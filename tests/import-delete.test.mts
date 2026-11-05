// ลบข้อมูลของรายงานที่นำเข้า (Super Admin) — รัน: npx tsx tests/import-delete.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install } from "./integration/fake-sheets.mjs";
import { makeD1 } from "./integration/fake-d1.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const S = await import("../src/lib/sheets");
const { deleteBatchData, listBatches, HttpError } = await import("../src/lib/import/service");
await initializeSpreadsheet("admin@example.com");

for (const mode of ["sheets", "d1"]) {
  if (mode === "d1") { // กลุ่ม core + marketing อยู่บน D1 จำลอง (เหมือนระบบจริง)
    const D = await import("../src/lib/d1"); const ST = await import("../src/lib/d1-state"); const { TABS } = await import("../src/lib/schema");
    const d1 = makeD1(); D.setD1ForTest(d1 as never);
    await D.ensureSchema(d1 as never, TABS.map((x) => ({ name: x.name, headers: x.headers })));
    await D.metaSet(d1 as never, "active_groups", JSON.stringify(["core", "marketing"])); ST.invalidateD1State();
  }
  const tabs = await S.readTabs(["IMPORT_BATCHES", "META_ADS"]);
  const BH = tabs.IMPORT_BATCHES.headers, MH = tabs.META_ADS.headers;
  if (!MH.length) { console.log(`  (ข้าม ${mode}: ไม่มีแท็บ META_ADS)`); continue; }
  const b = (id: string, start: string, end: string, status = "success") => S.toRow(BH, { batch_id: id, source: "facebook_ads", report_type: "fb_ads", filename: `${id}.csv`, report_start: start, report_end: end, status, uploaded_at: "2026-10-01T00:00:00Z" });
  const m = (rid: string, batch: string, start: string, end: string) => S.toRow(MH, { record_id: rid, source_batch_id: batch, report_start: start, report_end: end, ad_name: rid, amount_spent_thb: "10" });
  await S.appendRows("IMPORT_BATCHES", [b(`${mode}-sep`, "2026-09-01", "2026-09-30"), b(`${mode}-ytd`, "2026-01-01", "2026-09-30"), b(`${mode}-sep2`, "2026-09-01", "2026-09-30")]);
  await S.appendRows("META_ADS", [m(`${mode}a1`, `${mode}-sep`, "2026-09-01", "2026-09-30"), m(`${mode}a2`, `${mode}-sep`, "2026-09-01", "2026-09-30"), m(`${mode}a3`, `${mode}-sep2`, "2026-09-01", "2026-09-30"), m("y1", `${mode}-ytd`, "2026-01-01", "2026-09-30")]);

  await t(`[${mode}] นับก่อนลบ: ไม่เขียนอะไร · นับรวมรายงานช่วงเดียวกันที่นำเข้าซ้ำ`, async () => {
    const pre = await deleteBatchData(`${mode}-sep`, "admin@example.com", false);
    assert.deepEqual([pre.rows, pre.batches, pre.deleted], [3, 2, false]);
    assert.equal((await S.readTab("META_ADS")).rows.filter((r) => r.source_batch_id.startsWith(mode)).length, 4);
  });
  await t(`[${mode}] ยืนยันลบ: ลบเฉพาะช่วง 1–30 ก.ย. · รายงาน 1 ม.ค.–30 ก.ย. ยังอยู่ · ชุดนำเข้าเป็น deleted (ไม่หายจากประวัติ)`, async () => {
    const r = await deleteBatchData(`${mode}-sep`, "admin@example.com", true); assert.equal(r.rows, 3); assert.ok(r.deleted);
    assert.deepEqual((await S.readTab("META_ADS")).rows.filter((x) => x.source_batch_id.startsWith(mode)).map((x) => x.record_id), ["y1"]);
    const hist = (await listBatches()).filter((x) => x.batch_id.startsWith(mode));
    assert.deepEqual(Object.fromEntries(hist.map((x) => [x.batch_id, x.status])), { [`${mode}-sep`]: "deleted", [`${mode}-ytd`]: "success", [`${mode}-sep2`]: "deleted" });
    assert.ok((await S.readTab("AUDIT_LOG")).rows.some((x) => x.action === "import_batch_delete"));
  });
  await t(`[${mode}] ลบซ้ำ → 409 · ไม่พบ → 404`, async () => {
    await assert.rejects(deleteBatchData(`${mode}-sep`, "admin@example.com", true), (e: unknown) => e instanceof HttpError && e.status === 409);
    await assert.rejects(deleteBatchData("nope", "admin@example.com", true), (e: unknown) => e instanceof HttpError && e.status === 404);
  });
}
console.log("import-delete: ผ่านทั้งหมด");
