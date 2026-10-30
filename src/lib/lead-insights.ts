// วิเคราะห์ Lead (30/10/2026): รายการติดตาม · ผลงานรายพนักงาน · เหตุผลที่ไม่สำเร็จ
// ใช้ร่วมกันในหน้า ภาพรวม, Leads และ รายงาน Lead (ไม่อ่านข้อมูลส่วนบุคคลนอกจากที่หน้านั้นมีสิทธิ์อยู่แล้ว)
import { isQualifiedCall, isSiteVisitCall, normCall, SELL_NEEDS } from "./lead-options";

export type LeadRow = Record<string, string>;
const day = (v: unknown) => String(v ?? "").slice(0, 10);
const isSeller = (r: LeadRow) => SELL_NEEDS.includes(r.need ?? "");

/** Lead ที่จบแล้ว (ไม่ต้องติดตาม) */
export const CLOSED_CALL = ["ซื้อสำเร็จ", "กู้ไม่ผ่าน", "ไม่สนใจ"];
export const CLOSED_SELL = ["ขายแล้ว", "ยกเลิก", "บ้านไม่พร้อมขาย"];
export const CLOSED_BUY = ["Close", "Archive"];
export function isClosedLead(r: LeadRow): boolean {
  if (isSeller(r)) return CLOSED_SELL.includes(r.sell_status ?? "");
  return CLOSED_CALL.includes(normCall(r.call_status)) || CLOSED_BUY.includes(r.buy_status ?? "");
}

/** สัญญา + ขายแล้ว (Seller Leads): เซ็นสัญญา / สัญญาเปิด / ขายแล้ว */
export const CONTRACT_SELL = ["เซ็นสัญญา", "สัญญาเปิด", "ขายแล้ว"];
export const isContractOrSold = (r: LeadRow) => CONTRACT_SELL.includes(r.sell_status ?? "");

export const STALE_DAYS = 14;
const addDays = (d: string, n: number) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export type FollowUp = { overdue: LeadRow[]; today: LeadRow[]; stale: LeadRow[] };
/**
 * รายการติดตามของฝ่ายขาย (ไม่รวม Lead ที่จบแล้ว)
 * - เลยกำหนด: วันติดตามครั้งถัดไป < วันนี้ · วันนี้: = วันนี้
 * - ค้างนาน: ไม่มีวันติดตาม และไม่ได้แก้ไขเกิน 14 วัน
 */
export function followUps(rows: LeadRow[], today: string): FollowUp {
  const open = rows.filter((r) => r.lead_id && !isClosedLead(r));
  const by = (a: LeadRow, b: LeadRow) => day(a.next_follow_up_at).localeCompare(day(b.next_follow_up_at));
  const cutoff = addDays(today, -STALE_DAYS);
  return {
    overdue: open.filter((r) => day(r.next_follow_up_at) && day(r.next_follow_up_at) < today).sort(by),
    today: open.filter((r) => day(r.next_follow_up_at) === today),
    stale: open.filter((r) => !day(r.next_follow_up_at) && day(r.updated_at || r.created_at || r.received_at) && day(r.updated_at || r.created_at || r.received_at) < cutoff)
      .sort((a, b) => day(a.updated_at || a.received_at).localeCompare(day(b.updated_at || b.received_at))),
  };
}

