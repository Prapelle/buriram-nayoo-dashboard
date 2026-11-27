// ความคิดเห็นในการ์ด Content (27/11/2026): ข้อความ + ไฟล์แนบ · สิทธิ์แก้/ลบ · แจ้งเตือน · ลบการ์ดแล้วลบความคิดเห็น · รัน: npx tsx tests/content-comments.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install } from "./integration/fake-sheets.mjs";
import { makeD1 } from "./integration/fake-d1.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
const S = await import("../src/lib/content-comments-schema");
const CC = await import("../src/lib/content-comments");
const CS = await import("../src/lib/content-service");
const C = await import("../src/lib/content");
const G = await import("../src/lib/d1-groups");
const N = await import("../src/lib/notify");
const AS = await import("../src/lib/account-service");
const D = await import("../src/lib/d1");
const ST = await import("../src/lib/d1-state");
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const { saveUser } = await import("../src/lib/users-service");

const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const ADMIN = "admin@example.com", AE = "ae@example.com", PD = "pd@example.com", MK = "mk@example.com";
const bytes = (n: number) => new Uint8Array(n).fill(7).buffer;
const code = (e: unknown) => (e as { status?: number }).status;

await t("ตารางเกิดบน D1 · ชนิดไฟล์กำหนดจากนามสกุล (ไม่เชื่อเบราว์เซอร์) · SVG / HTML / EXE แนบไม่ได้", () => {
  for (const tab of [S.COMMENTS_TAB, S.COMMENT_FILES_TAB]) { assert.ok(G.NATIVE_TABS.includes(tab)); assert.ok(C.NATIVE_DEFS.some((d) => d.name === tab)); }
  assert.equal(S.mimeOfName("รูป.JPG"), "image/jpeg"); assert.equal(S.mimeOfName("a.xlsx"), S.COMMENT_FILE_TYPES.xlsx);
  for (const n of ["x.svg", "x.html", "x.exe", "noext", "x.jpg.exe"]) assert.equal(S.mimeOfName(n), "", n);
  assert.throws(() => CC.checkFiles([{ name: "x.svg", data: bytes(10) }]), (e) => code(e) === 422);
  assert.throws(() => CC.checkFiles(Array.from({ length: 6 }, (_, i) => ({ name: `${i}.png`, data: bytes(10) }))), /ไม่เกิน 5 ไฟล์/);
  assert.throws(() => CC.checkFiles([{ name: "big.pdf", data: bytes(S.MAX_COMMENT_FILE_BYTES + 1) }]), /10 MB/);
  assert.throws(() => CC.checkFiles([1, 2, 3].map((i) => ({ name: `${i}.pdf`, data: bytes(9 * 1024 * 1024) }))), /25 MB/);
  assert.equal(CC.checkFiles([{ name: "../../evil<>.png", data: bytes(5) }])[0].name.includes("/"), false, "ชื่อไฟล์ไม่มี /");
});

await initializeSpreadsheet(ADMIN);
for (const [email, name, role] of [[AE, "เอ", "ae"], [PD, "พี", "production"], [MK, "เอ็ม", "marketing"]] as const) await saveUser({ email, display_name: name, role, active: true } as never, ADMIN);
const db = makeD1(); D.setD1ForTest(db as never); ST.invalidateD1State();
const kv = new Map<string, ArrayBuffer>();
AS.setFileStoreForTest({ put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, get: async (k) => (kv.has(k) ? new Blob([kv.get(k)!]).stream() : null) });
const notifs = () => (db.rows(N.NOTIF_TAB) as Record<string, string>[]).filter((r) => r.kind === "comment");

const card = await CS.saveCard({ title: "โพสต์มีคอมเมนต์", content_type: "Knowledge", members: [{ email: AE, duty: "Writer", is_main: true }, { email: PD, duty: "Graphic Designer" }] }, ADMIN);
const cardId = card.card_id as string;
let first = "", withFile = "";

