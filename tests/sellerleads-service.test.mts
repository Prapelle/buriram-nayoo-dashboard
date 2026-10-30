// changeSellStatus / saveLead กับ Google Sheets จำลอง — รัน: npx tsx tests/sellerleads-service.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install, tabs } from "./integration/fake-sheets.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const { saveLead, changeSellStatus, LeadError } = await import("../src/lib/leads-service");

const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const base = { received_at: "2026-10-30", source_channel: "Referral", customer_name: "ผู้ขาย", phone: "0811111111", need: "ขาย" };
const row = (id: string) => { const rows = tabs.get("LEADS")!.rows as string[][]; const h = rows[0]; const r = rows.find((x, i) => i > 0 && x[h.indexOf("lead_id")] === id)!; return Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])) as Record<string, string>; };
const fails = async (p: Promise<unknown>, code: string) => { try { await p; } catch (e) { assert.ok(e instanceof LeadError, String(e)); assert.equal((e as InstanceType<typeof LeadError>).code, code); return; } assert.fail("ควรผิดพลาด " + code); };

await initializeSpreadsheet("admin@example.com");
let lead = (await saveLead({ ...base }, "sales@example.com")).lead;

await t("Lead ขายที่ไม่ระบุ Sell Status เริ่มที่ รอติดต่อ", async () => { assert.equal(lead.sell_status, "รอติดต่อ"); assert.equal(lead.status, "New"); });
await t("เปลี่ยนเป็น สนใจขาย → Qualified + audit", async () => {
  const r = await changeSellStatus(lead.lead_id, "สนใจขาย", lead.updated_at, "sales@example.com"); assert.ok(r.changed);
  assert.equal(row(lead.lead_id).sell_status, "สนใจขาย"); assert.equal(row(lead.lead_id).status, "Qualified"); assert.ok(row(lead.lead_id).qualified_at);
  assert.ok((tabs.get("AUDIT_LOG")!.rows as string[][]).some((x) => x.join("|").includes("สนใจขาย")));
  lead = r.lead;
});
await t("ขายแล้ว → Won (won_at) · ย้ายออกจาก Won → ล้าง won_at", async () => {
  let r = await changeSellStatus(lead.lead_id, "ขายแล้ว", lead.updated_at, "sales@example.com"); assert.equal(row(lead.lead_id).status, "Won"); assert.ok(row(lead.lead_id).won_at); lead = r.lead;
  r = await changeSellStatus(lead.lead_id, "สัญญาเปิด", lead.updated_at, "sales@example.com"); assert.equal(row(lead.lead_id).status, "Qualified"); assert.equal(row(lead.lead_id).won_at, ""); lead = r.lead;
});
await t("ข้อมูลเก่า (STALE) → 409 ไม่เขียนทับ", async () => { await fails(changeSellStatus(lead.lead_id, "ยกเลิก", "2000-01-01T00:00:00.000Z", "x@example.com"), "STALE"); assert.equal(row(lead.lead_id).sell_status, "สัญญาเปิด"); });
await t("สถานะนอกรายการ (เช่นค่าเก่า ทำสัญญา) → 422", async () => { await fails(changeSellStatus(lead.lead_id, "ทำสัญญา", lead.updated_at, "x@example.com"), "VALIDATION"); });
await t("Lead ที่ไม่ใช่ Need = ขาย → 409", async () => {
  const b = (await saveLead({ ...base, customer_name: "ผู้ซื้อ", phone: "0822222222", need: "ซื้อ", buy_status: "Hot" }, "sales@example.com")).lead;
  await fails(changeSellStatus(b.lead_id, "สนใจขาย", b.updated_at, "x@example.com"), "NOT_SELL");
});
await t("ไม่พบ Lead → 404", async () => { await fails(changeSellStatus("nope", "สนใจขาย", "", "x@example.com"), "NOT_FOUND"); });
console.log("ผ่านทั้งหมด");
