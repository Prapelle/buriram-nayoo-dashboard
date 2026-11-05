// ย้าย Google Sheets → D1: ชั้นเข้าถึงข้อมูล (เลขแถวแบบชีต) · คัดลอก/ตรวจเทียบ · สลับ/ย้อนกลับ · ล็อกระหว่างย้าย
// ใช้ Sheets จำลอง + D1 จำลอง (SQLite) — รัน: npx tsx tests/d1.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install, tabs } from "./integration/fake-sheets.mjs";
import { makeD1 } from "./integration/fake-d1.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
const D = await import("../src/lib/d1");
const S = await import("../src/lib/sheets");
const ST = await import("../src/lib/d1-state");
const AD = await import("../src/lib/d1-admin");
const { GROUP_TABS } = await import("../src/lib/d1-groups");
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const { saveDeveloper, addProductType } = await import("../src/lib/developers-service");
const { saveUser } = await import("../src/lib/users-service");
const { guardRow } = await import("../src/lib/row-guard");
const A = await import("../src/lib/account-service");
const { todayBkk } = await import("../src/lib/developers");

const META_H = (await import("../src/lib/schema")).TABS.find((x) => x.name === "META_ADS")!.headers;
const G_readTab = (await import("../src/lib/sheets-google")).readTab;
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const ADMIN = "admin@example.com", today = todayBkk();
const CORE = GROUP_TABS.core;
const sheetSnap = () => JSON.stringify(CORE.map((n) => [n, tabs.get(n)?.rows ?? null]));
const reject = async (p: Promise<unknown>, re: RegExp) => { try { await p; } catch (e) { assert.match(String((e as Error).message), re); return; } assert.fail("ควรผิดพลาด " + re); };

// ── ข้อมูลตั้งต้นบน Google Sheets (ยังไม่มี D1) ──
await initializeSpreadsheet(ADMIN);
await saveUser({ email: "ae@example.com", display_name: "เอ", role: "ae" }, ADMIN);
const dev = (await saveDeveloper({ company_name: "ซีเจ เออเบิ้ล โฮม", project_main: "ซีเจ เออเบิ้ล โฮม", contact_name: "คุณ ป", phone: "0833651355" }, ADMIN)).dev;
await addProductType("แพ็กเกจ STD", ADMIN);
A.setFileStoreForTest({ put: async () => {}, get: async () => null, delete: async () => {} });
const line = { product: "แพ็กเกจ STD", category: "Product", description: "- Content", qty: 1, unit_price: 5000, start_date: "2026-11-01", end_date: "2027-04-30" };
const qt = (await A.saveDoc({ doc_type: "quotation", doc_date: today, customer_id: dev.developer_id, job_title: "ทดสอบ", contact_name: "คุณ ป", contact_phone: "0833651355", lines: [line] }, ADMIN)).doc;
await A.confirmPayment(qt.doc_id, { amount: 2000, paid_at: today, method: "โอนเงิน", updated_at_seen: qt.updated_at }, ADMIN, { name: "slip.png", type: "image/png", data: new ArrayBuffer(16) });

const DOCS_N = (await S.readTab("ACC_DOCS")).rows.length; // ใบเสนอราคา + ใบเสร็จที่ออกอัตโนมัติตอนยืนยันชำระ
assert.ok(DOCS_N >= 2);
let corrupt = false;
const d1 = makeD1();
const db = { ...d1, batch: async (s: never[]) => { const r = await d1.batch(s); if (corrupt) d1.raw.exec(`UPDATE "ACC_DOCS" SET total = '1'`); return r; } };

await t("ยังไม่ผูก D1 → ใช้ Sheets ทั้งหมด (ไม่แตะ D1)", async () => {
  D.setD1ForTest(null); ST.invalidateD1State();
  assert.equal((await AD.d1Status()).available, false);
  assert.ok((await S.readTab("APP_USERS")).rows.some((r) => r.email === "ae@example.com"));
});

D.setD1ForTest(db as never); ST.invalidateD1State();
await t("ผูก D1 แล้วแต่ยังไม่เตรียม → ยังใช้ Sheets · เตรียมฐานข้อมูลสร้างครบทุกตาราง รันซ้ำได้", async () => {
  assert.equal((await S.readTab("ACC_DOCS")).rows.length, DOCS_N);
  const r = await AD.initD1(); assert.ok(r.createdTables.length >= CORE.length); assert.ok(r.createdTables.includes("ACC_DOCS"));
  const again = await AD.initD1(); assert.equal(again.createdTables.length, 0); assert.equal(Object.keys(again.addedColumns).length, 0);
  assert.equal((await AD.d1Status() as { initialized: boolean }).initialized, true);
});

