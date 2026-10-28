/**
 * Phase 5 — บันทึกข้อมูล Website Analytics ลง Google Sheets
 * เบราว์เซอร์อ่านไฟล์และสรุปผลมาแล้ว (parse.ts) — Server ตรวจข้อมูลทุกช่องอีกครั้งก่อนเขียน
 * - กันซ้ำด้วย row_key: สรุป = แหล่ง|property|ระดับ|วันเริ่ม|วันสิ้นสุด · รายละเอียด = แหล่ง|property|ช่วง|มิติ|ค่า
 *   นำเข้าซ้ำ = อัปเดตแถวเดิม (ไม่เพิ่มยอดซ้ำ) · ไฟล์เดิม (SHA-256 เดิม) ต้องให้ Admin ยืนยัน
 * - ไม่ลบข้อมูลเดิม · บันทึก IMPORT_BATCHES และ AUDIT_LOG
 */
import { writeAudit } from "../audit";
import type { Role } from "../roles";
import { appendRows, batchUpdateValues, colLetter, firstRowOf, readTabs, toRow } from "../sheets";
import { DIM_TYPE, KIND_LABEL, type DimRow, type SummaryRow, type UploadBatch, type WebKind } from "./parse";

export class WebError extends Error { constructor(public status: number, message: string, public code: string) { super(message); } }

const SUM_TAB = "WEBSITE_ANALYTICS", DIM_TAB = "WEBSITE_DIMENSIONS";
const KINDS = Object.keys(KIND_LABEL).filter((k) => k !== "gsc_filters") as WebKind[];
const SUM_NUM = ["website_users", "page_views", "user_engagement_sec", "avg_engagement_sec_per_user", "event_count", "key_events", "total_revenue", "pages_count", "search_clicks", "search_impressions", "search_ctr_pct", "search_position"] as const;
const DIM_NUM = ["views", "user_engagement_sec", "event_count", "key_events", "clicks", "impressions", "ctr_pct", "position"] as const;
const isIso = (s: unknown) => { if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const t = Date.parse(s + "T00:00:00Z"); return Number.isFinite(t) && new Date(t).toISOString().startsWith(s); };
const str = (v: unknown, max: number, what: string) => { const s = String(v ?? ""); if (s.length > max) throw new WebError(422, `${what} ยาวเกิน ${max} ตัวอักษร`, "VALIDATION"); return s; };
const numOrBlank = (v: unknown, what: string): number | "" => {
  if (v === "" || v === null || v === undefined) return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new WebError(422, `${what} ต้องเป็นตัวเลขไม่ติดลบ`, "VALIDATION");
  return n;
};

export const sumKey = (r: Pick<SummaryRow, "source" | "property" | "granularity" | "report_start" | "report_end">) => [r.source, r.property, r.granularity, r.report_start, r.report_end].join("|");
export const dimKey = (r: Pick<DimRow, "source" | "property" | "report_start" | "report_end" | "dimension_type" | "dimension_value">) => [r.source, r.property, r.report_start, r.report_end, r.dimension_type, r.dimension_value].join("|");

