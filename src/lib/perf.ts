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
/** ตำแหน่งของผู้ใช้: หนึ่งแถวต่อคน · positions = รหัสตำแหน่งคั่นด้วยจุลภาค (หนึ่งคนมีได้หลายตำแหน่ง) */
export const PERF_POSITION_COLUMNS = ["user_email", "positions", "updated_by", "updated_at"];
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
/**
 * ตรวจช่อง Staff ฝั่ง Server (5/11/2026): ต้องว่าง / เป็นชื่อผู้ใช้ที่เป็น Staff ได้ / หรือคงค่าเดิมของรายการนั้น (ข้อมูลเก่าที่พิมพ์เอง)
 * คืนชื่อที่ใช้บันทึก (สะกดตามรายชื่อผู้ใช้) หรือ null ถ้าไม่อนุญาต
 */
export function checkStaff(staff: unknown, prevStaff: unknown, userNames: string[]): string | null {
  const v = String(staff ?? "").trim();
  if (!v || v === String(prevStaff ?? "").trim()) return v;
  return userNames.find((n) => n.toLowerCase() === v.toLowerCase()) ?? null;
}
/** รายชื่อสำหรับตัวกรอง = ผู้ใช้ปัจจุบัน + ชื่อเดิมที่มีอยู่ในข้อมูลแต่ไม่ตรงกับผู้ใช้ใด (ข้อมูลเก่าที่พิมพ์เอง) */
export const mergeStaff = (userNames: string[], existing: string[]) => [...userNames, ...[...new Set(existing.map((x) => x.trim()).filter(Boolean))].filter((x) => !userNames.includes(x)).sort(th)];

// ── ตำแหน่ง + ตัวชี้วัด (นิยามเดียว ใช้ทั้งหน้าตั้งเป้าและตัวคำนวณ) ──
export const POSITIONS = [
  { key: "ae_sell", label: "AE คนต้องการขาย" },
  { key: "ae_buy", label: "AE คนต้องการซื้อ" },
  { key: "sale_developer", label: "Sale developer" },
  { key: "sale_home_builder", label: "Sale home builder" },
  { key: "production", label: "Production" },
] as const;
export type PositionKey = (typeof POSITIONS)[number]["key"];
export const POSITION_KEYS: string[] = POSITIONS.map((p) => p.key);
export const positionLabel = (k: string) => POSITIONS.find((p) => p.key === k)?.label ?? k;

/**
 * สถานะที่ "เป็นบวก" — ได้คะแนนเฉพาะการย้ายเข้าสถานะเหล่านี้ (ผู้ใช้กำหนด 5/11/2026)
 * ย้ายไป บ้านไม่พร้อมขาย / ยกเลิก / ติดต่อไม่ได้ / ไม่สนใจ / กู้ไม่ผ่าน ไม่ได้คะแนน
 */
export const SELL_POSITIVE = ["สนใจขาย", "นัดทำสัญญา", "เซ็นสัญญา", "สัญญาเปิด", "ขายแล้ว"];
export const BUY_POSITIVE = ["ติดต่อได้แล้ว", "รอเข้าชม", "เข้าชมแล้ว", "จอง", "ซื้อสำเร็จ"];

export type MetricUnit = "count" | "baht" | "percent";
/** rule = วิธีนับ (ตัวคำนวณขั้นถัดไปอ่านจากนี้) — how = คำอธิบายภาษาไทยที่แสดงในหน้าตั้งเป้า */
export type MetricRule =
  | { kind: "lead_move"; field: LeadStatusField; from?: string[]; to: string[] }
  | { kind: "dev_status"; to: string }
  | { kind: "dev_contact"; method: string }
  | { kind: "dev_sales" }
  | { kind: "content_done" }
  | { kind: "content_ontime" }
  | { kind: "report_sent" }
  | { kind: "report_ontime" };
export type Metric = { key: string; position: PositionKey; label: string; unit: MetricUnit; how: string; rule: MetricRule };

