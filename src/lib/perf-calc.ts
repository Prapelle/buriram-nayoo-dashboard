/**
 * ตัวคำนวณประสิทธิภาพรายคน (5/11/2026) — ฟังก์ชันล้วน ๆ ไม่แตะฐานข้อมูล
 * นับจากประวัติที่ระบบบันทึกเอง ไม่ใช่การกดนับ:
 *   Seller / Buyer Leads  ← LEAD_STATUS_LOG   (นับเมื่อย้ายเข้าสถานะที่เป็นบวก · ครั้งเดียวต่อ Lead ต่อตัวชี้วัดต่อเดือน)
 *   Sale developer / Home builder ← สรุปรายเดือนเดิมของหน้า Developer (monthlyReport) แยกตามประเภทลูกค้า
 *   Production ← CONTENT_HISTORY + CONTENT_MEMBERS (เสร็จ = ย้ายถึง PUBLISHED · ผู้ร่วมงานทุกคนได้เต็ม 1 งาน)
 * คนที่ได้ผลงาน = Staff ของ Lead / Developer (จับคู่กับ "ชื่อที่แสดง" ของผู้ใช้) · ไม่มี Staff ให้ผู้ดูแลบอร์ดนั้น (คนที่มีตำแหน่งของบอร์ด)
 */
import { AUTO_STATUS, bkkDay, monthlyReport, type Dev, type DevProduct } from "./developers";
import { isTrue, REPORT_STAGES } from "./content";
import { addWorkdays, isWorkday, waitSummary, workdaysBetween, type WaitRow } from "./workdays";
import { METRICS, metricsOf, positionLabel, type Metric } from "./perf";

