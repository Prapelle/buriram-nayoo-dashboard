// การแจ้งเตือนในเว็บ (20/11/2026): งานที่ต้องทำ + การเปลี่ยนแปลง (D1) · รัน: npx tsx tests/notify.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install } from "./integration/fake-sheets.mjs";
import { makeD1 } from "./integration/fake-d1.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
const N = await import("../src/lib/notify");
const NS = await import("../src/lib/notify-service");
const D = await import("../src/lib/d1");
const ST = await import("../src/lib/d1-state");
const G = await import("../src/lib/d1-groups");
const C = await import("../src/lib/content");
const CS = await import("../src/lib/content-service");
const LS = await import("../src/lib/leads-service");
const DS = await import("../src/lib/developers-service");
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const { saveUser } = await import("../src/lib/users-service");
const { savePositions } = await import("../src/lib/perf-service");
const { todayBkk } = await import("../src/lib/leads");

const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const ADMIN = "admin@example.com", AE = "ae@example.com", AE2 = "ae2@example.com", PD = "pd@example.com", PD2 = "pd2@example.com", PDX = "pdx@example.com", today = todayBkk();
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

await t("ตาราง NOTIFICATIONS เกิดบน D1 (สร้างอัตโนมัติ) · recipients: ตัดผู้ทำ · ไม่ซ้ำ · ตัวพิมพ์เล็ก", () => {
  assert.ok(G.NATIVE_TABS.includes(N.NOTIF_TAB)); assert.ok(C.NATIVE_DEFS.some((d) => d.name === N.NOTIF_TAB));
  const base = { kind: "change" as const, title: "x", href: "/", ref_type: "lead", ref_id: "1" };
  const r = N.recipients([{ ...base, to: "A@x.com" }, { ...base, to: "a@x.com" }, { ...base, to: "me@x.com" }, { ...base, to: "b@x.com", kind: "assign" }, { ...base, to: "" }], "ME@x.com");
  assert.deepEqual(r.map((x) => `${x.to}:${x.kind}`), ["a@x.com:change", "b@x.com:assign"]);
});

await initializeSpreadsheet(ADMIN);
for (const [email, name, role] of [[AE, "เอ", "ae"], [AE2, "บี", "ae"], [PD, "พี", "production"], [PD2, "พีสอง", "production"], [PDX, "ไม่ใช่โปรดักชัน", "production"]] as const) await saveUser({ email, display_name: name, role }, ADMIN);

await t("ไม่มี D1: บันทึกงานได้ตามปกติ · ไม่มีการแจ้งเตือน (enabled = false) · งานที่ต้องทำยังคำนวณได้", async () => {
  const r = await LS.saveLead({ received_at: today, source_channel: "Referral", customer_name: "ไม่มี D1", phone: "0811110000", need: "ซื้อ", staff: "เอ", next_follow_up_at: today }, AE2);
  assert.equal(r.created, true);
  const l = await NS.listNotifs(AE); assert.deepEqual(l, { items: [], unread: 0, enabled: false });
  const td = await NS.todosFor(AE); assert.ok(td.some((x) => x.key === `lead:${r.lead.lead_id}` && x.tone === "amber"), JSON.stringify(td));
});

const db = makeD1(); D.setD1ForTest(db as never); ST.invalidateD1State();
await savePositions(PD, ["production"], ADMIN); await savePositions(PD2, ["production"], ADMIN); // PDX ไม่มีตำแหน่ง Production
const rows = () => db.rows(N.NOTIF_TAB) as Record<string, string>[];
const of = (email: string) => rows().filter((r) => r.user_email === email);

