// ประสิทธิภาพรายคน (ชั้นข้อมูล): กติกาตรวจการเปลี่ยนสถานะ + บันทึกประวัติ Lead ลง D1 จำลอง
// รัน: npx tsx tests/perf.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install } from "./integration/fake-sheets.mjs";
import { makeD1 } from "./integration/fake-d1.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
const P = await import("../src/lib/perf");
const D = await import("../src/lib/d1");
const ST = await import("../src/lib/d1-state");
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const { saveLead, changeLeadStatus, changeSellStatus } = await import("../src/lib/leads-service");

const t = async (name: string, fn: () => Promise<void>) => { await fn(); console.log("  ✓", name); };
const DEF = { sell_status: "รอติดต่อ", call_status: "รอติดต่อ" } as const;

// ── กติกาล้วน ──
await t("leadStatusChanges: สร้างใหม่ → บันทึก \"\" → ค่าเริ่มต้น (เฉพาะช่องตามประเภท)", async () => {
  assert.deepEqual(P.leadStatusChanges(null, { call_status: "รอติดต่อ", sell_status: "รอติดต่อ" }, DEF, "call_status"), [{ field: "call_status", from: "", to: "รอติดต่อ" }]);
  assert.deepEqual(P.leadStatusChanges(null, { call_status: "รอติดต่อ", sell_status: "รอติดต่อ" }, DEF, "sell_status"), [{ field: "sell_status", from: "", to: "รอติดต่อ" }]);
});
await t("leadStatusChanges: ยังไม่ระบุ Need (field ว่าง) → ไม่บันทึก", async () => {
  assert.deepEqual(P.leadStatusChanges(null, { call_status: "รอติดต่อ" }, DEF, ""), []);
});
await t("leadStatusChanges: ช่องเดิมว่าง + ใหม่เป็นค่าเริ่มต้น = ไม่เปลี่ยน", async () => {
  assert.deepEqual(P.leadStatusChanges({ call_status: "" }, { call_status: "รอติดต่อ" }, DEF, "call_status"), []);
});
await t("leadStatusChanges: เปลี่ยนจริง → from/to ถูก", async () => {
  assert.deepEqual(P.leadStatusChanges({ call_status: "รอติดต่อ" }, { call_status: "ติดต่อได้แล้ว" }, DEF, "call_status"), [{ field: "call_status", from: "รอติดต่อ", to: "ติดต่อได้แล้ว" }]);
});
await t("leadStatusChanges: ช่องที่ถูกล้างเป็นว่าง / ไม่เปลี่ยน → ไม่บันทึก", async () => {
  assert.deepEqual(P.leadStatusChanges({ sell_status: "สนใจขาย" }, { sell_status: "" }, DEF, "sell_status"), []);
  assert.deepEqual(P.leadStatusChanges({ call_status: "จอง" }, { call_status: "จอง" }, DEF, "call_status"), []);
});
await t("PERF_DEFS: ชื่อตารางไม่ซ้ำ และอยู่ในรายการตารางที่เกิดบน D1", async () => {
  assert.equal(new Set(P.PERF_TABS).size, P.PERF_TABS.length);
  const G = await import("../src/lib/d1-groups");
  for (const n of P.PERF_TABS) assert.ok(G.NATIVE_TABS.includes(n), n);
});

// ── รายชื่อ Staff ──
const U = (email: string, name: string, role: string, active = "TRUE") => ({ email, display_name: name, role, active });
const nr = (await import("../src/lib/roles")).normRole;
await t("staffUserNames: เฉพาะผู้ใช้ที่ใช้งานอยู่และเป็น Super Admin/Admin/AE · ใช้ชื่อที่แสดง (ไม่มี → อีเมล) · ไม่ซ้ำ", async () => {
  const names = P.staffUserNames([U("a@x.com", "สมชาย", "ae"), U("b@x.com", "", "admin"), U("c@x.com", "นักการตลาด", "marketing"), U("d@x.com", "ถูกระงับ", "ae", "FALSE"), U("e@x.com", "สมชาย", "sales"), U("f@x.com", "ผู้ผลิต", "production")], nr);
  assert.deepEqual(names, ["b@x.com", "สมชาย"].sort((a, b) => a.localeCompare(b, "th")));
});
await t("mergeStaff: ผู้ใช้มาก่อน แล้วตามด้วยชื่อเดิมที่ไม่ตรงผู้ใช้ (ไม่ซ้ำ ตัดช่องว่าง)", async () => {
  assert.deepEqual(P.mergeStaff(["สมชาย", "สมหญิง"], ["สมชาย", " เก่า ", "เก่า", "", "สมหญิง"]), ["สมชาย", "สมหญิง", "เก่า"]);
});

