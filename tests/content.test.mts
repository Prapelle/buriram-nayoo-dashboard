// บอร์ด Content: กติกาล้วน (content.ts) + service บน D1 จำลอง (ตารางเกิดบน D1) + สร้างการ์ดอัตโนมัติตอนเปิด Job
// รัน: npx tsx tests/content.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install } from "./integration/fake-sheets.mjs";
import { makeD1 } from "./integration/fake-d1.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
const C = await import("../src/lib/content");
const D = await import("../src/lib/d1");
const ST = await import("../src/lib/d1-state");
const CS = await import("../src/lib/content-service");
const A = await import("../src/lib/account-service");
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const { saveDeveloper, addProductType } = await import("../src/lib/developers-service");
const { saveUser } = await import("../src/lib/users-service");
const { todayBkk } = await import("../src/lib/developers");

const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const fails = async (p: Promise<unknown>, code: string) => { try { await p; } catch (e) { assert.equal((e as { code?: string }).code, code, String((e as Error).message)); return; } assert.fail("ควรผิดพลาด " + code); };
const ADMIN = "admin@example.com", today = todayBkk();

// ── กติกาล้วน ──
await t("planMove: งานขายเข้า PUBLISHED → เลื่อนไปรอรายงานอัตโนมัติ + วันครบกำหนด", async () => {
  const p = C.planMove({ stage: "SCHEDULED", sales_tag: "TRUE", follow_days: "30" }, "PUBLISHED", "2026-11-05");
  assert.ok(p.ok); assert.deepEqual(p.steps, ["PUBLISHED", "รอครบเพื่อทำรายงาน"]); assert.equal(p.patch.published_at, "2026-11-05"); assert.equal(p.patch.report_due_date, "2026-12-05");
});
await t("planMove: งานขายไม่มีระยะติดตาม → 422 · งานไม่ใช่งานขายเผยแพร่ได้ปกติ", async () => {
  const p = C.planMove({ stage: "REVIEW", sales_tag: "TRUE", follow_days: "" }, "PUBLISHED", today); assert.ok(!p.ok && p.code === "NEED_FOLLOW_DAYS");
  const q = C.planMove({ stage: "REVIEW", sales_tag: "FALSE" }, "PUBLISHED", today); assert.ok(q.ok && q.steps.length === 1);
});
await t("planMove: ไม่ใช่งานขายเข้าช่วงรายงานไม่ได้ · ยังไม่เผยแพร่เข้าไม่ได้", async () => {
  const a = C.planMove({ stage: "PUBLISHED", sales_tag: "FALSE", published_at: today }, "กำลังทำรายงาน", today); assert.ok(!a.ok && a.code === "NOT_SALES");
  const b = C.planMove({ stage: "REVIEW", sales_tag: "TRUE", follow_days: "7" }, "กำลังทำรายงาน", today); assert.ok(!b.ok && b.code === "NOT_PUBLISHED");
});
await t("planMove: ส่งให้ลูกค้า → บันทึกวันที่ส่ง · ถอยกลับก่อนเผยแพร่ → ล้างวันที่", async () => {
  const s = C.planMove({ stage: "รายงานเสร็จแล้ว", sales_tag: "TRUE", follow_days: "7", published_at: "2026-11-01", report_due_date: "2026-11-08" }, "ส่งให้ลูกค้าแล้ว", "2026-11-09");
  assert.ok(s.ok && s.patch.report_sent_at === "2026-11-09");
  const b = C.planMove({ stage: "รอครบเพื่อทำรายงาน", sales_tag: "TRUE", follow_days: "7", published_at: "2026-11-01", report_due_date: "2026-11-08" }, "REVIEW", today);
  assert.ok(b.ok && b.patch.published_at === "" && b.patch.report_due_date === "");
});
await t("validateCard: ตรวจข้อมูล", async () => {
  assert.ok(!C.validateCard({ title: "" }).ok);
  const bad = C.validateCard({ title: "x", follow_days: "0", drive_link: "javascript:1", members: [{ email: "a@b.co", is_main: true }, { email: "c@d.co", is_main: true }] });
  assert.ok(!bad.ok && bad.errors.follow_days && bad.errors.drive_link && bad.errors.members);
  assert.ok(C.validateCard({ title: "ok", content_type: "Knowledge", members: [{ email: "A@B.co", duty: "Writer", is_main: true }] }).ok);
});