await t("เพิ่มความคิดเห็น: ชื่อ · เวลา · ข้อความ · ว่างทั้งข้อความและไฟล์ไม่ได้ · การ์ดไม่มีอยู่ → 404 · ยาวเกิน → 422", async () => {
  await assert.rejects(CC.addComment(cardId, "   ", [], AE), (e) => code(e) === 422);
  await assert.rejects(CC.addComment("no-such-card", "x", [], AE), (e) => code(e) === 404);
  await assert.rejects(CC.addComment(cardId, "ก".repeat(S.MAX_COMMENT_CHARS + 1), [], AE), (e) => code(e) === 422);
  const r = await CC.addComment(cardId, "  ขอรูปเพิ่มอีก 2 รูปครับ\r\nดูลิงก์ https://example.com  ", [], AE);
  first = r.comment.comment_id;
  assert.equal(r.comment.author_name, "เอ"); assert.equal(r.comment.body, "ขอรูปเพิ่มอีก 2 รูปครับ\nดูลิงก์ https://example.com"); assert.ok(Date.parse(r.comment.created_at));
});
await t("แจ้งเตือน: ผู้ร่วมงานในการ์ดได้รับ (ไม่แจ้งคนเขียน) · คนนอกการ์ดไม่ได้รับ", async () => {
  const n = notifs(); assert.deepEqual(n.map((x) => x.user_email).sort(), [PD]);
  assert.match(n[0].title, /^เอ แสดงความคิดเห็นในการ์ด CT-\d{4} โพสต์มีคอมเมนต์$/); assert.equal(n[0].href, N.cardHref(cardId)); assert.match(n[0].body, /ขอรูปเพิ่ม/);
  await CC.addComment(cardId, "คนนอกการ์ดเขียน", [], MK);
  assert.deepEqual(notifs().slice(1).map((x) => x.user_email).sort(), [AE, PD]);
});
await t("แนบรูป + PDF: เก็บไฟล์ใน KV · รูปเปิดดูในหน้า / PDF ดาวน์โหลด · เรียงตามเวลา · บอร์ดนับ 💬", async () => {
  const r = await CC.addComment(cardId, "", [{ name: "งาน.png", data: bytes(1234) }, { name: "brief.pdf", data: bytes(99) }], PD);
  withFile = r.comment.comment_id;
  assert.equal(r.comment.files.length, 2); assert.equal(kv.size, 2); assert.ok([...kv.keys()].every((k) => k.startsWith(`cmt/${cardId}/`)));
  const img = r.comment.files.find((f) => f.is_image)!; assert.equal(img.mime, "image/png"); assert.equal(img.size, 1234);
  const o = await CC.openCommentFile(img.file_id); assert.equal(o.inline, true); assert.equal(o.mime, "image/png");
  const p = await CC.openCommentFile(r.comment.files.find((f) => !f.is_image)!.file_id); assert.equal(p.inline, false);
  const l = await CC.listComments(cardId); assert.deepEqual(l.comments.map((c) => c.author_name), ["เอ", "เอ็ม", "พี"]);
  assert.equal(l.comments[2].files.length, 2);
  const b = await CS.getBoard(); assert.equal((b.cards.find((c) => c.card_id === cardId) as unknown as { comment_count: number }).comment_count, 3);
  assert.ok(notifs().some((x) => x.user_email === AE && /แนบไฟล์ 2 ไฟล์/.test(x.body)));
});
await t("ที่เก็บไฟล์ยังไม่เปิด → แนบไฟล์ไม่ได้ (409) แต่ส่งข้อความได้", async () => {
  AS.setFileStoreForTest(null);
  await assert.rejects(CC.addComment(cardId, "x", [{ name: "a.png", data: bytes(3) }], AE), (e) => code(e) === 409);
  AS.setFileStoreForTest({ put: async (k, v) => { kv.set(k, v); }, delete: async (k) => { kv.delete(k); }, get: async (k) => (kv.has(k) ? new Blob([kv.get(k)!]).stream() : null) });
});
await t("แก้: เฉพาะคนเขียน (Admin แก้ของคนอื่นไม่ได้) · มีเวลาแก้ไข · ข้อความว่างไม่ได้ถ้าไม่มีไฟล์", async () => {
  await assert.rejects(CC.editComment(first, "แก้แทน", ADMIN), (e) => code(e) === 403);
  await assert.rejects(CC.editComment(first, "  ", AE), (e) => code(e) === 422);
  const r = await CC.editComment(first, "ขอรูปเพิ่มอีก 3 รูปครับ", AE); assert.ok(r.edited_at);
  const c = (await CC.listComments(cardId)).comments.find((x) => x.comment_id === first)!; assert.equal(c.body, "ขอรูปเพิ่มอีก 3 รูปครับ"); assert.ok(c.edited_at);
  await CC.editComment(withFile, "", PD); // มีไฟล์ ข้อความว่างได้
});
await t("ลบ: คนอื่นที่ไม่ใช่ Admin ลบไม่ได้ · Admin ลบของคนอื่นได้ (ลบไฟล์ใน KV + บันทึก Audit) · คนเขียนลบของตัวเองได้", async () => {
  await assert.rejects(CC.deleteComment(withFile, AE, "ae"), (e) => code(e) === 403);
  await CC.deleteComment(withFile, ADMIN, "admin");
  assert.equal(kv.size, 0, "ไฟล์ใน KV ถูกลบ"); assert.equal((db.rows(S.COMMENT_FILES_TAB) as unknown[]).length, 0);
  await CC.deleteComment(first, AE, "ae");
  assert.deepEqual((await CC.listComments(cardId)).comments.map((c) => c.author_name), ["เอ็ม"]);
  await assert.rejects(CC.deleteComment(first, AE, "ae"), (e) => code(e) === 404);
});
await t("ลบการ์ด → ความคิดเห็นและไฟล์ของการ์ดนั้นถูกลบด้วย · การ์ดอื่นไม่โดน", async () => {
  const other = await CS.saveCard({ title: "การ์ดอื่น", content_type: "Knowledge", members: [] }, ADMIN);
  await CC.addComment(other.card_id as string, "ของการ์ดอื่น", [], AE);
  await CC.addComment(cardId, "ก่อนลบการ์ด", [{ name: "x.jpg", data: bytes(4) }], AE);
  await CS.deleteCard(cardId, ADMIN);
  assert.equal(kv.size, 0);
  const left = db.rows(S.COMMENTS_TAB) as Record<string, string>[]; assert.deepEqual(left.map((r) => r.body), ["ของการ์ดอื่น"]);
});
D.setD1ForTest(null); ST.invalidateD1State(); AS.setFileStoreForTest(null);
console.log("ผ่านทั้งหมด (ความคิดเห็นในการ์ด Content)");
