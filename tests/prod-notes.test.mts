// Production note (24/11/2026): เข้ารหัสรหัสผ่าน · รหัสเปิดดู 5 นาที · ล็อกเมื่อใส่ผิด · รัน: npx tsx tests/prod-notes.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install, tabs } from "./integration/fake-sheets.mjs";
import { makeD1 } from "./integration/fake-d1.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com", AUTH_SECRET: "test-secret-0123456789-abcdefghijklmnop" });
install("SHEET");
const P = await import("../src/lib/prod-notes");
const D = await import("../src/lib/d1");
const ST = await import("../src/lib/d1-state");
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const ADMIN = "admin@example.com", AE = "ae@example.com";

await t("เข้ารหัส / ถอดรหัส · ทุกครั้งได้ค่าต่างกัน (IV สุ่ม) · เปลี่ยน AUTH_SECRET แล้วถอดไม่ได้ (แจ้งชัดเจน)", async () => {
  const a = await P.encryptPassword("p@ss ไทย 123"), b = await P.encryptPassword("p@ss ไทย 123");
  assert.notEqual(a, b); assert.ok(a.startsWith("v1:") && !a.includes("p@ss"));
  assert.equal(await P.decryptPassword(a), "p@ss ไทย 123"); assert.equal(await P.encryptPassword(""), "");
  const old = process.env.AUTH_SECRET; process.env.AUTH_SECRET = "another-secret-0123456789-xyz";
  await assert.rejects(P.decryptPassword(a), (e) => (e as { code?: string }).code === "DECRYPT");
  process.env.AUTH_SECRET = old;
});
await t("รหัสเปิดดู: เก็บเป็นแฮช (ไม่มีตัวรหัส) · ตรวจถูก/ผิด", async () => {
  const h = await P.hashCode("secret-123"); assert.ok(h.startsWith("pbkdf2$") && !h.includes("secret-123"));
  assert.equal(await P.checkCode("secret-123", h), true); assert.equal(await P.checkCode("secret-124", h), false);
});
await t("cookie เปิดดู: ใช้ได้ 5 นาที · ผูกอีเมล · แก้ค่าแล้วใช้ไม่ได้ · หมดเวลาแล้วใช้ไม่ได้", async () => {
  const now = Date.now(), tk = await P.unlockToken("A@x.com", now);
  assert.equal(await P.unlockedUntil(tk.value, "a@x.com", now), tk.exp); assert.equal(tk.exp - now, 5 * 60_000);
  assert.equal(await P.unlockedUntil(tk.value, "b@x.com", now), 0, "คนอื่นใช้ cookie นี้ไม่ได้");
  assert.equal(await P.unlockedUntil(tk.value, "a@x.com", tk.exp + 1), 0, "หมดเวลา");
  const [p, s] = tk.value.split("."); const forged = Buffer.from(Buffer.from(p, "base64").toString().replace(/\|\d+$/, `|${now + 3600_000}`)).toString("base64");
  assert.equal(await P.unlockedUntil(`${forged}.${s}`, "a@x.com", now), 0, "แก้เวลาหมดอายุเองไม่ได้");
  assert.equal(await P.unlockedUntil(undefined, "a@x.com"), 0); assert.equal(await P.unlockedUntil("garbage", "a@x.com"), 0);
});

await initializeSpreadsheet(ADMIN);
await t("ไม่มี D1 → แจ้งว่าต้องใช้ D1", async () => { await assert.rejects(P.listNotes(), (e) => (e as { status?: number }).status === 409); });
const db = makeD1(); D.setD1ForTest(db as never); ST.invalidateD1State();

