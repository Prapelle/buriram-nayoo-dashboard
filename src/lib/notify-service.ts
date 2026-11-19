import * as D from "./d1";
import { getD1 } from "./d1";
import { readTab, readTabs } from "./sheets";
import { logError } from "./log";
import { staffNameOf, parsePositions } from "./perf";
import { followUps } from "./lead-insights";
import { todayBkk } from "./leads";
import { devFollowUps, kindOf, type Dev } from "./developers";
import { ART_DUTIES, ART_STAGE, cardHref, devHref, leadHref, NOTIF_COLUMNS, NOTIF_LIST_LIMIT, NOTIF_RETENTION_DAYS, NOTIF_TAB, recipients, type NotifInput, type NotifItem, type Todo } from "./notify";

/**
 * การแจ้งเตือนในเว็บ (20/11/2026) — ดูกติกาใน notify.ts
 * ทุกฟังก์ชันที่ "สร้าง" การแจ้งเตือนเป็นแบบ best-effort: ผิดพลาดแล้วไม่ทำให้การบันทึกงานหลักล้ม
 */
type Row = Record<string, string>;
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const active = (u: Row) => !!u.email && String(u.active).toUpperCase() === "TRUE";
const nameOfEmail = (users: Row[], email: string) => { const u = users.find((x) => norm(x.email) === norm(email)); return u ? staffNameOf(u) : email.split("@")[0]; };
const day = (v: string | undefined) => String(v ?? "").slice(0, 10);
const addDays = (d: string, n: number) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 864e5);

const hasD1 = async () => !!(await getD1());
async function users(): Promise<Row[]> { try { return (await readTab("APP_USERS")).rows.filter(active); } catch { return []; } }
/** อีเมลของผู้ใช้ที่ชื่อ Staff ตรงกัน (ชื่อแสดง หรืออีเมล) */
export const emailsOfStaff = (us: Row[], staff: string) => { const s = String(staff ?? "").trim(); return s ? us.filter((u) => staffNameOf(u).trim() === s || norm(u.email) === norm(s)).map((u) => norm(u.email)) : []; };

let lastPurge = 0;
/** ลบการแจ้งเตือนที่เก่ากว่า 90 วัน · ทำไม่เกินชั่วโมงละครั้งต่อเครื่อง (force = ทำทันที) */
export async function purgeOldNotifs(force = false) {
  if (!force && Date.now() - lastPurge < 3600_000) return 0;
  const db = await getD1(); if (!db) return 0;
  lastPurge = Date.now();
  return D.deleteBefore(db, NOTIF_TAB, "created_at", new Date(Date.now() - NOTIF_RETENTION_DAYS * 864e5).toISOString());
}
/** บันทึกการแจ้งเตือน (ต้องมี D1) · ตัดผู้ทำออก · ลบของเก่ากว่า 90 วันไม่เกินชั่วโมงละครั้ง */
export async function notify(items: NotifInput[], actor: string) {
  try {
    const list = recipients(items, actor);
    if (!list.length) return 0;
    const db = await getD1();
    if (!db) return 0;
    await readTab(NOTIF_TAB); // ให้ตารางถูกสร้าง (ตารางเกิดบน D1)
    const now = new Date().toISOString();
    await D.appendRows(db, NOTIF_TAB, list.map((n) => NOTIF_COLUMNS.map((c) => ({
      notif_id: crypto.randomUUID(), user_email: n.to, kind: n.kind, title: n.title.slice(0, 300), body: String(n.body ?? "").slice(0, 500), href: n.href,
      ref_type: n.ref_type, ref_id: n.ref_id, actor: norm(actor), created_at: now, read_at: "",
    } as Row)[c])));
    await purgeOldNotifs();
    return list.length;
  } catch (e) { logError("notify", e); return 0; }
}

// ── เหตุการณ์ ──────────────────────────────────────────────