// ── บันทึกลง D1 ──
await initializeSpreadsheet("admin@example.com");
const db = makeD1(); D.setD1ForTest(db as never); ST.invalidateD1State();
const log = () => db.rows("LEAD_STATUS_LOG") as Record<string, string>[];
const base = { received_at: "2026-11-05", source_channel: "Referral", phone: "0811111111" };
let buyer: Awaited<ReturnType<typeof saveLead>>["lead"];

await t("สร้าง Lead ซื้อ → ตาราง LEAD_STATUS_LOG ถูกสร้างอัตโนมัติ + มีแถว \"\" → รอติดต่อ", async () => {
  buyer = (await saveLead({ ...base, customer_name: "ผู้ซื้อ", need: "ซื้อ", buy_status: "Hot", staff: "สมชาย" }, "ae1@example.com")).lead;
  const r = log().filter((x) => x.lead_id === buyer.lead_id);
  assert.equal(r.length, 1); assert.equal(r[0].field, "call_status"); assert.equal(r[0].from_status, ""); assert.equal(r[0].to_status, "รอติดต่อ");
  assert.equal(r[0].staff, "สมชาย"); assert.equal(r[0].changed_by, "ae1@example.com"); assert.equal(r[0].lead_code, buyer.lead_code); assert.ok(r[0].changed_at);
});
await t("ลากเปลี่ยน Call Status → บันทึก รอติดต่อ → ติดต่อได้แล้ว พร้อมคนกด", async () => {
  const r = await changeLeadStatus(buyer.lead_id, "call_status", "ติดต่อได้แล้ว", buyer.updated_at, "ae2@example.com"); assert.ok(r.changed); buyer = r.lead;
  const last = log().filter((x) => x.lead_id === buyer.lead_id).pop()!;
  assert.deepEqual([last.field, last.from_status, last.to_status, last.changed_by, last.staff], ["call_status", "รอติดต่อ", "ติดต่อได้แล้ว", "ae2@example.com", "สมชาย"]);
});
await t("วางซ้ำสถานะเดิม → ไม่บันทึกเพิ่ม", async () => {
  const n = log().length;
  const r = await changeLeadStatus(buyer.lead_id, "call_status", "ติดต่อได้แล้ว", buyer.updated_at, "ae2@example.com"); assert.equal(r.changed, false);
  assert.equal(log().length, n);
});
await t("แก้ผ่านฟอร์ม (saveLead) แล้วสถานะเปลี่ยน → บันทึก · แก้ช่องอื่นอย่างเดียว → ไม่บันทึก", async () => {
  const n = log().length;
  const r1 = await saveLead({ ...buyer, lead_id: buyer.lead_id, updated_at_seen: buyer.updated_at, notes: "แก้โน้ต" }, "ae2@example.com"); buyer = r1.lead;
  assert.equal(log().length, n);
  const r2 = await saveLead({ ...buyer, lead_id: buyer.lead_id, updated_at_seen: buyer.updated_at, call_status: "เข้าชมแล้ว" }, "ae2@example.com"); buyer = r2.lead;
  assert.equal(log().length, n + 1); const last = log().pop()!; assert.deepEqual([last.from_status, last.to_status], ["ติดต่อได้แล้ว", "เข้าชมแล้ว"]);
});
await t("Lead ขาย: เปลี่ยน Sell Status → บันทึกช่อง sell_status", async () => {
  const s = (await saveLead({ ...base, phone: "0822222222", customer_name: "ผู้ขาย", need: "ขาย", staff: "สมหญิง" }, "ae1@example.com")).lead;
  const r = await changeSellStatus(s.lead_id, "สนใจขาย", s.updated_at, "ae1@example.com"); assert.ok(r.changed);
  const mine = log().filter((x) => x.lead_id === s.lead_id);
  assert.deepEqual(mine.map((x) => [x.field, x.from_status, x.to_status]), [["sell_status", "", "รอติดต่อ"], ["sell_status", "รอติดต่อ", "สนใจขาย"]]);
});
await t("เขียนประวัติไม่สำเร็จ (ไม่มี D1) → การบันทึก Lead ยังสำเร็จ ไม่ throw", async () => {
  D.setD1ForTest(null); ST.invalidateD1State();
  const r = await saveLead({ ...base, phone: "0833333333", customer_name: "ไม่มี D1", need: "ซื้อ", buy_status: "Cold" }, "ae1@example.com");
  assert.ok(r.created && r.lead.lead_id);
});
await t("listLeads / listDevelopers ส่ง staffUsers (ชื่อผู้ใช้) + staff (ผู้ใช้ + ชื่อเดิมในข้อมูล)", async () => {
  D.setD1ForTest(makeD1() as never); ST.invalidateD1State();
  const { saveUser } = await import("../src/lib/users-service");
  await saveUser({ email: "ae9@example.com", display_name: "เอไอ", role: "ae" }, "admin@example.com");
  const { listLeads } = await import("../src/lib/leads-service");
  await saveLead({ ...base, phone: "0844444444", customer_name: "ชื่อเก่า", need: "ซื้อ", buy_status: "Cold", staff: "คนเก่าที่ไม่มีบัญชี" }, "ae9@example.com");
  const L = await listLeads(); assert.ok(L.staffUsers.includes("เอไอ")); assert.ok(!L.staffUsers.includes("คนเก่าที่ไม่มีบัญชี"));
  assert.ok(L.staff.includes("เอไอ") && L.staff.includes("คนเก่าที่ไม่มีบัญชี"));
  const { listDevelopers } = await import("../src/lib/developers-service");
  const Dv = await listDevelopers("developer"); assert.ok(Dv.staffUsers.includes("เอไอ"));
});
// ── รายการตัวชี้วัด + หน้าตั้งค่า ──
const OPT = await import("../src/lib/lead-options");
const DEVM = await import("../src/lib/developers");
await t("METRICS: คีย์ไม่ซ้ำ · ตำแหน่งมีจริง · สถานะที่อ้างตรงกับรายการสถานะจริง (กันพิมพ์ผิด)", async () => {
  assert.equal(new Set(P.METRICS.map((m) => m.key)).size, P.METRICS.length);
  for (const m of P.METRICS) {
    assert.ok(P.POSITION_KEYS.includes(m.position), m.key); assert.ok(m.key.startsWith(m.position + "."), m.key);
    const r = m.rule;
    if (r.kind === "lead_move") { const list = r.field === "sell_status" ? OPT.SELL_STATUS : OPT.CALL_STATUS; for (const x of [...r.to, ...(r.from ? [r.from] : [])]) assert.ok(list.includes(x), `${m.key}: ${x}`); }
    if (r.kind === "dev_status") assert.ok((DEVM.DEV_STATUS as readonly string[]).includes(r.to), `${m.key}: ${r.to}`);
  }
  for (const k of P.POSITION_KEYS) assert.ok(P.metricsOf(k).length > 0, k);
});
await t("สถานะเป็นบวก: ไม่รวม บ้านไม่พร้อมขาย / ยกเลิก / กู้ไม่ผ่าน / ติดต่อไม่ได้ / ไม่สนใจ", async () => {
  for (const bad of ["บ้านไม่พร้อมขาย", "ยกเลิก", "กู้ไม่ผ่าน", "ติดต่อไม่ได้", "ไม่สนใจ", "รอติดต่อ"]) assert.ok(![...P.SELL_POSITIVE, ...P.BUY_POSITIVE].includes(bad), bad);
  const contact = P.METRICS.find((m) => m.key === "ae_sell.contact")!; assert.ok(contact.rule.kind === "lead_move" && contact.rule.from === "รอติดต่อ");
});
const fail422 = (fn: () => unknown, code = "VALIDATION") => { try { fn(); } catch (e) { assert.equal((e as { code?: string }).code, code); return; } assert.fail("ควรผิดพลาด " + code); };
await t("validateTarget: ว่าง=ไม่ตั้ง · จำนวนต้องเป็นจำนวนเต็ม · % ไม่เกิน 100 · ติดลบ/ตัวอักษร/ตัวชี้วัดแปลก → ผิด", async () => {
  assert.equal(P.validateTarget({ user_email: "a", metric_key: "ae_buy.sold", value: "" }).value, null);
  assert.equal(P.validateTarget({ user_email: "a", metric_key: "ae_buy.sold", value: "12" }).value, 12);
  assert.equal(P.validateTarget({ user_email: "a", metric_key: "sale_developer.sales", value: "1,250,000.555" }).value, 1250000.56);
  assert.equal(P.validateTarget({ user_email: "a", metric_key: "production.ontime", value: 95 }).value, 95);
  fail422(() => P.validateTarget({ user_email: "a", metric_key: "ae_buy.sold", value: "2.5" }));
  fail422(() => P.validateTarget({ user_email: "a", metric_key: "production.ontime", value: "101" }));
  fail422(() => P.validateTarget({ user_email: "a", metric_key: "ae_buy.sold", value: "-1" }));
  fail422(() => P.validateTarget({ user_email: "a", metric_key: "ae_buy.sold", value: "abc" }));
  fail422(() => P.validateTarget({ user_email: "a", metric_key: "nope", value: "1" }));
});
await t("validateMonth / validateHoliday", async () => {
  assert.equal(P.validateMonth("2026-11"), "2026-11"); fail422(() => P.validateMonth("2026-13")); fail422(() => P.validateMonth("พ.ย."));
  assert.deepEqual(P.validateHoliday("2026-12-31", "  วันสิ้นปี  "), { date: "2026-12-31", name: "วันสิ้นปี" });
  fail422(() => P.validateHoliday("2026-02-30", "x")); fail422(() => P.validateHoliday("2026-12-31", " "));
});