// ── service บน D1 ──
await fails(CS.getBoard(), "NO_D1");
await initializeSpreadsheet(ADMIN);
await saveUser({ email: "ae@example.com", display_name: "เอ", role: "ae" }, ADMIN);
await saveUser({ email: "pd@example.com", display_name: "พี", role: "production" }, ADMIN);
const db = makeD1(); D.setD1ForTest(db as never); ST.invalidateD1State();
await addProductType("แพ็กเกจ STD", ADMIN);
const dev = (await saveDeveloper({ company_name: "ซีเจ เออเบิ้ล โฮม", project_main: "ซีเจ", contact_name: "ป", phone: "0833651355" }, ADMIN)).dev;
let id = "";

await t("สร้างการ์ด: ตารางสร้างเองบน D1 · เริ่มที่ IDEA · มีประวัติ + ผู้ร่วมงาน", async () => {
  const r = await CS.saveCard({ title: "โพสต์แนะนำโครงการ", content_type: "Pure Product", sales_tag: true, sales_goal: "Sales", developer_id: dev.developer_id, product: "แพ็กเกจ STD", follow_days: "14", members: [{ email: "pd@example.com", duty: "Writer", is_main: true }, { email: "ae@example.com", duty: "Admin / Approver", is_main: false }] }, ADMIN);
  id = r.card_id; assert.equal(r.card_code, "CT-0001");
  const b = await CS.getBoard(); const c = b.cards[0];
  assert.equal(c.stage, "IDEA"); assert.equal(c.customer_name, "ซีเจ เออเบิ้ล โฮม"); assert.equal(c.members.length, 2); assert.equal(c.members.find((m) => m.is_main)?.name, "พี");
  assert.equal(db.rows("CONTENT_HISTORY").length, 1);
});
await t("ผู้ร่วมงานที่ไม่มีในระบบ / ลูกค้าไม่มีจริง → 422", async () => {
  await fails(CS.saveCard({ title: "x", members: [{ email: "ghost@x.co" }] }, ADMIN), "VALIDATION");
  await fails(CS.saveCard({ title: "x", developer_id: "nope" }, ADMIN), "VALIDATION");
  assert.equal(db.rows("CONTENT_CARDS").length, 1);
});
await t("แก้การ์ด: stale ถูกปฏิเสธ · เปลี่ยนผู้ร่วมงานได้", async () => {
  const c = (await CS.getBoard()).cards[0];
  await fails(CS.saveCard({ title: "เก่า", updated_at_seen: "x" }, ADMIN, id), "STALE");
  await CS.saveCard({ title: "โพสต์แนะนำโครงการ v2", sales_tag: true, follow_days: "14", developer_id: dev.developer_id, product: "แพ็กเกจ STD", members: [{ email: "ae@example.com", duty: "Writer", is_main: true }], updated_at_seen: c.updated_at }, ADMIN, id);
  const n = (await CS.getBoard()).cards[0]; assert.equal(n.title, "โพสต์แนะนำโครงการ v2"); assert.deepEqual(n.members.map((m) => m.email), ["ae@example.com"]); assert.equal(db.rows("CONTENT_MEMBERS").length, 1);
});
await t("ย้ายผ่านช่วงผลิต → PUBLISHED เลื่อนไปรอรายงานอัตโนมัติ (ประวัติ 2 แถวเพิ่ม)", async () => {
  for (const s of ["CONTENT PLANS", "REVIEW", "SCHEDULED"]) await CS.moveCard(id, s, ADMIN);
  const r = await CS.moveCard(id, "PUBLISHED", ADMIN); assert.equal(r.stage, "รอครบเพื่อทำรายงาน"); assert.equal(r.auto, true);
  const c = (await CS.getBoard()).cards[0]; assert.equal(c.published_at, today); assert.equal(c.report_due_date, C.addDays(today, 14)); assert.equal(c.due, "upcoming");
  assert.equal(db.rows("CONTENT_HISTORY").length, 1 + 3 + 2);
});
await t("เอาแท็กงานขายออกขณะอยู่ช่วงรายงาน → 409", async () => {
  const c = (await CS.getBoard()).cards[0];
  await fails(CS.saveCard({ title: c.title, sales_tag: false, updated_at_seen: c.updated_at }, ADMIN, id), "IN_REPORT");
});
await t("ส่งให้ลูกค้า → บันทึกวันที่ส่ง · ถอยกลับ → ล้างวันที่ส่ง", async () => {
  await CS.moveCard(id, "กำลังทำรายงาน", ADMIN); await CS.moveCard(id, "รายงานเสร็จแล้ว", ADMIN); await CS.moveCard(id, "ส่งให้ลูกค้าแล้ว", ADMIN);
  assert.equal((await CS.getBoard()).cards[0].report_sent_at, today);
  await CS.moveCard(id, "รายงานเสร็จแล้ว", ADMIN); assert.equal((await CS.getBoard()).cards[0].report_sent_at, "");
});
await t("การ์ดที่ไม่ใช่งานขายย้ายเข้าช่วงรายงานไม่ได้", async () => {
  const r = await CS.saveCard({ title: "ความรู้ทั่วไป", content_type: "Knowledge" }, ADMIN);
  await fails(CS.moveCard(r.card_id, "กำลังทำรายงาน", ADMIN), "NOT_SALES");
  assert.equal(r.card_code, "CT-0002");
});
await t("ตั้งค่า Product + เปิด Job สร้างการ์ดตามจำนวนโพสต์ (ซ้ำไม่สร้างเพิ่ม)", async () => {
  await fails(CS.saveProductSetting("แพ็กเกจ STD", "abc", "", ADMIN), "VALIDATION");
  await CS.saveProductSetting("แพ็กเกจ STD", "3", "30", ADMIN);
  const line = { product: "แพ็กเกจ STD", category: "Product", description: "- Content", qty: 1, unit_price: 5000, start_date: "2026-11-01", end_date: "2027-04-30" };
  A.setFileStoreForTest({ put: async () => {}, get: async () => null, delete: async () => {} });
  const q = (await A.saveDoc({ doc_type: "quotation", doc_date: today, customer_id: dev.developer_id, job_title: "ทดสอบ", contact_name: "ป", contact_phone: "0833651355", lines: [line] }, ADMIN)).doc;
  await A.confirmPayment(q.doc_id, { amount: 2000, paid_at: today, method: "โอนเงิน", updated_at_seen: q.updated_at }, ADMIN, { name: "s.png", type: "image/png", data: new ArrayBuffer(8) });
  const before = db.rows("CONTENT_CARDS").length;
  const r = await A.startWork(q.doc_id, ADMIN); assert.equal(r.started.jobs.length, 1);
  const rows = db.rows("CONTENT_CARDS").slice(before); assert.equal(rows.length, 3);
  assert.ok(rows.every((c) => c.sales_tag === "TRUE" && c.follow_days === "30" && c.stage === "IDEA" && c.job_id === r.started.jobs[0].job_id));
  const jobRow = r.started.jobs[0];
  assert.equal((await CS.createCardsForJobs([{ job_id: jobRow.job_id, job_code: jobRow.job_code, product: jobRow.product, doc_id: q.doc_id, developer_id: dev.developer_id, customer_name: "x", job_title: "" }], ADMIN)).created, 0);
});
await t("เปลี่ยนชื่อ Product ตามไปที่ตั้งค่าและการ์ด", async () => {
  await A.renameProduct("แพ็กเกจ STD", "แพ็กเกจ Standard", ADMIN);
  assert.ok(db.rows("PRODUCT_SETTINGS").some((s) => s.product === "แพ็กเกจ Standard")); assert.ok(db.rows("CONTENT_CARDS").every((c) => c.product !== "แพ็กเกจ STD"));
});
await t("ลบการ์ด: ลบผู้ร่วมงาน + ประวัติด้วย", async () => {
  await CS.deleteCard(id, ADMIN);
  assert.ok(!db.rows("CONTENT_CARDS").some((c) => c.card_id === id)); assert.equal(db.rows("CONTENT_MEMBERS").filter((m) => m.card_id === id).length, 0); assert.equal(db.rows("CONTENT_HISTORY").filter((h) => h.card_id === id).length, 0);
  await fails(CS.deleteCard(id, ADMIN), "NOT_FOUND");
});
await t("Facebook: คล้ายข้อความ + จับคู่เฉพาะที่มั่นใจ + ตัวเลขโพสต์", async () => {
  const F = await import("../src/lib/fb-match"); const S = await import("../src/lib/sheets");
  assert.ok(F.similarity("โปรโมชั่นบ้านหลังใหม่ ลดพิเศษ", "ประกาศ โปรโมชั่นบ้านหลังใหม่ ลดพิเศษ วันนี้ถึงสิ้นเดือน") >= 0.9); assert.ok(F.similarity("โปรโมชั่นบ้านหลังใหม่", "สูตรอาหารเช้า") < 0.2);
  const cards = [{ card_id: "c1", card_code: "CT-1", title: "โปรโมชั่นบ้านหลังใหม่ ลดพิเศษ", planned_date: "2026-11-03" }, { card_id: "c2", card_code: "CT-2", title: "ความรู้เรื่องกู้บ้าน", planned_date: "2026-11-03" }] as never[];
  const posts = [{ post_id: "P1", page_id: "pg", publish_time: "2026-11-03 10:00", text: "โปรโมชั่นบ้านหลังใหม่ ลดพิเศษ ถึงสิ้นเดือน", permalink: "u" }, { post_id: "P2", page_id: "pg", publish_time: "2026-11-09 10:00", text: "ความรู้เรื่องกู้บ้าน", permalink: "u" }];
  assert.deepEqual(F.pickMatches(cards, posts).map((m) => m.post_id), ["P1"]); // c2 โพสต์ห่างเกิน 1 วัน ไม่จับ
  // ครบทาง: เขียนแถวลงแท็บ FB_PAGE_POSTS ของ Sheets จำลอง แล้วจับคู่
  const r = await CS.saveCard({ title: "โปรโมชั่นบ้านหลังใหม่ ลดพิเศษ", planned_date: "2026-11-03" }, ADMIN);
  const h = (await S.readTab("FB_PAGE_POSTS")).headers; const row = (o: Record<string, string>) => h.map((k) => o[k] ?? "");
  await S.appendRows("FB_PAGE_POSTS", [row({ post_id: "P1", page_id: "pg", publish_time: "2026-11-03 10:00", title: "โปรโมชั่นบ้านหลังใหม่ ลดพิเศษ ถึงสิ้นเดือน", metric_date: "2026-11-04", metric_scope: "daily", reach: "100", reactions: "5", permalink: "https://fb/p1" }), row({ post_id: "P1", page_id: "pg", publish_time: "2026-11-03 10:00", metric_date: "2026-11-05", metric_scope: "daily", reach: "50", reactions: "3" })]);
  const m = await F.matchFacebookPosts(ADMIN); assert.equal(m.matched, 1);
  assert.equal(db.rows("CONTENT_CARDS").find((c) => c.card_id === r.card_id)?.post_id, "P1");
  assert.equal((await F.matchFacebookPosts(ADMIN)).matched, 0); // ไม่จับซ้ำ
  const mx = await F.metricsForPost("P1"); assert.ok(mx); assert.equal(mx.scope, "daily"); assert.equal(mx.reach, 150); assert.equal(mx.reactions, 8); assert.equal(mx.permalink, "https://fb/p1");
});
console.log("content: ผ่านทั้งหมด");