/** Lead: มอบให้ Staff ใหม่ → แจ้ง Staff · คนอื่นเปลี่ยนสถานะ Lead ของ Staff → แจ้ง Staff */
export async function notifyLeads(changes: { prev: Row | null; rec: Row }[], actor: string) {
  try {
    if (!changes.length) return; if (!(await hasD1())) return;
    const us = await users(), who = nameOfEmail(us, actor), out: NotifInput[] = [];
    for (const { prev, rec } of changes) {
      const label = `${rec.lead_code} ${rec.customer_name}`.trim(), href = leadHref(rec.lead_id);
      const st = (r: Row) => r.sell_status || r.call_status || "";
      if (rec.staff && (!prev || prev.staff !== rec.staff)) {
        for (const to of emailsOfStaff(us, rec.staff)) out.push({ to, kind: "assign", title: `${who} มอบ Lead ${label} ให้คุณ`, body: [rec.need, st(rec)].filter(Boolean).join(" · "), href, ref_type: "lead", ref_id: rec.lead_id });
      } else if (prev && rec.staff) {
        const parts = [prev.need !== rec.need ? `ความต้องการ ${prev.need || "(ว่าง)"} → ${rec.need}` : "", prev.call_status !== rec.call_status ? `Call ${prev.call_status || "(ว่าง)"} → ${rec.call_status}` : "",
          prev.sell_status !== rec.sell_status ? `สถานะ ${prev.sell_status || "(ว่าง)"} → ${rec.sell_status}` : "", prev.buy_status !== rec.buy_status ? `Buy ${prev.buy_status || "(ว่าง)"} → ${rec.buy_status}` : ""].filter(Boolean);
        if (parts.length) for (const to of emailsOfStaff(us, rec.staff)) out.push({ to, kind: "change", title: `${who} แก้ Lead ${label}`, body: parts.join(" · "), href, ref_type: "lead", ref_id: rec.lead_id });
      }
    }
    await notify(out, actor);
  } catch (e) { logError("notify.leads", e); }
}

/** Developer / Home Builder: มอบให้ Staff ใหม่ · คนอื่นเปลี่ยน Status */
export async function notifyDev(prev: Row | null, rec: Row, actor: string) {
  try {
    if (!rec.staff) return; if (!(await hasD1())) return;
    const us = await users(), who = nameOfEmail(us, actor), label = `${rec.dev_code} ${rec.company_name || rec.project_main}`.trim(), href = devHref(rec.developer_id, kindOf(rec));
    const L = kindOf(rec) === "home_builder" ? "Home Builder" : "Developer";
    const out: NotifInput[] = [];
    if (!prev || prev.staff !== rec.staff) for (const to of emailsOfStaff(us, rec.staff)) out.push({ to, kind: "assign", title: `${who} มอบ ${L} ${label} ให้คุณ`, body: rec.status || "", href, ref_type: "developer", ref_id: rec.developer_id });
    else if ((prev.status || "") !== (rec.status || "")) for (const to of emailsOfStaff(us, rec.staff)) out.push({ to, kind: "change", title: `${who} เปลี่ยน Status ${L} ${label}`, body: `${prev.status || "(ว่าง)"} → ${rec.status}`, href, ref_type: "developer", ref_id: rec.developer_id });
    await notify(out, actor);
  } catch (e) { logError("notify.dev", e); }
}

/** ผู้ใช้ที่มีตำแหน่ง Production (ตั้งค่า → ตั้งเป้าประสิทธิภาพรายคน → ตำแหน่ง) */
async function productionEmails(): Promise<string[]> {
  try {
    const t = await readTabs(["PERF_POSITIONS", "APP_USERS"]);
    const act = new Set(t.APP_USERS.rows.filter(active).map((u) => norm(u.email)));
    return t.PERF_POSITIONS.rows.filter((r) => r.user_email && parsePositions(r.positions).includes("production")).map((r) => norm(r.user_email)).filter((e) => act.has(e));
  } catch { return []; }
}