const dbHandle = makeD1(); D.setD1ForTest(dbHandle as never); ST.invalidateD1State();
const PS = await import("../src/lib/perf-service");
const { saveUser: saveU } = await import("../src/lib/users-service");
const ADM = "admin@example.com";
await saveU({ email: "ae1@example.com", display_name: "สมชาย", role: "ae" }, ADM);
await saveU({ email: "ae2@example.com", display_name: "สมชาย", role: "ae" }, ADM);
const rej = async (p: Promise<unknown>, code: string) => { try { await p; } catch (e) { assert.equal((e as { code?: string }).code, code, String((e as Error).message)); return; } assert.fail("ควรผิดพลาด " + code); };
const S = async (m = "2026-11") => PS.getPerfSettings(m);

await t("getPerfSettings: ผู้ใช้ที่ใช้งานอยู่ + รายการตำแหน่ง/ตัวชี้วัด · เตือนชื่อที่แสดงซ้ำ", async () => {
  const s = await S(); assert.ok(s.users.some((u) => u.email === "ae1@example.com")); assert.equal(s.positions.length, 5); assert.ok(s.metrics.length > 10);
  assert.deepEqual(s.duplicateNames, ["สมชาย"]);
});
await t("savePositions: ตำแหน่งแปลก → 422 · ผู้ใช้ไม่มี → 404 · บันทึกแล้วอ่านกลับได้ · บันทึกซ้ำ = แทนที่ (ไม่เพิ่มแถว)", async () => {
  await rej(PS.savePositions("ae1@example.com", ["boss"], ADM), "VALIDATION");
  await rej(PS.savePositions("nobody@example.com", ["ae_buy"], ADM), "NOT_FOUND");
  await PS.savePositions("ae1@example.com", ["ae_buy", "sale_developer", "ae_buy"], ADM);
  assert.deepEqual((await S()).users.find((u) => u.email === "ae1@example.com")!.positions, ["ae_buy", "sale_developer"]);
  await PS.savePositions("AE1@example.com", ["production"], ADM);
  assert.deepEqual((await S()).users.find((u) => u.email === "ae1@example.com")!.positions, ["production"]);
  assert.equal((db2().rows("PERF_POSITIONS") as unknown[]).length, 1);
});
function db2() { return dbHandle; }
await t("saveTargets: ผู้ใช้ไม่มีตำแหน่งนั้น → 422 และไม่บันทึกอะไรเลย (ทั้งชุด)", async () => {
  await PS.savePositions("ae1@example.com", ["ae_buy"], ADM);
  await rej(PS.saveTargets("2026-11", [{ user_email: "ae1@example.com", metric_key: "ae_buy.sold", value: "5" }, { user_email: "ae1@example.com", metric_key: "production.done", value: "3" }], ADM), "VALIDATION");
  assert.equal((await S()).targets.length, 0);
});
await t("saveTargets: บันทึก → อ่านกลับ · ซ้ำค่าเดิม changed=0 · แก้ค่า changed=1 ไม่เพิ่มแถว · เดือนอื่นไม่ปน", async () => {
  const r = await PS.saveTargets("2026-11", [{ user_email: "ae1@example.com", metric_key: "ae_buy.sold", value: "5" }, { user_email: "ae1@example.com", metric_key: "ae_buy.contact", value: "40" }], ADM);
  assert.equal(r.changed, 2);
  assert.deepEqual((await S()).targets.map((x) => [x.metric_key, x.value]).sort(), [["ae_buy.contact", 40], ["ae_buy.sold", 5]]);
  assert.equal((await PS.saveTargets("2026-11", [{ user_email: "ae1@example.com", metric_key: "ae_buy.sold", value: "5" }], ADM)).changed, 0);
  assert.equal((await PS.saveTargets("2026-11", [{ user_email: "ae1@example.com", metric_key: "ae_buy.sold", value: "8" }], ADM)).changed, 1);
  assert.equal((db2().rows("PERF_TARGETS") as unknown[]).length, 2);
  assert.equal((await S("2026-12")).targets.length, 0);
});
await t("saveTargets: ค่าว่าง = ยกเลิกเป้านั้น · ว่างที่ไม่เคยตั้ง = ไม่สร้างแถว", async () => {
  await PS.saveTargets("2026-11", [{ user_email: "ae1@example.com", metric_key: "ae_buy.contact", value: "" }, { user_email: "ae1@example.com", metric_key: "ae_buy.booked", value: "" }], ADM);
  assert.deepEqual((await S()).targets.map((x) => x.metric_key), ["ae_buy.sold"]);
  assert.equal((db2().rows("PERF_TARGETS") as unknown[]).length, 2);
});
await t("วันหยุดบริษัท: เพิ่ม · ซ้ำ 409 · วันที่ผิด 422 · ลบ · ลบที่ไม่มี 404", async () => {
  await PS.addHoliday("2026-12-31", "วันสิ้นปี", ADM); await PS.addHoliday("2026-12-05", "วันพ่อ", ADM);
  await rej(PS.addHoliday("2026-12-31", "ซ้ำ", ADM), "DUPLICATE"); await rej(PS.addHoliday("2026-02-30", "ผิด", ADM), "VALIDATION");
  assert.deepEqual((await S()).holidays.map((h) => h.date), ["2026-12-31", "2026-12-05"]);
  await PS.deleteHoliday("2026-12-31", ADM);
  assert.deepEqual((await S()).holidays.map((h) => h.date), ["2026-12-05"]);
  await rej(PS.deleteHoliday("2026-12-31", ADM), "NOT_FOUND");
});
await t("ไม่มี D1 → 409 DB_NOT_READY (ไม่ใช่ error ดิบ)", async () => {
  D.setD1ForTest(null); ST.invalidateD1State(); await rej(S(), "DB_NOT_READY");
});
console.log("perf: ผ่านทั้งหมด");
