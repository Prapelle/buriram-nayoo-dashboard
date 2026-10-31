import { ALL_CHANNELS, SERVICES } from "./dashboard";
import { isIsoDate } from "./import/normalize";

export const AREA_OPTIONS: [string, string][] = [["unknown", "ไม่ทราบ (Unknown)"], ["buriram", "บุรีรัมย์"], ["surin", "สุรินทร์"], ["multi_province", "หลายจังหวัด"]];
/** พื้นที่ของ Lead กรอกเองได้ · ชื่อพื้นที่มาตรฐาน (บุรีรัมย์ / สุรินทร์ / หลายจังหวัด) เก็บเป็นรหัสเดิม เพื่อให้ตัวกรองพื้นที่ของ Dashboard/Export ใช้ต่อได้ */
const AREA_BY_NAME: Record<string, string> = Object.fromEntries(AREA_OPTIONS.flatMap(([code, label]) => [[code, code], [label.toLowerCase(), code]]));
AREA_BY_NAME["ไม่ทราบ"] = "unknown";
export function areaCode(v: unknown): string {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  const code = AREA_BY_NAME[s.toLowerCase()];
  return code === "unknown" ? "" : code ?? s;
}
/** ค่าที่แสดง: รหัสมาตรฐาน → ชื่อไทย · ไม่ทราบ/ว่าง → "" · อื่น ๆ แสดงตามที่กรอก */
export function areaLabel(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s || s === "unknown") return "";
  return AREA_OPTIONS.find(([c]) => c === s)?.[1] ?? s;
}
export const AREA_SUGGEST = ["บุรีรัมย์", "สุรินทร์", "หลายจังหวัด"];
import { CALL_DEFAULT, isContactedCall, normCall, NEEDS, BUY_NEEDS, SELL_NEEDS, BUY_STATUS, SELL_STATUS, CALL_STATUS, PROPERTY_TYPES, CONDITIONS, PRICE_RANGES } from "./lead-options";
export { NEEDS, BUY_NEEDS, SELL_NEEDS, BUY_STATUS, SELL_STATUS, CALL_STATUS, PROPERTY_TYPES, CONDITIONS, PRICE_RANGES };

/** ช่องสถานะที่ใช้กับ Need นั้น */
export const statusFieldOf = (need: string): "buy_status" | "sell_status" | "" => (BUY_NEEDS.includes(need) ? "buy_status" : SELL_NEEDS.includes(need) ? "sell_status" : "");
export const statusOptionsOf = (need: string) => (statusFieldOf(need) === "buy_status" ? BUY_STATUS : statusFieldOf(need) === "sell_status" ? SELL_STATUS : []);
/** สถานะที่แสดง (ตาม Need) */
export const leadStatusOf = (r: Lead) => { const k = statusFieldOf(r.need ?? ""); return k ? r[k] ?? "" : ""; };

/** แปลง Buy/Sell Status → ขั้น Pipeline เดิมที่ Dashboard ใช้ (ตามที่ผู้ใช้เลือก) */
const WON = ["Close", "ขายแล้ว"];
const LOST = ["Archive", "ยกเลิก", "บ้านไม่พร้อมขาย"];
const QUALIFIED = ["Hot", "Warm", "สนใจขาย", "นัดทำสัญญา", "เซ็นสัญญา", "สัญญาเปิด"];
export function pipelineOf(r: Lead): "Won" | "Lost" | "Qualified" | "Contacted" | "New" {
  const st = leadStatusOf(r);
  if (WON.includes(st)) return "Won";
  if (LOST.includes(st)) return "Lost";
  if (QUALIFIED.includes(st)) return "Qualified";
  return isContactedCall(r.call_status) ? "Contacted" : "New";
}
export const PIPELINE_MAP = { Qualified: [...QUALIFIED, ...WON], Won: WON, Lost: LOST };

export const LEAD_COLUMNS = ["lead_id", "lead_code", "received_at", "customer_name", "company_name", "phone", "email", "source_channel", "campaign_name", "utm_source", "utm_medium", "utm_campaign", "area", "service_category", "service_interest", "need_description", "owner_email", "status", "contactable", "last_contacted_at", "next_follow_up_at", "qualified_at", "won_at", "lost_reason", "notes", "created_by", "created_at", "updated_by", "updated_at",
  "need", "buy_status", "sell_status", "property_type", "property_condition", "price_range", "call_status", "staff", "line_id", "interest"];
/** status ไม่ได้กรอกเองแล้ว (คำนวณจาก Buy/Sell Status) · owner_email ไม่แสดงในฟอร์มแต่คงค่าเดิมไว้ */
export const EDITABLE = ["received_at", "customer_name", "company_name", "phone", "email", "source_channel", "campaign_name", "utm_source", "utm_medium", "utm_campaign", "area", "service_category", "service_interest", "need_description", "owner_email", "contactable", "last_contacted_at", "next_follow_up_at", "lost_reason", "notes",
  "need", "buy_status", "sell_status", "property_type", "property_condition", "price_range", "call_status", "staff", "line_id", "interest"];
