// ความเร็ว D1 (20/11/2026): cache รายชื่อคอลัมน์ + ข้ามการตรวจโครงสร้างตารางเมื่อไม่เปลี่ยน · รัน: npx tsx tests/d1-cache.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install } from "./integration/fake-sheets.mjs";
import { makeD1 } from "./integration/fake-d1.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
const D = await import("../src/lib/d1");
const ST = await import("../src/lib/d1-state");
const S = await import("../src/lib/sheets");
const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };

/** นับคำสั่ง SQL ที่ส่งไป D1 */
function counting(db: ReturnType<typeof makeD1>) {
  const log: string[] = [];
  const wrap = (st: { bind: (...a: unknown[]) => unknown }, sql: string): unknown => new Proxy(st as object, { get(o, k) {
    const v = (o as Record<string | symbol, unknown>)[k];
    if (k === "bind") return (...a: unknown[]) => wrap((v as (...x: unknown[]) => { bind: (...a: unknown[]) => unknown }).apply(o, a), sql);
    if (k === "all" || k === "run" || k === "first") return (...a: unknown[]) => { log.push(sql); return (v as (...x: unknown[]) => unknown).apply(o, a); };
    return typeof v === "function" ? (v as (...x: unknown[]) => unknown).bind(o) : v;
  } });
  const proxy = {
    prepare: (sql: string) => wrap(db.prepare(sql) as never, sql),
    batch: (s: unknown[]) => { log.push(`batch(${s.length})`); return db.batch(s as never); },
  };
  return { proxy, log };
}

const raw = makeD1();
const { proxy, log } = counting(raw);
D.setD1ForTest(proxy as never); ST.invalidateD1State();

await t("เครื่องแรก: สร้างตารางที่เกิดบน D1 ครั้งเดียว แล้วบันทึกลายนิ้วมือโครงสร้างใน _meta", async () => {
  await S.readTab("CONTENT_CARDS");
  const meta = await D.metaGetAll(raw as never);
  assert.ok(meta.native_schema && meta.native_schema.includes("CONTENT_CARDS:"), "มี native_schema");
  assert.ok(meta.schema_ver, "สร้างตารางแล้วบันทึก schema_ver");
});
await t("เครื่องใหม่ (cold start) โครงสร้างไม่เปลี่ยน → ไม่ตรวจโครงสร้างซ้ำ (ไม่มี CREATE / PRAGMA ทุกตาราง)", async () => {
  const { proxy: p2, log: l2 } = counting(raw); D.setD1ForTest(p2 as never); ST.invalidateD1State(); // จำลองเครื่องใหม่ (cache ว่าง)
  await S.readTab("CONTENT_CARDS");
  assert.ok(!l2.some((x) => /CREATE TABLE|sqlite_master/.test(x)), l2.join("\n"));
  assert.ok(l2.filter((x) => /PRAGMA/.test(x)).length <= 1, "อ่านรายชื่อคอลัมน์เฉพาะตารางที่ใช้");
  log.length = 0;
});
await t("รายชื่อคอลัมน์อยู่ใน cache นาน (ไม่ PRAGMA ทุกคำขอ)", async () => {
  const { proxy: p3, log: l3 } = counting(raw); D.setD1ForTest(p3 as never); ST.invalidateD1State();
  await S.readTab("CONTENT_CARDS"); const n1 = l3.filter((x) => /PRAGMA/.test(x)).length;
  for (let i = 0; i < 5; i++) { ST.invalidateD1State(); await S.readTab("CONTENT_CARDS"); }
  assert.equal(l3.filter((x) => /PRAGMA/.test(x)).length, n1, "PRAGMA ไม่เพิ่ม");
});
await t("เครื่องอื่นเพิ่มคอลัมน์ → schema_ver เปลี่ยน → เครื่องนี้ล้าง cache และเห็นคอลัมน์ใหม่ภายในรอบอ่าน _meta ถัดไป", async () => {
  const before = await S.readTab("CONTENT_CARDS"); assert.ok(!before.headers.includes("zz_new"));
  const v0 = (await D.metaGetAll(raw as never)).schema_ver;
  // เครื่องอื่น: ใช้ db จริง (ไม่ผ่าน cache ของเครื่องนี้) เพิ่มคอลัมน์ผ่าน ensureColumns
  await raw.prepare(`ALTER TABLE "CONTENT_CARDS" ADD COLUMN "zz_new" TEXT NOT NULL DEFAULT ''`).run();
  await raw.prepare("INSERT INTO _meta (key, value) VALUES ('schema_ver', 'other-machine') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  assert.notEqual(v0, "other-machine");
  ST.invalidateD1State(); // ครบรอบ 3 วินาที
  const after = await S.readTab("CONTENT_CARDS"); assert.ok(after.headers.includes("zz_new"), after.headers.join(","));
});
await t("ensureColumns / ensureSchema ที่เพิ่มคอลัมน์จริง → บันทึก schema_ver ใหม่ · ไม่มีอะไรเพิ่ม → ไม่เขียน", async () => {
  const v1 = (await D.metaGetAll(raw as never)).schema_ver;
  await D.ensureColumns(raw as never, "CONTENT_CARDS", ["card_id"]); assert.equal((await D.metaGetAll(raw as never)).schema_ver, v1);
  await D.ensureColumns(raw as never, "CONTENT_CARDS", ["zz_two"]); assert.notEqual((await D.metaGetAll(raw as never)).schema_ver, v1);
});
D.setD1ForTest(null); ST.invalidateD1State();
console.log("ผ่านทั้งหมด (cache D1)");
