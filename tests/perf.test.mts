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
console.log("perf: ผ่านทั้งหมด");
