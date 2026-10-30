// ยอดจริงเทียบเป้าหมายรายเดือน (หน้า ภาพรวม): ใช้สูตรเดียวกับการ์ด Total Paid Media Spend และ Total Leads
import { computeDashboard, type DashData } from "./dashboard";
import type { Role } from "./roles";
import { toTarget } from "./targets";
import { monthLabel } from "./data-checklist";

export type Progress = {
  month: string; label: string; from: string; to: string; current: boolean; elapsedPct: number;
  budget: number | null; spend: number | null; spendPct: number | null; spendNote?: string;
  leadTarget: number | null; leads: number | null; leadPct: number | null;
};
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
const pct = (a: number | null, b: number | null) => (a === null || !b ? null : Math.round((a / b) * 1000) / 10);

/** เดือนที่จะแสดง: ตัวกรองวันที่ตรงกับเดือนเต็มพอดี → เดือนนั้น · อื่น ๆ → เดือนปัจจุบัน */
export function progressMonth(from: string | undefined, to: string | undefined, today: string): string {
  if (from && to && from.slice(8) === "01" && to === lastDay(from.slice(0, 7))) return from.slice(0, 7);
  return today.slice(0, 7);
}

export function targetProgress(d: DashData, month: string, today: string, role: Role): Progress | null {
  const t = (d.targets ?? []).map(toTarget).find((x) => x.month === month);
  if (!t || (t.ad_budget_thb === null && t.lead_target === null)) return null;
  const from = `${month}-01`, end = lastDay(month), current = today >= from && today <= end;
  const to = current ? today : end;
  const days = Number(end.slice(8)), elapsed = current ? Number(today.slice(8)) : today < from ? 0 : days;
  const dash = computeDashboard(d, { from, to }, role);
  const k = Object.fromEntries(dash.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  const spend = typeof k.paid?.value === "number" ? k.paid.value : null;
  const leads = typeof k.leads?.value === "number" ? k.leads.value : d.leads.length ? 0 : null;
  return {
    month, label: monthLabel(month), from, to: current ? to : end, current, elapsedPct: Math.round((elapsed / days) * 1000) / 10,
    budget: t.ad_budget_thb, spend, spendPct: pct(spend, t.ad_budget_thb), spendNote: k.paid?.incomplete ?? (spend === null ? "ยังไม่มีรายงานโฆษณาของเดือนนี้" : undefined),
    leadTarget: t.lead_target, leads, leadPct: pct(leads, t.lead_target),
  };
}
