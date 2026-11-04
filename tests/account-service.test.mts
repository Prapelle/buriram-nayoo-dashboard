// ระบบบัญชีกับ Google Sheets จำลอง: ออกเอกสาร → ชำระ/มัดจำ → เพิ่ม Product ให้ลูกค้า + สร้าง Job — รัน: npx tsx tests/account-service.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install, tabs } from "./integration/fake-sheets.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const { saveDeveloper, addProductType } = await import("../src/lib/developers-service");
const A = await import("../src/lib/account-service");
const { todayBkk } = await import("../src/lib/developers");

const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const rows = (tab: string) => { const r = tabs.get(tab)!.rows as string[][]; const h = r[0]; return r.slice(1).map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] ?? ""])) as Record<string, string>); };
const fails = async (p: Promise<unknown>, code: string) => { try { await p; } catch (e) { assert.ok(e instanceof A.AccError, String(e)); assert.equal((e as InstanceType<typeof A.AccError>).code, code); return; } assert.fail("ควรผิดพลาด " + code); };
const ADMIN = "admin@example.com", today = todayBkk();

await initializeSpreadsheet(ADMIN);
const dev = (await saveDeveloper({ company_name: "ซีเจ เออเบิ้ล โฮม", project_main: "ซีเจ เออเบิ้ล โฮม", contact_name: "คุณ ปริญญาพร", phone: "0833651355" }, ADMIN)).dev;
await addProductType("แพ็กเกจ STD", ADMIN);
const DESC = "สิ่งที่โครงการได้รับ\n- Content รวมโครงการที่เข้าแคมเปญ\n- Code Grab มูลค่า 100 บาท\n- ปักหมุดโครงการเปิดตัวเร็วนี้";
const form = (o: Record<string, unknown> = {}) => ({ doc_type: "quotation", doc_date: today, customer_id: dev.developer_id, job_title: "บุรีรัมย์น่าอยู่ (แคมเปญ TopDeal)", contact_name: "คุณ ปริญญาพร บุญประสพ", contact_phone: "0833651355",
  lines: [{ product: "แพ็กเกจ STD", category: "Product", description: DESC, qty: 1, unit_price: 5000, start_date: "2026-11-01", end_date: "2027-04-30" }], ...o });

let qt = (await A.saveDoc(form(), ADMIN)).doc;
await t("ออกใบเสนอราคา: เลขที่ QT+ปีเดือน+ลำดับ · ยอดรวม · ผูกลูกค้าตามรายชื่อ", async () => {
  assert.match(qt.doc_no, /^QT\d{6}0001$/); assert.equal(qt.total, "5000"); assert.equal(qt.customer_name, "ซีเจ เออเบิ้ล โฮม"); assert.equal(qt.status, "draft"); assert.equal(rows("ACC_LINES").length, 1);
});
await t("ลูกค้าที่ไม่อยู่ในรายชื่อ / Product นอกรายการ → 422", async () => {
  await fails(A.saveDoc(form({ customer_id: "nope" }), ADMIN), "VALIDATION");
  await fails(A.saveDoc(form({ lines: [{ product: "ไม่มี", category: "Product", qty: 1, unit_price: 1 }] }), ADMIN), "VALIDATION");
});
await t("แก้ใบที่ยังไม่ชำระได้ (รายการถูกแทนที่) · ข้อมูลเก่า → STALE", async () => {
  qt = (await A.saveDoc({ ...form({ discount: 500 }), doc_id: qt.doc_id, updated_at_seen: qt.updated_at }, ADMIN)).doc; assert.equal(qt.total, "4500"); assert.equal(rows("ACC_LINES").filter((l) => l.doc_id === qt.doc_id).length, 1);
  await fails(A.saveDoc({ ...form(), doc_id: qt.doc_id, updated_at_seen: "2000-01-01T00:00:00.000Z" }, ADMIN), "STALE");
  qt = (await A.saveDoc({ ...form(), doc_id: qt.doc_id, updated_at_seen: qt.updated_at }, ADMIN)).doc; assert.equal(qt.total, "5000");
});
let bl = (await A.convertDoc(qt.doc_id, "billing", ADMIN)).doc;
await t("สร้างใบวางบิลต่อ: คัดลอกรายการ · root เดียวกัน · กดซ้ำไม่สร้างซ้ำ · ใบแจ้งหนี้ข้ามไปตรง ๆ ได้", async () => {
  assert.match(bl.doc_no, /^BL\d{6}0001$/); assert.equal(bl.root_id, qt.doc_id); assert.equal(bl.parent_doc_id, qt.doc_id); assert.equal(rows("ACC_LINES").filter((l) => l.doc_id === bl.doc_id).length, 1);
  const again = await A.convertDoc(qt.doc_id, "billing", ADMIN); assert.equal(again.created, false); assert.equal(again.doc.doc_id, bl.doc_id);
  await fails(A.convertDoc(bl.doc_id, "quotation" as never, ADMIN), "BAD_FLOW");
});
const iv = (await A.convertDoc(bl.doc_id, "invoice", ADMIN)).doc;
await t("ใบแจ้งหนี้ต่อจากใบวางบิล · ใบที่ถูกสร้างต่อแล้วแก้ไม่ได้", async () => {
  assert.match(iv.doc_no, /^IV\d{6}0001$/); assert.equal(iv.root_id, qt.doc_id);
  await fails(A.saveDoc({ ...form(), doc_id: qt.doc_id, updated_at_seen: qt.updated_at }, ADMIN), "LOCKED");
});

