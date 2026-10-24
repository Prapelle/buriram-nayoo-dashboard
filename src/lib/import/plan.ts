import { CsvError, parseTable, type Table } from "../csv";
import { convert, isIsoDate } from "./normalize";
import { SPECS, type Rec, type Spec } from "./specs";

export type Ctx = {
  filename: string;
  reportStart?: string; reportEnd?: string;
  comparisonStart?: string; comparisonEnd?: string;
  area: string;
  snapshotDate?: string;
};
export type ImportErr = { row: number; column: string; raw: string; code: string; message: string };
export type Status = "insert" | "update" | "skip" | "invalid";
export type Planned = { n: number; status: Status; rec?: Rec; existingRow?: number };
export type Existing = Map<string, { rowNumber: number; row: Record<string, string> }>;
export type Plan = {
  planned: Planned[];
  counts: { total: number; insert: number; update: number; skip: number; invalid: number };
  errors: ImportErr[];
  warnings: string[];
  period: { start: string; end: string };
};

export class PlanError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const norm = (h: string) => h.trim().toLowerCase();

/** ตรวจประเภทไฟล์จาก header signature: ต้องมีครบทุกคอลัมน์ใน signature และ signature ยาวสุดชนะ */
export function detectSpec(headers: string[]): { spec?: Spec; ambiguous: Spec[] } {
  const have = new Set(headers.map(norm));
  const hits = SPECS.filter((s) => s.signature.every((h) => have.has(h)));
  if (!hits.length) return { ambiguous: [] };
  const max = Math.max(...hits.map((s) => s.signature.length));
  const top = hits.filter((s) => s.signature.length === max);
  return top.length === 1 ? { spec: top[0], ambiguous: [] } : { ambiguous: top };
}

/** ช่วงวันที่จากชื่อไฟล์ Google Ads เช่น Campaigns_2026_09_01-2026_09_30_.csv (เป็นข้อเสนอแนะ ผู้ใช้ต้องยืนยัน) */
export function periodsFromFilename(name: string): { start?: string; end?: string; cmpStart?: string; cmpEnd?: string } {
  const re = /(\d{4})_(\d{2})_(\d{2})-(\d{4})_(\d{2})_(\d{2})/g;
  const found = [...name.matchAll(re)].map((m) => ({ s: `${m[1]}-${m[2]}-${m[3]}`, e: `${m[4]}-${m[5]}-${m[6]}` }));
  const out: ReturnType<typeof periodsFromFilename> = {};
  if (found[0]) { out.start = found[0].s; out.end = found[0].e; }
  if (found[1]) { out.cmpStart = found[1].s; out.cmpEnd = found[1].e; }
  return out;
}

const SAME_EPS = 1e-9;
function same(a: string | number | undefined, b: string | number | undefined): boolean {
  const x = a === undefined ? "" : String(a), y = b === undefined ? "" : String(b);
  if (x === y) return true;
  if (x !== "" && y !== "" && !isNaN(Number(x)) && !isNaN(Number(y))) return Math.abs(Number(x) - Number(y)) < SAME_EPS;
  return false;
}

export function compareKeys(spec: Spec): string[] {
  const k = spec.fields.map((f) => f.key);
  if (spec.derive) k.push("hour_24");
  if (!spec.noArea) k.push("area");
  if (spec.period === "user") k.push("report_start", "report_end");
  if (spec.comparison) k.push("comparison_start", "comparison_end");
  return k;
}

export function parseInput(text: string): Table {
  try { return parseTable(text); }
  catch (e) { if (e instanceof CsvError) throw new PlanError(e.code, e.message); throw e; }
}