const devMetrics = (position: "sale_developer" | "sale_home_builder"): Metric[] => [
  { key: `${position}.calls`, position, label: "โทรหาลูกค้า", unit: "count", how: "จำนวนครั้งที่บันทึกการติดต่อแบบ โทร", rule: { kind: "dev_contact", method: "โทร" } },
  { key: `${position}.planned`, position, label: "นัดเข้าพบ", unit: "count", how: "ย้ายการ์ดไป มีแผนเข้าพบ", rule: { kind: "dev_status", to: "มีแผนเข้าพบ" } },
  { key: `${position}.met`, position, label: "เข้าพบแล้ว", unit: "count", how: "ย้ายการ์ดไป เข้าพบแล้ว", rule: { kind: "dev_status", to: "เข้าพบแล้ว" } },
  { key: `${position}.won`, position, label: "ปิดการขาย", unit: "count", how: "ย้ายการ์ดไป ปิดการขาย", rule: { kind: "dev_status", to: "ปิดการขาย" } },
  { key: `${position}.sales`, position, label: "ยอดขาย (บาท)", unit: "baht", how: "ราคารวมของ Product ที่ปิดการขายในเดือนนั้น", rule: { kind: "dev_sales" } },
];

export const METRICS: Metric[] = [
  { key: "ae_sell.contact", position: "ae_sell", label: "ติดต่อผู้ขายได้", unit: "count", how: "ย้ายจาก รอติดต่อ ไปสถานะที่เป็นบวก (สนใจขาย · นัดทำสัญญา · เซ็นสัญญา · สัญญาเปิด · ขายแล้ว)", rule: { kind: "lead_move", field: "sell_status", from: ["รอติดต่อ"], to: SELL_POSITIVE } },
  { key: "ae_sell.contract", position: "ae_sell", label: "เซ็นสัญญา", unit: "count", how: "ย้ายการ์ดไป เซ็นสัญญา", rule: { kind: "lead_move", field: "sell_status", to: ["เซ็นสัญญา"] } },
  { key: "ae_sell.sold", position: "ae_sell", label: "ขายแล้ว", unit: "count", how: "ย้ายการ์ดไป ขายแล้ว", rule: { kind: "lead_move", field: "sell_status", to: ["ขายแล้ว"] } },
  { key: "ae_buy.contact", position: "ae_buy", label: "ติดต่อผู้ซื้อได้", unit: "count", how: "ย้ายจาก รอติดต่อ หรือ ติดต่อไม่ได้ ไปสถานะที่เป็นบวก (ติดต่อได้แล้ว · รอเข้าชม · เข้าชมแล้ว · จอง · ซื้อสำเร็จ)", rule: { kind: "lead_move", field: "call_status", from: ["รอติดต่อ", "ติดต่อไม่ได้"], to: BUY_POSITIVE } },
  { key: "ae_buy.visited", position: "ae_buy", label: "เข้าชมแล้ว", unit: "count", how: "ย้ายการ์ดไป เข้าชมแล้ว", rule: { kind: "lead_move", field: "call_status", to: ["เข้าชมแล้ว"] } },
  { key: "ae_buy.booked", position: "ae_buy", label: "จอง", unit: "count", how: "ย้ายการ์ดไป จอง", rule: { kind: "lead_move", field: "call_status", to: ["จอง"] } },
  { key: "ae_buy.sold", position: "ae_buy", label: "ซื้อสำเร็จ", unit: "count", how: "ย้ายการ์ดไป ซื้อสำเร็จ", rule: { kind: "lead_move", field: "call_status", to: ["ซื้อสำเร็จ"] } },
  ...devMetrics("sale_developer"),
  ...devMetrics("sale_home_builder"),
  { key: "production.done", position: "production", label: "งานที่เสร็จ", unit: "count", how: "การ์ด Content ที่เสร็จ โดยผู้ร่วมงานทุกคนในการ์ดได้ครบ 1 งาน", rule: { kind: "content_done" } },
  { key: "production.ontime", position: "production", label: "ทันเวลา (%)", unit: "percent", how: "งานที่เผยแพร่ไม่เกินวันลง ÷ งานที่เสร็จและมีวันลง (วันลงเลื่อนออกตามวันทำการที่รอลูกค้า ตัดวันอาทิตย์/วันหยุดบริษัท)", rule: { kind: "content_ontime" } },
  { key: "production.reports", position: "production", label: "รายงานที่ส่งลูกค้า", unit: "count", how: "การ์ดงานขายที่ย้ายเป็น ส่งให้ลูกค้าแล้ว ในเดือนนี้ ผู้ร่วมงานทุกคนในการ์ดได้ครบ 1 งาน", rule: { kind: "report_sent" } },
  { key: "production.report_ontime", position: "production", label: "ส่งรายงานทันเวลา (%)", unit: "percent", how: "รายงานที่ส่งไม่เกินวันครบกำหนด ÷ รายงานที่ส่งทั้งหมดในเดือน (วันครบกำหนดเลื่อนตามวันทำการที่รอลูกค้า)", rule: { kind: "report_ontime" } },
];
export const metricsOf = (position: string) => METRICS.filter((m) => m.position === position);
export const metricByKey = (key: string) => METRICS.find((m) => m.key === key);