let leadId = "", leadAt = "";
await t("Lead: คนอื่นมอบ Lead ให้ → Staff ได้รับ (มอบหมายให้คุณ) · มอบให้ตัวเอง → ไม่แจ้ง", async () => {
  const r = await LS.saveLead({ received_at: today, source_channel: "Referral", customer_name: "สมชาย มอบงาน", phone: "0812223333", need: "ซื้อ", staff: "เอ" }, ADMIN);
  leadId = r.lead.lead_id; leadAt = r.lead.updated_at;
  const a = of(AE); assert.equal(a.length, 1); assert.equal(a[0].kind, "assign"); assert.match(a[0].title, /มอบ Lead LD-\d{4}-\d{4} สมชาย มอบงาน ให้คุณ$/); assert.equal(a[0].href, N.leadHref(leadId)); assert.equal(a[0].read_at, "");
  await LS.saveLead({ received_at: today, source_channel: "Referral", customer_name: "ทำเอง", phone: "0812224444", need: "ซื้อ", staff: "เอ" }, AE);
  assert.equal(of(AE).length, 1, "ทำเองไม่แจ้งตัวเอง");
});
await t("Lead: คนอื่นเปลี่ยนสถานะ Lead ของ Staff → แจ้ง Staff (มีการเปลี่ยนแปลง) · Staff เปลี่ยนเอง → ไม่แจ้ง", async () => {
  const r = await LS.changeLeadStatus(leadId, "call_status", "ติดต่อได้แล้ว", leadAt, ADMIN);
  const c = of(AE).find((x) => x.kind === "change")!; assert.match(c.body, /Call รอติดต่อ → ติดต่อได้แล้ว/);
  await LS.changeLeadStatus(leadId, "call_status", "รอติดต่อ", r.lead.updated_at, AE);
  assert.equal(of(AE).filter((x) => x.kind === "change").length, 1);
});
await t("Lead: เปลี่ยน Staff → Staff ใหม่ได้รับ · Staff เดิมไม่ได้", async () => {
  const cur = (await LS.listLeads()).rows.find((x) => x.lead_id === leadId)!;
  await LS.saveLead({ ...cur, staff: "บี", updated_at_seen: cur.updated_at }, ADMIN);
  assert.equal(of(AE2).filter((x) => x.kind === "assign").length, 1); assert.equal(of(AE).length, 2);
});
await t("นำเข้า Lead จากไฟล์: แถวที่ใส่ Staff → แจ้ง Staff ทีละรายการ", async () => {
  const n0 = of(AE).length;
  await LS.importLeads([["ชื่อลูกค้า", "เบอร์โทร", "ความต้องการ", "Staff"], ["นำเข้า 1", "0819990001", "ซื้อ", "เอ"], ["นำเข้า 2", "0819990002", "ขาย", "เอ"], ["นำเข้า 3", "0819990003", "ซื้อ", ""]], true, ADMIN);
  assert.equal(of(AE).length - n0, 2);
});
await t("Developer: มอบ Staff → แจ้ง · คนอื่นเปลี่ยน Status → แจ้ง (ลิงก์ไปหน้า Developer)", async () => {
  const r = await DS.saveDeveloper({ company_name: "บ.แจ้งเตือน", project_main: "โครงการ ก", staff: "เอ" }, ADMIN);
  const a = of(AE).filter((x) => x.ref_type === "developer"); assert.equal(a.length, 1); assert.equal(a[0].href, N.devHref(r.dev.developer_id, "developer"));
  await DS.changeDevStatus(r.dev.developer_id, "เข้าร่วมแล้ว", r.dev.updated_at, ADMIN);
  const c = of(AE).filter((x) => x.ref_type === "developer" && x.kind === "change"); assert.equal(c.length, 1); assert.match(c[0].body, /→ เข้าร่วมแล้ว$/);
});