type CardEvt = { card: Row; members: string[]; actor: string };
/** การ์ด Content: เพิ่มคนในการ์ด → แจ้งคนที่ถูกเพิ่ม */
export async function notifyCardMembers(card: Row, before: string[], after: string[], actor: string) {
  try {
    if (!(await hasD1())) return;
    const us = await users(), who = nameOfEmail(us, actor), b = new Set(before.map(norm));
    await notify(after.map(norm).filter((e) => !b.has(e)).map((to) => ({ to, kind: "member", title: `${who} เพิ่มคุณในการ์ด ${card.card_code} ${card.title}`, body: card.stage, href: cardHref(card.card_id), ref_type: "card", ref_id: card.card_id })), actor);
  } catch (e) { logError("notify.cardMembers", e); }
}
/** การ์ด Content ย้ายช่อง: แจ้งผู้ร่วมงาน · เข้าช่อง ART WORK / VIDEO → แจ้งตำแหน่ง Production ที่ยังไม่มีชื่อในการ์ดให้เข้ามารับงาน */
export async function notifyCardMove({ card, members, actor }: CardEvt, from: string, to: string) {
  try {
    const us = await users(), who = nameOfEmail(us, actor), href = cardHref(card.card_id), label = `${card.card_code} ${card.title}`;
    const out: NotifInput[] = members.map((m) => ({ to: m, kind: "change", title: `${who} ย้ายการ์ด ${label}`, body: `${from} → ${to}`, href, ref_type: "card", ref_id: card.card_id }));
    if (to === ART_STAGE && from !== ART_STAGE) {
      const inCard = new Set(members.map(norm));
      for (const e of await productionEmails()) if (!inCard.has(e)) out.push({ to: e, kind: "claim", title: `การ์ด ${label} เข้า ${ART_STAGE} — เข้ามารับงาน`, body: [card.product, card.customer_name].filter(Boolean).join(" · "), href, ref_type: "card", ref_id: card.card_id });
    }
    await notify(out, actor);
  } catch (e) { logError("notify.cardMove", e); }
}
/** การ์ด Content เลื่อนวันลง: แจ้งผู้ร่วมงาน */
export async function notifyCardReschedule({ card, members, actor }: CardEvt, fromDay: string, toDay: string) {
  try {
    const us = await users(), who = nameOfEmail(us, actor);
    await notify(members.map((m) => ({ to: m, kind: "change", title: `${who} เลื่อนวันลงการ์ด ${card.card_code} ${card.title}`, body: `${fromDay || "(ยังไม่กำหนด)"} → ${toDay}`, href: cardHref(card.card_id), ref_type: "card", ref_id: card.card_id })), actor);
  } catch (e) { logError("notify.cardReschedule", e); }
}
/** มีคนรับงานการ์ดแล้ว → การแจ้งเตือน "เข้ามารับงาน" ของการ์ดนั้นที่ยังไม่อ่าน = อ่านแล้ว */
export async function resolveClaims(cardId: string) {
  try { const db = await getD1(); if (db) await D.patchWhere(db, NOTIF_TAB, { kind: "claim", ref_id: cardId }, { read_at: new Date().toISOString() }, "read_at"); } catch (e) { logError("notify.resolveClaims", e); }
}

// ── อ่าน / อ่านแล้ว ─────────────────────────────────────────

export async function listNotifs(email: string): Promise<{ items: NotifItem[]; unread: number; enabled: boolean }> {
  const db = await getD1();
  if (!db) return { items: [], unread: 0, enabled: false };
  await readTab(NOTIF_TAB);
  const me = norm(email);
  const rows = await D.selectWhere(db, NOTIF_TAB, { user_email: me }, { orderBy: "created_at", desc: true, limit: NOTIF_LIST_LIMIT });
  const unread = (await D.selectWhere(db, NOTIF_TAB, { user_email: me, read_at: "" })).length;
  const us = await users();
  return { items: rows.map((r) => ({ notif_id: r.notif_id, kind: r.kind, title: r.title, body: r.body, href: r.href, actor: r.actor ? nameOfEmail(us, r.actor) : "", created_at: r.created_at, read_at: r.read_at })), unread, enabled: true };
}
export async function markRead(email: string, ids: unknown, all = false) {
  const db = await getD1();
  if (!db) return 0;
  const me = norm(email), now = new Date().toISOString();
  if (all) return D.patchWhere(db, NOTIF_TAB, { user_email: me }, { read_at: now }, "read_at");
  let n = 0;
  for (const id of (Array.isArray(ids) ? ids : []).slice(0, 100).map(String)) n += await D.patchWhere(db, NOTIF_TAB, { user_email: me, notif_id: id }, { read_at: now }, "read_at");
  return n;
}

// ── งานที่ต้องทำ (คำนวณสด · เฉพาะรายการของผู้ใช้) ──────────────

const DONE_REPORT = new Set(["รายงานเสร็จแล้ว", "ส่งให้ลูกค้าแล้ว"]);
type Card = Row & { wait?: { planned_eff?: string; report_due_eff?: string }; members?: { email: string; duty: string }[] };

