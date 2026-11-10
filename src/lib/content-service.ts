/**
 * บอร์ด Content (Production) — ตารางเกิดบน D1: CONTENT_CARDS / CONTENT_MEMBERS / CONTENT_HISTORY / PRODUCT_SETTINGS
 * เข้าถึงผ่าน sheets.ts (ชั้นเดียวกับข้อมูลอื่น) · ถ้ายังไม่ผูก D1 ทุกฟังก์ชันตอบ 409 NO_D1
 */
import { writeAudit } from "./audit";
import { getD1 } from "./d1";
import { plannedForTarget, workdaysBetween, waitSummary, type WaitRow } from "./workdays";
import { addDays, validDate, CARD_COLUMNS, WAIT_COLUMNS, waitKindsOf, HISTORY_COLUMNS, isStage, isTrue, MEMBER_COLUMNS, nextCardCode, planMove, reportDue, SETTING_COLUMNS, S_FIRST, validateCard, STAGES, type Rec } from "./content";
import { todayBkk } from "./developers";
import { productTypesOf } from "./developers-service";
import { normRole } from "./roles";
import { dedupeCode } from "./row-guard";
import { appendRows, atomicWrite, casRow, deleteWhere, patchById, readTabs, toRow, updateById } from "./sheets";

export class ContentError extends Error {
  constructor(public status: number, message: string, public code: string, public extra: { fields?: Record<string, string> } = {}) { super(message); }
}
type Tab = { headers: string[]; rows: Rec[] };
const TABS = ["CONTENT_CARDS", "CONTENT_MEMBERS", "CONTENT_HISTORY", "PRODUCT_SETTINGS", "CONTENT_WAITS", "PERF_HOLIDAYS", "APP_USERS", "DEVELOPERS", "APP_CONFIG"];
const blank = (cols: string[]): Rec => Object.fromEntries(cols.map((c) => [c, ""]));
const nameOf = (u: Rec) => (u.display_name || u.email.split("@")[0]).trim();

async function load(): Promise<Record<string, Tab>> {
  if (!(await getD1())) throw new ContentError(409, "ฟีเจอร์ Content ต้องใช้ฐานข้อมูล D1 — ผูก D1 (binding DB) แล้ว Deploy ใหม่", "NO_D1");
  const t = await readTabs(TABS);
  for (const [tab, cols] of [["CONTENT_CARDS", CARD_COLUMNS], ["CONTENT_MEMBERS", MEMBER_COLUMNS], ["CONTENT_HISTORY", HISTORY_COLUMNS], ["PRODUCT_SETTINGS", SETTING_COLUMNS], ["CONTENT_WAITS", WAIT_COLUMNS]] as const)
    if (!t[tab].headers.length) t[tab] = { headers: cols, rows: [] };
  return t;
}

const activeUsers = (t: Record<string, Tab>) => t.APP_USERS.rows.filter((u) => u.email && isTrue(u.active) && normRole(u.role));
const settingOf = (t: Record<string, Tab>, product: string) => t.PRODUCT_SETTINGS.rows.find((s) => s.product === product);
const userName = (t: Record<string, Tab>, email: string) => { const u = t.APP_USERS.rows.find((x) => x.email.toLowerCase() === email.toLowerCase()); return u ? nameOf(u) : email.split("@")[0]; };

const holidaysOf = (t: Record<string, Tab>) => new Set(t.PERF_HOLIDAYS.rows.map((h) => h.holiday_date).filter(Boolean));
const dayOf = (iso: string) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10) : "");
const waitsOf = (t: Record<string, Tab>, cardId: string): WaitRow[] => t.CONTENT_WAITS.rows.filter((w) => w.card_id === cardId).map((w) => ({ card_id: w.card_id, kind: w.kind, started_day: dayOf(w.started_at), ended_day: dayOf(w.ended_at) }));

