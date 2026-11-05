// ระบบบัญชีกับ Google Sheets จำลอง: ออกเอกสาร → ชำระ/มัดจำ → เพิ่ม Product ให้ลูกค้า + สร้าง Job — รัน: npx tsx tests/account-service.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install, tabs } from "./integration/fake-sheets.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
// D1_MODE=1: รันชุดเทสต์เดียวกันโดยให้กลุ่ม core ใช้ D1 จำลอง (Sheets จำลองต้องไม่ถูกเขียนเลย) — ใช้ตรวจว่าย้ายแล้วพฤติกรรมไม่เปลี่ยน
const D1MODE = process.env.D1_MODE === "1";
let d1: { rows: (t: string) => Record<string, string>[]; raw: { exec: (s: string) => void; prepare: (s: string) => { run: (...a: unknown[]) => unknown } } } | null = null;
if (D1MODE) {
  const { makeD1 } = await import("./integration/fake-d1.mjs");
  const D = await import("../src/lib/d1");
  const { TABS } = await import("../src/lib/schema");
  d1 = makeD1(); D.setD1ForTest(d1 as never);
  await D.ensureSchema(d1 as never, TABS.map((x) => ({ name: x.name, headers: x.headers })));
  await D.metaSet(d1 as never, "active_groups", JSON.stringify(["core"]));
}
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const { saveDeveloper, addProductType } = await import("../src/lib/developers-service");
const A = await import("../src/lib/account-service");
const { todayBkk } = await import("../src/lib/developers");

const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const rows = (tab: string) => { if (d1) return d1.rows(tab); const r = tabs.get(tab)!.rows as string[][]; const h = r[0]; return r.slice(1).map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] ?? ""])) as Record<string, string>); };
const fails = async (p: Promise<unknown>, code: string) => { try { await p; } catch (e) { assert.ok(e instanceof A.AccError, String(e)); assert.equal((e as InstanceType<typeof A.AccError>).code, code); return; } assert.fail("ควรผิดพลาด " + code); };
const ADMIN = "admin@example.com", today = todayBkk();

await initializeSpreadsheet(ADMIN);
const dev = (await saveDeveloper({ company_name: "ซีเจ เออเบิ้ล โฮม", project_main: "ซีเจ เออเบิ้ล โฮม", contact_name: "คุณ ปริญญาพร", phone: "0833651355" }, ADMIN)).dev;
await addProductType("แพ็กเกจ STD", ADMIN);
const DESC = "สิ่งที่โครงการได้รับ\n- Content รวมโครงการที่เข้าแคมเปญ\n- Code Grab มูลค่า 100 บาท\n- ปักหมุดโครงการเปิดตัวเร็วนี้";
const form = (o: Record<string, unknown> = {}) => ({ doc_type: "quotation", doc_date: today, customer_id: dev.developer_id, job_title: "บุรีรัมย์น่าอยู่ (แคมเปญ TopDeal)", contact_name: "คุณ ปริญญาพร บุญประสพ", contact_phone: "0833651355",
  lines: [{ product: "แพ็กเกจ STD", category: "Product", description: DESC, qty: 1, unit_price: 5000, start_date: "2026-11-01", end_date: "2027-04-30" }], ...o });

const SLIP = { name: "slip.png", type: "image/png", data: new ArrayBuffer(16) };
const kv0 = new Map<string, ArrayBuffer>();
A.setFileStoreForTest({ put: async (k: string, v: ArrayBuffer) => { kv0.set(k, v); }, get: async () => null, delete: async (k: string) => { kv0.delete(k); } });
const payNow = (id: string, input: Record<string, unknown>, actor: string, file: typeof SLIP | undefined = SLIP) => A.confirmPayment(id, input, actor, file);
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
  const r = await payNow(iv.doc_id, { amount: 2000, paid_at: today, method: "โอนเงิน", ref: "สลิป 001", updated_at_seen: iv.updated_at }, ADMIN);
  assert.equal(r.full, false); assert.equal(r.started, null); assert.equal(r.canStart, true); assert.equal(r.doc.status, "paid_partial"); assert.equal(r.doc.paid_amount, "2000");
  assert.equal(rows("DEVELOPER_PRODUCTS").length, 0); assert.equal(rows("PRODUCTION_JOBS").length, 0);
  Object.assign(iv, r.doc);
});
await t("เกินยอดคงเหลือ / ข้อมูลเก่า → ปฏิเสธ ไม่บันทึกชำระ", async () => {
  await fails(payNow(iv.doc_id, { amount: 3000.01, paid_at: today, method: "โอนเงิน", updated_at_seen: iv.updated_at }, ADMIN), "VALIDATION");
  await fails(payNow(iv.doc_id, { amount: 100, paid_at: today, method: "โอนเงิน", updated_at_seen: "2000-01-01T00:00:00.000Z" }, ADMIN), "STALE");
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
  const r = await payNow(iv.doc_id, { amount: 3000, paid_at: today, method: "เงินสด", updated_at_seen: cur.updated_at }, ADMIN);
  assert.equal(r.doc.status, "paid"); assert.equal(r.full, true); assert.equal(r.started, null); assert.equal(rows("PRODUCTION_JOBS").length, 1); assert.equal(rows("ACC_PAYMENTS").length, 2);
});