export type StaffRow = {
  staff: string; leads: number; qualified: number; qualifiedPct: number | null;
  siteVisits: number; leadsPerVisit: number | null; contractSold: number; leadsPerContract: number | null; bought: number;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
/** ผลงานรายพนักงาน (ตามช่อง Staff) · Lead ต่อ 1 Site Visit = Lead ÷ Site Visit · Lead ต่อ 1 สัญญา/ขาย = Lead ÷ (เซ็นสัญญา + สัญญาเปิด + ขายแล้ว) · หาร 0 = null */
export function staffPerformance(rows: LeadRow[]): StaffRow[] {
  const m = new Map<string, LeadRow[]>();
  for (const r of rows) { const k = (r.staff ?? "").trim() || "(ไม่ระบุ Staff)"; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  const out = [...m].map(([staff, list]) => {
    const q = list.filter((r) => isQualifiedCall(r.call_status)).length;
    const v = list.filter((r) => isSiteVisitCall(r.call_status)).length;
    const c = list.filter(isContractOrSold).length;
    return {
      staff, leads: list.length, qualified: q, qualifiedPct: list.length ? r1((q / list.length) * 100) : null,
      siteVisits: v, leadsPerVisit: v ? r1(list.length / v) : null, contractSold: c, leadsPerContract: c ? r1(list.length / c) : null,
      bought: list.filter((r) => normCall(r.call_status) === "ซื้อสำเร็จ").length,
    };
  });
  return out.sort((a, b) => b.leads - a.leads || a.staff.localeCompare(b.staff));
}

/** เหตุผลที่ไม่สำเร็จ: จากสถานะ (Call / Sell / Buy) — Lead หนึ่งรายนับเหตุผลเดียว (ตามลำดับด้านล่าง) */
export const LOST_REASONS = [
  { key: "กู้ไม่ผ่าน", test: (r: LeadRow) => !isSeller(r) && normCall(r.call_status) === "กู้ไม่ผ่าน" },
  { key: "ไม่สนใจ", test: (r: LeadRow) => normCall(r.call_status) === "ไม่สนใจ" },
  { key: "ติดต่อไม่ได้", test: (r: LeadRow) => normCall(r.call_status) === "ติดต่อไม่ได้" },
  { key: "ยกเลิก (ขาย)", test: (r: LeadRow) => isSeller(r) && r.sell_status === "ยกเลิก" },
  { key: "บ้านไม่พร้อมขาย", test: (r: LeadRow) => isSeller(r) && r.sell_status === "บ้านไม่พร้อมขาย" },
  { key: "Archive (ซื้อ)", test: (r: LeadRow) => !isSeller(r) && r.buy_status === "Archive" },
] as const;
export function lostReasonOf(r: LeadRow): string | null { return LOST_REASONS.find((x) => x.test(r))?.key ?? null; }

export type LostReport = {
  total: number; lost: number;
  byReason: { reason: string; count: number }[];
  byChannel: { channel: string; leads: number; lost: number; lostPct: number | null; reasons: Record<string, number> }[];
  notes: { reason: string; count: number }[]; // ข้อความในช่อง "เหตุผลที่ปิดไม่สำเร็จ" (ไม่สนตัวพิมพ์/ช่องว่าง)
};
export function lostReasons(rows: LeadRow[]): LostReport {
  const lost = rows.map((r) => ({ r, why: lostReasonOf(r) })).filter((x) => x.why);
  const byReason = LOST_REASONS.map((x) => ({ reason: x.key as string, count: lost.filter((l) => l.why === x.key).length })).filter((x) => x.count);
  const ch = new Map<string, LeadRow[]>();
  for (const r of rows) { const k = r.source_channel || "Unknown"; if (!ch.has(k)) ch.set(k, []); ch.get(k)!.push(r); }
  const byChannel = [...ch].map(([channel, list]) => {
    const reasons: Record<string, number> = {};
    for (const r of list) { const w = lostReasonOf(r); if (w) reasons[w] = (reasons[w] ?? 0) + 1; }
    const n = Object.values(reasons).reduce((a, b) => a + b, 0);
    return { channel, leads: list.length, lost: n, lostPct: list.length ? r1((n / list.length) * 100) : null, reasons };
  }).sort((a, b) => b.lost - a.lost || b.leads - a.leads);
  const nm = new Map<string, { reason: string; count: number }>();
  for (const r of rows) {
    const t = (r.lost_reason ?? "").trim().replace(/\s+/g, " "); if (!t) continue;
    const k = t.toLowerCase(); const cur = nm.get(k) ?? { reason: t, count: 0 }; cur.count++; nm.set(k, cur);
  }
  return { total: rows.length, lost: lost.length, byReason, byChannel, notes: [...nm.values()].sort((a, b) => b.count - a.count).slice(0, 15) };
}

/** Lead ไม่ซ้ำ (lead_id) ตามวันที่รับในช่วง */
export function leadsInRange(rows: LeadRow[], from?: string, to?: string): LeadRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (!r.lead_id || seen.has(r.lead_id)) return false; seen.add(r.lead_id);
    const d = day(r.received_at);
    return (!from || d >= from) && (!to || d <= to);
  });
}