await t("ลองคัดลอก + ตรวจเทียบ: ตรงทุกแท็บ (แถว · เนื้อหา · ยอดเงิน) · Sheets ไม่ถูกแก้ · ยังไม่สลับ", async () => {
  const before = sheetSnap();
  const rep = await AD.checkGroup("core");
  assert.equal(rep.ok, true, JSON.stringify(rep.tabs.filter((x) => !x.ok)));
  const docs = rep.tabs.find((x) => x.tab === "ACC_DOCS")!; assert.equal(docs.sheetRows, DOCS_N); assert.equal(docs.d1Rows, DOCS_N); const paid = docs.sums.find((s) => s.column === "paid_amount")!; assert.ok(paid.sheet >= 2000); assert.equal(paid.d1, paid.sheet); // ยอดชำระใน Sheets = ใน D1 (ใบเสนอราคา + ใบเสร็จ)
  assert.equal(sheetSnap(), before);
  assert.equal(((await AD.d1Status()) as { groups: { active: boolean }[] }).groups[0].active, false);
  assert.equal((await S.readTab("ACC_DOCS")).rows.length, DOCS_N); // ยังอ่านจาก Sheets
});

await t("ตรวจเทียบจับความต่างได้: แก้ยอดใน D1 → ไม่ตรง (เนื้อหาและยอดรวม)", async () => {
  d1.raw.exec(`UPDATE "ACC_DOCS" SET total = '1'`);
  const bad = await AD.verifyGroup("core"); assert.equal(bad.ok, false);
  const docs = bad.tabs.find((x) => x.tab === "ACC_DOCS")!; assert.equal(docs.hashMatch, false); assert.notEqual(docs.sums[0].sheet, docs.sums[0].d1);
  await AD.checkGroup("core"); // คัดลอกใหม่ → กลับมาตรง
  assert.equal((await AD.verifyGroup("core")).ok, true);
});

await t("สลับแล้วถ้าตรวจไม่ผ่านจะไม่สลับ (จำลองข้อมูลเพี้ยนระหว่างคัดลอก) · ธงล็อกถูกปลดเสมอ", async () => {
  corrupt = true;
  const r = await AD.cutoverGroup("core", ADMIN, { waitMs: 0 }); corrupt = false;
  assert.equal(r.switched, false); assert.equal(r.report.ok, false);
  const st = (await AD.d1Status()) as { groups: { active: boolean }[]; migrating: unknown }; assert.equal(st.groups[0].active, false); assert.equal(st.migrating, null);
  await S.appendRows("APP_CONFIG", [S.toRow((await S.readTab("APP_CONFIG")).headers, { config_key: "tmp", config_value: "1" })]); // เขียนได้ปกติ (ยังเป็น Sheets)
  await S.batchUpdateValues([]); // ไม่ล็อก
});

let snapAtCutover = "";
await t("สลับ (cutover): คัดลอก ตรวจ แล้วใช้ D1 · บันทึก Audit ลง D1 · Sheets ต้นทางไม่ถูกแก้", async () => {
  snapAtCutover = sheetSnap();
  const r = await AD.cutoverGroup("core", ADMIN, { waitMs: 0 });
  assert.equal(r.switched, true, JSON.stringify(r.report.tabs.filter((x) => !x.ok)));
  assert.equal(sheetSnap(), snapAtCutover);
  const audits = d1.rows("AUDIT_LOG").filter((a) => a.action === "d1_cutover"); assert.equal(audits.length, 1);
  assert.equal(((await AD.d1Status()) as { groups: { active: boolean }[] }).groups[0].active, true);
  await reject(AD.cutoverGroup("core", ADMIN, { waitMs: 0 }), /ใช้ D1 อยู่แล้ว/);
  await reject(AD.checkGroup("core"), /ใช้ D1 อยู่แล้ว/); // กันคัดลอกทับข้อมูลจริงที่อยู่บน D1
});

await t("หลังสลับ: อ่าน/เขียนทุกอย่างที่ D1 · Sheets ไม่ถูกเขียนอีก", async () => {
  const dev2 = (await saveDeveloper({ company_name: "บ้านดี จำกัด", project_main: "บ้านดี วิลล์" }, ADMIN)).dev;
  assert.equal(d1.rows("DEVELOPERS").length, 2); assert.ok(d1.rows("DEVELOPERS").some((r) => r.developer_id === dev2.developer_id));
  await saveUser({ email: "mk@example.com", display_name: "เอ็ม", role: "marketing" }, ADMIN);
  assert.ok(d1.rows("APP_USERS").some((r) => r.email === "mk@example.com"));
  assert.equal(sheetSnap(), snapAtCutover);
  assert.ok((await S.listTabs()).find((m) => m.title === "ACC_DOCS")!.sheetId < 0); // sheetId สมมติของ D1 → deleteRow ไปที่ D1
});

