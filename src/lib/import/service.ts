import { AREAS } from "../schema";
import { appendRows, batchUpdateValues, colLetter, firstRowOf, readTabs, toRow } from "../sheets";
import { isIsoDate } from "./normalize";
import { buildPlan, detectSpec, parseInput, periodsFromFilename, PlanError, type Ctx, type Existing, type Plan } from "./plan";
import { SPEC_BY_ID, type Spec } from "./specs";
import type { Role } from "../roles";

export type ImportInput = {
  filename: string;
  text: string;
  specId?: string;
  reportStart?: string; reportEnd?: string;
  comparisonStart?: string; comparisonEnd?: string;
  area?: string;
  snapshotDate?: string;
  overrideDuplicate?: boolean;
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public code = "ERROR") { super(message); }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

async function prepare(input: ImportInput) {
  if (typeof input?.text !== "string" || typeof input?.filename !== "string")
    throw new HttpError(400, "คำขอไม่ถูกต้อง", "BAD_REQUEST");
  const area = input.area ?? "unknown";
  if (!(AREAS as readonly string[]).includes(area)) throw new HttpError(400, "ค่า Area ไม่ถูกต้อง", "BAD_AREA");

  let table;
  try { table = parseInput(input.text); } catch (e) { if (e instanceof PlanError) throw new HttpError(422, e.message, e.code); throw e; }

  let spec: Spec | undefined;
  let detected = true;
  if (input.specId) {
    spec = SPEC_BY_ID[input.specId];
    if (!spec) throw new HttpError(400, "ไม่รู้จักประเภทรายงาน", "BAD_SPEC");
    detected = detectSpec(table.headers).spec?.id === spec.id;
  } else {
    const d = detectSpec(table.headers);
    if (!d.spec) throw new HttpError(422, d.ambiguous.length
      ? `ตรวจประเภทไฟล์ไม่ได้แน่ชัด (ตรงกับ: ${d.ambiguous.map((s) => s.label).join(" / ")}) กรุณาเลือกประเภทเอง`
      : "ไม่รู้จักประเภทไฟล์นี้ (header ไม่ตรงกับรายงานที่รองรับ) หรือไฟล์ไม่มีข้อมูล", "UNKNOWN_TYPE");
    spec = d.spec;
  }

  const fromName = periodsFromFilename(input.filename);
  const ctx: Ctx = {
    filename: input.filename.slice(0, 200), area,
    reportStart: input.reportStart ?? fromName.start, reportEnd: input.reportEnd ?? fromName.end,
    comparisonStart: input.comparisonStart ?? fromName.cmpStart, comparisonEnd: input.comparisonEnd ?? fromName.cmpEnd,
    snapshotDate: input.snapshotDate ?? bangkokToday(),
  };
  for (const [k, v] of [["reportStart", ctx.reportStart], ["reportEnd", ctx.reportEnd], ["comparisonStart", ctx.comparisonStart], ["comparisonEnd", ctx.comparisonEnd], ["snapshotDate", ctx.snapshotDate]] as const)
    if (v && !isIsoDate(v)) throw new HttpError(400, `วันที่ไม่ถูกต้อง (${k})`, "BAD_DATE");

  let tabs;
  try { tabs = await readTabs([spec.tab, "AREA_MAPPINGS", "IMPORT_BATCHES", "APP_CONFIG"]); }
  catch { throw new HttpError(409, "อ่านฐานข้อมูลไม่ได้ กรุณาไปที่ ตั้งค่า → เตรียม Google Sheet ก่อน (ต้องกดอีกครั้งหลังอัปเดตระบบ เพื่อเพิ่มแท็บใหม่)", "SHEET_NOT_READY"); }
  const target = tabs[spec.tab];
  if (!target.headers.length) throw new HttpError(409, `แท็บ ${spec.tab} ยังไม่ถูกสร้าง กรุณาไปที่ ตั้งค่า → เตรียม Google Sheet`, "SHEET_NOT_READY");
  const missingCols = ["row_key", "record_id"].filter((h) => !target.headers.includes(h));
  if (missingCols.length) throw new HttpError(409, `แท็บ ${spec.tab} ขาดคอลัมน์ ${missingCols.join(", ")} กรุณากด เตรียม Google Sheet`, "SHEET_NOT_READY");

  const maxMb = Number(tabs.APP_CONFIG.rows.find((r) => r.config_key === "max_upload_mb")?.config_value) || 10;
  const bytes = new TextEncoder().encode(input.text).length;
  if (bytes > maxMb * 1024 * 1024) throw new HttpError(413, `ไฟล์ใหญ่เกิน ${maxMb} MB`, "FILE_TOO_LARGE");

  const existing: Existing = new Map();
  target.rows.forEach((row, i) => { if (row.row_key) existing.set(row.row_key, { rowNumber: i + 2, row }); });
  const areaMap = new Map<string, string>();
  for (const r of tabs.AREA_MAPPINGS.rows)
    if (String(r.confirmed).toUpperCase() === "TRUE" && (AREAS as readonly string[]).includes(r.area)) areaMap.set(`${r.source_platform}|${r.source_name}`, r.area);

  let plan: Plan;
  try { plan = buildPlan({ spec, table, ctx, existing, areaMap }); }
  catch (e) { if (e instanceof PlanError) throw new HttpError(422, e.message, e.code); throw e; }

  const sha256 = await sha256Hex(input.text);
  const dup = tabs.IMPORT_BATCHES.rows.find((b) =>
    b.status === "success" && b.file_sha256 === sha256 && b.source === spec.source && b.report_type === spec.id
    && b.report_start === plan.period.start && b.report_end === plan.period.end);
  return { spec, ctx, plan, sha256, detected, target, batches: tabs.IMPORT_BATCHES, fileDuplicate: dup ? { batchId: dup.batch_id, uploadedAt: dup.uploaded_at, uploadedBy: dup.uploaded_by } : null };
}