export type Row = Record<string, string>;
export type CalcUser = { email: string; name: string; positions: string[] };
export type DevData = { devs: Dev[]; products: DevProduct[]; logs: Row[]; contacts: Row[] };
export type CalcInput = {
  month: string; users: CalcUser[]; leadLogs: Row[]; developers: DevData; homeBuilders: DevData;
  cards: Row[]; members: Row[]; history: Row[];
  leads?: Row[]; followups?: Row[]; accDocs?: Row[]; accLines?: Row[]; // LEADS · FOLLOWUP_LOG · ACC_DOCS · ACC_LINES (6/11/2026)
  waits?: Row[]; holidays?: string[]; today?: string; // CONTENT_WAITS · วันหยุดบริษัท (YYYY-MM-DD) · วันนี้ (เวลาไทย) ใช้นับการรอที่ยังไม่จบ
};
/** ผลงานที่ระบบนับให้ใครไม่ได้ (ชื่อ Staff ไม่ตรงกับผู้ใช้ / ชื่อซ้ำหลายคน) — แสดงให้ Admin แก้ */
export type Unmatched = { name: string; reason: "no_user" | "ambiguous" | "no_member" | "no_holder" | "many_holders"; source: string; count: number };
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
  /** ผู้ดูแลบอร์ดของตำแหน่งนั้น (ตั้งที่ ตั้งค่า → ตั้งเป้าประสิทธิภาพรายคน) */
  const holders = (pos: string) => inp.users.filter((u) => u.positions.includes(pos)).map((u) => u.email);
  /**
   * Staff → อีเมลผู้ใช้ · ไม่ตรง/ชื่อซ้ำ → null และบันทึกเป็น unmatched
   * Staff ว่าง (ผู้ใช้กำหนด 5/11/2026) → ให้ผู้ดูแลบอร์ดนั้น = คนที่มีตำแหน่งของบอร์ด:
   *   มีคนเดียว → คนนั้น · หลายคน → คนที่กดย้าย ถ้าเป็นหนึ่งในผู้ดูแล ไม่งั้นนับให้ใครไม่ได้ · ไม่มีใคร → นับให้ใครไม่ได้
   */
  const resolve = (staff: string, mover: string, source: string, position: string, n = 1): string | null => {
    const s = lc(staff);
    if (s) {
      if (byName.has(s)) { const e = byName.get(s); if (e) return e; miss(staff.trim(), "ambiguous", source, n); return null; }
      if (byEmail.has(s)) return byEmail.get(s)!;
      miss(staff.trim(), "no_user", source, n); return null;
    }
    const hs = holders(position);
    if (hs.length === 1) return hs[0];
    const m = lc(mover), hit = hs.find((e) => lc(e) === m);
    if (hit) return hit;
    miss("(ไม่ระบุ Staff)", hs.length ? "many_holders" : "no_holder", source, n); return null;
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
      add(resolve(l.staff, l.changed_by, r.field === "sell_status" ? "คนต้องการขาย" : "คนต้องการซื้อ", m.position), m.key, 1);
    }
  }

  // อัตราส่วน/เปอร์เซ็นต์ที่ต้องรวมตัวตั้ง-ตัวหารก่อนค่อยหาร (คนเดียวอาจมีหลายแถวชื่อ Staff)
  const ratio = new Map<string, Map<string, { n: number; d: number }>>();
  const bump = (key: string, email: string | null, n: number, d: number) => {
    if (!email || (!n && !d)) return;
    const m = ratio.get(key) ?? ratio.set(key, new Map()).get(key)!; const x = m.get(email) ?? m.set(email, { n: 0, d: 0 }).get(email)!; x.n += n; x.d += d;
  };

  // ── Sale developer / Sale home builder (ใช้สรุปรายเดือนเดิมของหน้า Developer) ──
  for (const [pos, d] of [["sale_developer", inp.developers], ["sale_home_builder", inp.homeBuilders]] as const) {
    for (const r of monthlyReport(d.logs, d.products, d.devs, month, d.contacts)) {
      const n = r.calls + r.planned + r.met + r.won + r.productSales;
      if (!n) continue; // แถวที่ไม่มีผลงาน ไม่ต้องจับคู่/ไม่ต้องรายงานว่าไม่ตรง
      const e = resolve(r.staff === "(ไม่ระบุ Staff)" ? "" : r.staff, "", pos === "sale_developer" ? "Developer" : "Home Builder", pos);
      add(e, `${pos}.calls`, r.calls); add(e, `${pos}.planned`, r.planned); add(e, `${pos}.met`, r.met); add(e, `${pos}.won`, r.won); add(e, `${pos}.sales`, r.productSales);
      bump(`${pos}.close_rate`, e, Math.min(r.won, r.met), r.met); // ปิดเดือนนี้ ÷ เข้าพบเดือนนี้
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
  const tally = new Map<string, { done: number; due: number; ontime: number; sent: number; rdue: number; rontime: number; sdue: number; sontime: number }>();
  const row = (email: string) => tally.get(email) ?? tally.set(email, { done: 0, due: 0, ontime: 0, sent: 0, rdue: 0, rontime: 0, sdue: 0, sontime: 0 }).get(email)!;
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
      t.done++;
      if (c.planned_date) { const ok = d <= sched(c).plannedEff; t.due++; if (ok) t.ontime++; if (isTrue(c.sales_tag)) { t.sdue++; if (ok) t.sontime++; } }
    }
  }
  for (const [email, t] of tally) {
    actuals[email]["production.done"] = t.done;
    actuals[email]["production.ontime"] = t.due ? Math.round((t.ontime / t.due) * 1000) / 10 : null;
    actuals[email]["production.sales_ontime"] = t.sdue ? Math.round((t.sontime / t.sdue) * 1000) / 10 : null;
    actuals[email]["production.reports"] = t.sent;
    actuals[email]["production.report_ontime"] = t.rdue ? Math.round((t.rontime / t.rdue) * 1000) / 10 : null;
  }

  // ── ไม่ค้างสถานะ / ทรัพย์เข้าระบบ (Lead) ──
  const TERMINAL: Record<string, string[]> = { sell_status: ["ขายแล้ว", "ยกเลิก", "บ้านไม่พร้อมขาย"], call_status: ["ซื้อสำเร็จ", "ไม่สนใจ", "กู้ไม่ผ่าน", "ยกเลิก"] };
  const STALE_DAYS = 3;
  const stayPos = (field: string) => (field === "sell_status" ? "ae_sell" : "ae_buy");
  const byLeadField = new Map<string, Row[]>();
  for (const l of inp.leadLogs) if (l.lead_id && l.field) (byLeadField.get(`${l.lead_id}|${l.field}`) ?? byLeadField.set(`${l.lead_id}|${l.field}`, []).get(`${l.lead_id}|${l.field}`)!).push(l);
  const seenLog = new Set<string>();
  for (const [, list] of byLeadField) {
    list.sort((a, b) => String(a.changed_at).localeCompare(String(b.changed_at)));
    list.forEach((l, i) => {
      if (l.log_id) { if (seenLog.has(l.log_id)) return; seenLog.add(l.log_id); }
      const field = l.field, pos = stayPos(field), src = field === "sell_status" ? "คนต้องการขาย" : "คนต้องการซื้อ";
      if (field === "sell_status" && l.from_status === "" && inMonth(l.changed_at, month)) add(resolve(l.staff, l.changed_by, src, pos), "ae_sell.intake", 1); // ทรัพย์เข้าระบบ
      const next = list[i + 1], start = bkkDay(l.changed_at), end = next ? bkkDay(next.changed_at) : today;
      if (!next && (TERMINAL[field] ?? []).includes(l.to_status)) return; // อยู่สถานะปลายทาง ไม่นับเป็นค้าง
      if (!(next ? inMonth(next.changed_at, month) : today.slice(0, 7) === month)) return; // นับช่วงที่จบในเดือนนี้ (ช่วงที่ยังเปิดอยู่นับในเดือนปัจจุบัน)
      bump(`${pos}.follow`, resolve(l.staff, l.changed_by, src, pos), workdaysBetween(start, end, hol) <= STALE_DAYS ? 1 : 0, 1);
    });
  }

  // ── บริหารข้อมูล: ลงมือภายในวันนัดติดตาม (Lead / Developer / Home Builder) ──
  const seenFu = new Map<string, Row>(); // รอบนัดเดียวกัน (ชนิด+รายการ+วันนัด) นับครั้งแรกที่ลงมือ
  for (const f of inp.followups ?? []) {
    if (!f.item_id || !f.due_day || !f.done_day) continue;
    const k = `${f.kind}|${f.item_id}|${f.due_day}`, ex = seenFu.get(k);
    if (!ex || f.done_day < ex.done_day) seenFu.set(k, f);
  }
  const leadNeed = new Map((inp.leads ?? []).map((l) => [l.lead_id, l.need]));
  const fuPos = (kind: string, id: string) => (kind === "developer" ? "sale_developer" : kind === "home_builder" ? "sale_home_builder" : leadNeed.get(id) === "ขาย" ? "ae_sell" : "ae_buy");
  for (const f of seenFu.values()) {
    if (f.due_day.slice(0, 7) !== month) continue;
    const pos = fuPos(f.kind, f.item_id);
    bump(`${pos}.data_mgmt`, resolve(f.staff, f.done_by, f.kind === "lead" ? "Lead" : f.kind === "developer" ? "Developer" : "Home Builder", pos), f.done_day <= f.due_day ? 1 : 0, 1);
  }
  // ถึงกำหนดแล้วยังไม่มีใครลงมือ (วัน "ติดต่อครั้งถัดไป" ยังอยู่ในเดือนนี้และผ่านมาแล้ว) = ไม่ทัน
  const lateOpen = (kind: string, id: string, due: string, staff: string, source: string) => {
    const dd = due.slice(0, 10);
    if (dd.slice(0, 7) !== month || dd >= today || seenFu.has(`${kind}|${id}|${dd}`)) return;
    const pos = fuPos(kind, id); bump(`${pos}.data_mgmt`, resolve(staff, "", source, pos), 0, 1);
  };
  for (const l of inp.leads ?? []) {
    if (!l.lead_id || !l.next_follow_up_at) continue;
    const sf = l.need === "ขาย" ? "sell_status" : "call_status";
    if ((TERMINAL[sf] ?? []).includes(l[sf] ?? "")) continue;
    lateOpen("lead", l.lead_id, l.next_follow_up_at, l.staff, "Lead");
  }
  for (const [kind, d] of [["developer", inp.developers], ["home_builder", inp.homeBuilders]] as const) {
    for (const x of d.devs) if (x.next_follow_up_at && x.status !== "ไม่ให้เข้าพบ" && !AUTO_STATUS.includes(x.status)) lateOpen(kind, x.developer_id, x.next_follow_up_at, x.staff ?? "", kind === "developer" ? "Developer" : "Home Builder");
  }

  // ── Production: การ์ดไม่ค้างขั้นเกิน 3 วันทำการ (ไม่รวมวันที่รอลูกค้า) ──
  const CONTENT_FREE = new Set(["IDEA", "SCHEDULED", "PUBLISHED", "รอครบเพื่อทำรายงาน", "ส่งให้ลูกค้าแล้ว"]); // ขั้นที่รอนานโดยออกแบบ ไม่วัด
  const waitedDays = (cardId: string): Set<string> => {
    const out = new Set<string>();
    for (const w of waitsOf.get(cardId) ?? []) { let dday = w.started_day; const stop = w.ended_day || today; for (let i = 0; dday && dday < stop && i < 400; i++) { out.add(dday); const x = new Date(dday + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); dday = x.toISOString().slice(0, 10); } }
    return out;
  };
  const byCard = new Map<string, Row[]>();
  for (const h of inp.history) if (h.card_id && h.to_stage) (byCard.get(h.card_id) ?? byCard.set(h.card_id, []).get(h.card_id)!).push(h);
  const cardOpen = new Map(inp.cards.map((c) => [c.card_id, c]));
  for (const [cardId, list] of byCard) {
    list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const wd = waitedDays(cardId);
    list.forEach((h, i) => {
      if (CONTENT_FREE.has(h.to_stage)) return;
      const next = list[i + 1], start = bkkDay(h.at), end = next ? bkkDay(next.at) : today;
      if (!next && cardOpen.get(cardId)?.stage !== h.to_stage) return; // ข้อมูลไม่ตรงกับสถานะปัจจุบัน ข้ามกันนับผิด
      if (!(next ? inMonth(next.at, month) : today.slice(0, 7) === month)) return;
      let days = workdaysBetween(start, end, hol);
      for (const x of wd) if (x >= start && x < end && isWorkday(x, hol)) days--;
      const mem = [...new Set(membersOf.get(cardId) ?? [])];
      for (const em of mem) { const email = byEmail.get(em); if (email) bump("production.data_mgmt", email, days <= STALE_DAYS ? 1 : 0, 1); }
    });
  }

  // ── ค่าคอมมิชชันจากใบเสร็จรับเงิน (รายการสินค้า "ค่าคอมมิชชัน") ──
  const isComm = (name: string) => /คอมมิชชั่?น|ค่าคอม/.test(name);
  const linesOf = new Map<string, Row[]>();
  for (const l of inp.accLines ?? []) if (l.doc_id) (linesOf.get(l.doc_id) ?? linesOf.set(l.doc_id, []).get(l.doc_id)!).push(l);
  const docById = new Map((inp.accDocs ?? []).map((d) => [d.doc_id, d]));
  for (const d of inp.accDocs ?? []) {
    if (d.doc_type !== "receipt" || !d.doc_id || String(d.doc_date ?? "").slice(0, 7) !== month) continue;
    let amt = (linesOf.get(d.doc_id) ?? []).filter((l) => isComm(l.product ?? "")).reduce((a, l) => a + Number(l.amount || 0), 0);
    if (!amt) { // ใบเสร็จชำระบางส่วน มีบรรทัดเดียว "ชำระ…" → คิดตามสัดส่วนค่าคอมของใบต้นทาง
      const par = docById.get(d.parent_doc_id ?? ""), pl = par ? linesOf.get(par.doc_id) ?? [] : [];
      const all = pl.reduce((a, l) => a + Number(l.amount || 0), 0), com = pl.filter((l) => isComm(l.product ?? "")).reduce((a, l) => a + Number(l.amount || 0), 0);
      if (all > 0 && com > 0) amt = (com / all) * Number(d.total || 0);
    }
    if (amt) add(resolve(d.seller_name ?? "", "", "ใบเสร็จ (ผู้ขาย)", "ae_buy"), "ae_buy.commission", Math.round(amt * 100) / 100);
  }

  // ── สรุปอัตราส่วน ──
  for (const [key, m] of ratio) for (const [email, x] of m) actuals[email][key] = x.d ? Math.min(100, Math.round((x.n / x.d) * 1000) / 10) : null;
  for (const m of METRICS) {
    const r = m.rule; if (r.kind !== "lead_ratio") continue;
    for (const u of inp.users) { const n = actuals[u.email][r.num] ?? 0, d = actuals[u.email][r.den] ?? 0; actuals[u.email][m.key] = d ? Math.min(100, Math.round((n / d) * 1000) / 10) : null; }
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
