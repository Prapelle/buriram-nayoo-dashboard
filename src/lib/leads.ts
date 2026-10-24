import { CHANNELS, PIPELINE, SERVICES } from "./dashboard";
import { isIsoDate } from "./import/normalize";

export const AREA_OPTIONS: [string, string][] = [["unknown", "ไม่ทราบ (Unknown)"], ["buriram", "บุรีรัมย์"], ["surin", "สุรินทร์"], ["multi_province", "หลายจังหวัด"]];
export const LEAD_COLUMNS = ["lead_id", "lead_code", "received_at", "customer_name", "company_name", "phone", "email", "source_channel", "campaign_name", "utm_source", "utm_medium", "utm_campaign", "area", "service_category", "service_interest", "need_description", "owner_email", "status", "contactable", "last_contacted_at", "next_follow_up_at", "qualified_at", "won_at", "lost_reason", "notes", "created_by", "created_at", "updated_by", "updated_at"];
export const EDITABLE = ["received_at", "customer_name", "company_name", "phone", "email", "source_channel", "campaign_name", "utm_source", "utm_medium", "utm_campaign", "area", "service_category", "service_interest", "need_description", "owner_email", "status", "contactable", "last_contacted_at", "next_follow_up_at", "lost_reason", "notes"];
export type Lead = Record<string, string>;

export const todayBkk = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export function normalizePhone(s: string): string {
  let d = String(s ?? "").replace(/\D/g, "");
  if (d.startsWith("66") && d.length >= 11) d = "0" + d.slice(2);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  return d;
}
export const normalizeEmail = (s: string) => String(s ?? "").trim().toLowerCase();

const LIMITS: Record<string, number> = { customer_name: 200, company_name: 200, campaign_name: 200, utm_source: 200, utm_medium: 200, utm_campaign: 200, service_interest: 300, need_description: 2000, owner_email: 200, lost_reason: 500, notes: 2000, phone: 40, email: 200 };
const LABEL: Record<string, string> = { customer_name: "ชื่อลูกค้า", company_name: "บริษัท", campaign_name: "Campaign", service_interest: "บริการที่สนใจ", need_description: "ความต้องการ", lost_reason: "เหตุผลที่ปิดไม่สำเร็จ", notes: "หมายเหตุ", phone: "โทรศัพท์", email: "อีเมล", owner_email: "ผู้รับผิดชอบ" };

export function validateLead(input: Record<string, unknown>): { ok: true; rec: Lead } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const rec: Lead = {};
  for (const k of EDITABLE) rec[k] = String(input[k] ?? "").trim();
  if (!isIsoDate(rec.received_at)) errors.received_at = "กรุณาระบุวันที่รับ Lead";
  if (!rec.customer_name) errors.customer_name = "กรุณาระบุชื่อลูกค้า";
  if (!CHANNELS.includes(rec.source_channel)) errors.source_channel = "กรุณาเลือกช่องทาง";
  if (!SERVICES.includes(rec.service_category)) errors.service_category = "กรุณาเลือกหมวดบริการ";
  if (!PIPELINE.includes(rec.status)) errors.status = "กรุณาเลือกสถานะ";
  if (!AREA_OPTIONS.some(([v]) => v === rec.area)) { if (rec.area === "") rec.area = "unknown"; else errors.area = "Area ไม่ถูกต้อง"; }
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

export function nextLeadCode(codes: string[], year: number): string {
  const re = new RegExp(`^LD-${year}-(\\d+)$`);
  const max = codes.reduce((m, c) => { const x = re.exec(c); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `LD-${year}-${String(max + 1).padStart(4, "0")}`;
}

export type DupMatch = { lead_code: string; customer_name: string; company_name: string; status: string; received_at: string; matched: ("phone" | "email")[] };
export function findDuplicates(rows: Lead[], rec: Lead, selfId?: string): DupMatch[] {
  const p = normalizePhone(rec.phone), e = normalizeEmail(rec.email);
  const out: DupMatch[] = [];
  for (const r of rows) {
    if (selfId && r.lead_id === selfId) continue;
    const matched: DupMatch["matched"] = [];
    if (p && normalizePhone(r.phone) === p) matched.push("phone");
    if (e && normalizeEmail(r.email) === e) matched.push("email");
    if (matched.length) out.push({ lead_code: r.lead_code, customer_name: r.customer_name, company_name: r.company_name, status: r.status, received_at: r.received_at, matched });
  }
  return out;
}

export type LeadFilter = { q?: string; channel?: string; area?: string; status?: string; service?: string };
export function filterLeads(rows: Lead[], f: LeadFilter): Lead[] {
  const q = f.q?.trim().toLowerCase(); const qd = q ? q.replace(/\D/g, "") : "";
  return rows.filter((r) => {
    if (f.channel && r.source_channel !== f.channel) return false;
    if (f.area && (r.area || "unknown") !== f.area) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.service && r.service_category !== f.service) return false;
    if (!q) return true;
    if (["lead_code", "customer_name", "company_name", "email", "campaign_name", "phone"].some((k) => (r[k] ?? "").toLowerCase().includes(q))) return true;
    return qd.length >= 3 && normalizePhone(r.phone).includes(qd);
  });
}