export type Lead = Record<string, string>;

/** คุยกับลูกค้าได้แล้ว (ติดต่อได้แล้วขึ้นไป หรือ ไม่สนใจ) → contactable TRUE · ติดต่อไม่ได้ → FALSE · อื่น ๆ คงค่าเดิม */
export function contactableFor(call: string, current: string): string {
  if (isContactedCall(call) || call === "ไม่สนใจ") return "TRUE";
  if (call === "ติดต่อไม่ได้") return "FALSE";
  return current;
}

export const todayBkk = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export function normalizePhone(s: string): string {
  let d = String(s ?? "").replace(/\D/g, "");
  if (d.startsWith("66") && d.length >= 11) d = "0" + d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d;
}
export const normalizeEmail = (s: string) => String(s ?? "").trim().toLowerCase();
/** Line ID เทียบแบบไม่สนตัวพิมพ์/ช่องว่าง/@ นำหน้า */
export const normalizeLine = (s: string) => String(s ?? "").trim().replace(/^@/, "").replace(/\s+/g, "").toLowerCase();

const LIMITS: Record<string, number> = { customer_name: 200, company_name: 200, campaign_name: 200, utm_source: 200, utm_medium: 200, utm_campaign: 200, service_interest: 300, need_description: 2000, owner_email: 200, lost_reason: 500, notes: 2000, phone: 40, email: 200, staff: 100, line_id: 100, interest: 500, area: 100 };
const LABEL: Record<string, string> = { customer_name: "ชื่อลูกค้า", company_name: "บริษัท", campaign_name: "Campaign", service_interest: "บริการที่สนใจ", need_description: "ความต้องการ", lost_reason: "เหตุผลที่ปิดไม่สำเร็จ", notes: "Note", staff: "Staff", line_id: "Line", interest: "ความสนใจ", area: "พื้นที่", phone: "โทรศัพท์", email: "อีเมล", owner_email: "ผู้รับผิดชอบ" };

export function validateLead(input: Record<string, unknown>): { ok: true; rec: Lead } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const rec: Lead = {};
  for (const k of EDITABLE) rec[k] = String(input[k] ?? "").trim();
  if (!isIsoDate(rec.received_at)) errors.received_at = "กรุณาระบุวันที่รับ Lead";
  if (!rec.customer_name) errors.customer_name = "กรุณาระบุชื่อลูกค้า";
  if (!ALL_CHANNELS.includes(rec.source_channel)) errors.source_channel = "กรุณาเลือกช่องทาง";
  if (rec.service_category && !SERVICES.includes(rec.service_category)) errors.service_category = "หมวดบริการไม่ถูกต้อง";
  if (!NEEDS.includes(rec.need)) errors.need = "กรุณาเลือกความต้องการ (Need)";
  // Call Status กู้ไม่ผ่าน → ต้องกรอกสาเหตุที่กู้ไม่ผ่าน (ใช้ช่อง lost_reason เดิม) — 31/10/2026
  if (normCall(rec.call_status) === "กู้ไม่ผ่าน" && !rec.lost_reason) errors.lost_reason = "กรุณากรอกสาเหตุที่กู้ไม่ผ่าน";
  const sf = statusFieldOf(rec.need);
  if (rec.buy_status && !BUY_STATUS.includes(rec.buy_status)) errors.buy_status = "Buy Status ไม่ถูกต้อง";
  if (rec.sell_status && !SELL_STATUS.includes(rec.sell_status)) errors.sell_status = "Sell Status ไม่ถูกต้อง";
  if (sf === "buy_status" && errors.sell_status) delete errors.sell_status; // ช่องที่ไม่ใช้ จัดการตอนบันทึก
  if (sf === "sell_status" && errors.buy_status) delete errors.buy_status;
  rec.call_status = normCall(rec.call_status);
  if (rec.call_status === "") rec.call_status = CALL_DEFAULT;
  if (!CALL_STATUS.includes(rec.call_status)) errors.call_status = "Call Status ไม่ถูกต้อง";
  if (rec.property_type && !PROPERTY_TYPES.includes(rec.property_type)) errors.property_type = "Type ไม่ถูกต้อง";
  if (rec.property_condition && !CONDITIONS.includes(rec.property_condition)) errors.property_condition = "Condition ไม่ถูกต้อง";
  if (rec.price_range && !PRICE_RANGES.includes(rec.price_range)) errors.price_range = "Price ไม่ถูกต้อง";
  rec.area = areaCode(rec.area); // พื้นที่กรอกเอง (30/10/2026): ชื่อพื้นที่มาตรฐานเก็บเป็นรหัสเดิม ที่เหลือเก็บตามที่กรอก
  if (rec.phone) { const n = normalizePhone(rec.phone).length; if (n < 8 || n > 15) errors.phone = "เบอร์โทรไม่ถูกต้อง (ควรมี 8–15 หลัก)"; }
  if (rec.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rec.email)) errors.email = "รูปแบบอีเมลไม่ถูกต้อง";
  if (rec.owner_email && !/^[^\s@]+@[^\s@]+$/.test(rec.owner_email)) errors.owner_email = "ผู้รับผิดชอบต้องเป็นอีเมล";
  if (!["", "TRUE", "FALSE"].includes(rec.contactable)) errors.contactable = "ค่าไม่ถูกต้อง";
  for (const k of ["last_contacted_at", "next_follow_up_at"]) if (rec[k] && !isIsoDate(rec[k])) errors[k] = "วันที่ไม่ถูกต้อง";
  for (const [k, max] of Object.entries(LIMITS)) if (rec[k] && rec[k].length > max) errors[k] = `${LABEL[k] ?? k}: ยาวเกิน ${max} ตัวอักษร`;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, rec };
}

