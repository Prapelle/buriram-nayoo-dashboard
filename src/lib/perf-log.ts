/** บันทึกประวัติ "ติดตามทันกำหนด" (ไม่ทำให้การบันทึกหลักล้ม) — แยกไฟล์เพื่อไม่ให้ import วนกับ developers-service */
import { logError } from "./log";
import { FOLLOWUP_COLUMNS } from "./perf";
import { appendRows, toRow } from "./sheets";

export async function logFollowup(row: Record<string, string> | null) {
  if (!row) return;
  try { await appendRows("FOLLOWUP_LOG", [toRow(FOLLOWUP_COLUMNS, row)]); } catch (e) { logError("perf.logFollowup", e); }
}