export async function getBoard() {
  const t = await load(), today = todayBkk(), hol = holidaysOf(t);
  const members = new Map<string, Rec[]>();
  for (const m of t.CONTENT_MEMBERS.rows) if (m.card_id) (members.get(m.card_id) ?? members.set(m.card_id, []).get(m.card_id)!).push(m);
  const cards = t.CONTENT_CARDS.rows.filter((c) => c.card_id).sort((a, b) => (a.stage_at || "").localeCompare(b.stage_at || "") || a.card_code.localeCompare(b.card_code)).map((c) => ({
    ...c, ...(() => {
      const w = waitSummary(c, waitsOf(t, c.card_id), today, hol);
      return { wait: { open: w.open, alert: w.alert, prod_days: w.prod, report_days: w.report, planned_eff: w.plannedEff, report_due_eff: w.reportDueEff }, due: reportDue({ ...c, report_due_date: w.reportDueEff || c.report_due_date }, today) };
    })(),
    members: (members.get(c.card_id) ?? []).map((m) => ({ email: m.email, name: userName(t, m.email), duty: m.duty, is_main: isTrue(m.is_main) })),
  }));
  const products = productTypesOf(t.APP_CONFIG.rows);
  return {
    cards, stages: STAGES, today, products, waitKinds: waitKindsOf(t.APP_CONFIG.rows),
    users: activeUsers(t).map((u) => ({ email: u.email.toLowerCase(), name: nameOf(u) })).sort((a, b) => a.name.localeCompare(b.name, "th")),
    customers: t.DEVELOPERS.rows.filter((d) => d.developer_id).map((d) => ({ developer_id: d.developer_id, name: d.company_name || d.project_main || d.dev_code })),
    settings: products.map((p) => { const s = settingOf(t, p); return { product: p, content_count: Number(s?.content_count || 0), report_days: Number(s?.report_days || 0) }; }),
  };
}

export async function getHistory(cardId: string) {
  const t = await load();
  return { history: t.CONTENT_HISTORY.rows.filter((h) => h.card_id === cardId).map((h) => ({ ...h, actor_name: userName(t, h.actor) })) };
}