// ── ตรวจข้อมูลเข้า ──
export class PerfError extends Error {
  constructor(public status: number, message: string, public code: string, public fields?: Record<string, string>) { super(message); }
}
const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && Number(m.slice(0, 4)) >= 2020 && Number(m.slice(0, 4)) <= 2100;
export const isIsoDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z")) && new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;
export const parsePositions = (v: unknown): string[] => [...new Set(String(v ?? "").split(",").map((x) => x.trim()).filter((x) => POSITION_KEYS.includes(x)))];

export type TargetInput = { user_email: string; metric_key: string; value: unknown };
/** ตรวจเป้าหมาย 1 รายการ: ตัวชี้วัดต้องมีจริง · ว่าง = ไม่ตั้งเป้า (null) · ตัวเลข 0 ขึ้นไป (เปอร์เซ็นต์ไม่เกิน 100, จำนวนต้องเป็นจำนวนเต็ม) */
export function validateTarget(t: TargetInput): { metric: Metric; value: number | null } {
  const metric = metricByKey(String(t.metric_key ?? ""));
  if (!metric) throw new PerfError(422, "ตัวชี้วัดไม่ถูกต้อง", "VALIDATION", { metric_key: "ตัวชี้วัดไม่ถูกต้อง" });
  const raw = String(t.value ?? "").replace(/,/g, "").trim();
  if (!raw) return { metric, value: null };
  const n = Number(raw);
  const bad = (m: string) => new PerfError(422, `${metric.label}: ${m}`, "VALIDATION", { [t.metric_key]: m });
  if (!Number.isFinite(n) || n < 0) throw bad("ต้องเป็นตัวเลข 0 ขึ้นไป");
  if (metric.unit === "percent" && n > 100) throw bad("เปอร์เซ็นต์ไม่เกิน 100");
  if (metric.unit === "count" && !Number.isInteger(n)) throw bad("ต้องเป็นจำนวนเต็ม");
  if (n > 1e9) throw bad("ตัวเลขสูงเกินไป");
  return { metric, value: metric.unit === "baht" ? Math.round(n * 100) / 100 : n };
}
export const validateMonth = (m: unknown): string => { const v = String(m ?? "").trim(); if (!isMonth(v)) throw new PerfError(422, "เดือนไม่ถูกต้อง (YYYY-MM)", "VALIDATION", { month: "เดือนไม่ถูกต้อง" }); return v; };
export function validateHoliday(date: unknown, name: unknown): { date: string; name: string } {
  const d = String(date ?? "").trim(), n = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!isIsoDate(d)) throw new PerfError(422, "วันที่ไม่ถูกต้อง", "VALIDATION", { holiday_date: "วันที่ไม่ถูกต้อง" });
  if (!n || n.length > 100) throw new PerfError(422, "ใส่ชื่อวันหยุด 1–100 ตัวอักษร", "VALIDATION", { name: "ใส่ชื่อวันหยุด 1–100 ตัวอักษร" });
  return { date: d, name: n };
}