function summarize(p: Awaited<ReturnType<typeof prepare>>) {
  const { spec, plan } = p;
  return {
    spec: { id: spec.id, label: spec.label, tab: spec.tab, source: spec.source, period: spec.period, comparison: !!spec.comparison },
    detected: p.detected, ctx: p.ctx, sha256: p.sha256, period: plan.period,
    counts: plan.counts, warnings: plan.warnings, errors: plan.errors.slice(0, 1000),
    fileDuplicate: p.fileDuplicate,
    previewColumns: spec.previewKeys,
    preview: plan.planned.slice(0, 20).map((x) => ({ n: x.n, status: x.status, values: x.rec ? Object.fromEntries(spec.previewKeys.map((k) => [k, x.rec![k] ?? ""])) : null })),
  };
}

export async function runPlan(input: ImportInput) { return summarize(await prepare(input)); }

export async function runCommit(input: ImportInput, actor: string, role: Role) {
  const p = await prepare(input);
  const { spec, plan } = p;
  if (p.fileDuplicate) {
    const allowed = input.overrideDuplicate === true && role === "admin";
    if (!allowed) throw new HttpError(409, "ไฟล์นี้เคยนำเข้าสำเร็จแล้ว (Admin เท่านั้นที่ยืนยันนำเข้าซ้ำได้)", "DUPLICATE_FILE");
  }
  if (plan.counts.insert + plan.counts.update + plan.counts.skip === 0)
    throw new HttpError(422, "ไม่มีแถวที่ถูกต้องให้นำเข้า", "NOTHING_TO_IMPORT");

  const now = new Date().toISOString();
  const batchId = crypto.randomUUID();
  const batchHeaders = p.batches.headers;
  const batchRow = (status: string, errorSummary = "") => toRow(batchHeaders, {
    batch_id: batchId, source: spec.source, report_type: spec.id, filename: p.ctx.filename, file_sha256: p.sha256,
    report_start: plan.period.start, report_end: plan.period.end,
    comparison_start: p.ctx.comparisonStart && spec.comparison ? p.ctx.comparisonStart : "", comparison_end: p.ctx.comparisonEnd && spec.comparison ? p.ctx.comparisonEnd : "",
    area: p.ctx.area, uploaded_by: actor, uploaded_at: now, status,
    rows_total: plan.counts.total, rows_inserted: plan.counts.insert, rows_updated: plan.counts.update,
    rows_skipped: plan.counts.skip, rows_invalid: plan.counts.invalid, drive_file_id: "", error_summary: errorSummary,
  });

  const range = await appendRows("IMPORT_BATCHES", [batchRow("processing")]);
  const batchRowNo = firstRowOf(range);
  const setStatus = async (status: string, err = "") => {
    if (batchRowNo) await batchUpdateValues([{ range: `'IMPORT_BATCHES'!A${batchRowNo}`, values: [batchRow(status, err)] }]);
  };

  try {
    const headers = p.target.headers;
    const full = (rec: Record<string, string | number>) => toRow(headers, { ...rec, record_id: rec.record_id ?? crypto.randomUUID(), source_batch_id: batchId, source_filename: p.ctx.filename, imported_at: now });
    const inserts = plan.planned.filter((x) => x.status === "insert").map((x) => full(x.rec!));
    for (let i = 0; i < inserts.length; i += 500) await appendRows(spec.tab, inserts.slice(i, i + 500));

    const updates = plan.planned.filter((x) => x.status === "update");
    const lastCol = colLetter(headers.length - 1);
    const existingIds = new Map<number, string>();
    // คง record_id เดิมไว้เมื่ออัปเดต (อ่านจาก existing ที่ prepare ไว้แล้ว)
    for (const x of updates) existingIds.set(x.existingRow!, "");
    const idx = headers.indexOf("record_id");
    const exById = await readIds(spec.tab, idx, [...existingIds.keys()]);
    const data = updates.map((x) => ({ range: `'${spec.tab}'!A${x.existingRow}:${lastCol}${x.existingRow}`, values: [full({ ...x.rec!, record_id: exById.get(x.existingRow!) || crypto.randomUUID() })] }));
    for (let i = 0; i < data.length; i += 200) await batchUpdateValues(data.slice(i, i + 200));

    const errRows = plan.errors.slice(0, 1000);
    if (errRows.length) {
      const eh = (await readTabs(["IMPORT_ERRORS"])).IMPORT_ERRORS.headers;
      await appendRows("IMPORT_ERRORS", errRows.map((e) => toRow(eh, {
        error_id: crypto.randomUUID(), batch_id: batchId, source_row_number: e.row, column_name: e.column,
        raw_value: e.raw, error_code: e.code, message: e.message, created_at: now,
      })));
    }
    await setStatus("success", plan.counts.invalid ? `${plan.counts.invalid} แถวไม่ถูกต้อง (ดู IMPORT_ERRORS)` : "");
    await audit(actor, p.fileDuplicate ? "import_duplicate_override" : "import", batchId, `${spec.id}: +${plan.counts.insert} ~${plan.counts.update} =${plan.counts.skip} !${plan.counts.invalid}`, now);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    try { await setStatus("failed", msg.slice(0, 500)); await audit(actor, "import_failed", batchId, `${spec.id}: ${msg.slice(0, 200)}`, now); } catch { /* ignore */ }
    throw new HttpError(500, `นำเข้าไม่สำเร็จ: ${msg} (ข้อมูลที่เขียนไปแล้วบางส่วนจะไม่ซ้ำเมื่อนำเข้าไฟล์เดิมอีกครั้ง)`, "WRITE_FAILED");
  }
  return { batchId, counts: plan.counts, errors: plan.errors.slice(0, 1000), warnings: plan.warnings };
}