function checkMembers(t: Record<string, Tab>, input: { email: string }[]) {
  const known = new Set(activeUsers(t).map((u) => u.email.toLowerCase()));
  for (const m of input) if (!known.has(m.email)) throw new ContentError(422, `ไม่พบผู้ใช้ ${m.email} (หรือถูกปิดใช้งาน)`, "VALIDATION", { fields: { members: `ไม่พบผู้ใช้ ${m.email}` } });
}
async function replaceMembers(t: Record<string, Tab>, cardId: string, input: { email: string; duty: string; is_main: boolean }[], now: string) {
  // ลบของเดิม + ใส่ชุดใหม่ ตาม card_id ในชุดเดียว (ไม่ใช้เลขแถว — คนอื่นแก้การ์ดอื่นพร้อมกันไม่กระทบ)
  await atomicWrite([{ deleteWhere: "CONTENT_MEMBERS", col: "card_id", value: cardId },
    { insert: "CONTENT_MEMBERS", rows: input.map((m) => toRow(MEMBER_COLUMNS, { ...blank(MEMBER_COLUMNS), member_id: crypto.randomUUID(), card_id: cardId, email: m.email, display_name: userName(t, m.email), duty: m.duty, is_main: m.is_main ? "TRUE" : "FALSE", created_at: now })) }]);
}
/** แก้การ์ดเฉพาะเมื่อยังไม่มีใครแก้ก่อน (คำสั่งเดียวตาม card_id) — ไม่ผ่าน = มีคนแก้/ลบไปแล้ว */
async function casCard(t: Record<string, Tab>, cur: Rec, rec: Rec) {
  const H = t.CONTENT_CARDS.headers.length ? t.CONTENT_CARDS.headers : CARD_COLUMNS;
  if (!(await casRow("CONTENT_CARDS", H, "card_id", cur.card_id, cur.updated_at, toRow(H, rec)))) throw new ContentError(409, "การ์ดนี้ถูกแก้ไขหรือลบโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
}

async function logMove(cardId: string, from: string, to: string, actor: string, at: string, note = "") {
  await appendRows("CONTENT_HISTORY", [toRow(HISTORY_COLUMNS, { log_id: crypto.randomUUID(), card_id: cardId, from_stage: from, to_stage: to, actor, at, note })]);
}

/** สร้าง/แก้การ์ด · id ว่าง = สร้างใหม่ (เริ่มที่ IDEA) · แก้ต้องส่ง updated_at_seen กันเขียนทับกัน */
export async function saveCard(input: Record<string, unknown>, actor: string, id?: string) {
  const v = validateCard(input);
  if (!v.ok) throw new ContentError(422, "ข้อมูลไม่ถูกต้อง", "VALIDATION", { fields: v.errors });
  const t = await load(), c = v.value, now = new Date().toISOString();
  checkMembers(t, c.members); // ตรวจก่อนเขียนอะไรทั้งนั้น
  let customer_name = "", developer_id = c.developer_id;
  if (developer_id) {
    const d = t.DEVELOPERS.rows.find((x) => x.developer_id === developer_id);
    if (!d) throw new ContentError(422, "ไม่พบลูกค้าที่เลือก", "VALIDATION", { fields: { developer_id: "ไม่พบลูกค้าที่เลือก" } });
    customer_name = d.company_name || d.project_main || d.dev_code;
  }
  if (c.product && !productTypesOf(t.APP_CONFIG.rows).includes(c.product)) throw new ContentError(422, "ไม่พบ Product ที่เลือก", "VALIDATION", { fields: { product: "ไม่พบ Product ที่เลือก" } });
  const follow_days = c.follow_days || (c.product ? String(Number(settingOf(t, c.product)?.report_days || "") || "") : "");
  const fields: Rec = { title: c.title, content_type: c.content_type, sales_tag: c.sales_tag ? "TRUE" : "FALSE", sales_goal: c.sales_goal, developer_id, customer_name, product: c.product, follow_days,
    planned_date: c.planned_date, caption: c.caption, drive_link: c.drive_link, report_link: c.report_link, post_id: c.post_id };

  if (!id) {
    const rec: Rec = { ...blank(CARD_COLUMNS), ...fields, card_id: crypto.randomUUID(), card_code: nextCardCode(t.CONTENT_CARDS.rows.map((r) => r.card_code)), stage: S_FIRST, stage_at: now, created_by: actor, created_at: now, updated_by: actor, updated_at: now };
    await appendRows("CONTENT_CARDS", [toRow(CARD_COLUMNS, rec)]);
    rec.card_code = await dedupeCode("CONTENT_CARDS", t.CONTENT_CARDS.headers.length ? t.CONTENT_CARDS.headers : CARD_COLUMNS, "card_code", "card_id", rec.card_id, rec.card_code, nextCardCode); // สร้างพร้อมกัน → รหัสไม่ซ้ำ
    await logMove(rec.card_id, "", S_FIRST, actor, now, "สร้างการ์ด");
    await replaceMembers(t, rec.card_id, c.members, now);
    await writeAudit(actor, "content_create", "content_card", rec.card_id, `${rec.card_code} ${rec.title}`);
    return { card_id: rec.card_id, card_code: rec.card_code };
  }
  const i = t.CONTENT_CARDS.rows.findIndex((r) => r.card_id === id);
  if (i < 0) throw new ContentError(404, "ไม่พบการ์ด (อาจถูกลบ)", "NOT_FOUND");
  const cur = t.CONTENT_CARDS.rows[i];
  if (String(input.updated_at_seen ?? "") !== cur.updated_at) throw new ContentError(409, "การ์ดนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  if (!c.sales_tag && cur.sales_tag === "TRUE" && STAGES.indexOf(cur.stage as never) >= 7) throw new ContentError(409, "การ์ดอยู่ในช่วงรายงานลูกค้า เอาแท็กงานขายออกไม่ได้ — ย้ายกลับมาช่วงผลิตก่อน", "IN_REPORT");
  const rec: Rec = { ...cur, ...fields, updated_by: actor, updated_at: now };
  // ถ้าเปลี่ยนระยะติดตามผลหลังเผยแพร่แล้ว คำนวณวันครบกำหนดใหม่
  if (rec.published_at && rec.sales_tag === "TRUE" && Number(rec.follow_days) >= 1 && rec.report_due_date && rec.stage !== "ส่งให้ลูกค้าแล้ว") rec.report_due_date = addDays(rec.published_at, Number(rec.follow_days));
  await casCard(t, cur, rec);
  await replaceMembers(t, id, c.members, now);
  await writeAudit(actor, "content_update", "content_card", id, `${cur.card_code} ${rec.title}`);
  return { card_id: id, card_code: cur.card_code };
}

/**
 * เลื่อนวันลงจากปฏิทิน (10/11/2026): ลากการ์ดไปวันที่ต้องการ → ตั้งวันลงให้ "วันลงจริง" ตรงวันนั้น
 * (หักวันที่รอลูกค้าในช่วงผลิตออกให้) · การ์ดที่เผยแพร่แล้วเลื่อนไม่ได้ · แก้จากข้อมูลเก่า → STALE
 */
export async function rescheduleCard(id: string, day: string, actor: string, updatedAtSeen: string) {
  if (!validDate(day)) throw new ContentError(422, "วันที่ไม่ถูกต้อง", "VALIDATION", { fields: { planned_date: "วันที่ไม่ถูกต้อง" } });
  const t = await load();
  const c = t.CONTENT_CARDS.rows.find((r) => r.card_id === id);
  if (!c) throw new ContentError(404, "ไม่พบการ์ด", "NOT_FOUND");
  if (c.published_at) throw new ContentError(409, "การ์ดนี้เผยแพร่แล้ว เลื่อนวันลงไม่ได้", "PUBLISHED");
  if (updatedAtSeen !== c.updated_at) throw new ContentError(409, "การ์ดนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  const hol = holidaysOf(t), w = waitSummary(c, waitsOf(t, id), todayBkk(), hol);
  const planned = plannedForTarget(day, w.prod, hol), now = new Date().toISOString();
  const rec: Rec = { ...c, planned_date: planned, updated_by: actor, updated_at: now };
  const H = t.CONTENT_CARDS.headers.length ? t.CONTENT_CARDS.headers : CARD_COLUMNS;
  if (!(await casRow("CONTENT_CARDS", H, "card_id", id, c.updated_at, toRow(H, rec)))) throw new ContentError(409, "การ์ดนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  await writeAudit(actor, "content_reschedule", "content_card", id, `${c.card_code}: วันลง ${c.planned_date || "(ไม่มี)"} → ${planned}${planned !== day ? ` (วันลงจริง ${day} หลังรวมวันรอลูกค้า ${w.prod} วันทำการ)` : ""}`);
  return { planned_date: planned, planned_eff: w.prod > 0 ? waitSummary(rec, waitsOf(t, id), todayBkk(), hol).plannedEff : planned };
}

export async function moveCard(id: string, to: string, actor: string, updatedAtSeen?: string) {
  if (!isStage(to)) throw new ContentError(422, "สถานะปลายทางไม่ถูกต้อง", "VALIDATION");
  const t = await load(), i = t.CONTENT_CARDS.rows.findIndex((r) => r.card_id === id);
  if (i < 0) throw new ContentError(404, "ไม่พบการ์ด (อาจถูกลบ)", "NOT_FOUND");
  const cur = t.CONTENT_CARDS.rows[i];
  if (updatedAtSeen !== undefined && updatedAtSeen !== cur.updated_at) throw new ContentError(409, "การ์ดนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  const plan = planMove(cur, to, todayBkk());
  if (!plan.ok) throw new ContentError(plan.status, plan.message, plan.code);
  if (plan.noop) return { stage: cur.stage };
  const now = new Date().toISOString(), final = plan.steps[plan.steps.length - 1];
  const rec: Rec = { ...cur, ...plan.patch, stage: final, stage_at: now, updated_by: actor, updated_at: now };
  await casCard(t, cur, rec);
  if (final === "ส่งให้ลูกค้าแล้ว") { // ส่งรายงานแล้ว = ไม่ต้องรอลูกค้าต่อ: ปิดที่ค้างอยู่ (กันป้ายเตือนค้างบนงานที่เสร็จแล้ว)
    for (const w of t.CONTENT_WAITS.rows.filter((x) => x.card_id === id && !x.ended_at)) await patchById("CONTENT_WAITS", "wait_id", w.wait_id, { ended_at: now, ended_by: actor });
  }
  let prev = cur.stage;
  for (const s of plan.steps) { await logMove(id, prev, s, actor, now, s !== to ? "เลื่อนอัตโนมัติ (งานขาย)" : ""); prev = s; }
  return { stage: final, auto: final !== to };
}

/** เริ่มรอลูกค้า / ลูกค้าตอบแล้ว — เฉพาะการ์ดงานขาย และเฉพาะผู้ร่วมงานในการ์ด · รอได้ทีละเรื่อง */
async function waitGuard(t: Record<string, Tab>, id: string, actor: string) {
  const c = t.CONTENT_CARDS.rows.find((r) => r.card_id === id);
  if (!c) throw new ContentError(404, "ไม่พบการ์ด (อาจถูกลบ)", "NOT_FOUND");
  if (!isTrue(c.sales_tag)) throw new ContentError(422, "การรอลูกค้าใช้ได้เฉพาะการ์ดที่ติดแท็กงานขาย", "NOT_SALES");
  if (!t.CONTENT_MEMBERS.rows.some((m) => m.card_id === id && m.email.toLowerCase() === actor.toLowerCase())) throw new ContentError(403, "เฉพาะผู้ร่วมงานในการ์ดนี้เท่านั้นที่กดได้", "NOT_MEMBER");
  return c;
}
export async function startWait(id: string, kindRaw: unknown, actor: string) {
  const kind = String(kindRaw ?? "").trim();
  const t = await load(), c = await waitGuard(t, id, actor);
  if (!waitKindsOf(t.APP_CONFIG.rows).includes(kind)) throw new ContentError(422, "เลือกว่ารออะไรจากลูกค้า", "VALIDATION", { fields: { kind: "เลือกว่ารออะไรจากลูกค้า" } });
  if (t.CONTENT_WAITS.rows.some((w) => w.card_id === id && !w.ended_at)) throw new ContentError(409, "การ์ดนี้กำลังรอลูกค้าอยู่แล้ว — กด “ลูกค้าตอบแล้ว” ก่อน", "ALREADY_WAITING");
  await appendRows("CONTENT_WAITS", [toRow(WAIT_COLUMNS, { wait_id: crypto.randomUUID(), card_id: id, kind, started_at: new Date().toISOString(), started_by: actor, ended_at: "", ended_by: "" })]);
  await writeAudit(actor, "content_wait_start", "content_card", id, `${c.card_code} รอลูกค้า: ${kind}`);
  return { ok: true };
}
export async function endWait(id: string, actor: string) {
  const t = await load(), c = await waitGuard(t, id, actor);
  const open = t.CONTENT_WAITS.rows.filter((x) => x.card_id === id && !x.ended_at); // ปกติมีแถวเดียว · กดพร้อมกันอาจได้สองแถว → ปิดทั้งหมด
  if (!open.length) throw new ContentError(409, "การ์ดนี้ไม่ได้รอลูกค้าอยู่", "NOT_WAITING");
  const w = open[0], now = new Date().toISOString();
  for (const x of open) await patchById("CONTENT_WAITS", "wait_id", x.wait_id, { ended_at: now, ended_by: actor });
  const days = workdaysBetween(dayOf(w.started_at), dayOf(now), holidaysOf(t));
  await writeAudit(actor, "content_wait_end", "content_card", id, `${c.card_code} ลูกค้าตอบ: ${w.kind} (${days} วันทำการ)`);
  return { ok: true, days };
}

export async function deleteCard(id: string, actor: string) {
  const t = await load(), i = t.CONTENT_CARDS.rows.findIndex((r) => r.card_id === id);
  if (i < 0) throw new ContentError(404, "ไม่พบการ์ด (อาจถูกลบแล้ว)", "NOT_FOUND");
  const cur = t.CONTENT_CARDS.rows[i];
  await atomicWrite([{ deleteWhere: "CONTENT_MEMBERS", col: "card_id", value: id }, { deleteWhere: "CONTENT_WAITS", col: "card_id", value: id },
    { deleteWhere: "CONTENT_HISTORY", col: "card_id", value: id }, { deleteWhere: "CONTENT_CARDS", col: "card_id", value: id }]);
  await writeAudit(actor, "content_delete", "content_card", id, `${cur.card_code} ${cur.title}`);
}

/** ตั้งค่าต่อ Product: จำนวนโพสต์ (สร้างการ์ดอัตโนมัติตอนเปิด Job) + ระยะติดตามผล (วัน) */
export async function saveProductSetting(product: string, countRaw: unknown, daysRaw: unknown, actor: string) {
  const t = await load();
  if (!productTypesOf(t.APP_CONFIG.rows).includes(product)) throw new ContentError(404, "ไม่พบ Product", "NOT_FOUND");
  const n = (v: unknown, max: number) => { const s = String(v ?? "").trim(); if (s === "") return 0; if (!/^\d{1,3}$/.test(s) || Number(s) > max) return NaN; return Number(s); };
  const count = n(countRaw, 100), days = n(daysRaw, 365);
  const fields: Record<string, string> = {};
  if (Number.isNaN(count)) fields.content_count = "จำนวนโพสต์ 0–100";
  if (Number.isNaN(days)) fields.report_days = "ระยะติดตามผล 0–365 วัน";
  if (Object.keys(fields).length) throw new ContentError(422, "ข้อมูลไม่ถูกต้อง", "VALIDATION", { fields });
  const rec: Rec = { product, content_count: String(count), report_days: String(days), updated_by: actor, updated_at: new Date().toISOString() };
  const i = t.PRODUCT_SETTINGS.rows.findIndex((r) => r.product === product);
  if (!(i >= 0 && (await updateById("PRODUCT_SETTINGS", t.PRODUCT_SETTINGS.headers, "product", product, toRow(t.PRODUCT_SETTINGS.headers, rec))))) await appendRows("PRODUCT_SETTINGS", [toRow(SETTING_COLUMNS, rec)]);
  await writeAudit(actor, "content_product_setting", "config", product, `${product}: โพสต์ ${count} · ติดตามผล ${days} วัน`);
  return { product, content_count: count, report_days: days };
}

/** เปลี่ยนชื่อ Product → ตามไปแก้ตั้งค่า + การ์ด (best-effort เรียกจากที่เปลี่ยนชื่อ) */
export async function renameProductInContent(from: string, to: string) {
  if (!(await getD1())) return;
  await patchById("PRODUCT_SETTINGS", "product", from, { product: to });
  await patchById("CONTENT_CARDS", "product", from, { product: to });
}

/** เปิด Job แล้วสร้างการ์ดตามจำนวนโพสต์ของ Product (งานขาย) — ซ้ำ job เดิมไม่สร้างเพิ่ม · ไม่มี D1 / ไม่ตั้งจำนวน = ข้าม */
export async function createCardsForJobs(jobs: { job_id: string; job_code: string; product: string; doc_id: string; developer_id: string; customer_name: string; job_title: string }[], actor: string) {
  if (!jobs.length || !(await getD1())) return { created: 0 };
  const t = await load(), codes = t.CONTENT_CARDS.rows.map((r) => r.card_code), now = new Date().toISOString(), rows: Rec[] = [];
  const have = new Set(t.CONTENT_CARDS.rows.map((r) => r.job_id).filter(Boolean));
  for (const j of jobs) {
    if (have.has(j.job_id)) continue;
    const s = settingOf(t, j.product), n = Math.min(Number(s?.content_count || 0), 100);
    for (let k = 1; k <= n; k++) {
      const code = nextCardCode(codes); codes.push(code);
      rows.push({ ...blank(CARD_COLUMNS), card_id: crypto.randomUUID(), card_code: code, title: `${j.product} #${k}${j.job_title ? ` · ${j.job_title}` : ""}`.slice(0, 200), stage: S_FIRST, stage_at: now, sales_tag: "TRUE",
        developer_id: j.developer_id, customer_name: j.customer_name, product: j.product, follow_days: Number(s?.report_days) >= 1 ? String(Number(s?.report_days)) : "",
        job_id: j.job_id, job_code: j.job_code, doc_id: j.doc_id, created_by: actor, created_at: now, updated_by: actor, updated_at: now });
    }
  }
  if (!rows.length) return { created: 0 };
  await appendRows("CONTENT_CARDS", rows.map((r) => toRow(CARD_COLUMNS, r)));
  const H = t.CONTENT_CARDS.headers.length ? t.CONTENT_CARDS.headers : CARD_COLUMNS;
  for (const r of rows) r.card_code = await dedupeCode("CONTENT_CARDS", H, "card_code", "card_id", r.card_id, r.card_code, nextCardCode); // สร้างพร้อมกับที่อื่น → รหัสไม่ซ้ำ
  await appendRows("CONTENT_HISTORY", rows.map((r) => toRow(HISTORY_COLUMNS, { log_id: crypto.randomUUID(), card_id: r.card_id, from_stage: "", to_stage: S_FIRST, actor, at: now, note: `สร้างอัตโนมัติจาก ${r.job_code}` })));
  return { created: rows.length };
}

/** ลบการ์ดที่สร้างอัตโนมัติจาก Job ที่ถูกลบ (ใช้ตอนลบเอกสารบัญชีในโหมดทดสอบ) พร้อมผู้ร่วมงาน / การรอ / ประวัติของการ์ด */
export async function deleteCardsForJobs(jobIds: string[]) {
  const ids = new Set(jobIds.filter(Boolean));
  if (!ids.size || !(await getD1())) return { deleted: 0 };
  const t = await load(), cards = t.CONTENT_CARDS.rows.filter((c) => c.card_id && ids.has(c.job_id));
  if (!cards.length) return { deleted: 0 };
  await atomicWrite(cards.flatMap((c) => [{ deleteWhere: "CONTENT_MEMBERS", col: "card_id", value: c.card_id }, { deleteWhere: "CONTENT_WAITS", col: "card_id", value: c.card_id },
    { deleteWhere: "CONTENT_HISTORY", col: "card_id", value: c.card_id }, { deleteWhere: "CONTENT_CARDS", col: "card_id", value: c.card_id }]));
  return { deleted: cards.length };
}

/** รายงานลูกค้า: การ์ดงานขายของลูกค้าหนึ่งราย (เผยแพร่ในช่วงวันที่) พร้อมตัวเลขโพสต์ Facebook และยอดรวม */
export async function getReport(customerId: string, from: string, to: string, includeSent: boolean) {
  const { validDate } = await import("./content");
  if (!customerId) throw new ContentError(422, "เลือกลูกค้าก่อน", "VALIDATION", { fields: { customer: "เลือกลูกค้า" } });
  if ((from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) throw new ContentError(422, "ช่วงวันที่ไม่ถูกต้อง", "VALIDATION", { fields: { from: "ช่วงวันที่ไม่ถูกต้อง" } });
  const t = await load();
  const cards = t.CONTENT_CARDS.rows.filter((c) => c.card_id && c.developer_id === customerId && isTrue(c.sales_tag) && c.published_at
    && (!from || c.published_at >= from) && (!to || c.published_at <= to) && (includeSent || c.stage !== "ส่งให้ลูกค้าแล้ว"));
  cards.sort((a, b) => a.published_at.localeCompare(b.published_at) || a.card_code.localeCompare(b.card_code));
  let mx = new Map<string, import("./fb-match").PostMetrics>();
  try { mx = await (await import("./fb-match")).metricsForPosts(cards.map((c) => c.post_id)); } catch { /* ไม่มีแท็บ/อ่านไม่ได้ = ไม่มีตัวเลข รายงานยังออกได้ */ }
  const rows = cards.map((c) => ({ card_id: c.card_id, card_code: c.card_code, title: c.title, content_type: c.content_type, sales_goal: c.sales_goal, product: c.product, stage: c.stage, published_at: c.published_at,
    report_due_date: c.report_due_date, report_link: c.report_link, post_id: c.post_id, metrics: mx.get(c.post_id) ?? null }));
  const sum = (k: "views" | "reach" | "reactions" | "comments" | "shares" | "link_clicks") => rows.reduce((s, r) => s + (r.metrics?.[k] ?? 0), 0);
  const dev = t.DEVELOPERS.rows.find((d) => d.developer_id === customerId);
  return { customer: dev ? dev.company_name || dev.project_main || dev.dev_code : "", rows, matched: rows.filter((r) => r.metrics && r.metrics.scope !== "none").length,
    totals: { views: sum("views"), reach: sum("reach"), reactions: sum("reactions"), comments: sum("comments"), shares: sum("shares"), link_clicks: sum("link_clicks") } };
}

/** บันทึกว่ารายงานเสร็จ/ส่งแล้ว ให้หลายการ์ดพร้อมกัน (ใส่ลิงก์ไฟล์รายงานได้) — ย้ายตามกติกาเดิม การ์ดที่ย้ายไม่ได้ถูกข้ามและรายงานเหตุผล */
export async function markReports(ids: string[], stage: string, link: string, actor: string) {
  if (!["กำลังทำรายงาน", "รายงานเสร็จแล้ว", "ส่งให้ลูกค้าแล้ว"].includes(stage)) throw new ContentError(422, "สถานะไม่ถูกต้อง", "VALIDATION");
  if (!ids.length || ids.length > 100) throw new ContentError(422, "เลือกการ์ด 1–100 ใบ", "VALIDATION");
  const l = link.trim();
  if (l) { const v = validateCard({ title: "x", report_link: l }); if (!v.ok && v.errors.report_link) throw new ContentError(422, v.errors.report_link, "VALIDATION", { fields: { report_link: v.errors.report_link } }); }
  const done: string[] = [], skipped: { card_id: string; reason: string }[] = [];
  for (const id of new Set(ids)) {
    try {
      if (l) { // ใส่ลิงก์ก่อนย้าย
        await patchById("CONTENT_CARDS", "card_id", id, { report_link: l, updated_by: actor, updated_at: new Date().toISOString() });
      }
      await moveCard(id, stage, actor); done.push(id);
    } catch (e) { skipped.push({ card_id: id, reason: e instanceof Error ? e.message : "ไม่สำเร็จ" }); }
  }
  return { done: done.length, skipped };
}
