import { writeAudit } from "./audit";
import { LINE_COLUMNS, validateLine, type Saved } from "./line-oa";
import { appendRows, batchUpdateValues, colLetter, readTabs, toRow } from "./sheets";

const TAB = "LINE_OA_MONTHLY";

export class LineError extends Error {
  constructor(public status: number, message: string, public code: string, public fields?: Record<string, string>) { super(message); }
}

async function load() {
  try { return (await readTabs([TAB]))[TAB]; }
  catch { throw new LineError(409, "อ่านฐานข้อมูลไม่ได้ กรุณาไปที่ ตั้งค่า → เตรียม Google Sheet", "SHEET_NOT_READY"); }
}

export async function listLine() {
  const t = await load();
  return t.rows.filter((r) => r.report_month).sort((a, b) => String(b.report_month).localeCompare(String(a.report_month)))
    .map((r) => Object.fromEntries(LINE_COLUMNS.map((c) => [c, r[c] ?? ""])));
}

/** หนึ่งแถวต่อ report_month: เดือนเดิม = แก้ไขแถวเดิม (คง record_id/ผู้สร้าง) ไม่สร้างแถวซ้ำ */
export async function saveLine(input: Record<string, unknown>, actor: string) {
  const v = validateLine(input);
  if (!v.ok) throw new LineError(422, "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่ระบุ", "VALIDATION", v.errors);
  const t = await load();
  if (!t.headers.includes("report_month")) throw new LineError(409, "แท็บ LINE_OA_MONTHLY ยังไม่พร้อม กรุณากด เตรียม Google Sheet", "SHEET_NOT_READY");
  const idx = t.rows.findIndex((r) => r.report_month === v.rec.report_month);
  const seen = typeof input.updated_at_seen === "string" ? input.updated_at_seen : undefined;
  const now = new Date().toISOString();

  if (idx < 0) {
    const rec: Saved = { ...v.rec, record_id: crypto.randomUUID(), created_by: actor, created_at: now, updated_at: now };
    await appendRows(TAB, [toRow(t.headers, rec)]);
    await writeAudit(actor, "line_oa_create", "line_oa_month", String(rec.report_month), `เพิ่มข้อมูล LINE OA เดือน ${rec.report_month}`);
    return { created: true, record: rec };
  }
  const ex = t.rows[idx];
  if (seen === undefined) throw new LineError(409, `เดือน ${v.rec.report_month} มีข้อมูลอยู่แล้ว กรุณาเปิดแก้ไขเดือนเดิม`, "EXISTS");
  if (seen !== ex.updated_at) throw new LineError(409, "ข้อมูลเดือนนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่ก่อนแก้ไข", "STALE");
  const rec: Saved = { ...v.rec, record_id: ex.record_id, created_by: ex.created_by, created_at: ex.created_at, updated_at: now };
  const n = idx + 2;
  await batchUpdateValues([{ range: `'${TAB}'!A${n}:${colLetter(t.headers.length - 1)}${n}`, values: [toRow(t.headers, rec)] }]);
  await writeAudit(actor, "line_oa_update", "line_oa_month", String(rec.report_month), `แก้ไขข้อมูล LINE OA เดือน ${rec.report_month}`);
  return { created: false, record: rec };
}