export function buildPlan(a: { spec: Spec; table: Table; ctx: Ctx; existing: Existing; areaMap: Map<string, string> }): Plan {
  const { spec, table, ctx, existing, areaMap } = a;
  const idx = new Map(table.headers.map((h, i) => [norm(h), i]));
  const missing = spec.signature.filter((h) => !idx.has(h));
  if (missing.length) throw new PlanError("MISSING_HEADERS", `ไฟล์ขาดคอลัมน์ที่จำเป็น: ${missing.join(", ")}`);

  if (spec.period === "user") {
    if (!ctx.reportStart || !ctx.reportEnd || !isIsoDate(ctx.reportStart) || !isIsoDate(ctx.reportEnd))
      throw new PlanError("PERIOD_REQUIRED", "กรุณาระบุช่วงวันที่รายงาน (วันเริ่ม/วันสิ้นสุด) ให้ถูกต้อง");
    if (ctx.reportStart > ctx.reportEnd) throw new PlanError("PERIOD_INVALID", "วันเริ่มต้องไม่หลังวันสิ้นสุด");
  }
  if (spec.comparison) {
    if (!ctx.comparisonStart || !ctx.comparisonEnd || !isIsoDate(ctx.comparisonStart) || !isIsoDate(ctx.comparisonEnd))
      throw new PlanError("PERIOD_REQUIRED", "รายงานนี้เทียบสองช่วง กรุณาระบุช่วงเปรียบเทียบให้ถูกต้อง");
  }
  if (spec.period === "snapshot" && (!ctx.snapshotDate || !isIsoDate(ctx.snapshotDate)))
    throw new PlanError("PERIOD_REQUIRED", "กรุณาระบุวันที่ส่งออกข้อมูล (snapshot)");

  const warnings: string[] = [];
  const known = new Set(spec.fields.map((f) => norm(f.src)));
  const extra = table.headers.filter((h) => !known.has(norm(h)));
  if (extra.length) warnings.push(`คอลัมน์ที่ระบบยังไม่มีช่องเฉพาะ (เก็บไว้ใน raw_json): ${extra.join(", ")}`);
  const notInFile = spec.fields.filter((f) => !idx.has(norm(f.src)));
  if (notInFile.length) warnings.push(`ไม่พบคอลัมน์ในไฟล์ (เว้นว่างไว้): ${notInFile.map((f) => f.src).join(", ")}`);

  const errors: ImportErr[] = [];
  const planned: Planned[] = [];
  const recs: { n: number; rec: Rec; baseKey: string }[] = [];

  for (const r of table.records) {
    const before = errors.length;
    if (r.cells.length > table.headers.length && r.cells.slice(table.headers.length).some((c) => c.trim() !== "")) {
      errors.push({ row: r.n, column: "(ทั้งแถว)", raw: "", code: "COLUMN_COUNT", message: `จำนวนคอลัมน์เกิน header (${r.cells.length} > ${table.headers.length}) ไฟล์อาจมี comma ที่ไม่อยู่ในเครื่องหมายคำพูด` });
    }
    const rec: Rec = {};
    for (const f of spec.fields) {
      const i = idx.get(norm(f.src));
      const raw = i === undefined ? "" : (r.cells[i] ?? "");
      const c = convert(f.kind, raw);
      if ("err" in c) { errors.push({ row: r.n, column: f.src, raw: raw.slice(0, 200), code: c.code, message: c.err }); continue; }
      if (f.required && c.v === "") { errors.push({ row: r.n, column: f.src, raw: raw.slice(0, 200), code: "REQUIRED_BLANK", message: "ค่าที่จำเป็นเป็นค่าว่าง" }); continue; }
      rec[f.key] = c.v;
    }
    if (errors.length > before) { planned.push({ n: r.n, status: "invalid" }); continue; }

    if (spec.period === "user") { rec.report_start = ctx.reportStart!; rec.report_end = ctx.reportEnd!; }
    if (spec.comparison) { rec.comparison_start = ctx.comparisonStart!; rec.comparison_end = ctx.comparisonEnd!; }
    if (spec.period === "snapshot") rec.snapshot_date = ctx.snapshotDate!;
    spec.derive?.(rec);
    const mapped = spec.areaMap ? areaMap.get(`${spec.areaMap.platform}|${String(rec[spec.areaMap.key] ?? "")}`) : undefined;
    if (!spec.noArea) rec.area = mapped ?? ctx.area;

    const parts = spec.period === "file" ? [rec.report_start, rec.report_end] : spec.period === "user"
      ? [spec.id, rec.report_start, rec.report_end, ...(spec.comparison ? [rec.comparison_start, rec.comparison_end] : [])] : [];
    const baseKey = [...parts, ...spec.keyFields.map((k) => String(rec[k] ?? ""))].join("|");

    // raw_json: เก็บทุกคอลัมน์ต้นฉบับ (ตัดค่ายาวเกิน 4,000 ตัวอักษรต่อช่อง ป้องกันเกินขีดจำกัดเซลล์)
    const raw: Record<string, string> = {};
    table.headers.forEach((h, i) => { const v = r.cells[i] ?? ""; raw[h] = v.length > 4000 ? v.slice(0, 4000) : v; });
    rec.raw_json = JSON.stringify(raw);
    recs.push({ n: r.n, rec, baseKey });
  }

  // คีย์ซ้ำในไฟล์
  const groups = new Map<string, number>();
  recs.forEach((x) => groups.set(x.baseKey, (groups.get(x.baseKey) ?? 0) + 1));
  const seen = new Map<string, number>();
  let ambiguousGroups = 0;
  groups.forEach((c) => { if (c > 1) ambiguousGroups++; });
  if (spec.ambiguousDuplicates && ambiguousGroups)
    warnings.push(`พบชื่อโฆษณาซ้ำในชุดโฆษณาเดียวกัน ${ambiguousGroups} กลุ่ม (ไม่มี Ad ID) ระบบแยกแยะด้วยลำดับในไฟล์ หากส่งออกใหม่แล้วลำดับเปลี่ยน แถวกลุ่มนี้อาจถูกจับคู่สลับกัน`);

  const cmpKeys = compareKeys(spec);
  const counts = { total: table.records.length, insert: 0, update: 0, skip: 0, invalid: planned.length };
  for (const { n, rec, baseKey } of recs) {
    const occ = (seen.get(baseKey) ?? 0) + 1;
    seen.set(baseKey, occ);
    if (occ > 1 && !spec.ambiguousDuplicates) {
      errors.push({ row: n, column: spec.keyFields.join("+"), raw: baseKey.slice(0, 200), code: "DUPLICATE_IN_FILE", message: "ข้อมูลซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน" });
      planned.push({ n, status: "invalid" }); counts.invalid++;
      continue;
    }
    rec.row_key = spec.ambiguousDuplicates && (groups.get(baseKey) ?? 0) > 1 ? `${baseKey}#${occ}` : baseKey;
    const ex = existing.get(String(rec.row_key));
    if (!ex) { planned.push({ n, status: "insert", rec }); counts.insert++; continue; }
    const changed = cmpKeys.some((k) => !same(rec[k], ex.row[k]));
    if (changed) { planned.push({ n, status: "update", rec, existingRow: ex.rowNumber }); counts.update++; }
    else { planned.push({ n, status: "skip", rec, existingRow: ex.rowNumber }); counts.skip++; }
  }
  planned.sort((x, y) => x.n - y.n);

  const starts = recs.map((x) => String(x.rec.report_start ?? "")).filter(Boolean).sort();
  const ends = recs.map((x) => String(x.rec.report_end ?? "")).filter(Boolean).sort();
  return {
    planned, counts, errors, warnings,
    period: { start: starts[0] ?? ctx.reportStart ?? "", end: ends[ends.length - 1] ?? ctx.reportEnd ?? "" },
  };
}