/** ตรวจชุดข้อมูลจากเบราว์เซอร์ทุกช่อง (ไม่เชื่อค่าที่ส่งมา) */
export function validateBatch(b: UploadBatch): UploadBatch {
  if (!b || !KINDS.includes(b.kind)) throw new WebError(400, "ประเภทไฟล์ไม่ถูกต้อง", "BAD_KIND");
  if (!isIso(b.period?.start) || !isIso(b.period?.end) || b.period.start > b.period.end) throw new WebError(422, "ช่วงวันที่ไม่ถูกต้อง", "BAD_PERIOD");
  if (!/^[0-9a-f]{64}$/.test(String(b.sha256))) throw new WebError(400, "ไม่มีรหัสไฟล์ (SHA-256)", "BAD_REQUEST");
  const source = b.kind === "ga4_pages" ? "ga4" : "search_console";
  const property = str(b.property, 200, "Property");
  const summary = (b.summary ?? []).map((s) => {
    if (s.source !== source) throw new WebError(422, "แหล่งข้อมูลไม่ตรงกับประเภทไฟล์", "VALIDATION");
    const gran = b.kind === "gsc_chart" ? "day" : "period";
    if (s.granularity !== gran || !isIso(s.report_start) || !isIso(s.report_end) || s.report_start > s.report_end) throw new WebError(422, "ช่วงวันที่ของแถวสรุปไม่ถูกต้อง", "VALIDATION");
    if (gran === "day" && (s.report_start !== s.report_end || s.report_start < b.period.start || s.report_end > b.period.end)) throw new WebError(422, "วันที่รายวันอยู่นอกช่วงของไฟล์", "VALIDATION");
    if (gran === "period" && (s.report_start !== b.period.start || s.report_end !== b.period.end)) throw new WebError(422, "ช่วงของแถวสรุปไม่ตรงกับไฟล์", "VALIDATION");
    const out: SummaryRow = { source, property, granularity: gran, report_start: s.report_start, report_end: s.report_end, notes: str(s.notes, 300, "หมายเหตุ") };
    for (const k of SUM_NUM) (out as Record<string, unknown>)[k] = numOrBlank(s[k], k);
    if (source === "ga4" && out.website_users !== "") throw new WebError(422, "ไฟล์รายหน้า GA4 ไม่มียอดผู้ใช้รวม", "VALIDATION");
    if (out.search_clicks !== "" && out.search_impressions !== "" && Number(out.search_clicks) > Number(out.search_impressions)) throw new WebError(422, "Clicks มากกว่า Impressions", "VALIDATION");
    return out;
  });
  if (b.kind === "ga4_pages" && summary.length !== 1) throw new WebError(422, "ไฟล์ GA4 ต้องมีแถวสรุป 1 แถว", "VALIDATION");
  if (b.kind === "gsc_chart" && (summary.length < 1 || summary.length > 400 || new Set(summary.map((s) => s.report_start)).size !== summary.length)) throw new WebError(422, "ข้อมูลรายวันไม่ถูกต้อง", "VALIDATION");
  const dimType = DIM_TYPE[b.kind];
  if ((b.dims ?? []).length > 2000) throw new WebError(413, "รายละเอียดมากเกินไป", "TOO_LARGE");
  const dims = (b.dims ?? []).map((d) => {
    if (d.dimension_type !== dimType || d.source !== source || d.report_start !== b.period.start || d.report_end !== b.period.end) throw new WebError(422, "แถวรายละเอียดไม่ตรงกับประเภท/ช่วงของไฟล์", "VALIDATION");
    const out: DimRow = { source, property, report_start: d.report_start, report_end: d.report_end, dimension_type: dimType, dimension_value: str(d.dimension_value, 1000, "ค่าในตาราง").trim() || "(not set)" };
    for (const k of DIM_NUM) (out as Record<string, unknown>)[k] = numOrBlank(d[k], k);
    return out;
  });
  if (new Set(dims.map(dimKey)).size !== dims.length) throw new WebError(422, "มีรายการซ้ำในไฟล์", "DUPLICATE_ROW");
  if (b.kind === "ga4_pages") {
    const s = summary[0], dv = dims.reduce((t, d) => t + Number(d.views || 0), 0);
    if (Math.abs(dv - Number(s.page_views)) > 0.5) throw new WebError(422, "ยอดการดูรายหน้าไม่เท่ากับยอดรวม (ข้อมูลไม่สอดคล้อง)", "VALIDATION");
  }
  return { ...b, property, summary, dims };
}

async function load() {
  try {
    const t = await readTabs([SUM_TAB, DIM_TAB, "IMPORT_BATCHES"]);
    if (!t[SUM_TAB].headers.includes("row_key") || !t[DIM_TAB].headers.includes("row_key")) throw new Error("no headers");
    return t;
  } catch { throw new WebError(409, "ยังไม่มีแท็บ Website ใน Google Sheet กรุณาไปที่ ตั้งค่า → เตรียม Google Sheet", "SHEET_NOT_READY"); }
}

const sameNum = (a: unknown, b: unknown) => (a === "" || a === undefined ? "" : String(Number(a))) === (b === "" || b === undefined ? "" : String(Number(b)));
function planRows<T extends Record<string, unknown>>(incoming: T[], existing: Record<string, string>[], key: (r: T) => string, nums: readonly string[]) {
  const ex = new Map(existing.map((r, i) => [r.row_key, { r, rowNo: i + 2 }]));
  const insert: T[] = [], update: { rec: T; rowNo: number; prev: Record<string, string> }[] = []; let skip = 0;
  for (const r of incoming) {
    const e = ex.get(key(r));
    if (!e) insert.push(r);
    else if (nums.every((k) => sameNum(r[k], e.r[k])) && String(r.notes ?? "") === String(e.r.notes ?? "")) skip++;
    else update.push({ rec: r, rowNo: e.rowNo, prev: e.r });
  }
  return { insert, update, skip };
}