// ── เส้นทางชำระเต็มทันที (ข้ามใบวางบิล/ใบแจ้งหนี้)
const dev2 = (await saveDeveloper({ company_name: "บ้านดี จำกัด", project_main: "บ้านดี วิลล์" }, ADMIN)).dev;
const q2 = (await A.saveDoc(form({ customer_id: dev2.developer_id, lines: [{ product: "Top ads", category: "Product", description: "", qty: 2, unit_price: 1500, start_date: "2026-11-01", end_date: "2026-12-31" }, { product: "แพ็กเกจ STD", category: "Service", description: "- งานติดตั้ง", qty: 1, unit_price: 800, start_date: "2026-11-01", end_date: "2026-11-30" }] }), ADMIN)).doc;
await t("ชำระเต็มที่ใบเสนอราคาเลย → เริ่มงานอัตโนมัติ: Product 2 รายการ + Job 2 รายการ (หนึ่งรายการสินค้าต่อหนึ่ง Job)", async () => {
  assert.equal(q2.total, "3800");
  const r = await payNow(q2.doc_id, { amount: 3800, paid_at: today, method: "โอนเงิน", updated_at_seen: q2.updated_at }, ADMIN);
  assert.equal(r.full, true); assert.equal(r.started!.products, 2); assert.equal(r.startError, ""); assert.equal(r.doc.status, "paid");
  const p = rows("DEVELOPER_PRODUCTS").filter((x) => x.developer_id === dev2.developer_id); assert.deepEqual(p.map((x) => x.product).sort(), ["Top ads", "แพ็กเกจ STD"]); assert.equal(p.find((x) => x.product === "Top ads")!.price_thb, "3000");
  assert.equal(p.find((x) => x.product === "แพ็กเกจ STD")!.category, "Service");
  const j = rows("PRODUCTION_JOBS"); assert.deepEqual(j.map((x) => x.job_code), ["PJ-0001", "PJ-0002", "PJ-0003"]); assert.equal(j[2].checklist, "งานติดตั้ง");
});
await t("ขาดวันเริ่ม–สิ้นสุด → ชำระเต็มถูกปฏิเสธก่อนบันทึก (ไม่มีเงินเข้าแต่ไม่มีงาน) · ชำระมัดจำได้", async () => {
  const q3 = (await A.saveDoc(form({ lines: [{ product: "Top ads", category: "Product", qty: 1, unit_price: 1000 }] }), ADMIN)).doc; const n = rows("ACC_PAYMENTS").length;
  await fails(payNow(q3.doc_id, { amount: 1000, paid_at: today, method: "โอนเงิน", updated_at_seen: q3.updated_at }, ADMIN), "VALIDATION"); assert.equal(rows("ACC_PAYMENTS").length, n);
  const r = await payNow(q3.doc_id, { amount: 300, paid_at: today, method: "โอนเงิน", updated_at_seen: q3.updated_at }, ADMIN); assert.equal(r.canStart, true);
  await fails(A.startWork(q3.doc_id, ADMIN), "VALIDATION");
});
await t("ยังไม่ชำระ → เริ่มงานไม่ได้ · ใบที่ยกเลิกแล้วชำระไม่ได้ · ใบที่ชำระแล้วเปลี่ยนสถานะเองไม่ได้", async () => {
  const q4 = (await A.saveDoc(form(), ADMIN)).doc; await fails(A.startWork(q4.doc_id, ADMIN), "NOT_PAID");
  const c = (await A.setDocStatus(q4.doc_id, "cancelled", ADMIN)).doc; assert.equal(c.status, "cancelled");
  await fails(payNow(q4.doc_id, { amount: 100, paid_at: today, method: "โอนเงิน", updated_at_seen: c.updated_at }, ADMIN), "LOCKED");
  await fails(A.setDocStatus(q2.doc_id, "sent", ADMIN), "LOCKED"); await fails(A.setDocStatus(q4.doc_id, "paid", ADMIN), "VALIDATION");
});
await t("หัก ณ ที่จ่าย 3%: ยอดที่ต้องชำระ = ยอดรวม − หัก · ชำระเต็มตามยอดสุทธิ = เริ่มงานอัตโนมัติ · ชำระเกินยอดสุทธิถูกปฏิเสธ", async () => {
  const q = (await A.saveDoc(form({ wht_rate: 3, lines: [{ product: "Top ads", category: "Product", description: "- ลงโฆษณา", qty: 1, unit_price: 5000, start_date: "2026-11-01", end_date: "2026-12-31" }] }), ADMIN)).doc;
  assert.equal(q.total, "5000"); assert.equal(q.wht, "150"); assert.equal(q.wht_rate, "3");
  await fails(payNow(q.doc_id, { amount: 5000, paid_at: today, method: "โอนเงิน", updated_at_seen: q.updated_at }, ADMIN), "VALIDATION");
  const r = await payNow(q.doc_id, { amount: 4850, paid_at: today, method: "โอนเงิน", updated_at_seen: q.updated_at }, ADMIN);
  assert.equal(r.full, true); assert.equal(r.doc.status, "paid"); assert.ok(r.started); assert.equal(rows("DEVELOPER_PRODUCTS").find((p) => p.notes.includes(q.doc_no))!.price_thb, "5000"); // Product บันทึกราคาเต็ม ไม่ใช่ยอดหลังหัก
  const c = await A.convertDoc(q.doc_id, "invoice", ADMIN); assert.equal(c.doc.wht, "150");
});
await t("ลูกค้าถูกลบก่อนเริ่มงาน → เริ่มงานไม่ได้ (CUSTOMER_GONE) และไม่สร้าง Product/Job", async () => {
  const q5 = (await A.saveDoc(form({ customer_id: dev2.developer_id }), ADMIN)).doc;
  await payNow(q5.doc_id, { amount: 100, paid_at: today, method: "เงินสด", updated_at_seen: q5.updated_at }, ADMIN);
  if (d1) d1.raw.prepare(`DELETE FROM "DEVELOPERS" WHERE developer_id = ?`).run(dev2.developer_id); else { const dt = tabs.get("DEVELOPERS")!.rows as string[][]; const idCol = dt[0].indexOf("developer_id"); const k = dt.findIndex((r, i) => i > 0 && r[idCol] === dev2.developer_id); dt.splice(k, 1); }
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
  A.setFileStoreForTest(null);
  await fails(A.attachFile(qt.doc_id, "", { name: "slip.pdf", type: "application/pdf", data: new ArrayBuffer(10) }, ADMIN), "STORAGE_NOT_READY");
});
await t("แนบไฟล์ผ่าน KV จำลอง: บันทึกไฟล์ + แถวใน ACC_FILES · เปิดไฟล์กลับมาได้ครบ · ไฟล์ที่ไม่มีในที่เก็บ → 404", async () => {
  const kv = new Map<string, ArrayBuffer>();
  A.setFileStoreForTest({ put: async (k, v) => { kv.set(k, v); }, get: async (k) => { const v = kv.get(k); return v ? new Response(v).body : null; }, delete: async (k) => { kv.delete(k); } });
  const before = rows("ACC_FILES").length;
  const bytes = new TextEncoder().encode("%PDF-slip").buffer as ArrayBuffer;
  const r = await A.attachFile(qt.doc_id, "", { name: "สลิป 001.pdf", type: "application/pdf", data: bytes }, ADMIN);
  assert.equal(rows("ACC_FILES").length, before + 1); assert.equal(rows("ACC_FILES").find((x) => x.file_id === r.file.file_id)!.doc_id, qt.doc_id); assert.equal(kv.size, 1);
  const f = await A.openFile(r.file.file_id); assert.equal(f.mime, "application/pdf"); assert.equal(await new Response(f.body).text(), "%PDF-slip");
  kv.clear(); await fails(A.openFile(r.file.file_id), "NOT_FOUND"); await fails(A.openFile("nope"), "NOT_FOUND");
  A.setFileStoreForTest({ put: async (k: string, v: ArrayBuffer) => { kv0.set(k, v); }, get: async () => null, delete: async (k: string) => { kv0.delete(k); } });
});
await t("รายการ/รายละเอียดเอกสาร: สายเอกสาร · ยอดชำระ · งานที่สร้าง · ลูกค้า", async () => {
  const l = await A.listDocs(); assert.ok(l.docs.length >= 5); assert.ok(l.docs.find((d) => d.doc_id === iv.doc_id)!.work_started);
  const d = await A.getDoc(iv.doc_id); assert.deepEqual(d.chain.map((c) => c.doc_type), ["quotation", "billing", "invoice", "receipt", "receipt"]); // เรียงตามขั้น: เสนอราคา → วางบิล → แจ้งหนี้ → ใบเสร็จ (หนึ่งใบต่อการชำระหนึ่งครั้ง) assert.equal(d.payments.length, 2); assert.equal(d.jobs.length, 1); assert.equal(d.customer!.name, "ซีเจ เออเบิ้ล โฮม");
});
await t("ใบเสร็จ: ยืนยันชำระแล้วออกอัตโนมัติ (RC+ปีเดือน+ลำดับ) · มัดจำ/ส่วนที่เหลือเป็นคนละใบ · ผูกกับรายการชำระ · ออกซ้ำไม่ได้", async () => {
  const rc = rows("ACC_DOCS").filter((d) => d.doc_type === "receipt"); assert.ok(rc.length >= 2);
  assert.match(rc[0].doc_no, /^RC\d{6}0001$/); assert.equal(rc[0].status, "paid"); assert.equal(rc[0].parent_doc_id, iv.doc_id);
  const pays = rows("ACC_PAYMENTS").filter((p) => p.doc_id === iv.doc_id); assert.ok(pays.every((p) => p.receipt_doc_id));
  assert.equal(rc.find((d) => d.doc_id === pays[0].receipt_doc_id)!.paid_amount, pays[0].amount);
  const again = await A.issueReceipt(pays[0].payment_id, ADMIN); assert.equal(again.created, false); assert.equal(again.receipt.doc_id, pays[0].receipt_doc_id);
  const det = await A.getDoc(pays[0].receipt_doc_id); assert.equal(det.receipt_payment!.payment_id, pays[0].payment_id); assert.equal(det.parent_no, iv.doc_no);
  await fails(payNow(pays[0].receipt_doc_id, { amount: 1, paid_at: today, method: "เงินสด", updated_at_seen: det.doc.updated_at }, ADMIN), "BAD_FLOW");
  await fails(A.startWork(pays[0].receipt_doc_id, ADMIN), "BAD_FLOW");
});
await t("ใบเสร็จของการชำระเต็มครั้งเดียว: คัดลอกรายการ/ยอดจากเอกสาร (รวมหัก ณ ที่จ่าย) · รับจริง = ยอดสุทธิ", async () => {
  const q = (await A.saveDoc(form({ wht_rate: 3 }), ADMIN)).doc;
  const r = await payNow(q.doc_id, { amount: 4850, paid_at: today, method: "โอนเงิน", updated_at_seen: q.updated_at }, ADMIN);
  assert.ok(r.receipt && !r.receiptError); assert.equal(r.receipt!.total, "5000"); assert.equal(r.receipt!.wht, "150"); assert.equal(r.receipt!.paid_amount, "4850");
  assert.equal(rows("ACC_LINES").filter((l) => l.doc_id === r.receipt!.doc_id).length, 1);
});
await t("จำข้อมูลลูกค้า: ผู้ติดต่อ/เบอร์/ที่อยู่/เลขผู้เสียภาษี ตามลูกค้า · ออกใบใหม่ได้ค่าเดิม · ช่องว่างไม่ลบค่าที่จำ · เลขผู้เสียภาษีผิด → 422", async () => {
  await A.saveDoc(form({ customer_address: "99 ถ.หลักเมือง อ.เมือง จ.บุรีรัมย์ 31000", customer_tax_id: "0-3155-60000-47 6", contact_name: "คุณสมชาย", contact_phone: "0811112222" }), ADMIN);
  let c = (await A.listDocs()).customers.find((x) => x.developer_id === dev.developer_id)!;
  assert.equal(c.address, "99 ถ.หลักเมือง อ.เมือง จ.บุรีรัมย์ 31000"); assert.equal(c.tax_id, "0315560000476"); assert.equal(c.contact_name, "คุณสมชาย"); assert.equal(c.phone, "0811112222");
  await A.saveDoc(form({ customer_address: "", customer_tax_id: "", contact_name: "", contact_phone: "" }), ADMIN);
  c = (await A.listDocs()).customers.find((x) => x.developer_id === dev.developer_id)!; assert.equal(c.address, "99 ถ.หลักเมือง อ.เมือง จ.บุรีรัมย์ 31000"); assert.equal(c.tax_id, "0315560000476");
  assert.equal(rows("ACC_CUSTOMERS").filter((x) => x.developer_id === dev.developer_id).length, 1); // หนึ่งลูกค้า = หนึ่งแถว
  await fails(A.saveDoc(form({ customer_tax_id: "123" }), ADMIN), "VALIDATION");
  const d = await A.getDoc((await A.saveDoc(form({ customer_address: "ที่อยู่ใหม่" }), ADMIN)).doc.doc_id); assert.equal(d.doc.customer_address, "ที่อยู่ใหม่"); assert.equal(d.doc.customer_tax_id, "0315560000476" === d.doc.customer_tax_id ? d.doc.customer_tax_id : "");
});
await t("ยืนยันชำระต้องแนบเอกสารทุกครั้ง: ไม่แนบ/ชนิดผิด/ใหญ่เกิน/ไม่มีที่เก็บไฟล์ → ปฏิเสธก่อนบันทึกชำระ (ไม่มีเงินเข้าโดยไม่มีหลักฐาน)", async () => {
  const q = (await A.saveDoc(form(), ADMIN)).doc, n0 = rows("ACC_PAYMENTS").length, inp = { amount: 1000, paid_at: today, method: "โอนเงิน", updated_at_seen: q.updated_at };
  await fails(A.confirmPayment(q.doc_id, inp, ADMIN), "VALIDATION");
  await fails(payNow(q.doc_id, inp, ADMIN, { name: "x.exe", type: "application/x-msdownload", data: new ArrayBuffer(4) }), "VALIDATION");
  await fails(payNow(q.doc_id, inp, ADMIN, { name: "big.pdf", type: "application/pdf", data: new ArrayBuffer(10 * 1024 * 1024 + 1) }), "VALIDATION");
  A.setFileStoreForTest(null); await fails(payNow(q.doc_id, inp, ADMIN), "STORAGE_NOT_READY");
  A.setFileStoreForTest({ put: async (k: string, v: ArrayBuffer) => { kv0.set(k, v); }, get: async () => null, delete: async (k: string) => { kv0.delete(k); } });
  assert.equal(rows("ACC_PAYMENTS").length, n0);
  const r = await payNow(q.doc_id, inp, ADMIN); assert.equal(r.fileError, "");
  assert.ok(rows("ACC_FILES").some((x) => x.payment_id === r.payment.payment_id && x.doc_id === q.doc_id));
});
await t("ลบไฟล์แนบ: ลบแถว + ตัวไฟล์ใน KV · ไม่พบ → 404", async () => {
  const f = rows("ACC_FILES").find((x) => x.payment_id)!, n = rows("ACC_FILES").length, k = kv0.size;
  await A.deleteFile(f.file_id, ADMIN); assert.equal(rows("ACC_FILES").length, n - 1); assert.ok(!rows("ACC_FILES").some((x) => x.file_id === f.file_id)); assert.equal(kv0.size, k - 1);
  await fails(A.deleteFile(f.file_id, ADMIN), "NOT_FOUND");
});
await t("ลบเอกสาร: มีใบถัดไป/มีงาน Production → ลบไม่ได้ · ลบใบเสนอราคาที่มีชำระ = ลบรายการ ชำระ ไฟล์ ใบเสร็จ ด้วย · ลบใบเสร็จใบเดียว → ออกใหม่ได้", async () => {
  const q = (await A.saveDoc(form(), ADMIN)).doc;
  const b = (await A.convertDoc(q.doc_id, "billing", ADMIN)).doc;
  if (A.DELETE_RESTRICTED) { await fails(A.deleteDoc(q.doc_id, ADMIN), "LOCKED"); const jobsDoc = rows("PRODUCTION_JOBS")[0].doc_id; await fails(A.deleteDoc(jobsDoc, ADMIN), "LOCKED"); } // มีใบต่อ / สร้างงานแล้ว (โหมดปกติ)
  const r = await payNow(b.doc_id, { amount: 1000, paid_at: today, method: "เงินสด", updated_at_seen: b.updated_at }, ADMIN);
  const rc = r.receipt!.doc_id; await A.deleteDoc(rc, ADMIN);
  assert.ok(!rows("ACC_DOCS").some((d) => d.doc_id === rc)); assert.equal(rows("ACC_PAYMENTS").find((p) => p.payment_id === r.payment.payment_id)!.receipt_doc_id, "");
  const again = await A.issueReceipt(r.payment.payment_id, ADMIN); assert.equal(again.created, true);
  const nLines = rows("ACC_LINES").length, nFiles = rows("ACC_FILES").length;
  const res = await A.deleteDoc(b.doc_id, ADMIN); assert.equal(res.receipts, 1);
  for (const id of [b.doc_id, again.receipt.doc_id]) { assert.ok(!rows("ACC_DOCS").some((d) => d.doc_id === id)); assert.ok(!rows("ACC_LINES").some((l) => l.doc_id === id)); assert.ok(!rows("ACC_PAYMENTS").some((p) => p.doc_id === id)); }
  assert.equal(rows("ACC_FILES").length, nFiles - 1); assert.equal(rows("ACC_LINES").length, nLines - 2);
  await fails(A.deleteDoc(b.doc_id, ADMIN), "NOT_FOUND");
  await A.deleteDoc(q.doc_id, ADMIN); // ใบเสนอราคาลบได้แล้วเมื่อใบวางบิลถูกลบ
  if (!A.DELETE_RESTRICTED) { // โหมดทดสอบ: ลบใบที่มีใบต่อและงานแล้วได้
    const jd = rows("PRODUCTION_JOBS")[0].doc_id, jobs0 = rows("PRODUCTION_JOBS").length; await A.deleteDoc(jd, ADMIN);
    assert.ok(!rows("ACC_DOCS").some((d) => d.doc_id === jd)); assert.ok(rows("PRODUCTION_JOBS").length < jobs0); assert.ok(!rows("PRODUCTION_JOBS").some((j) => j.doc_id === jd));
  }
});
await t("สรุปบัญชี: นับเอกสารแต่ละชนิด · หนึ่งสายนับหนึ่งงาน (ใบล่าสุด) · รอเรียกเก็บ = สุทธิ − ที่ชำระ · ยอดรับจากใบเสร็จ · เกินกำหนด", async () => {
  const { summarize } = await import("../src/lib/account");
  const mk = (o: Record<string, string>) => ({ doc_id: o.doc_id, root_id: o.root_id ?? o.doc_id, doc_type: "quotation", doc_no: o.doc_id, status: "sent", total: "0", wht: "0", paid_amount: "0", due_date: "", doc_date: "2026-11-05", ...o });
  const docs = [
    mk({ doc_id: "a", total: "5000", wht: "150", paid_amount: "1000" }), mk({ doc_id: "a2", root_id: "a", doc_type: "invoice", total: "5000", wht: "150", due_date: "2026-11-01" }), // สาย a: ล่าสุดแจ้งหนี้ 4850 ชำระแล้ว 1000 → ค้าง 3850 เกินกำหนด
    mk({ doc_id: "b", total: "2000" }), mk({ doc_id: "c", total: "9999", status: "cancelled" }),
    mk({ doc_id: "r1", root_id: "a", doc_type: "receipt", status: "paid", paid_amount: "1000" }),
  ];
  const s = summarize(docs, "2026-11-05");
  assert.deepEqual(s.counts, { quotation: 2, billing: 0, invoice: 1, receipt: 1 }); assert.equal(s.cancelled, 1);
  assert.equal(s.stages.invoice.outstanding, 3850); assert.equal(s.stages.quotation.outstanding, 2000); assert.equal(s.outstanding, 5850);
  assert.equal(s.overdue.amount, 3850); assert.equal(s.received, 1000); assert.deepEqual(s.months, [{ month: "2026-11", amount: 1000 }]);
});
await t("ครบกำหนด: ไม่ใส่ = 7 วันหลังวันที่เอกสาร · ใส่ก่อนวันที่เอกสาร → 422 · ใบที่สร้างต่อก็ได้ +7 วัน", async () => {
  const { addDays } = await import("../src/lib/account");
  const d = (await A.saveDoc(form({ doc_date: "2026-11-05", due_date: "" }), ADMIN)).doc; assert.equal(d.due_date, "2026-11-12");
  const e = (await A.saveDoc(form({ doc_date: "2026-11-05", due_date: "2026-12-01" }), ADMIN)).doc; assert.equal(e.due_date, "2026-12-01");
  await fails(A.saveDoc(form({ doc_date: "2026-11-05", due_date: "2026-11-01" }), ADMIN), "VALIDATION");
  assert.equal((await A.convertDoc(d.doc_id, "billing", ADMIN)).doc.due_date, addDays(today, 7));
});
await t("ผู้ขาย: รายชื่อสมาชิกที่เปิดใช้งาน (Super Admin/Admin/AE) ใช้ทำรายการเลือก · ชื่อของผู้ใช้ปัจจุบัน", async () => {
  const l = await A.listDocs(ADMIN); assert.ok(Array.isArray(l.members)); assert.equal(typeof l.me, "string");
});
await t("รายชื่อลูกค้า: เพิ่ม → แก้ไข (ไม่ล้างช่องอื่นของ Developer) → ค้นหาได้ → ซ้ำ/เลขผู้เสียภาษีผิด/ไม่มีชื่อ → ปฏิเสธ → ลบ (มีเอกสารลบไม่ได้)", async () => {
  const c = (await A.saveCustomer({ kind: "home_builder", company_name: "บริษัท ทดสอบ บิวเดอร์ จำกัด", contact_name: "คุณทดสอบ", phone: "0812345678", address: "1 ถ.ทดสอบ", tax_id: "0-1055-12345-67 8" }, ADMIN));
  assert.equal(c.created, true); const id = c.customer.developer_id;
  let row = (await A.listCustomers()).customers.find((x) => x.developer_id === id)!; assert.equal(row.kind, "home_builder"); assert.equal(row.tax_id, "0105512345678"); assert.equal(row.address, "1 ถ.ทดสอบ"); assert.equal(row.docs, 0);
  await fails(A.saveCustomer({ company_name: "" }, ADMIN), "VALIDATION"); await fails(A.saveCustomer({ company_name: "x", tax_id: "12" }, ADMIN), "VALIDATION"); await fails(A.saveCustomer({ company_name: "x", phone: "12" }, ADMIN), "VALIDATION");
  const devRowBefore = rows("DEVELOPERS").find((r) => r.developer_id === id)!;
  await A.saveCustomer({ developer_id: id, updated_at_seen: row.updated_at, kind: "home_builder", company_name: "บริษัท ทดสอบ บิวเดอร์ จำกัด (แก้)", contact_name: "คุณใหม่", phone: "0899999999", address: "", tax_id: "" }, ADMIN);
  row = (await A.listCustomers()).customers.find((x) => x.developer_id === id)!; assert.equal(row.name, "บริษัท ทดสอบ บิวเดอร์ จำกัด (แก้)"); assert.equal(row.contact_name, "คุณใหม่"); assert.equal(row.address, ""); assert.equal(row.tax_id, "");
  const devRowAfter = rows("DEVELOPERS").find((r) => r.developer_id === id)!; assert.equal(devRowAfter.status, devRowBefore.status); assert.equal(devRowAfter.dev_code, devRowBefore.dev_code);
  assert.equal(rows("ACC_CUSTOMERS").filter((r) => r.developer_id === id).length, 1);
  await fails(A.saveCustomer({ developer_id: id, updated_at_seen: "old", kind: "home_builder", company_name: "x" }, ADMIN), "STALE");
  await A.saveDoc(form({ customer_id: id }), ADMIN);
  await fails(A.deleteCustomer(id, row.updated_at, ADMIN), "LOCKED"); // มีเอกสาร
  const c2 = await A.saveCustomer({ kind: "developer", company_name: "ลูกค้าไม่มีเอกสาร" }, ADMIN); const row2 = (await A.listCustomers()).customers.find((x) => x.developer_id === c2.customer.developer_id)!;
  await A.deleteCustomer(row2.developer_id, row2.updated_at, ADMIN); assert.ok(!rows("DEVELOPERS").some((r) => r.developer_id === row2.developer_id)); assert.ok(!rows("ACC_CUSTOMERS").some((r) => r.developer_id === row2.developer_id));
});
await t("Product: เพิ่ม · ซ้ำ/ชื่อผิด → ปฏิเสธ · เปลี่ยนชื่อแก้ทุกที่ที่ใช้ (Developer Product / รายการเอกสาร) · ลบไม่ได้ถ้ายังใช้อยู่ · ลบที่ไม่ได้ใช้ได้", async () => {
  await A.addProduct("สินค้าทดสอบ", ADMIN); await fails(A.addProduct("สินค้าทดสอบ", ADMIN), "DUPLICATE"); await fails(A.addProduct("a|b", ADMIN), "VALIDATION"); await fails(A.addProduct("  ", ADMIN), "VALIDATION");
  const used = (await A.listProducts()).products.find((p) => p.name === "แพ็กเกจ STD")!; assert.ok(used.docs > 0 && used.developers > 0);
  await fails(A.deleteProduct("แพ็กเกจ STD", ADMIN), "IN_USE");
  await fails(A.renameProduct("แพ็กเกจ STD", "สินค้าทดสอบ", ADMIN), "DUPLICATE"); await fails(A.renameProduct("ไม่มี", "x", ADMIN), "NOT_FOUND");
  const r = await A.renameProduct("แพ็กเกจ STD", "แพ็กเกจ STD2", ADMIN); assert.ok(r.updated > 0);
  assert.ok(!rows("ACC_LINES").some((l) => l.product === "แพ็กเกจ STD")); assert.ok(!rows("DEVELOPER_PRODUCTS").some((p) => p.product === "แพ็กเกจ STD")); assert.ok(rows("PRODUCTION_JOBS").every((j) => j.product !== "แพ็กเกจ STD"));
  await A.renameProduct("แพ็กเกจ STD2", "แพ็กเกจ STD", ADMIN);
  await A.deleteProduct("สินค้าทดสอบ", ADMIN); assert.ok(!(await A.listProducts()).products.some((p) => p.name === "สินค้าทดสอบ"));
});
await t("สรุปบัญชี: ยอดขายแยกตามผู้ขาย (ยอดขายรวม / ชำระแล้ว) — ใบเสนอราคาที่ยังไม่ชำระไม่นับเป็นยอดขาย", async () => {
  const { summarize } = await import("../src/lib/account");
  const mk = (o: Record<string, string>) => ({ doc_id: o.doc_id, root_id: o.root_id ?? o.doc_id, doc_type: "quotation", doc_no: o.doc_id, status: "sent", total: "0", wht: "0", paid_amount: "0", due_date: "", doc_date: "2026-11-05", seller_name: "", ...o });
  const docs = [
    mk({ doc_id: "a", seller_name: "บี", total: "5000", paid_amount: "5000" }), mk({ doc_id: "a2", root_id: "a", doc_type: "invoice", seller_name: "บี", total: "5000" }),
    mk({ doc_id: "b", seller_name: "บี", total: "3000" }), // เสนอราคาลอย ไม่นับ
    mk({ doc_id: "c", seller_name: "เอ", doc_type: "billing", total: "2000", wht: "60", paid_amount: "500" }), mk({ doc_id: "d", doc_type: "invoice", total: "100" }),
  ];
  assert.deepEqual(summarize(docs, "2026-11-05").bySeller, [{ seller: "บี", count: 1, amount: 5000, paid: 5000 }, { seller: "เอ", count: 1, amount: 1940, paid: 500 }, { seller: "(ไม่ระบุผู้ขาย)", count: 1, amount: 100, paid: 0 }]);
});
console.log("\nระบบบัญชี (Sheets จำลอง) ผ่านทั้งหมด");
