export const NUM_FIELDS: [string, string][] = [
  ["friends_start", "เพื่อนต้นเดือน"], ["friends_end", "เพื่อนสิ้นเดือน"], ["new_friends", "เพื่อนใหม่"], ["blocked_users", "ผู้บล็อก"],
  ["broadcast_count", "จำนวน Broadcast"], ["messages_sent", "ข้อความที่ส่ง"], ["messages_delivered", "ข้อความที่ส่งถึง"],
  ["opens", "เปิดอ่าน"], ["clicks", "คลิก"], ["new_chats", "แชตใหม่"], ["inquiries", "Inquiries (สอบถาม)"],
  ["leads", "Leads"], ["qualified_leads", "Qualified Leads"],
];
export const TEXT_FIELDS: [string, string, number][] = [["campaign_activity", "แคมเปญ / กิจกรรม", 500], ["notes", "หมายเหตุ", 2000]];
export const LINE_COLUMNS = ["record_id", "report_month", ...NUM_FIELDS.map((f) => f[0]), ...TEXT_FIELDS.map((f) => f[0]), "created_by", "created_at", "updated_at"];

export type Saved = Record<string, string | number>;
export type Validation = { ok: true; rec: Saved } | { ok: false; errors: Record<string, string> };

/** ช่องว่าง = ไม่มีข้อมูล (เก็บเป็นค่าว่าง ไม่ใช่ 0) */
export function validateLine(input: Record<string, unknown>): Validation {
  const errors: Record<string, string> = {};
  const rec: Saved = {};
  const month = String(input.report_month ?? "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) errors.report_month = "กรุณาเลือกเดือนที่รายงาน (รูปแบบ YYYY-MM)";
  rec.report_month = month;
  for (const [k, label] of NUM_FIELDS) {
    const raw = String(input[k] ?? "").trim().replace(/,/g, "");
    if (raw === "") { rec[k] = ""; continue; }
    if (!/^\d+$/.test(raw)) { errors[k] = `${label}: ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป`; continue; }
    const n = Number(raw);
    if (n > 1_000_000_000) { errors[k] = `${label}: ค่าสูงเกินไป`; continue; }
    rec[k] = n;
  }
  for (const [k, label, max] of TEXT_FIELDS) {
    const t = String(input[k] ?? "").trim();
    if (t.length > max) errors[k] = `${label}: ยาวเกิน ${max} ตัวอักษร`;
    rec[k] = t;
  }
  const n = (k: string) => (typeof rec[k] === "number" ? (rec[k] as number) : null);
  if (n("qualified_leads") !== null && n("leads") !== null && n("qualified_leads")! > n("leads")!) errors.qualified_leads = "Qualified Leads ต้องไม่มากกว่า Leads";
  if (n("messages_delivered") !== null && n("messages_sent") !== null && n("messages_delivered")! > n("messages_sent")!) errors.messages_delivered = "ข้อความที่ส่งถึงต้องไม่มากกว่าข้อความที่ส่ง";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, rec };
}