export async function planWebsite(batches: UploadBatch[]) {
  const t = await load();
  return batches.map((raw) => {
    const b = validateBatch(raw);
    const s = planRows(b.summary as unknown as Record<string, unknown>[], t[SUM_TAB].rows, (r) => sumKey(r as unknown as SummaryRow), SUM_NUM);
    const d = planRows(b.dims as unknown as Record<string, unknown>[], t[DIM_TAB].rows, (r) => dimKey(r as unknown as DimRow), DIM_NUM);
    const dup = t.IMPORT_BATCHES.rows.find((x) => x.status === "success" && x.file_sha256 === b.sha256 && x.source === "website");
    return { kind: b.kind, label: KIND_LABEL[b.kind], filename: b.filename, period: b.period, property: b.property,
      counts: { insert: s.insert.length + d.insert.length, update: s.update.length + d.update.length, skip: s.skip + d.skip },
      fileDuplicate: dup ? { uploadedAt: dup.uploaded_at, uploadedBy: dup.uploaded_by } : null };
  });
}

export async function commitWebsite(batches: UploadBatch[], actor: string, role: Role, overrideDuplicate = false) {
  if (!Array.isArray(batches) || !batches.length || batches.length > 12) throw new WebError(400, "ไม่มีไฟล์ให้นำเข้า", "BAD_REQUEST");
  const valid = batches.map(validateBatch);
  const results = [];
  for (const b of valid) {
    const t = await load(); // อ่านใหม่ทุกไฟล์ เพื่อให้เลขแถวถูกต้องหลังเขียนไฟล์ก่อนหน้า
    const dup = t.IMPORT_BATCHES.rows.find((x) => x.status === "success" && x.file_sha256 === b.sha256 && x.source === "website");
    if (dup && !(overrideDuplicate && role === "admin")) throw new WebError(409, `${b.filename}: ไฟล์นี้เคยนำเข้าแล้ว (Admin เท่านั้นที่ยืนยันนำเข้าซ้ำได้ — ยอดจะไม่ถูกบวกซ้ำ)`, "DUPLICATE_FILE");
    const now = new Date().toISOString(), batchId = crypto.randomUUID();
    const s = planRows(b.summary as unknown as Record<string, unknown>[], t[SUM_TAB].rows, (r) => sumKey(r as unknown as SummaryRow), SUM_NUM);
    const d = planRows(b.dims as unknown as Record<string, unknown>[], t[DIM_TAB].rows, (r) => dimKey(r as unknown as DimRow), DIM_NUM);
    const sh = t[SUM_TAB].headers, dh = t[DIM_TAB].headers, bh = t.IMPORT_BATCHES.headers;
    const meta = { source_filename: b.filename, source_batch_id: batchId };
    const batchRow = (status: string) => toRow(bh, { batch_id: batchId, source: "website", report_type: b.kind, filename: b.filename, file_sha256: b.sha256, report_start: b.period.start, report_end: b.period.end,
      uploaded_by: actor, uploaded_at: now, status, rows_total: b.summary.length + b.dims.length, rows_inserted: s.insert.length + d.insert.length, rows_updated: s.update.length + d.update.length, rows_skipped: s.skip + d.skip, rows_invalid: 0 });
    const range = await appendRows("IMPORT_BATCHES", [batchRow("processing")]);
    const sumRec = (r: Record<string, unknown>, id?: string) => toRow(sh, { ...r, ...meta, record_id: id || crypto.randomUUID(), row_key: sumKey(r as unknown as SummaryRow), imported_at: now, updated_at: id ? now : "" } as Record<string, string | number>);
    const dimRec = (r: Record<string, unknown>, id?: string) => toRow(dh, { ...r, ...meta, record_id: id || crypto.randomUUID(), row_key: dimKey(r as unknown as DimRow), imported_at: now } as Record<string, string | number>);
    for (let i = 0; i < s.insert.length; i += 500) await appendRows(SUM_TAB, s.insert.slice(i, i + 500).map((r) => sumRec(r)));
    for (let i = 0; i < d.insert.length; i += 500) await appendRows(DIM_TAB, d.insert.slice(i, i + 500).map((r) => dimRec(r)));
    const ups = [
      ...s.update.map((u) => ({ range: `'${SUM_TAB}'!A${u.rowNo}:${colLetter(sh.length - 1)}${u.rowNo}`, values: [sumRec(u.rec, u.prev.record_id)] })),
      ...d.update.map((u) => ({ range: `'${DIM_TAB}'!A${u.rowNo}:${colLetter(dh.length - 1)}${u.rowNo}`, values: [dimRec(u.rec, u.prev.record_id)] })),
    ];
    for (let i = 0; i < ups.length; i += 200) await batchUpdateValues(ups.slice(i, i + 200));
    const rowNo = firstRowOf(range);
    if (rowNo) await batchUpdateValues([{ range: `'IMPORT_BATCHES'!A${rowNo}:${colLetter(bh.length - 1)}${rowNo}`, values: [batchRow("success")] }]);
    await writeAudit(actor, dup ? "import_duplicate_override" : "import", "import_batch", batchId, `website ${b.kind}: +${s.insert.length + d.insert.length} ~${s.update.length + d.update.length} =${s.skip + d.skip}`);
    results.push({ kind: b.kind, filename: b.filename, inserted: s.insert.length + d.insert.length, updated: s.update.length + d.update.length, skipped: s.skip + d.skip });
  }
  return { results };
}

