/**
 * ตัวคำนวณประสิทธิภาพรายคน (5/11/2026) — ฟังก์ชันล้วน ๆ ไม่แตะฐานข้อมูล
 * นับจากประวัติที่ระบบบันทึกเอง ไม่ใช่การกดนับ:
 *   Seller / Buyer Leads  ← LEAD_STATUS_LOG   (นับเมื่อย้ายเข้าสถานะที่เป็นบวก · ครั้งเดียวต่อ Lead ต่อตัวชี้วัดต่อเดือน)
 *   Sale developer / Home builder ← สรุปรายเดือนเดิมของหน้า Developer (monthlyReport) แยกตามประเภทลูกค้า
 *   Production ← CONTENT_HISTORY + CONTENT_MEMBERS (เสร็จ = ย้ายถึง PUBLISHED · ผู้ร่วมงานทุกคนได้เต็ม 1 งาน)
 * คนที่ได้ผลงาน = Staff ของ Lead / Developer (จับคู่กับ "ชื่อที่แสดง" ของผู้ใช้) · Lead ที่ไม่มี Staff ให้คนที่กดย้าย
 */
import { bkkDay, monthlyReport, type Dev, type DevProduct } from "./developers";
import { REPORT_STAGES } from "./content";
import { addWorkdays, waitSummary, type WaitRow } from "./workdays";
import { METRICS, metricsOf, positionLabel, type Metric } from "./perf";

export type Row = Record<string, string>;
export type CalcUser = { email: string; name: string; positions: string[] };
export type DevData = { devs: Dev[]; products: DevProduct[]; logs: Row[]; contacts: Row[] };
export type CalcInput = {
  month: string; users: CalcUser[]; leadLogs: Row[]; developers: DevData; homeBuilders: DevData;
  cards: Row[]; members: Row[]; history: Row[];
  waits?: Row[]; holidays?: string[]; today?: string; // CONTENT_WAITS · วันหยุดบริษัท (YYYY-MM-DD) · วันนี้ (เวลาไทย) ใช้นับการรอที่ยังไม่จบ
};
/** ผลงานที่ระบบนับให้ใครไม่ได้ (ชื่อ Staff ไม่ตรงกับผู้ใช้ / ชื่อซ้ำหลายคน) — แสดงให้ Admin แก้ */
export type Unmatched = { name: string; reason: "no_user" | "ambiguous" | "no_member"; source: string; count: number };
export type CalcResult = { actuals: Record<string, Record<string, number | null>>; unmatched: Unmatched[] };

const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
const inMonth = (iso: unknown, month: string) => bkkDay(iso).slice(0, 7) === month;

