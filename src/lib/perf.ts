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
/**
 * ประวัติ "ติดตามทันกำหนด" (6/11/2026): หนึ่งแถว = การลงมือ (ย้ายสถานะ / บันทึกการติดต่อ) ครั้งแรกของรอบนัดติดตามหนึ่งรอบ
 * due_day = วัน "ติดต่อครั้งถัดไป" ก่อนลงมือ · done_day = วันที่ลงมือ (เวลาไทย) · ทัน = done_day ≤ due_day
 */
export const FOLLOWUP_COLUMNS = ["log_id", "kind", "item_id", "item_code", "staff", "due_day", "done_day", "done_by", "done_at"];
/** วันหยุดบริษัท (ใช้นับวันทำการ: จันทร์–เสาร์ ตัดวันอาทิตย์ และวันในตารางนี้) */
export const PERF_HOLIDAY_COLUMNS = ["holiday_date", "name", "created_by", "created_at"];

export const PERF_DEFS = [
  { name: "LEAD_STATUS_LOG", headers: LEAD_LOG_COLUMNS },
  { name: "PERF_TARGETS", headers: PERF_TARGET_COLUMNS },
  { name: "PERF_POSITIONS", headers: PERF_POSITION_COLUMNS },
  { name: "PERF_HOLIDAYS", headers: PERF_HOLIDAY_COLUMNS },
  { name: "FOLLOWUP_LOG", headers: FOLLOWUP_COLUMNS },
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

/** แปลงเวลา ISO เป็นวันที่เวลาไทย (YYYY-MM-DD) */
const bkk = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);
export type FollowKind = "lead" | "developer" | "home_builder";
/**
 * แถวประวัติ "ติดตามทันกำหนด": มีวันนัดติดตามเดิม (prevDue) และมีการลงมือ → บันทึก (ไม่มีวันนัด = ไม่มีอะไรให้วัด)
 * วันนัดที่ผู้ใช้ตั้งเป็นอนาคตแล้วลงมือก่อนก็ถือว่าทัน (done_day ≤ due_day)
 */
