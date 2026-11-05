/**
 * ประสิทธิภาพรายคน (5/11/2026) — ชั้นข้อมูล + กติกาล้วน ๆ (ไม่แตะฐานข้อมูล ทดสอบง่าย)
 * ตัวเลขทุกตัวนับจาก "ประวัติ" ที่ระบบบันทึกเองตอนการ์ดเปลี่ยนสถานะ ไม่ใช่การกดนับเอง:
 *   Seller / Buyer Leads  → LEAD_STATUS_LOG (เริ่มบันทึก 5/11/2026)
 *   Sale developer / Sale home builder → DEVELOPER_STATUS_LOG + DEVELOPER_CONTACTS (มีอยู่เดิม)
 *   บอร์ด Content → CONTENT_HISTORY + CONTENT_MEMBERS (มีอยู่เดิม)
 * ตารางทั้งหมดด้านล่างเกิดบน D1 (สร้างให้อัตโนมัติ ไม่ต้องกด เตรียมฐานข้อมูล)
 */

/** ประวัติการเปลี่ยนสถานะของ Lead: หนึ่งแถว = เปลี่ยนหนึ่งช่อง (sell_status หรือ call_status) หนึ่งครั้ง */
export const LEAD_LOG_COLUMNS = ["log_id", "lead_id", "lead_code", "field", "from_status", "to_status", "staff", "changed_by", "changed_at"];
/** เป้าหมายรายคน: หนึ่งแถว = เดือน × คน × ตัวชี้วัด (บันทึกซ้ำ = แก้แถวเดิม) */
export const PERF_TARGET_COLUMNS = ["target_id", "month", "user_email", "position", "metric_key", "target_value", "updated_by", "updated_at"];
/** ตำแหน่งของผู้ใช้: หนึ่งคนมีได้หลายตำแหน่ง (หนึ่งแถวต่อคู่ คน × ตำแหน่ง) */
export const PERF_POSITION_COLUMNS = ["user_email", "position", "updated_by", "updated_at"];
/** วันหยุดบริษัท (ใช้นับวันทำการ: จันทร์–เสาร์ ตัดวันอาทิตย์ และวันในตารางนี้) */
export const PERF_HOLIDAY_COLUMNS = ["holiday_date", "name", "created_by", "created_at"];

export const PERF_DEFS = [
  { name: "LEAD_STATUS_LOG", headers: LEAD_LOG_COLUMNS },
  { name: "PERF_TARGETS", headers: PERF_TARGET_COLUMNS },
  { name: "PERF_POSITIONS", headers: PERF_POSITION_COLUMNS },
  { name: "PERF_HOLIDAYS", headers: PERF_HOLIDAY_COLUMNS },
];
export const PERF_TABS = PERF_DEFS.map((d) => d.name);

export type LeadStatusField = "sell_status" | "call_status";
export type LeadStatusChange = { field: LeadStatusField; from: string; to: string };

/**
 * เทียบ Lead ก่อน/หลังบันทึก → รายการเปลี่ยนสถานะของ "ช่องที่ตรงกับประเภท Lead" (field)
 * - Lead ขาย = sell_status · Lead ซื้อ/เช่า/สร้าง = call_status · ยังไม่ระบุ Need = "" (ไม่บันทึก)
 *   (ทุก Lead ได้ค่าเริ่มต้นทั้งสองช่อง แต่ช่องที่ไม่ตรงประเภทไม่มีความหมาย ไม่บันทึกเพื่อไม่ให้ประวัติมีแถวขยะ)
 * - prev = null (สร้างใหม่): บันทึก "" → ค่าเริ่มต้น เพื่อให้รู้ว่า Lead เข้ามาเมื่อไร (ไม่นับเป็นผลงาน)
 * - ช่องเดิมว่างแต่ระบบมีค่าเริ่มต้น (รอติดต่อ) ถือว่าเดิมคือค่าเริ่มต้น ไม่บันทึกซ้ำ
 * - ช่องที่ถูกล้างเป็นค่าว่างไม่บันทึก
 * defaults = ค่าเริ่มต้นของแต่ละช่อง (ส่งเข้ามาเพื่อไม่ผูกไฟล์นี้กับ lead-options)
 */
export function leadStatusChanges(prev: Record<string, string> | null, next: Record<string, string>, defaults: Record<LeadStatusField, string>, field: LeadStatusField | ""): LeadStatusChange[] {
  if (!field) return [];
  const to = String(next[field] ?? "").trim();
  if (!to) return [];
  const from = prev ? String(prev[field] ?? "").trim() || defaults[field] : "";
  return from === to ? [] : [{ field, from, to }];
}

/** Role ที่เป็น Staff ได้ (ฝ่ายขาย) — ใช้เป็นตัวเลือกช่อง Staff ของ Leads / Developer / Home Builder */
export const STAFF_ROLES = ["super_admin", "admin", "ae"];
const th = (a: string, b: string) => a.localeCompare(b, "th");
/** ชื่อ Staff ของผู้ใช้ = "ชื่อที่แสดง" (ถ้าไม่ได้ตั้ง ใช้อีเมล) — ช่อง Staff เก็บเป็นชื่อนี้ */
export const staffNameOf = (u: Record<string, string>) => String(u.display_name ?? "").trim() || String(u.email ?? "").trim();
/** รายชื่อผู้ใช้ที่ใช้งานอยู่และเป็น Staff ได้ (ไม่ซ้ำ เรียงตามชื่อ) */
export function staffUserNames(users: Record<string, string>[], normRole: (v: unknown) => string | null): string[] {
  const names = users.filter((u) => u.email && String(u.active).toUpperCase() === "TRUE" && STAFF_ROLES.includes(normRole(u.role) ?? "")).map(staffNameOf).filter(Boolean);
  return [...new Set(names)].sort(th);
}
/** รายชื่อสำหรับตัวกรอง = ผู้ใช้ปัจจุบัน + ชื่อเดิมที่มีอยู่ในข้อมูลแต่ไม่ตรงกับผู้ใช้ใด (ข้อมูลเก่าที่พิมพ์เอง) */
export const mergeStaff = (userNames: string[], existing: string[]) => [...userNames, ...[...new Set(existing.map((x) => x.trim()).filter(Boolean))].filter((x) => !userNames.includes(x)).sort(th)];