await t("เลขแถวแบบชีต: append คืน range ถูก · แก้ตาม range · ลบแล้วแถวถัดไปเลื่อนขึ้น · อ่านเป็นคอลัมน์/แถวเดียว/header ได้", async () => {
  const h = (await S.readTab("APP_CONFIG")).headers;
  const rg = await S.appendRows("APP_CONFIG", ["k1", "k2", "k3"].map((k) => S.toRow(h, { config_key: k, config_value: k + "v" })));
  const first = S.firstRowOf(rg); const n = d1.rows("APP_CONFIG").length;
  assert.equal(first, n - 3 + 2); // แถวแรกของที่เพิ่ม = (จำนวนแถวข้อมูลก่อนเพิ่ม) + 2
  const ki = h.indexOf("config_key");
  const [one] = await S.batchGet([`'APP_CONFIG'!A${first + 1}:${S.colLetter(h.length - 1)}${first + 1}`]); assert.equal(one[0][ki], "k2");
  const [col] = await S.batchGet([`'APP_CONFIG'!${S.colLetter(ki)}:${S.colLetter(ki)}`]); assert.equal(col[0][0], "config_key"); assert.equal(col[first - 1][0], "k1");
  const [hdr] = await S.batchGet(["'APP_CONFIG'!1:1"]); assert.deepEqual(hdr[0], h);
  await S.batchUpdateValues([{ range: `'APP_CONFIG'!${S.colLetter(h.indexOf("config_value"))}${first + 1}`, values: [["แก้แล้ว"]] }]);
  assert.equal(d1.rows("APP_CONFIG").find((r) => r.config_key === "k2")!.config_value, "แก้แล้ว");
  const sid = (await S.listTabs()).find((m) => m.title === "APP_CONFIG")!.sheetId;
  await S.deleteRow(sid, first); // ลบ k1 → k2 ขึ้นมาแทนที่แถวนั้น
  const [now] = await S.batchGet([`'APP_CONFIG'!${S.colLetter(ki)}${first}`]); assert.equal(now[0][0], "k2");
  await reject(S.deleteRow(sid, 1), /header/);
});

await t("row-guard ทำงานเหมือนเดิมบน D1: แถวเลื่อน → หาแถวใหม่จาก id · ถูกลบ → gone · updated_at เปลี่ยน → stale", async () => {
  const h = (await S.readTab("DEVELOPERS")).headers; const idI = h.indexOf("developer_id");
  const rows = d1.rows("DEVELOPERS"); const target = rows[1]; // แถวที่ 3 ของชีต
  const g1 = await guardRow("DEVELOPERS", h, "developer_id", target.developer_id, 3); assert.deepEqual(g1, { row: 3 });
  const g2 = await guardRow("DEVELOPERS", h, "developer_id", target.developer_id, 2); assert.deepEqual(g2, { row: 3 }); // คาดผิดแถว → หาเจอ
  const g3 = await guardRow("DEVELOPERS", h, "developer_id", target.developer_id, 3, "2000-01-01"); assert.deepEqual(g3, { error: "stale" });
  d1.raw.prepare(`DELETE FROM "DEVELOPERS" WHERE developer_id = ?`).run(rows[0].developer_id); // มีคนลบแถวบน → แถวเลื่อนขึ้น
  assert.deepEqual(await guardRow("DEVELOPERS", h, "developer_id", target.developer_id, 3), { row: 2 });
  assert.deepEqual(await guardRow("DEVELOPERS", h, "developer_id", rows[0].developer_id, 2), { error: "gone" });
  void idI;
});

await t("ล็อกระหว่างย้าย: เขียนกลุ่มนั้นไม่ได้ (503) · อ่านได้ · ธงหมดอายุ/ปลดล็อกได้", async () => {
  await D.metaSet(d1 as never, "migrating", JSON.stringify({ group: "core", since: new Date().toISOString() })); ST.invalidateD1State();
  await reject(S.appendRows("APP_CONFIG", [["x", "y"]]), /กำลังย้ายฐานข้อมูล/);
  await reject(saveUser({ email: "zz@example.com", display_name: "z", role: "ae" }, ADMIN), /กำลังย้ายฐานข้อมูล/);
  assert.ok((await S.readTab("APP_USERS")).rows.length >= 3); // อ่านได้
  await AD.unlockMigration(); await S.appendRows("APP_CONFIG", [["x", "y"]]);
  await D.metaSet(d1 as never, "migrating", JSON.stringify({ group: "core", since: new Date(Date.now() - 10 * 60_000).toISOString() })); ST.invalidateD1State();
  await S.appendRows("APP_CONFIG", [["x2", "y"]]); // ธงเก่าเกินเวลา ไม่ล็อกค้าง
  await AD.unlockMigration();
});