let id = "";
await t("เพิ่ม / แก้ / ลบ: รหัสผ่านถูกเข้ารหัสในฐานข้อมูล · รายการที่ส่งออกไม่มีรหัสผ่าน · เว้นว่าง = คงเดิม · ลิงก์ต้อง http(s)", async () => {
  await assert.rejects(P.saveNote({ system_name: "" }, ADMIN), (e) => (e as { status?: number }).status === 422);
  await assert.rejects(P.saveNote({ system_name: "x", link: "javascript:alert(1)" }, ADMIN), (e) => !!(e as { fields?: Record<string, string> }).fields?.link);
  const n = await P.saveNote({ system_name: "Facebook Business", link: "business.facebook.com", username: "nayoo@x.com", password: "FbPass!2026" }, ADMIN);
  id = n.note_id; assert.equal(n.link, "https://business.facebook.com/"); assert.equal(n.has_password, true); assert.ok(!("password_enc" in n));
  const raw = (db.rows("PROD_NOTES") as Record<string, string>[])[0]; assert.ok(raw.password_enc.startsWith("v1:") && !raw.password_enc.includes("FbPass"));
  const l = await P.listNotes(); assert.equal(l.notes.length, 1); assert.ok(!JSON.stringify(l).includes("FbPass") && !JSON.stringify(l).includes("v1:"), "ไม่มีรหัสผ่านหลุดในรายการ");
  await P.saveNote({ note_id: id, system_name: "Facebook Business (หลัก)", link: "https://business.facebook.com", username: "nayoo@x.com", password: "" }, ADMIN);
  assert.equal((await P.revealPassword(id, ADMIN)).password, "FbPass!2026", "เว้นว่าง = ใช้รหัสเดิม");
  await P.saveNote({ note_id: id, system_name: "Facebook Business (หลัก)", link: "", username: "", password: "NewPass" }, ADMIN);
  assert.equal((await P.revealPassword(id, ADMIN)).password, "NewPass");
  const n2 = await P.saveNote({ system_name: "ลบทิ้ง", password: "x" }, ADMIN); await P.deleteNote(n2.note_id, ADMIN);
  assert.equal((await P.listNotes()).notes.length, 1);
});
await t("รหัสเปิดดูยังไม่ตั้ง → ปลดล็อกไม่ได้ · ตั้งแล้ว (สั้นเกินไม่ได้) → ใส่ถูกได้ cookie 5 นาที", async () => {
  assert.equal((await P.listNotes()).codeSet, false);
  await assert.rejects(P.unlock("whatever", AE), (e) => (e as { code?: string }).code === "NO_CODE");
  await assert.rejects(P.setViewCode("123", ADMIN), (e) => (e as { status?: number }).status === 422);
  await P.setViewCode("view-code-2026", ADMIN);
  const cfg = (tabs.get("APP_CONFIG")!.rows as string[][]).find((r) => r[0] === "prod_notes_code")!; assert.ok(!cfg.join("|").includes("view-code-2026"), "ไม่เก็บตัวรหัส");
  assert.equal((await P.listNotes()).codeSet, true);
  const tk = await P.unlock("view-code-2026", AE); assert.ok(await P.unlockedUntil(tk.value, AE));
});
await t("ใส่ผิด 5 ครั้งใน 15 นาที → ล็อก (แม้ใส่ถูก) · คนอื่นไม่โดนล็อก · บันทึกการเปิดดู / ใส่ผิด", async () => {
  for (let i = 0; i < 5; i++) await assert.rejects(P.unlock("wrong", AE), (e) => (e as { status?: number }).status === 403);
  await assert.rejects(P.unlock("view-code-2026", AE), (e) => (e as { status?: number }).status === 429);
  assert.ok(await P.unlock("view-code-2026", ADMIN));
  const audit = (tabs.get("AUDIT_LOG")?.rows ?? db.rows("AUDIT_LOG")) as unknown[];
  const s = JSON.stringify(audit); assert.ok(s.includes("prod_note_unlock_fail") && s.includes("prod_note_reveal") && s.includes("prod_note_unlock"));
});
await t("เปลี่ยนรหัสเปิดดู → รหัสเดิมใช้ไม่ได้", async () => {
  await P.setViewCode("brand-new-code", ADMIN);
  await assert.rejects(P.unlock("view-code-2026", ADMIN), (e) => (e as { status?: number }).status === 403);
  assert.ok(await P.unlock("brand-new-code", ADMIN));
});
D.setD1ForTest(null); ST.invalidateD1State();
console.log("ผ่านทั้งหมด (Production note)");
