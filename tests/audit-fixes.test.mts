// แก้จากการตรวจโค้ด 10/11/2026 — กติกาที่ผู้ใช้เลือก (2ก 3ข 4ก 5ก + งานเล็ก) · รัน: npx tsx tests/audit-fixes.test.mts
import assert from "node:assert/strict";
import { computeMonth } from "../src/lib/perf-calc";
import { monthlyReport, AUTO_PAYMENT } from "../src/lib/developers";
import { netLineAmounts } from "../src/lib/account-service";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const M = "2026-11", IN = "2026-11-05T03:00:00.000Z";
const none = { devs: [], products: [], logs: [], contacts: [] };
const U = [{ email: "a@x.co", name: "เอ", positions: ["ae_buy", "ae_sell", "sale_developer", "production"] }];
const L = (id: string, field: string, from: string, to: string, at = IN) => ({ log_id: `${id}|${from}>${to}|${at}`, lead_id: id, lead_code: id, field, from_status: from, to_status: to, staff: "เอ", changed_by: "a@x.co", changed_at: at });
const run = (o: Record<string, unknown>) => computeMonth({ month: M, users: U, leadLogs: [], developers: none, homeBuilders: none, cards: [], members: [], history: [], today: "2026-11-10", ...o } as never).actuals["a@x.co"];

t("2ก ยืนยันชำระก่อนลากการ์ด: ประวัติ auto_payment นับเป็น ปิดการขาย · เดือนเดียวกันลากเองด้วย = นับครั้งเดียว · ยอดขายเข้าคนเดียวกัน", () => {
  const devs = [{ developer_id: "D1", staff: "เอ", status: "กำลังใช้ Product" }];
  const products = [{ product_id: "P1", developer_id: "D1", product: "Top ads", price_thb: "50000", start_date: "2026-11-06", end_date: "2027-02-06", created_at: "2026-11-06T03:00:00Z" }];
  const met = { log_id: "m1", developer_id: "D1", staff: "เอ", from_status: "เข้าร่วมแล้ว", to_status: "เข้าพบแล้ว", kind: "manual", counts_as: "", month: M, changed_at: "2026-11-04T03:00:00Z" };
  const paid = { log_id: "p1", developer_id: "D1", staff: "เอ", from_status: "เข้าพบแล้ว", to_status: "ปิดการขาย", kind: AUTO_PAYMENT, counts_as: "", month: M, changed_at: "2026-11-06T02:59:00Z" };
  const auto = { log_id: "a1", developer_id: "D1", staff: "เอ", from_status: "ปิดการขาย", to_status: "กำลังใช้ Product", kind: "auto_product", counts_as: "", month: M, changed_at: "2026-11-06T03:00:00Z" };
  let a = run({ developers: { devs, products, logs: [met, paid, auto], contacts: [] } });
  assert.equal(a["sale_developer.won"], 1); assert.equal(a["sale_developer.sales"], 50000); assert.equal(a["sale_developer.close_rate"], 100);
  const manual = { ...paid, log_id: "m2", kind: "manual", changed_at: "2026-11-05T03:00:00Z" };
  a = run({ developers: { devs, products, logs: [met, manual, paid, auto], contacts: [] } });
  assert.equal(a["sale_developer.won"], 1, "ลากเอง + ระบบบันทึก เดือนเดียวกัน = 1");
  // ประวัติที่ระบบเปลี่ยนตาม Product (auto_product) ยังไม่นับเป็นผลงาน
  assert.equal(run({ developers: { devs, products: [], logs: [met, auto], contacts: [] } })["sale_developer.won"], 0);
});

t("3ข โทร: นับ 1 ครั้งต่อลูกค้าต่อเดือน (หน้าสรุปรายเดือนยังเห็นจำนวนครั้งจริง)", () => {
  const c = (id: string, dev: string, day: string, method = "โทร") => ({ contact_id: id, developer_id: dev, staff: "เอ", method, contacted_at: day });
  const contacts = [c("1", "D1", "2026-11-05"), c("2", "D1", "2026-11-05"), c("3", "D1", "2026-11-20"), c("4", "D2", "2026-11-06"), c("5", "D2", "2026-11-07", "Line"), c("6", "D3", "2026-10-30")];
  assert.equal(run({ developers: { devs: [], products: [], logs: [], contacts } })["sale_developer.calls"], 2); // D1, D2
  const r = monthlyReport([], [], [], M, contacts)[0]; assert.equal(r.calls, 4); assert.equal(r.callsUnique, 2); assert.equal(r.line, 1);
});

t("4ก อัตราปิดการขาย AE ผู้ซื้อ = ซื้อสำเร็จ ÷ Qualified (ติดต่อได้แล้ว ไม่นับเป็น Qualified · นับตอนเพิ่งเป็น Qualified ครั้งเดียว)", () => {
  const a = run({ leadLogs: [
    L("B1", "call_status", "รอติดต่อ", "ติดต่อได้แล้ว"), // ติดต่อได้ แต่ยังไม่ Qualified
    L("B2", "call_status", "รอติดต่อ", "ติดต่อได้แล้ว"), L("B2", "call_status", "ติดต่อได้แล้ว", "รอเข้าชม", "2026-11-06T03:00:00Z"), L("B2", "call_status", "รอเข้าชม", "เข้าชมแล้ว", "2026-11-07T03:00:00Z"),
    L("B3", "call_status", "รอติดต่อ", "เข้าชมแล้ว"), L("B3", "call_status", "เข้าชมแล้ว", "ซื้อสำเร็จ", "2026-11-08T03:00:00Z"),
    L("B4", "call_status", "ติดต่อได้แล้ว", "กู้ไม่ผ่าน"), // Qualified (ตามนิยาม Dashboard) แต่ไม่ได้คะแนนติดต่อ
  ] });
  assert.equal(a["ae_buy.contact"], 3); assert.equal(a["ae_buy.qualified"], 3); assert.equal(a["ae_buy.sold"], 1); assert.equal(a["ae_buy.close_rate"], 33.3);
});