export function computeMonth(inp: CalcInput): CalcResult {
  const { month } = inp;
  const byEmail = new Map(inp.users.map((u) => [lc(u.email), u.email]));
  const byName = new Map<string, string | null>(); // null = ชื่อซ้ำหลายคน
  for (const u of inp.users) { const k = lc(u.name); if (k) byName.set(k, byName.has(k) ? null : u.email); }

  const actuals: Record<string, Record<string, number | null>> = {};
  for (const u of inp.users) actuals[u.email] = Object.fromEntries(METRICS.map((m) => [m.key, m.unit === "percent" ? null : 0]));
  const unmatched = new Map<string, Unmatched>();
  const miss = (name: string, reason: Unmatched["reason"], source: string, n = 1) => {
    const k = `${reason}|${source}|${name}`; const x = unmatched.get(k);
    if (x) x.count += n; else unmatched.set(k, { name, reason, source, count: n });
  };
  /** Staff → อีเมลผู้ใช้ · ว่าง → คนที่กด (fallback) · ไม่ตรง/ซ้ำ → null และบันทึกเป็น unmatched */
  const resolve = (staff: string, fallback: string, source: string, n = 1): string | null => {
    const s = lc(staff);
    if (s) {
      if (byName.has(s)) { const e = byName.get(s); if (e) return e; miss(staff.trim(), "ambiguous", source, n); return null; }
      if (byEmail.has(s)) return byEmail.get(s)!;
      miss(staff.trim(), "no_user", source, n); return null;
    }
    const f = lc(fallback);
    if (f && byEmail.has(f)) return byEmail.get(f)!;
    miss("(ไม่ระบุ Staff)", "no_user", source, n); return null;
  };
  const add = (email: string | null, key: string, n: number) => { if (email && n) actuals[email][key] = (actuals[email][key] ?? 0) + n; };

  // ── Seller / Buyer Leads ──
  const monthLogs = inp.leadLogs.filter((l) => l.lead_id && inMonth(l.changed_at, month));
  for (const m of metricsOf("ae_sell").concat(metricsOf("ae_buy"))) {
    const r = m.rule; if (r.kind !== "lead_move") continue;
    const seen = new Set<string>(); // ลากไปมา/ย้ายซ้ำในเดือนเดียวกัน = ได้คะแนนครั้งเดียวต่อ Lead
    for (const l of monthLogs) {
      if (l.field !== r.field || !r.to.includes(l.to_status) || (r.from && !r.from.includes(l.from_status)) || seen.has(l.lead_id)) continue;
      seen.add(l.lead_id);
      add(resolve(l.staff, l.changed_by, "Leads"), m.key, 1);
    }
  }

  // ── Sale developer / Sale home builder (ใช้สรุปรายเดือนเดิมของหน้า Developer) ──
  for (const [pos, d] of [["sale_developer", inp.developers], ["sale_home_builder", inp.homeBuilders]] as const) {
    for (const r of monthlyReport(d.logs, d.products, d.devs, month, d.contacts)) {
      const n = r.calls + r.planned + r.met + r.won + r.productSales;
      if (!n) continue; // แถวที่ไม่มีผลงาน ไม่ต้องจับคู่/ไม่ต้องรายงานว่าไม่ตรง
      const e = resolve(r.staff === "(ไม่ระบุ Staff)" ? "" : r.staff, "", pos === "sale_developer" ? "Developer" : "Home Builder", 1);
      add(e, `${pos}.calls`, r.calls); add(e, `${pos}.planned`, r.planned); add(e, `${pos}.met`, r.met); add(e, `${pos}.won`, r.won); add(e, `${pos}.sales`, r.productSales);
    }
  }

  // ── Production (บอร์ด Content) ──
  const pubDay = new Map<string, string>(); // card_id → วันที่ย้ายถึง PUBLISHED ครั้งล่าสุดในเดือนนี้
  for (const h of inp.history) if (h.card_id && h.to_stage === "PUBLISHED" && !(REPORT_STAGES as readonly string[]).includes(h.from_stage) && inMonth(h.at, month)) { const d = bkkDay(h.at); if (d > (pubDay.get(h.card_id) ?? "")) pubDay.set(h.card_id, d); }
  const membersOf = new Map<string, string[]>();
  for (const m of inp.members) if (m.card_id && m.email) (membersOf.get(m.card_id) ?? membersOf.set(m.card_id, []).get(m.card_id)!).push(lc(m.email));
  const hol = new Set(inp.holidays ?? []), today = inp.today ?? bkkDay(new Date().toISOString());
  const waitsOf = new Map<string, WaitRow[]>();
  for (const w of inp.waits ?? []) if (w.card_id) (waitsOf.get(w.card_id) ?? waitsOf.set(w.card_id, []).get(w.card_id)!).push({ card_id: w.card_id, kind: w.kind, started_day: bkkDay(w.started_at), ended_day: w.ended_at ? bkkDay(w.ended_at) : "" });
  const sched = (c: Row) => waitSummary(c, waitsOf.get(c.card_id) ?? [], today, hol);
  const tally = new Map<string, { done: number; due: number; ontime: number; sent: number; rdue: number; rontime: number }>();
  const row = (email: string) => tally.get(email) ?? tally.set(email, { done: 0, due: 0, ontime: 0, sent: 0, rdue: 0, rontime: 0 }).get(email)!;
  // รายงานที่ส่งในเดือนนี้ (ส่งให้ลูกค้าแล้ว) — ผู้ร่วมงานทุกคนได้เต็ม
  for (const c of inp.cards) {
    if (!c.card_id || c.stage !== "ส่งให้ลูกค้าแล้ว" || String(c.report_sent_at ?? "").slice(0, 7) !== month) continue;
    const mem = [...new Set(membersOf.get(c.card_id) ?? [])];
    if (!mem.length) { miss("(การ์ดไม่มีผู้ร่วมงาน)", "no_member", "Production"); continue; }
    const due = c.report_due_date ? sched(c).reportDueEff : "";
    for (const em of mem) {
      const email = byEmail.get(em); if (!email) { miss(em, "no_user", "Production"); continue; }
      const t = row(email); t.sent++; if (due) { t.rdue++; if (c.report_sent_at <= due) t.rontime++; }
    }
  }
  for (const c of inp.cards) {
    const d = pubDay.get(c.card_id); if (!d) continue;
    const mem = [...new Set(membersOf.get(c.card_id) ?? [])];
    if (!mem.length) { miss("(การ์ดไม่มีผู้ร่วมงาน)", "no_member", "Production"); continue; }
    for (const em of mem) {
      const email = byEmail.get(em); if (!email) { miss(em, "no_user", "Production"); continue; }
      const t = row(email);
      t.done++; if (c.planned_date) { t.due++; if (d <= sched(c).plannedEff) t.ontime++; }
    }
  }
  for (const [email, t] of tally) {
    actuals[email]["production.done"] = t.done;
    actuals[email]["production.ontime"] = t.due ? Math.round((t.ontime / t.due) * 1000) / 10 : null;
    actuals[email]["production.reports"] = t.sent;
    actuals[email]["production.report_ontime"] = t.rdue ? Math.round((t.rontime / t.rdue) * 1000) / 10 : null;
  }
  return { actuals, unmatched: [...unmatched.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th")) };
}

// ── รวมเป็นรายงานรายคน: ทำได้ / เป้า / % ──
export type MetricLine = { key: string; label: string; unit: Metric["unit"]; how: string; actual: number | null; target: number | null; pct: number | null };
export type PersonReport = { email: string; name: string; positions: { key: string; label: string; metrics: MetricLine[] }[]; overall: number | null };

/** % ของเป้า = ทำได้ ÷ เป้า (ไม่มีเป้า/เป้า 0 = null) · ทำเกินเป้าแสดงเกิน 100 ได้ แต่ภาพรวมจำกัดตัวชี้วัดละไม่เกิน 100 */
export const pctOf = (actual: number | null, target: number | null) => (target && target > 0 && actual !== null ? Math.round((actual / target) * 1000) / 10 : null);

export function buildReport(users: CalcUser[], actuals: CalcResult["actuals"], targets: { user_email: string; metric_key: string; value: number }[]): PersonReport[] {
  const tg = new Map(targets.map((t) => [`${lc(t.user_email)}|${t.metric_key}`, t.value]));
  return users.filter((u) => u.positions.length).map((u) => {
    const positions = u.positions.map((p) => ({
      key: p, label: positionLabel(p),
      metrics: metricsOf(p).map((m): MetricLine => {
        const actual = actuals[u.email]?.[m.key] ?? null, target = tg.get(`${lc(u.email)}|${m.key}`) ?? null;
        return { key: m.key, label: m.label, unit: m.unit, how: m.how, actual, target, pct: pctOf(actual, target) };
      }),
    }));
    const scored = positions.flatMap((p) => p.metrics).filter((m) => m.pct !== null).map((m) => Math.min(100, m.pct as number));
    return { email: u.email, name: u.name, positions, overall: scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null };
  });
}