await t("ชำระมัดจำ: บันทึกชำระ + สถานะชำระบางส่วน · ยังไม่เพิ่ม Product / ไม่สร้าง Job · มีปุ่มเริ่มงาน", async () => {
  const r = await A.confirmPayment(iv.doc_id, { amount: 2000, paid_at: today, method: "โอนเงิน", ref: "สลิป 001", updated_at_seen: iv.updated_at }, ADMIN);
  assert.equal(r.full, false); assert.equal(r.started, null); assert.equal(r.canStart, true); assert.equal(r.doc.status, "paid_partial"); assert.equal(r.doc.paid_amount, "2000");
  assert.equal(rows("DEVELOPER_PRODUCTS").length, 0); assert.equal(rows("PRODUCTION_JOBS").length, 0);
  Object.assign(iv, r.doc);
});
await t("เกินยอดคงเหลือ / ข้อมูลเก่า → ปฏิเสธ ไม่บันทึกชำระ", async () => {
  await fails(A.confirmPayment(iv.doc_id, { amount: 3000.01, paid_at: today, method: "โอนเงิน", updated_at_seen: iv.updated_at }, ADMIN), "VALIDATION");
  await fails(A.confirmPayment(iv.doc_id, { amount: 100, paid_at: today, method: "โอนเงิน", updated_at_seen: "2000-01-01T00:00:00.000Z" }, ADMIN), "STALE");
  assert.equal(rows("ACC_PAYMENTS").length, 1);
});
await t("กดเริ่มงาน: เพิ่ม Product ให้ Developer (ราคา วันเริ่ม–สิ้นสุด) + สถานะลูกค้าเปลี่ยนเอง + สร้าง Job พร้อมเช็กลิสต์", async () => {
  const r = await A.startWork(iv.doc_id, ADMIN); assert.equal(r.started.products, 1); assert.equal(r.started.jobs.length, 1);
  const p = rows("DEVELOPER_PRODUCTS"); assert.equal(p.length, 1); assert.equal(p[0].developer_id, dev.developer_id); assert.equal(p[0].product, "แพ็กเกจ STD"); assert.equal(p[0].price_thb, "5000"); assert.equal(p[0].start_date, "2026-11-01"); assert.equal(p[0].end_date, "2027-04-30"); assert.match(p[0].notes, /IV\d+/);
  const j = rows("PRODUCTION_JOBS"); assert.equal(j.length, 1); assert.equal(j[0].job_code, "PJ-0001"); assert.equal(j[0].status, "รอเริ่ม"); assert.equal(j[0].checklist.split("|").length, 3); assert.equal(j[0].developer_id, dev.developer_id); assert.equal(j[0].customer_name, "ซีเจ เออเบิ้ล โฮม");
  assert.ok(rows("ACC_DOCS").find((d) => d.doc_id === qt.doc_id)!.work_started_at); assert.ok(rows("ACC_LINES").find((l) => l.doc_id === iv.doc_id)!.product_id);
  assert.ok(["ปิดการขาย", "กำลังใช้ Product", "ใกล้หมดสัญญา"].includes(rows("DEVELOPERS")[0].status), rows("DEVELOPERS")[0].status);
});
await t("เริ่มงานซ้ำไม่ได้ (ไม่เพิ่ม Product / Job ซ้ำ)", async () => { await fails(A.startWork(iv.doc_id, ADMIN), "ALREADY_STARTED"); assert.equal(rows("DEVELOPER_PRODUCTS").length, 1); assert.equal(rows("PRODUCTION_JOBS").length, 1); });
await t("ชำระส่วนที่เหลือ → ชำระแล้ว · ไม่เริ่มงานซ้ำ", async () => {
  const cur = rows("ACC_DOCS").find((d) => d.doc_id === iv.doc_id)!;
  const r = await A.confirmPayment(iv.doc_id, { amount: 3000, paid_at: today, method: "เงินสด", updated_at_seen: cur.updated_at }, ADMIN);
  assert.equal(r.doc.status, "paid"); assert.equal(r.full, true); assert.equal(r.started, null); assert.equal(rows("PRODUCTION_JOBS").length, 1); assert.equal(rows("ACC_PAYMENTS").length, 2);
});