export function todosOf(input: { me: string; myName: string; today: string; leads: Row[]; devs: Row[]; cards: Card[]; isProduction: boolean }): Todo[] {
  const { me, myName, today, leads, devs, cards, isProduction } = input, out: Todo[] = [];
  const mine = (staff: string | undefined) => !!myName && String(staff ?? "").trim() === myName;
  const late = (d: string) => { const n = daysBetween(d, today); return n === 0 ? "วันนี้" : `เลยมา ${n} วัน`; };
  // Lead
  const f = followUps(leads.filter((r) => mine(r.staff)) as never, today);
  for (const r of [...f.overdue, ...f.today] as unknown as Row[]) out.push({ key: `lead:${r.lead_id}`, group: "Lead ที่ต้องติดตาม", text: `${r.lead_code} ${r.customer_name} — ติดตาม${late(day(r.next_follow_up_at))}`, href: leadHref(r.lead_id), tone: day(r.next_follow_up_at) < today ? "red" : "amber" });
  // Developer / Home Builder
  const myDevs = devs.filter((d) => d.developer_id && mine(d.staff)) as unknown as Dev[];
  const df = devFollowUps(myDevs, today);
  for (const d of [...df.overdue, ...df.stale, ...df.today] as unknown as Row[]) out.push({ key: `dev:${d.developer_id}`, group: "Developer / Home Builder ที่ต้องติดต่อ", text: `${d.dev_code} ${d.company_name || d.project_main} — ติดต่อ${late(day(d.next_follow_up_at))}`, href: devHref(d.developer_id, kindOf(d)), tone: day(d.next_follow_up_at) < today ? "red" : "amber" });
  for (const d of myDevs as unknown as Row[]) if (d.status === "ใกล้หมดสัญญา") out.push({ key: `devexp:${d.developer_id}`, group: "Developer / Home Builder ที่ต้องติดต่อ", text: `${d.dev_code} ${d.company_name || d.project_main} — ใกล้หมดสัญญา`, href: devHref(d.developer_id, kindOf(d)), tone: "amber" });
  // Content: การ์ดที่ฉันอยู่
  for (const c of cards) {
    const inCard = (c.members ?? []).some((m) => norm(m.email) === me);
    if (inCard && !c.published_at && STAGE_PROD.has(c.stage)) {
      const p = c.wait?.planned_eff || c.planned_date || "";
      if (p && p <= today) out.push({ key: `card:${c.card_id}`, group: "Content", text: `${c.card_code} ${c.title} — วันลง${late(p)} (${c.stage})`, href: cardHref(c.card_id), tone: p < today ? "red" : "amber" });
    }
    const r = c.wait?.report_due_eff || c.report_due_date || "";
    if (inCard && r && !c.report_sent_at && !DONE_REPORT.has(c.stage) && r <= addDays(today, 1)) out.push({ key: `report:${c.card_id}`, group: "Content", text: `${c.card_code} ${c.title} — ครบกำหนดรายงาน${r > today ? "พรุ่งนี้" : late(r)}`, href: cardHref(c.card_id), tone: r < today ? "red" : "amber" });
    // ตำแหน่ง Production: การ์ดในช่อง ART WORK / VIDEO ที่ยังไม่มีคนรับงานกราฟิก / วิดีโอ
    if (isProduction && c.stage === ART_STAGE && !inCard && !(c.members ?? []).some((m) => ART_DUTIES.includes(m.duty))) out.push({ key: `claim:${c.card_id}`, group: "รอคนรับงาน ART WORK / VIDEO", text: `${c.card_code} ${c.title}`, href: cardHref(c.card_id), tone: "sky" });
  }
  return out;
}
const STAGE_PROD = new Set(["IDEA", "CONTENT PLANS", "ART WORK / VIDEO", "เสร็จ ART / VIDEO", "REVIEW", "SCHEDULED"]);

export async function todosFor(email: string): Promise<Todo[]> {
  const me = norm(email), today = todayBkk();
  const t = await readTabs(["APP_USERS", "LEADS", "DEVELOPERS"]);
  const u = t.APP_USERS.rows.find((x) => norm(x.email) === me);
  const myName = u ? staffNameOf(u).trim() : "";
  let cards: Card[] = [], isProduction = false;
  if (await getD1()) {
    try { const { getBoard } = await import("./content-service"); cards = (await getBoard()).cards as unknown as Card[]; } catch { cards = []; }
    isProduction = (await productionEmails()).includes(me);
  }
  return todosOf({ me, myName, today, leads: t.LEADS.rows.filter((r) => r.lead_id), devs: t.DEVELOPERS.rows, cards, isProduction });
}