t("งานเล็ก: สร้าง Lead ที่สถานะบวกตั้งแต่แรก นับเป็นติดต่อได้ / Qualified ด้วย (อัตราปิดไม่ว่าง) · สร้างที่ รอติดต่อ ไม่นับ", () => {
  const a = run({ leadLogs: [L("B1", "call_status", "", "ซื้อสำเร็จ"), L("B2", "call_status", "", "รอติดต่อ"), L("S1", "sell_status", "", "เซ็นสัญญา"), L("S2", "sell_status", "", "รอติดต่อ")] });
  assert.equal(a["ae_buy.contact"], 1); assert.equal(a["ae_buy.qualified"], 1); assert.equal(a["ae_buy.sold"], 1); assert.equal(a["ae_buy.close_rate"], 100);
  assert.equal(a["ae_sell.contact"], 1); assert.equal(a["ae_sell.contract"], 1); assert.equal(a["ae_sell.intake"], 2);
});

t("งานเล็ก: ทรัพย์เข้าระบบ นับ 1 ครั้งต่อ Lead ต่อเดือน (เปลี่ยน Need ไปมาไม่นับซ้ำ) · ช่องสถานะฝั่งเดิมไม่นับเป็นค้าง", () => {
  const logs = [L("X1", "call_status", "", "รอติดต่อ", "2026-11-02T03:00:00Z"), L("X1", "sell_status", "", "รอติดต่อ", "2026-11-03T03:00:00Z"), L("X1", "sell_status", "", "รอติดต่อ", "2026-11-09T03:00:00Z")];
  const a = run({ leadLogs: logs, leads: [{ lead_id: "X1", need: "ขาย", sell_status: "รอติดต่อ" }] });
  assert.equal(a["ae_sell.intake"], 1); assert.equal(a["ae_buy.follow"], null, "ช่วงที่ค้างในช่อง call_status ของ Lead ที่ย้ายไปฝั่งขายแล้ว ไม่ถูกนับ");
});

t("งานเล็ก: การ์ดที่ย้ายกลับแล้วเผยแพร่ใหม่ นับงานเสร็จเฉพาะเดือนของครั้งล่าสุด · ย้ายกลับแล้วยังไม่เผยแพร่ = ไม่นับ", () => {
  const hist = [{ card_id: "C1", from_stage: "SCHEDULED", to_stage: "PUBLISHED", at: "2026-10-20T03:00:00Z" }, { card_id: "C1", from_stage: "PUBLISHED", to_stage: "REVIEW", at: "2026-11-08T03:00:00Z" }, { card_id: "C1", from_stage: "REVIEW", to_stage: "PUBLISHED", at: "2026-11-09T03:00:00Z" }];
  const card = { card_id: "C1", stage: "PUBLISHED", planned_date: "2026-11-10", published_at: "2026-11-09" }, members = [{ card_id: "C1", email: "a@x.co" }];
  const at = (month: string, c = card, h = hist) => computeMonth({ month, users: U, leadLogs: [], developers: none, homeBuilders: none, cards: [c], members, history: h, today: "2026-11-10" } as never).actuals["a@x.co"]["production.done"];
  assert.equal(at("2026-10"), 0); assert.equal(at("2026-11"), 1);
  assert.equal(at("2026-10", { ...card, stage: "REVIEW", published_at: "" }, hist.slice(0, 2)), 0, "ถูกย้ายกลับ ยังไม่เผยแพร่ใหม่");
  assert.equal(at("2026-10", { ...card, stage: "รอครบเพื่อทำรายงาน" }, hist.slice(0, 1)), 1, "เข้าช่วงรายงานแล้ว ยังนับเดือนที่เผยแพร่");
});

t("5ก ยอดขายของ Sale = ราคารายการหลังเฉลี่ยส่วนลดท้ายบิล (ผลรวมเท่ากับ ยอดรวม − ส่วนลด พอดี)", () => {
  const lines = [{ line_id: "a", amount: "100000" }, { line_id: "b", amount: "60000" }, { line_id: "c", amount: "39576" }];
  const n = netLineAmounts({ discount: "35000" }, lines);
  assert.equal(Math.round(([...n.values()].reduce((x, y) => x + y, 0)) * 100) / 100, 164576);
  assert.equal(n.get("a"), 82462.82); assert.equal(n.get("b"), 49477.69);
  assert.deepEqual([...netLineAmounts({ discount: "" }, lines).values()], [100000, 60000, 39576]);
  assert.deepEqual([...netLineAmounts({ discount: "999999" }, [{ line_id: "a", amount: "500" }]).values()], [0]);
});
console.log("audit-fixes: ผ่านทั้งหมด");