// ── เส้นทางชำระเต็มทันที (ข้ามใบวางบิล/ใบแจ้งหนี้)
const dev2 = (await saveDeveloper({ company_name: "บ้านดี จำกัด", project_main: "บ้านดี วิลล์" }, ADMIN)).dev;
const q2 = (await A.saveDoc(form({ customer_id: dev2.developer_id, lines: [{ product: "Top ads", category: "Product", description: "", qty: 2, unit_price: 1500, start_date: "2026-11-01", end_date: "2026-12-31" }, { product: "แพ็กเกจ STD", category: "Service", description: "- งานติดตั้ง", qty: 1, unit_price: 800, start_date: "2026-11-01", end_date: "2026-11-30" }] }), ADMIN)).doc;
await t("ชำระเต็มที่ใบเสนอราคาเลย → เริ่มงานอัตโนมัติ: Product 2 รายการ + Job 2 รายการ (หนึ่งรายการสินค้าต่อหนึ่ง Job)", async () => {
  assert.equal(q2.total, "3800");
  const r = await A.confirmPayment(q2.doc_id, { amount: 3800, paid_at: today, method: "โอนเงิน", updated_at_seen: q2.updated_at }, ADMIN);
  assert.equal(r.full, true); assert.equal(r.started!.products, 2); assert.equal(r.startError, ""); assert.equal(r.doc.status, "paid");
  const p = rows("DEVELOPER_PRODUCTS").filter((x) => x.developer_id === dev2.developer_id); assert.deepEqual(p.map((x) => x.product).sort(), ["Top ads", "แพ็กเกจ STD"]); assert.equal(p.find((x) => x.product === "Top ads")!.price_thb, "3000");
  assert.equal(p.find((x) => x.product === "แพ็กเกจ STD")!.category, "Service");
  const j = rows("PRODUCTION_JOBS"); assert.deepEqual(j.map((x) => x.job_code), ["PJ-0001", "PJ-0002", "PJ-0003"]); assert.equal(j[2].checklist, "งานติดตั้ง");
});
await t("ขาดวันเริ่ม–สิ้นสุด → ชำระเต็มถูกปฏิเสธก่อนบันทึก (ไม่มีเงินเข้าแต่ไม่มีงาน) · ชำระมัดจำได้", async () => {
  const q3 = (await A.saveDoc(form({ lines: [{ product: "Top ads", category: "Product", qty: 1, unit_price: 1000 }] }), ADMIN)).doc; const n = rows("ACC_PAYMENTS").length;
  await fails(A.confirmPayment(q3.doc_id, { amount: 1000, paid_at: today, method: "โอนเงิน", updated_at_seen: q3.updated_at }, ADMIN), "VALIDATION"); assert.equal(rows("ACC_PAYMENTS").length, n);
  const r = await A.confirmPayment(q3.doc_id, { amount: 300, paid_at: today, method: "โอนเงิน", updated_at_seen: q3.updated_at }, ADMIN); assert.equal(r.canStart, true);
  await fails(A.startWork(q3.doc_id, ADMIN), "VALIDATION");
});
await t("ยังไม่ชำระ → เริ่มงานไม่ได้ · ใบที่ยกเลิกแล้วชำระไม่ได้ · ใบที่ชำระแล้วเปลี่ยนสถานะเองไม่ได้", async () => {
  const q4 = (await A.saveDoc(form(), ADMIN)).doc; await fails(A.startWork(q4.doc_id, ADMIN), "NOT_PAID");
  const c = (await A.setDocStatus(q4.doc_id, "cancelled", ADMIN)).doc; assert.equal(c.status, "cancelled");
  await fails(A.confirmPayment(q4.doc_id, { amount: 100, paid_at: today, method: "โอนเงิน", updated_at_seen: c.updated_at }, ADMIN), "LOCKED");
  await fails(A.setDocStatus(q2.doc_id, "sent", ADMIN), "LOCKED"); await fails(A.setDocStatus(q4.doc_id, "paid", ADMIN), "VALIDATION");
});
await t("ลูกค้าถูกลบก่อนเริ่มงาน → เริ่มงานไม่ได้ (CUSTOMER_GONE) และไม่สร้าง Product/Job", async () => {
  const q5 = (await A.saveDoc(form({ customer_id: dev2.developer_id }), ADMIN)).doc;
  await A.confirmPayment(q5.doc_id, { amount: 100, paid_at: today, method: "เงินสด", updated_at_seen: q5.updated_at }, ADMIN);
  const dt = tabs.get("DEVELOPERS")!.rows as string[][]; const idCol = dt[0].indexOf("developer_id"); const k = dt.findIndex((r, i) => i > 0 && r[idCol] === dev2.developer_id); dt.splice(k, 1);
  const before = rows("PRODUCTION_JOBS").length; await fails(A.startWork(q5.doc_id, ADMIN), "CUSTOMER_GONE"); assert.equal(rows("PRODUCTION_JOBS").length, before);
});
await t("Job: เปลี่ยนสถานะ · ติ๊กเช็กลิสต์ (ตัดค่านอกช่วง) · ข้อมูลเก่า → STALE", async () => {
  const j = rows("PRODUCTION_JOBS")[0];
  const r = await A.updateJob(j.job_id, { status: "กำลังทำ", done_idx: "0,2,9,x,0" }, j.updated_at, ADMIN); assert.equal(r.job.status, "กำลังทำ"); assert.equal(r.job.done_idx, "0,2");
  await fails(A.updateJob(j.job_id, { status: "เสร็จแล้ว" }, j.updated_at, ADMIN), "STALE"); await fails(A.updateJob(j.job_id, { status: "x" }, r.job.updated_at, ADMIN), "VALIDATION");
});
await t("แนบไฟล์: ยังไม่ผูก R2 → แจ้งให้เปิดที่เก็บไฟล์ · ชนิด/ขนาดไฟล์ผิด → 422", async () => {
  await fails(A.attachFile(qt.doc_id, "", { name: "a.exe", type: "application/x-msdownload", data: new ArrayBuffer(10) }, ADMIN), "VALIDATION");
  await fails(A.attachFile(qt.doc_id, "", { name: "a.pdf", type: "application/pdf", data: new ArrayBuffer(11 * 1024 * 1024) }, ADMIN), "VALIDATION");
  await fails(A.attachFile(qt.doc_id, "", { name: "slip.pdf", type: "application/pdf", data: new ArrayBuffer(10) }, ADMIN), "STORAGE_NOT_READY");
});
await t("แนบไฟล์ผ่าน KV จำลอง: บันทึกไฟล์ + แถวใน ACC_FILES · เปิดไฟล์กลับมาได้ครบ · ไฟล์ที่ไม่มีในที่เก็บ → 404", async () => {
  const kv = new Map<string, ArrayBuffer>();
  A.setFileStoreForTest({ put: async (k, v) => { kv.set(k, v); }, get: async (k) => { const v = kv.get(k); return v ? new Response(v).body : null; } });
  const bytes = new TextEncoder().encode("%PDF-slip").buffer as ArrayBuffer;
  const r = await A.attachFile(qt.doc_id, "", { name: "สลิป 001.pdf", type: "application/pdf", data: bytes }, ADMIN);
  assert.equal(rows("ACC_FILES").length, 1); assert.equal(rows("ACC_FILES")[0].doc_id, qt.doc_id); assert.equal(kv.size, 1);
  const f = await A.openFile(r.file.file_id); assert.equal(f.mime, "application/pdf"); assert.equal(await new Response(f.body).text(), "%PDF-slip");
  kv.clear(); await fails(A.openFile(r.file.file_id), "NOT_FOUND"); await fails(A.openFile("nope"), "NOT_FOUND");
  A.setFileStoreForTest(null);
});
await t("รายการ/รายละเอียดเอกสาร: สายเอกสาร · ยอดชำระ · งานที่สร้าง · ลูกค้า", async () => {
  const l = await A.listDocs(); assert.ok(l.docs.length >= 5); assert.ok(l.docs.find((d) => d.doc_id === iv.doc_id)!.work_started);
  const d = await A.getDoc(iv.doc_id); assert.deepEqual(d.chain.map((c) => c.doc_type), ["billing", "invoice", "quotation"].sort((a, b) => 0)); assert.equal(d.payments.length, 2); assert.equal(d.jobs.length, 1); assert.equal(d.customer!.name, "ซีเจ เออเบิ้ล โฮม");
});
console.log("\nระบบบัญชี (Sheets จำลอง) ผ่านทั้งหมด");