export function followupRow(kind: FollowKind, item: { id: string; code: string; staff: string }, prevDue: unknown, actor: string, at: string): Record<string, string> | null {
  const due = String(prevDue ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  return { log_id: crypto.randomUUID(), kind, item_id: item.id, item_code: item.code, staff: item.staff, due_day: due, done_day: bkk(at), done_by: actor, done_at: at };
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
/** Qualified Lead ฝั่งผู้ซื้อ (นิยามเดียวกับ Dashboard — 30/10/2026): ติดต่อได้แล้ว ยังไม่นับ · นับเมื่อ "เพิ่งเป็น" Qualified (ย้ายมาจากสถานะที่ยังไม่ Qualified) */
export const BUY_QUALIFIED = ["รอเข้าชม", "เข้าชมแล้ว", "จอง", "ซื้อสำเร็จ", "กู้ไม่ผ่าน"];
export const BUY_NOT_QUALIFIED = ["", "รอติดต่อ", "ติดต่อได้แล้ว", "ติดต่อไม่ได้", "ไม่สนใจ"];

export type MetricUnit = "count" | "baht" | "percent";
/** rule = วิธีนับ (ตัวคำนวณขั้นถัดไปอ่านจากนี้) — how = คำอธิบายภาษาไทยที่แสดงในหน้าตั้งเป้า */
export type MetricRule =
  | { kind: "lead_move"; field: LeadStatusField; from?: string[]; to: string[] }
  | { kind: "dev_status"; to: string }
  | { kind: "dev_contact"; method: string }
  | { kind: "dev_sales" }
  | { kind: "dev_close_rate" }                       // ปิดเดือนนี้ ÷ เข้าพบเดือนนี้
  | { kind: "follow_ontime"; source: "lead" | "dev" } // บริหารข้อมูล: ลงมือภายในวันนัดติดตาม
  | { kind: "lead_stale"; field: LeadStatusField }    // ไม่ค้างสถานะเกิน 3 วันทำการ
  | { kind: "lead_intake" }                           // ทรัพย์เข้าระบบ (Lead ขายที่สร้างในเดือน)
  | { kind: "lead_ratio"; num: string; den: string }  // อัตราปิด = ตัวตั้ง ÷ ตัวหาร (อ้างตัวชี้วัดอื่น)
  | { kind: "commission" }                            // ค่าคอมมิชชันจากใบเสร็จ
  | { kind: "content_stale" }                         // การ์ดไม่ค้างขั้นเกิน 3 วันทำการ (ไม่รวมรอลูกค้า)
  | { kind: "content_sales_ontime" }                  // งานขายส่งทันเวลา
  | { kind: "content_done" }
  | { kind: "content_ontime" }
  | { kind: "report_sent" }
  | { kind: "report_ontime" };
export type Metric = { key: string; position: PositionKey; label: string; unit: MetricUnit; how: string; rule: MetricRule };

const devMetrics = (position: "sale_developer" | "sale_home_builder"): Metric[] => [
  { key: `${position}.calls`, position, label: "โทรหาลูกค้า", unit: "count", how: "จำนวนลูกค้าที่บันทึกการติดต่อแบบ โทร ในเดือนนั้น (นับ 1 ครั้งต่อลูกค้าต่อเดือน)", rule: { kind: "dev_contact", method: "โทร" } },
  { key: `${position}.planned`, position, label: "นัดเข้าพบ", unit: "count", how: "ย้ายการ์ดไป มีแผนเข้าพบ", rule: { kind: "dev_status", to: "มีแผนเข้าพบ" } },
  { key: `${position}.met`, position, label: "เข้าพบแล้ว", unit: "count", how: "ย้ายการ์ดไป เข้าพบแล้ว", rule: { kind: "dev_status", to: "เข้าพบแล้ว" } },
  { key: `${position}.won`, position, label: "ปิดการขาย", unit: "count", how: "ย้ายการ์ดไป ปิดการขาย หรือยืนยันชำระเงิน / เริ่มงานในระบบบัญชี (ระบบบันทึกปิดการขายให้ · 1 ครั้งต่อลูกค้าต่อเดือน)", rule: { kind: "dev_status", to: "ปิดการขาย" } },
  { key: `${position}.close_rate`, position, label: "อัตราปิดการขาย (%)", unit: "percent", how: "ปิดการขายเดือนนี้ ÷ เข้าพบเดือนนี้", rule: { kind: "dev_close_rate" } },
  { key: `${position}.data_mgmt`, position, label: "บริหารข้อมูล (%)", unit: "percent", how: "การ์ดที่ถึงวัน 'ติดต่อครั้งถัดไป' แล้วมีการติดต่อหรือย้ายสถานะภายในวันนั้น ÷ การ์ดที่ถึงกำหนดทั้งหมดในเดือน (เริ่มนับ 6/11/2026)", rule: { kind: "follow_ontime", source: "dev" } },
  { key: `${position}.sales`, position, label: "ยอดขาย (บาท)", unit: "baht", how: "ราคารวมของ Product ที่ปิดการขายในเดือนนั้น (จากเอกสารบัญชี = ราคาหลังหักส่วนลดท้ายบิล ก่อน VAT)", rule: { kind: "dev_sales" } },
];

export const METRICS: Metric[] = [
  { key: "ae_sell.contact", position: "ae_sell", label: "ติดต่อผู้ขายได้", unit: "count", how: "ย้ายจาก รอติดต่อ ไปสถานะที่เป็นบวก (สนใจขาย · นัดทำสัญญา · เซ็นสัญญา · สัญญาเปิด · ขายแล้ว) หรือสร้าง Lead ที่สถานะบวกตั้งแต่แรก", rule: { kind: "lead_move", field: "sell_status", from: ["", "รอติดต่อ"], to: SELL_POSITIVE } },
  { key: "ae_sell.contract", position: "ae_sell", label: "สัญญารับฝากขายแบบปิด (เซ็นสัญญา)", unit: "count", how: "ย้ายการ์ดไป เซ็นสัญญา", rule: { kind: "lead_move", field: "sell_status", to: ["เซ็นสัญญา"] } },
  { key: "ae_sell.sold", position: "ae_sell", label: "ขายแล้ว", unit: "count", how: "ย้ายการ์ดไป ขายแล้ว", rule: { kind: "lead_move", field: "sell_status", to: ["ขายแล้ว"] } },
  { key: "ae_buy.contact", position: "ae_buy", label: "ติดต่อผู้ซื้อได้", unit: "count", how: "ย้ายจาก รอติดต่อ หรือ ติดต่อไม่ได้ ไปสถานะที่เป็นบวก (ติดต่อได้แล้ว · รอเข้าชม · เข้าชมแล้ว · จอง · ซื้อสำเร็จ) หรือสร้าง Lead ที่สถานะบวกตั้งแต่แรก", rule: { kind: "lead_move", field: "call_status", from: ["", "รอติดต่อ", "ติดต่อไม่ได้"], to: BUY_POSITIVE } },
  { key: "ae_buy.qualified", position: "ae_buy", label: "Qualified Lead", unit: "count", how: "Lead ผู้ซื้อที่เพิ่งเป็น Qualified ในเดือนนั้น = ย้ายเข้า รอเข้าชม · เข้าชมแล้ว · จอง · ซื้อสำเร็จ · กู้ไม่ผ่าน จากสถานะที่ยังไม่ Qualified (ติดต่อได้แล้ว ยังไม่นับ)", rule: { kind: "lead_move", field: "call_status", from: BUY_NOT_QUALIFIED, to: BUY_QUALIFIED } },
  { key: "ae_buy.visited", position: "ae_buy", label: "เข้าชมแล้ว", unit: "count", how: "ย้ายการ์ดไป เข้าชมแล้ว", rule: { kind: "lead_move", field: "call_status", to: ["เข้าชมแล้ว"] } },
  { key: "ae_buy.booked", position: "ae_buy", label: "จอง", unit: "count", how: "ย้ายการ์ดไป จอง", rule: { kind: "lead_move", field: "call_status", to: ["จอง"] } },
  { key: "ae_buy.sold", position: "ae_buy", label: "ซื้อสำเร็จ", unit: "count", how: "ย้ายการ์ดไป ซื้อสำเร็จ", rule: { kind: "lead_move", field: "call_status", to: ["ซื้อสำเร็จ"] } },
  { key: "ae_sell.intake", position: "ae_sell", label: "ทรัพย์เข้าระบบ", unit: "count", how: "จำนวน Lead ผู้ขาย (Need = ขาย) ที่สร้างในเดือนนั้น หรือเปลี่ยน Need มาเป็น ขาย ในเดือนนั้น · 1 ครั้งต่อ Lead ต่อเดือน (เริ่มนับ 5/11/2026)", rule: { kind: "lead_intake" } },
  { key: "ae_sell.open_contract", position: "ae_sell", label: "สัญญารับฝากขายแบบเปิด", unit: "count", how: "ย้ายการ์ดไป สัญญาเปิด", rule: { kind: "lead_move", field: "sell_status", to: ["สัญญาเปิด"] } },
  { key: "ae_sell.follow", position: "ae_sell", label: "ติดตาม Lead ไม่ค้างเกิน 3 วัน (%)", unit: "percent", how: "ช่วงที่ Lead ผู้ขายอยู่ในสถานะเดียว ที่ไม่เกิน 3 วันทำการ (จันทร์–เสาร์ ตัดวันหยุดบริษัท) ÷ ทุกช่วงที่จบหรือค้างในเดือน · สถานะปลายทาง (ขายแล้ว / ยกเลิก / บ้านไม่พร้อมขาย) ไม่นับเป็นค้าง", rule: { kind: "lead_stale", field: "sell_status" } },
  { key: "ae_sell.data_mgmt", position: "ae_sell", label: "บริหารข้อมูล (%)", unit: "percent", how: "Lead ที่ถึงวัน 'ติดต่อครั้งถัดไป' แล้วมีการติดต่อหรือย้ายสถานะภายในวันนั้น ÷ ที่ถึงกำหนดทั้งหมดในเดือน (เริ่มนับ 6/11/2026)", rule: { kind: "follow_ontime", source: "lead" } },
  { key: "ae_buy.commission", position: "ae_buy", label: "รายได้ค่าคอมมิชชัน (บาท)", unit: "baht", how: "ผลรวมรายการ 'ค่าคอมมิชชัน' ในใบเสร็จรับเงินของเดือนนั้น แยกตามชื่อผู้ขายในเอกสาร (ใบเสร็จชำระบางส่วนคิดตามสัดส่วน)", rule: { kind: "commission" } },
  { key: "ae_buy.close_rate", position: "ae_buy", label: "อัตราปิดการขาย (%)", unit: "percent", how: "ซื้อสำเร็จ ÷ Qualified Lead ในเดือนนั้น · 1 ดีลต่อ 15 Qualified ≈ 6.7%", rule: { kind: "lead_ratio", num: "ae_buy.sold", den: "ae_buy.qualified" } },
  { key: "ae_buy.follow", position: "ae_buy", label: "ติดตาม Lead ไม่ค้างเกิน 3 วัน (%)", unit: "percent", how: "ช่วงที่ Lead ผู้ซื้อ/เช่า อยู่ในสถานะเดียว ที่ไม่เกิน 3 วันทำการ ÷ ทุกช่วงที่จบหรือค้างในเดือน · สถานะปลายทาง (ซื้อสำเร็จ / ไม่สนใจ / กู้ไม่ผ่าน) ไม่นับเป็นค้าง", rule: { kind: "lead_stale", field: "call_status" } },
  { key: "ae_buy.data_mgmt", position: "ae_buy", label: "บริหารข้อมูล (%)", unit: "percent", how: "Lead ที่ถึงวัน 'ติดต่อครั้งถัดไป' แล้วมีการติดต่อหรือย้ายสถานะภายในวันนั้น ÷ ที่ถึงกำหนดทั้งหมดในเดือน (เริ่มนับ 6/11/2026)", rule: { kind: "follow_ontime", source: "lead" } },
  ...devMetrics("sale_developer"),
  ...devMetrics("sale_home_builder"),
  { key: "production.done", position: "production", label: "งานที่เสร็จ", unit: "count", how: "การ์ด Content ที่เผยแพร่ในเดือนนั้น โดยผู้ร่วมงานทุกคนในการ์ดได้ครบ 1 งาน (การ์ดที่ถูกย้ายกลับแล้วเผยแพร่ใหม่ นับเฉพาะครั้งล่าสุด)", rule: { kind: "content_done" } },
  { key: "production.ontime", position: "production", label: "ทันเวลา (%)", unit: "percent", how: "งานที่เผยแพร่ไม่เกินวันลง ÷ งานที่เสร็จและมีวันลง (วันลงเลื่อนออกตามวันทำการที่รอลูกค้า ตัดวันอาทิตย์/วันหยุดบริษัท)", rule: { kind: "content_ontime" } },
  { key: "production.data_mgmt", position: "production", label: "บริหารข้อมูล (%)", unit: "percent", how: "ช่วงที่การ์ดอยู่ขั้นเดียวไม่เกิน 3 วันทำการ (ไม่รวมวันที่รอลูกค้า) ÷ ทุกช่วงที่จบหรือค้างในเดือน · ผู้ร่วมงานทุกคนในการ์ดได้ครบ", rule: { kind: "content_stale" } },
  { key: "production.sales_ontime", position: "production", label: "ส่งงานขาย ทันเวลา (%)", unit: "percent", how: "การ์ดที่ติดแท็กงานขาย เสร็จและเผยแพร่ไม่เกินวันลง (วันลงเลื่อนตามวันที่รอลูกค้า) ÷ การ์ดงานขายที่เสร็จและมีวันลง", rule: { kind: "content_sales_ontime" } },
  { key: "production.reports", position: "production", label: "รายงานที่ส่งลูกค้า", unit: "count", how: "การ์ดงานขายที่ย้ายเป็น ส่งให้ลูกค้าแล้ว ในเดือนนี้ ผู้ร่วมงานทุกคนในการ์ดได้ครบ 1 งาน", rule: { kind: "report_sent" } },
  { key: "production.report_ontime", position: "production", label: "ส่งรายงานทันเวลา (%)", unit: "percent", how: "รายงานที่ส่งไม่เกินวันครบกำหนด ÷ รายงานที่ส่งทั้งหมดในเดือน (วันครบกำหนดเลื่อนตามวันทำการที่รอลูกค้า)", rule: { kind: "report_ontime" } },
];
/**
 * เป้าตั้งต้นต่อตำแหน่ง (6/11/2026 ตามที่ผู้ใช้กำหนด) — Super Admin แก้ได้ที่ ตั้งค่า → ประสิทธิภาพรายคน
 * ลำดับการใช้เป้า: เป้ารายคนรายเดือน (ถ้ามี) → เป้าตั้งต้นที่ Super Admin แก้ → ค่าในโค้ดนี้
 */
export const DEFAULT_TARGETS: Record<string, number> = {
  "sale_home_builder.sales": 50000, "sale_home_builder.met": 10, "sale_home_builder.close_rate": 70, "sale_home_builder.data_mgmt": 80,
  "sale_developer.sales": 100000, "sale_developer.met": 15, "sale_developer.close_rate": 70, "sale_developer.data_mgmt": 80,
  "ae_sell.intake": 15, "ae_sell.contract": 3, "ae_sell.open_contract": 12, "ae_sell.follow": 90, "ae_sell.data_mgmt": 80,
  "ae_buy.sold": 1, "ae_buy.commission": 60000, "ae_buy.visited": 15, "ae_buy.close_rate": 6.7, "ae_buy.follow": 90, "ae_buy.data_mgmt": 80,
  "production.done": 20, "production.ontime": 90, "production.data_mgmt": 80, "production.sales_ontime": 100,
};
export const DEFAULT_TARGETS_KEY = "perf_default_targets";
/** อ่านเป้าตั้งต้นที่ Super Admin แก้ (JSON ใน APP_CONFIG) ทับค่าในโค้ด · "" / null = ยกเลิกเป้าข้อนั้น */
export function defaultTargetsOf(rows: Record<string, string>[]): Record<string, number> {
  const out = { ...DEFAULT_TARGETS };
  try {
    const o = JSON.parse(rows.find((r) => r.config_key === DEFAULT_TARGETS_KEY)?.config_value || "{}");
    for (const [k, v] of Object.entries(o)) { if (!metricByKey(k)) continue; if (v === null || v === "") delete out[k]; else if (Number.isFinite(Number(v)) && Number(v) >= 0) out[k] = Number(v); }
  } catch { /* ใช้ค่าในโค้ด */ }
  return out;
}
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