export type ManualInput = { report_start?: string; report_end?: string; website_users?: unknown; page_views?: unknown; avg_engagement_sec_per_user?: unknown; notes?: string };
/** กรอกเอง: ยอดผู้ใช้เว็บไซต์ (และยอดอื่นถ้าไม่มีไฟล์) ของช่วงที่ตรงกับรายงานใน GA4 — หนึ่งแถวต่อช่วง (แก้ไขทับได้) */
export async function saveManualWebsite(input: ManualInput, actor: string) {
  if (!isIso(input.report_start) || !isIso(input.report_end) || input.report_start! > input.report_end!) throw new WebError(422, "กรุณาระบุช่วงวันที่ให้ถูกต้อง", "BAD_PERIOD");
  const users = numOrBlank(input.website_users, "ยอดผู้ใช้"), pv = numOrBlank(input.page_views, "จำนวนการดู"), avg = numOrBlank(input.avg_engagement_sec_per_user, "เวลาเฉลี่ย");
  if (users === "") throw new WebError(422, "กรุณากรอกยอดผู้ใช้เว็บไซต์ (Users)", "VALIDATION");
  if (!Number.isInteger(users) || (pv !== "" && !Number.isInteger(pv))) throw new WebError(422, "ยอดผู้ใช้และจำนวนการดูต้องเป็นจำนวนเต็ม", "VALIDATION");
  const t = await load();
  const rec: SummaryRow = { source: "manual", property: "", granularity: "period", report_start: input.report_start!, report_end: input.report_end!, website_users: users, page_views: pv, avg_engagement_sec_per_user: avg, notes: str(input.notes, 300, "หมายเหตุ") };
  const now = new Date().toISOString(), key = sumKey(rec), h = t[SUM_TAB].headers;
  const i = t[SUM_TAB].rows.findIndex((r) => r.row_key === key);
  const row = (id: string, created: string) => toRow(h, { ...rec, record_id: id, row_key: key, source_filename: "กรอกเอง", imported_at: created, updated_at: now } as Record<string, string | number>);
  if (i < 0) await appendRows(SUM_TAB, [row(crypto.randomUUID(), now)]);
  else await batchUpdateValues([{ range: `'${SUM_TAB}'!A${i + 2}:${colLetter(h.length - 1)}${i + 2}`, values: [row(t[SUM_TAB].rows[i].record_id, t[SUM_TAB].rows[i].imported_at)] }]);
  await writeAudit(actor, "website_manual", "website_period", key, `${i < 0 ? "เพิ่ม" : "แก้ไข"} ยอดผู้ใช้เว็บไซต์ ${rec.report_start}–${rec.report_end}: ${users}`);
  return { created: i < 0 };
}

/** ข้อมูลสำหรับหน้า Website: แถวสรุปทั้งหมด + รายละเอียดของช่วงที่เลือก */
export async function websiteOverview(period?: { start: string; end: string }) {
  const t = await load();
  const summary = t[SUM_TAB].rows.filter((r) => r.row_key);
  const periods = [...new Map(t[DIM_TAB].rows.filter((r) => r.row_key).map((r) => [`${r.report_start}|${r.report_end}`, { start: r.report_start, end: r.report_end }])).values()].sort((a, b) => b.start.localeCompare(a.start));
  const sel = period && periods.some((p) => p.start === period.start && p.end === period.end) ? period : periods[0];
  const dims = sel ? t[DIM_TAB].rows.filter((r) => r.row_key && r.report_start === sel.start && r.report_end === sel.end) : [];
  return { summary, periods, selected: sel ?? null, dims };
}
