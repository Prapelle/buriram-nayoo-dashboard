import { CHANNELS } from "./dashboard";
import { SELL_NEEDS } from "./lead-options";
import { normalizeLine, normalizePhone, type Lead } from "./leads";

/**
 * นำเข้า Lead จากไฟล์ CSV / XLSX (12/11/2026)
 * - แถวแรก = หัวคอลัมน์ตามฟอร์ม (ภาษาไทย หรือรหัสคอลัมน์)
 * - ซ้ำ = ฝั่งเดียวกัน (ซื้อ/เช่า/สร้าง หรือ ขาย) และ ชื่อลูกค้าเหมือนกัน หรือ เบอร์โทร / Line เหมือนกัน
 *   (เทียบทั้งกับ Lead ที่มีอยู่และแถวก่อนหน้าในไฟล์เดียวกัน) → ข้าม ไม่เพิ่ม
 */
export const LEAD_TEMPLATE: string[][] = [
  ["วันที่รับ Lead", "ชื่อลูกค้า", "เบอร์โทร", "Line", "ช่องทาง", "Campaign", "ความต้องการ", "ประเภททรัพย์", "ช่วงราคา", "สภาพทรัพย์", "ความสนใจ", "พื้นที่", "สถานะ", "Call Status", "Staff", "ติดต่อล่าสุด", "ติดตามครั้งถัดไป", "Note"],
  ["2026-11-12", "คุณตัวอย่าง ใจดี", "0812345678", "@example", "Facebook Ads", "", "ซื้อ", "บ้านเดี่ยว", "1.5–2.5 m", "", "ใกล้โรงเรียน", "บุรีรัมย์", "Warm", "รอติดต่อ", "", "", "2026-11-15", "แถวตัวอย่าง — ลบก่อนนำเข้า"],
];
export const MAX_IMPORT_ROWS = 1000;

const norm = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
/** หัวคอลัมน์ → ช่องข้อมูล · "สถานะ" = Buy Status หรือ Sell Status ตามความต้องการ */
export const LEAD_IMPORT_HEADERS: Record<string, string> = Object.fromEntries(([
  ["วันที่รับ lead", "received_at"], ["วันที่รับ", "received_at"], ["วันที่", "received_at"], ["received_at", "received_at"],
  ["ชื่อลูกค้า", "customer_name"], ["ชื่อ", "customer_name"], ["customer_name", "customer_name"],
  ["เบอร์โทร", "phone"], ["เบอร์", "phone"], ["โทรศัพท์", "phone"], ["phone", "phone"],
  ["line", "line_id"], ["line id", "line_id"], ["ไลน์", "line_id"], ["line_id", "line_id"],
  ["ช่องทาง", "source_channel"], ["source_channel", "source_channel"], ["campaign", "campaign_name"], ["campaign_name", "campaign_name"],
  ["ความต้องการ", "need"], ["need", "need"], ["ประเภททรัพย์", "property_type"], ["type", "property_type"], ["property_type", "property_type"],
  ["ช่วงราคา", "price_range"], ["price", "price_range"], ["price_range", "price_range"], ["สภาพทรัพย์", "property_condition"], ["condition", "property_condition"], ["property_condition", "property_condition"],
  ["ความสนใจ", "interest"], ["interest", "interest"], ["พื้นที่", "area"], ["area", "area"],
  ["สถานะ", "status_in"], ["buy status", "buy_status"], ["buy_status", "buy_status"], ["sell status", "sell_status"], ["sell_status", "sell_status"],
  ["call status", "call_status"], ["call_status", "call_status"], ["staff", "staff"], ["พนักงาน", "staff"],
  ["ติดต่อล่าสุด", "last_contacted_at"], ["last_contacted_at", "last_contacted_at"], ["ติดตามครั้งถัดไป", "next_follow_up_at"], ["next_follow_up_at", "next_follow_up_at"],
  ["note", "notes"], ["notes", "notes"], ["หมายเหตุ", "notes"],
] as [string, string][]).map(([k, v]) => [norm(k), v]));

/** วันที่จากไฟล์ → YYYY-MM-DD · รองรับ 2026-11-12, 12/11/2026, 12/11/2569 (พ.ศ.), เลขวันที่ของ Excel · อ่านไม่ได้คืนค่าเดิม (ให้ตรวจแจ้งผิด) */
export function importDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) { const [y, m, d] = s.slice(0, 10).split(/[-T]/).map(Number); return fmt(y > 2400 ? y - 543 : y, m, d) ?? s; }
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (dmy) { let y = Number(dmy[3]); if (y < 100) y += y > 50 ? 2500 : 2000; return fmt(y > 2400 ? y - 543 : y, Number(dmy[2]), Number(dmy[1])) ?? s; }
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5); return d.toISOString().slice(0, 10); }
  return s;
}
function fmt(y: number, m: number, d: number): string | null {
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return t.toISOString().slice(0, 10);
}
const channelOf = (v: string) => CHANNELS.find((c) => norm(c) === norm(v)) ?? v;

/** แปลงแถวของไฟล์เป็นค่าฟอร์ม Lead (ยังไม่ตรวจ) · วันที่รับว่าง = วันนี้ · ช่องทางว่าง = Unknown */
export function importRowToInput(map: (string | undefined)[], cells: unknown[], today: string): Record<string, string> {
  const o: Record<string, string> = {};
  map.forEach((f, j) => { if (f) o[f] = String(cells[j] ?? "").trim(); });
  for (const k of ["received_at", "last_contacted_at", "next_follow_up_at"]) if (o[k]) o[k] = importDate(o[k]);
  if (!o.received_at) o.received_at = today;
  o.source_channel = o.source_channel ? channelOf(o.source_channel) : "Unknown";
  if (o.status_in) { o[SELL_NEEDS.includes(o.need ?? "") ? "sell_status" : "buy_status"] ||= o.status_in; delete o.status_in; }
  return o;
}

export type LeadDupReason = "name" | "phone" | "line";
/** หา Lead ฝั่งเดียวกันที่ ชื่อ / เบอร์โทร / Line ซ้ำ (rows ต้องกรองฝั่งมาแล้ว) */
export function importDuplicates(rows: Lead[], rec: Lead): { lead_code: string; matched: LeadDupReason[] }[] {
  const n = norm(rec.customer_name), p = normalizePhone(rec.phone), l = normalizeLine(rec.line_id);
  const out: { lead_code: string; matched: LeadDupReason[] }[] = [];
  for (const r of rows) {
    const m: LeadDupReason[] = [];
    if (n && norm(r.customer_name) === n) m.push("name");
    if (p && normalizePhone(r.phone) === p) m.push("phone");
    if (l && normalizeLine(r.line_id) === l) m.push("line");
    if (m.length) out.push({ lead_code: r.lead_code, matched: m });
  }
  return out;
}
export const DUP_LABEL: Record<LeadDupReason, string> = { name: "ชื่อ", phone: "เบอร์โทร", line: "Line" };
