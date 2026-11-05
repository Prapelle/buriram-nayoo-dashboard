/**
 * บันทึกประวัติสำหรับประสิทธิภาพรายคน (5/11/2026)
 * การบันทึกประวัติ "ต้องไม่ทำให้การบันทึก Lead ล้ม" — ถ้าเขียนไม่สำเร็จ แค่ log error แล้วไปต่อ
 * (Lead เปลี่ยนสถานะสำเร็จแล้วตอนนี้ ผู้ใช้ไม่ควรเห็น error เพราะตารางประวัติ)
 */
import { logError } from "./log";
import { LEAD_LOG_COLUMNS, type LeadStatusChange } from "./perf";
import { appendRows, toRow } from "./sheets";

export async function logLeadStatus(changes: LeadStatusChange[], lead: Record<string, string>, actor: string, at: string) {
  if (!changes.length) return;
  try {
    await appendRows("LEAD_STATUS_LOG", changes.map((c) => toRow(LEAD_LOG_COLUMNS, {
      log_id: crypto.randomUUID(), lead_id: lead.lead_id ?? "", lead_code: lead.lead_code ?? "", field: c.field, from_status: c.from, to_status: c.to,
      staff: lead.staff ?? "", changed_by: actor, changed_at: at,
    })));
  } catch (e) { logError("perf.logLeadStatus", e); }
}