async function readIds(tab: string, colIdx: number, rows: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!rows.length || colIdx < 0) return out;
  const { batchGet } = await import("../sheets");
  const col = colLetter(colIdx);
  const [vals] = await batchGet([`'${tab}'!${col}:${col}`]);
  rows.forEach((r) => out.set(r, vals[r - 1]?.[0] ?? ""));
  return out;
}

async function audit(actor: string, action: string, entityId: string, summary: string, now: string) {
  const eh = (await readTabs(["AUDIT_LOG"])).AUDIT_LOG.headers;
  await appendRows("AUDIT_LOG", [toRow(eh, { audit_id: crypto.randomUUID(), actor_email: actor, action, entity_type: "import_batch", entity_id: entityId, timestamp: now, summary })]);
}

export async function listBatches(limit = 30) {
  const { IMPORT_BATCHES } = await readTabs(["IMPORT_BATCHES"]);
  return IMPORT_BATCHES.rows.slice(-limit).reverse().map((b) => ({
    batch_id: b.batch_id, report_type: b.report_type, filename: b.filename, report_start: b.report_start, report_end: b.report_end,
    uploaded_by: b.uploaded_by, uploaded_at: b.uploaded_at, status: b.status,
    rows_total: b.rows_total, rows_inserted: b.rows_inserted, rows_updated: b.rows_updated, rows_skipped: b.rows_skipped, rows_invalid: b.rows_invalid,
    error_summary: b.error_summary,
  }));
}