let cardId = "";
await t("การ์ด Content: เพิ่มคนในการ์ด → แจ้งคนที่ถูกเพิ่ม (ไม่แจ้งผู้สร้าง)", async () => {
  const r = await CS.saveCard({ title: "โพสต์ทดสอบแจ้งเตือน", content_type: "Knowledge", members: [{ email: AE, duty: "Writer", is_main: true }, { email: ADMIN, duty: "Admin / Approver" }] }, ADMIN);
  cardId = r.card_id;
  const m = of(AE).filter((x) => x.kind === "member"); assert.equal(m.length, 1); assert.equal(m[0].href, N.cardHref(cardId)); assert.equal(of(ADMIN).length, 0);
});
await t("การ์ดเข้าช่อง ART WORK / VIDEO → ตำแหน่ง Production ที่ไม่มีชื่อในการ์ดได้ 'เข้ามารับงาน' · ผู้ร่วมงานได้ 'ย้ายการ์ด' · คนที่ไม่มีตำแหน่ง Production ไม่ได้", async () => {
  await CS.moveCard(cardId, "CONTENT PLANS", AE);
  assert.equal(of(ADMIN).filter((x) => x.kind === "change").length, 1, "ผู้ร่วมงานได้รับ (ยกเว้นผู้ย้าย)");
  await CS.moveCard(cardId, N.ART_STAGE, AE);
  for (const e of [PD, PD2]) { const c = of(e).filter((x) => x.kind === "claim"); assert.equal(c.length, 1, e); assert.match(c[0].title, /เข้า ART WORK \/ VIDEO — เข้ามารับงาน$/); }
  assert.equal(of(PDX).length, 0); assert.equal(of(AE).filter((x) => x.kind === "claim").length, 0);
});
await t("งานที่ต้องทำของตำแหน่ง Production: การ์ดในช่อง ART WORK / VIDEO ที่ยังไม่มีคนรับ → แสดง · Role อื่นไม่แสดง", async () => {
  assert.ok((await NS.todosFor(PD)).some((x) => x.key === `claim:${cardId}`));
  assert.ok(!(await NS.todosFor(AE)).some((x) => x.key.startsWith("claim:")));
});
await t("รับงาน: PD กดรับ (Graphic Designer) → อยู่ในการ์ด · แจ้งเตือน 'เข้ามารับงาน' ของทุกคน = อ่านแล้ว · หายจากงานที่ต้องทำ · หน้าที่ผิด → 422", async () => {
  await assert.rejects(CS.claimCard(cardId, "Writer", PD), (e) => (e as { status?: number }).status === 422);
  const r = await CS.claimCard(cardId, "Graphic Designer", PD); assert.deepEqual(r, { ok: true, already: false });
  const b = await CS.getBoard(); const card = b.cards.find((c) => c.card_id === cardId)!;
  assert.deepEqual(card.members.map((m) => `${m.email}:${m.duty}`).sort(), [`${ADMIN}:Admin / Approver`, `${AE}:Writer`, `${PD}:Graphic Designer`].sort());
  for (const e of [PD, PD2]) assert.ok(of(e).filter((x) => x.kind === "claim").every((x) => x.read_at), e);
  assert.ok(!(await NS.todosFor(PD2)).some((x) => x.key === `claim:${cardId}`), "มีคนรับแล้ว → ไม่ขึ้นในงานที่ต้องทำของคนอื่น");
  assert.deepEqual(await CS.claimCard(cardId, "Graphic Designer", PD), { ok: true, already: true });
});
await t("ย้ายออกแล้วย้ายกลับเข้า ART WORK / VIDEO → แจ้งเฉพาะ Production ที่ยังไม่มีชื่อ (PD อยู่ในการ์ดแล้ว)", async () => {
  await CS.moveCard(cardId, "CONTENT PLANS", AE); await CS.moveCard(cardId, N.ART_STAGE, AE);
  assert.equal(of(PD).filter((x) => x.kind === "claim").length, 1); assert.equal(of(PD2).filter((x) => x.kind === "claim").length, 2);
  assert.ok(of(PD).some((x) => x.kind === "change" && /ART WORK/.test(x.body)), "PD เป็นผู้ร่วมงานแล้ว → ได้แจ้งย้ายการ์ด");
});
await t("เลื่อนวันลง → ผู้ร่วมงานได้รับ (ไม่รวมผู้เลื่อน)", async () => {
  const c = (await CS.getBoard()).cards.find((x) => x.card_id === cardId)!;
  await CS.rescheduleCard(cardId, addDays(today, 5), PD, c.updated_at);
  assert.ok(of(AE).some((x) => /เลื่อนวันลงการ์ด/.test(x.title))); assert.ok(!of(PD).some((x) => /เลื่อนวันลงการ์ด/.test(x.title)));
});
await t("รายการแจ้งเตือน: ใหม่สุดก่อน · นับยังไม่อ่าน · อ่านทีละรายการ / อ่านทั้งหมด · อ่านของคนอื่นไม่ได้", async () => {
  const l = await NS.listNotifs(AE); assert.equal(l.enabled, true); assert.equal(l.unread, of(AE).length);
  assert.ok(l.items.every((x, i, a) => i === 0 || a[i - 1].created_at >= x.created_at)); assert.ok(l.items[0].actor, "มีชื่อผู้ทำ");
  const other = of(AE2)[0].notif_id;
  assert.equal(await NS.markRead(AE, [other]), 0, "อ่านแทนคนอื่นไม่ได้"); assert.equal(of(AE2).find((x) => x.notif_id === other)!.read_at, "");
  assert.equal(await NS.markRead(AE, [l.items[0].notif_id]), 1); assert.equal((await NS.listNotifs(AE)).unread, l.unread - 1);
  assert.equal(await NS.markRead(AE, [], true), l.unread - 1); assert.equal((await NS.listNotifs(AE)).unread, 0);
});
await t("เก็บ 90 วัน: ของเก่ากว่า 90 วันถูกลบ (ตอนมีการแจ้งเตือนใหม่ ไม่เกินชั่วโมงละครั้ง)", async () => {
  const old = new Date(Date.now() - 91 * 864e5).toISOString(), keep = new Date(Date.now() - 89 * 864e5).toISOString();
  await D.appendRows(db as never, N.NOTIF_TAB, [N.NOTIF_COLUMNS.map((c) => ({ notif_id: "old1", user_email: AE, kind: "change", title: "เก่า", created_at: old } as Record<string, string>)[c] ?? ""), N.NOTIF_COLUMNS.map((c) => ({ notif_id: "keep1", user_email: AE, kind: "change", title: "ยังเก็บ", created_at: keep } as Record<string, string>)[c] ?? "")]);
  await NS.notify([{ to: AE, kind: "change", title: "ใหม่", href: "/", ref_type: "x", ref_id: "1" }], ADMIN);
  assert.ok(rows().some((r) => r.notif_id === "old1"), "ลบไม่เกินชั่วโมงละครั้ง (เพิ่งลบไปแล้วตอนแจ้งเตือนแรก)");
  assert.equal(await NS.purgeOldNotifs(true), 1);
  assert.ok(!rows().some((r) => r.notif_id === "old1")); assert.ok(rows().some((r) => r.notif_id === "keep1"));
});
await t("งานที่ต้องทำ: Lead เลยกำหนด/วันนี้ · การ์ดที่ฉันอยู่ถึงวันลง · รายงานครบกำหนดพรุ่งนี้ · เฉพาะของตัวเอง", () => {
  const todos = NS.todosOf({ me: AE, myName: "เอ", today, isProduction: false,
    leads: [{ lead_id: "1", lead_code: "LD-1", customer_name: "ก", staff: "เอ", next_follow_up_at: addDays(today, -2), status: "New" }, { lead_id: "2", lead_code: "LD-2", customer_name: "ข", staff: "บี", next_follow_up_at: today, status: "New" }, { lead_id: "3", lead_code: "LD-3", customer_name: "ค", staff: "เอ", next_follow_up_at: addDays(today, 3), status: "New" }],
    devs: [{ developer_id: "d1", dev_code: "DV-1", company_name: "บ.หนึ่ง", staff: "เอ", status: "ใกล้หมดสัญญา", next_follow_up_at: "" }],
    cards: [{ card_id: "c1", card_code: "CT-1", title: "ถึงวันลง", stage: "REVIEW", planned_date: today, members: [{ email: AE, duty: "Writer" }] }, { card_id: "c2", card_code: "CT-2", title: "รายงาน", stage: "รอครบเพื่อทำรายงาน", report_due_date: addDays(today, 1), members: [{ email: AE, duty: "Writer" }] },
      { card_id: "c3", card_code: "CT-3", title: "ไม่ใช่ของฉัน", stage: "REVIEW", planned_date: today, members: [{ email: AE2, duty: "Writer" }] }] as never });
  assert.deepEqual(todos.map((x) => x.key), ["lead:1", "devexp:d1", "card:c1", "report:c2"]);
  assert.match(todos[0].text, /เลยมา 2 วัน$/); assert.equal(todos[0].tone, "red"); assert.match(todos[3].text, /ครบกำหนดรายงานพรุ่งนี้$/);
});
D.setD1ForTest(null); ST.invalidateD1State();
console.log("ผ่านทั้งหมด (การแจ้งเตือน)");