await t("กลับไปใช้ Sheets (rollback): อ่าน/เขียนที่ Sheets อีกครั้ง · D1 ไม่ถูกลบ · ข้อมูลหลังสลับอยู่ใน D1 เท่านั้น", async () => {
  const d1Users = d1.rows("APP_USERS").length;
  await AD.rollbackGroup("core", ADMIN);
  assert.equal(((await AD.d1Status()) as { groups: { active: boolean }[] }).groups[0].active, false);
  const emails = (await S.readTab("APP_USERS")).rows.map((r) => r.email);
  assert.ok(emails.includes("ae@example.com")); assert.ok(!emails.includes("mk@example.com"));
  assert.equal(d1.rows("APP_USERS").length, d1Users);
  await reject(AD.rollbackGroup("core", ADMIN), /ยังไม่ได้ใช้ D1/);
  assert.ok((await S.readTab("AUDIT_LOG")).rows.some((r) => r.action === "d1_rollback"));
});

await t("ไม่รู้จักกลุ่ม → 422 · ชื่อตาราง/range แปลกปลอมถูกปฏิเสธ (กัน SQL injection)", async () => {
  await reject(AD.checkGroup("nope"), /ไม่รู้จักกลุ่ม/);
  await reject(D.getRange(d1 as never, `'APP_USERS"; DROP TABLE x;--'!A1`), /ชื่อตาราง D1 ไม่ถูกต้อง/);
  await reject(D.getRange(d1 as never, "APP_USERS"), /range ไม่ถูกต้อง/);
});

// ── รอบ 3: กลุ่ม leads / sales / marketing / fbposts ──
const { saveLead, listLeads } = await import("../src/lib/leads-service");
await t("กลุ่มที่เหลือ: ตรวจ → สลับ → ใช้งานจริงบน D1 (ไม่แตะ Sheets) → ย้อนกลับได้", async () => {
  const sheetN = async (tab: string) => (await G_readTab(tab)).rows.length;
  // ข้อมูลตั้งต้นบน Sheets (ตอนนี้ core ย้อนกลับมาที่ Sheets แล้ว)
  const l1 = (await saveLead({ received_at: "2026-11-01", source_channel: "Referral", customer_name: "ผู้ซื้อ ก", phone: "0811111111", need: "ซื้อ" }, ADMIN)).lead;
  await S.appendRows("META_ADS", [["r1", "2026-11-01", "2026-11-07", "โฆษณา A"].concat(new Array(40).fill(""))].map((r) => { const h = META_H; return h.map((k, i) => (i < r.length ? r[i] : "")); }));
  const metaSum = (await S.readTab("META_ADS")).rows.length;
  // check / cutover ทุกกลุ่ม
  for (const g of ["leads", "sales", "marketing", "fbposts"]) {
    const c = await AD.checkGroup(g); assert.equal(c.ok, true, `${g}: ${JSON.stringify(c.tabs.filter((x) => !x.ok))}`);
    const r = await AD.cutoverGroup(g, ADMIN, { waitMs: 0 }); assert.equal(r.switched, true, g);
  }
  const st = (await AD.d1Status()) as { groups: { name: string; active: boolean }[] };
  assert.deepEqual(st.groups.filter((x) => x.active).map((x) => x.name).sort(), ["fbposts", "leads", "marketing", "sales"]);
  assert.equal(d1.rows("LEADS").length, 1); assert.equal(d1.rows("META_ADS").length, metaSum);
  // ใช้งานต่อบน D1: เพิ่ม Lead ใหม่ → อยู่ใน D1 · Sheets ไม่เปลี่ยน
  const before = await sheetN("LEADS");
  const l2 = (await saveLead({ received_at: "2026-11-02", source_channel: "Referral", customer_name: "ผู้ซื้อ ข", phone: "0822222222", need: "ซื้อ" }, ADMIN)).lead;
  assert.equal(d1.rows("LEADS").length, 2); assert.equal(await sheetN("LEADS"), before);
  assert.equal((await listLeads()).rows.length, 2); assert.ok(l1.lead_id && l2.lead_id);
  // ย้อนกลับ
  await AD.rollbackGroup("leads", ADMIN); assert.equal((await S.readTab("LEADS")).rows.length, before);
});

console.log("\nD1 (Sheets จำลอง + D1 จำลอง) ผ่านทั้งหมด");