/** วันที่ Qualified/Won ตั้งอัตโนมัติเมื่อสถานะเปลี่ยน (Qualified เก็บไว้เป็นประวัติ, Won ล้างเมื่อออกจาก Won) */
export function stampStatus(prev: Lead | null, rec: Lead, today: string): { qualified_at: string; won_at: string } {
  const advanced = ["Qualified", "Proposal", "Won"].includes(rec.status);
  return {
    qualified_at: prev?.qualified_at || (advanced ? today : ""),
    won_at: rec.status === "Won" ? prev?.won_at || today : "",
  };
}

/** floor = เลขสูงสุดที่เคยออกไปแล้วแต่ถูกลบ (กันไม่ให้ใช้รหัสซ้ำหลังลบ) */
export function nextLeadCode(codes: string[], year: number, floor = 0): string {
  const re = new RegExp(`^LD-${year}-(\\d+)$`);
  const max = codes.reduce((m, c) => { const x = re.exec(c); return x ? Math.max(m, Number(x[1])) : m; }, floor);
  return `LD-${year}-${String(max + 1).padStart(4, "0")}`;
}

/**
 * จัดการช่องสถานะเมื่อบันทึก: เก็บเฉพาะช่องของ Need ปัจจุบัน
 * ถ้าช่องของอีกกลุ่ม "มีค่าเดิมใน Sheet" (prev) จะไม่ล้างเงียบ ๆ — คืน conflict ให้ผู้ใช้ยืนยันก่อน
 */
export function resolveNeedStatus(prev: Lead | null, rec: Lead): { rec: Lead; conflict: { field: string; value: string } | null } {
  const sf = statusFieldOf(rec.need);
  const other = sf === "buy_status" ? "sell_status" : sf === "sell_status" ? "buy_status" : "";
  const out = { ...rec };
  if (!other) return { rec: out, conflict: null };
  const oldVal = prev?.[other] ?? "";
  out[other] = "";
  return { rec: out, conflict: oldVal ? { field: other, value: oldVal } : null };
}

export type DupMatch = { lead_code: string; customer_name: string; company_name: string; status: string; received_at: string; matched: ("phone" | "email" | "line")[] };
export function findDuplicates(rows: Lead[], rec: Lead, selfId?: string): DupMatch[] {
  const p = normalizePhone(rec.phone), e = normalizeEmail(rec.email), l = normalizeLine(rec.line_id);
  const out: DupMatch[] = [];
  for (const r of rows) {
    if (selfId && r.lead_id === selfId) continue;
    const matched: DupMatch["matched"] = [];
    if (p && normalizePhone(r.phone) === p) matched.push("phone");
    if (e && normalizeEmail(r.email) === e) matched.push("email");
    if (l && normalizeLine(r.line_id) === l) matched.push("line");
    if (matched.length) out.push({ lead_code: r.lead_code, customer_name: r.customer_name, company_name: r.company_name, status: r.status, received_at: r.received_at, matched });
  }
  return out;
}

export type LeadFilter = { q?: string; channel?: string; area?: string; status?: string; service?: string; need?: string; callStatus?: string; staff?: string; from?: string; to?: string };
export function filterLeads(rows: Lead[], f: LeadFilter): Lead[] {
  const q = f.q?.trim().toLowerCase(); const qd = q ? q.replace(/\D/g, "") : "";
  return rows.filter((r) => {
    if (f.channel && r.source_channel !== f.channel) return false;
    if (f.area && areaLabel(r.area) !== f.area) return false;
    if (f.status && leadStatusOf(r) !== f.status) return false;
    if (f.need && r.need !== f.need) return false;
    if (f.callStatus && (normCall(r.call_status) || CALL_DEFAULT) !== f.callStatus) return false;
    if (f.staff && r.staff !== f.staff) return false;
    if (f.from && (r.received_at ?? "") < f.from) return false;
    if (f.to && (r.received_at ?? "").slice(0, 10) > f.to) return false;
    if (f.service && r.service_category !== f.service) return false;
    if (!q) return true;
    if (["lead_code", "customer_name", "company_name", "email", "campaign_name", "phone", "line_id", "interest", "staff", "need_description", "notes"].some((k) => (r[k] ?? "").toLowerCase().includes(q))) return true;
    return qd.length >= 3 && normalizePhone(r.phone).includes(qd);
  });
}
