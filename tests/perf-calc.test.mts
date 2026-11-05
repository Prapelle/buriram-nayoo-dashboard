// ตัวคำนวณประสิทธิภาพรายคน (ล้วน ๆ) — รัน: npx tsx tests/perf-calc.test.mts
import assert from "node:assert/strict";
const C = await import("../src/lib/perf-calc");

const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const M = "2026-11", IN = "2026-11-05T03:00:00.000Z", OUT = "2026-10-20T03:00:00.000Z";
const users = [
  { email: "a@x.com", name: "สมชาย", positions: ["ae_buy", "ae_sell"] },
  { email: "b@x.com", name: "สมหญิง", positions: ["sale_developer"] },
  { email: "c@x.com", name: "ป้อม", positions: ["production"] },
  { email: "d1@x.com", name: "ซ้ำ", positions: [] }, { email: "d2@x.com", name: "ซ้ำ", positions: [] },
];
const L = (lead_id: string, field: string, from_status: string, to_status: string, staff = "สมชาย", changed_at = IN, changed_by = "x@x.com") => ({ lead_id, field, from_status, to_status, staff, changed_at, changed_by });
const leadLogs = [
  L("L1", "call_status", "รอติดต่อ", "ติดต่อได้แล้ว"), L("L1", "call_status", "ติดต่อได้แล้ว", "เข้าชมแล้ว"),
  L("L2", "call_status", "รอติดต่อ", "ติดต่อไม่ได้"), // ลบ ไม่ได้คะแนน
  L("L3", "call_status", "รอติดต่อ", "ติดต่อได้แล้ว"), L("L3", "call_status", "ติดต่อได้แล้ว", "รอติดต่อ"), L("L3", "call_status", "รอติดต่อ", "ติดต่อได้แล้ว"), // ลากไปมา = 1 ครั้ง
  L("S1", "sell_status", "รอติดต่อ", "สนใจขาย"), L("S1", "sell_status", "สนใจขาย", "ขายแล้ว"),
  L("S2", "sell_status", "รอติดต่อ", "บ้านไม่พร้อมขาย"), L("S3", "sell_status", "รอติดต่อ", "ยกเลิก"),
  L("L9", "call_status", "รอติดต่อ", "ติดต่อได้แล้ว", "สมชาย", OUT), // เดือนอื่น
  L("L5", "call_status", "รอติดต่อ", "ติดต่อได้แล้ว", "", IN, "a@x.com"), // ไม่มี Staff → คนที่กด
  L("L6", "call_status", "รอติดต่อ", "ติดต่อได้แล้ว", "คนนอก"), L("L7", "call_status", "รอติดต่อ", "ติดต่อได้แล้ว", "ซ้ำ"),
  L("L8", "call_status", "", "รอติดต่อ"), // สร้างใหม่ ไม่ใช่ผลงาน
  L("L10", "call_status", "รอติดต่อ", "ติดต่อไม่ได้"), L("L10", "call_status", "ติดต่อไม่ได้", "ติดต่อได้แล้ว"), // เคยติดต่อไม่ได้ แล้วกลับมาติดต่อได้ = นับ
  L("L11", "call_status", "กู้ไม่ผ่าน", "จอง"), // ย้ายมาจากสถานะอื่นที่ไม่ใช่ รอติดต่อ/ติดต่อไม่ได้ = ไม่นับเป็นการติดต่อ (นับเป็น จอง เท่านั้น)
];
const dev = (id: string, staff: string) => ({ developer_id: id, staff, company_name: id, status: "เข้าร่วมแล้ว" });
const DL = (id: string, to: string, staff = "สมหญิง", at = IN) => ({ log_id: `${id}${to}${at}`, developer_id: id, staff, from_status: "", to_status: to, kind: "manual", counts_as: "", month: M, changed_by: "x", changed_at: at });
const developers = { devs: [dev("d1", "สมหญิง")], products: [], logs: [DL("d1", "เข้าพบแล้ว"), DL("d1", "ปิดการขาย"), DL("d1", "เข้าพบแล้ว", "สมหญิง", OUT)], contacts: [{ contact_id: "c1", developer_id: "d1", staff: "สมหญิง", method: "โทร", contacted_at: "2026-11-04" }, { contact_id: "c2", developer_id: "d1", staff: "สมหญิง", method: "Line", contacted_at: "2026-11-04" }] };
const homeBuilders = { devs: [dev("h1", "สมหญิง")], products: [], logs: [DL("h1", "ปิดการขาย")], contacts: [] };
const card = (card_id: string, planned_date = "") => ({ card_id, planned_date });
const mem = (card_id: string, email: string) => ({ card_id, email });
const H = (card_id: string, at: string, to_stage = "PUBLISHED") => ({ card_id, to_stage, at });
const res = C.computeMonth({
  month: M, users, leadLogs, developers, homeBuilders,
  cards: [card("k1", "2026-11-10"), card("k2", "2026-11-05"), card("k3"), card("k4"), card("k5", "2026-10-30"), card("k6", "2026-11-30")],
  members: [mem("k1", "c@x.com"), mem("k2", "C@x.com"), mem("k3", "c@x.com"), mem("k3", "ghost@x.com"), mem("k5", "c@x.com"), mem("k6", "c@x.com")],
  history: [H("k1", "2026-11-08T05:00:00.000Z"), H("k2", "2026-11-08T05:00:00.000Z"), H("k3", "2026-11-09T05:00:00.000Z"), H("k4", "2026-11-09T05:00:00.000Z"), H("k5", OUT), H("k6", "2026-11-12T05:00:00.000Z", "REVIEW")],
});
const A = res.actuals["a@x.com"], B = res.actuals["b@x.com"], Cc = res.actuals["c@x.com"];

await t("Buyer: ติดต่อได้ = ย้ายจาก รอติดต่อ ไปสถานะบวก ครั้งเดียวต่อ Lead (ลากไปมาไม่ซ้ำ · ติดต่อไม่ได้ไม่ได้คะแนน · เดือนอื่น/สร้างใหม่ไม่นับ)", () => {
  assert.equal(A["ae_buy.contact"], 4); // L1 + L3 + L5(ไม่มี Staff → คนที่กด) + L10(ติดต่อไม่ได้ → ติดต่อได้แล้ว)
  assert.equal(A["ae_buy.visited"], 1);
  assert.equal(A["ae_buy.booked"], 1); assert.equal(A["ae_buy.sold"], 0); // booked = L11
});
await t("Seller: สนใจขาย/ขายแล้วได้คะแนน · บ้านไม่พร้อมขาย/ยกเลิกไม่ได้", () => {
  assert.equal(A["ae_sell.contact"], 1); assert.equal(A["ae_sell.sold"], 1); assert.equal(A["ae_sell.contract"], 0);
});
await t("Sale developer / Home builder: นับจากสรุปรายเดือนเดิม แยกตามประเภทลูกค้า · เดือนอื่นไม่นับ", () => {
  assert.equal(B["sale_developer.met"], 1); assert.equal(B["sale_developer.won"], 1); assert.equal(B["sale_developer.calls"], 1); // Line ไม่นับเป็นโทร
  assert.equal(B["sale_home_builder.won"], 1); assert.equal(B["sale_home_builder.met"], 0);
});
await t("Production: เสร็จ = ถึง PUBLISHED ในเดือน · ทุกผู้ร่วมงานได้เต็ม 1 งาน · ทันเวลา = ไม่เกินวันลง (นับเฉพาะงานที่มีวันลง)", () => {
  assert.equal(Cc["production.done"], 3); // k1 k2 k3 (k5 เดือนก่อน, k6 ยังไม่ถึง PUBLISHED)
  assert.equal(Cc["production.ontime"], 50); // k1 ทัน, k2 เลย, k3 ไม่มีวันลง
});
await t("ไม่มีงานเลย → % ทันเวลาเป็น null (ไม่ใช่ 0)", () => { assert.equal(res.actuals["a@x.com"]["production.ontime"], null); });
await t("unmatched: ชื่อไม่ตรง / ชื่อซ้ำ / การ์ดไม่มีผู้ร่วมงาน / ผู้ร่วมงานที่ไม่มีบัญชี", () => {
  const has = (name: string, reason: string) => res.unmatched.some((x) => x.name === name && x.reason === reason);
  assert.ok(has("คนนอก", "no_user")); assert.ok(has("ซ้ำ", "ambiguous")); assert.ok(has("(การ์ดไม่มีผู้ร่วมงาน)", "no_member")); assert.ok(has("ghost@x.com", "no_user"));
  assert.equal(res.unmatched.some((x) => x.name === "สมชาย"), false);
});
await t("ผลงานของ Staff ที่ไม่มี (ผลงาน = 0) ไม่ถูกรายงานว่าจับคู่ไม่ได้", () => {
  const r = C.computeMonth({ month: M, users, leadLogs: [], developers: { ...developers, logs: [DL("d1", "เข้าพบแล้ว", "ไม่มีใคร", OUT)], contacts: [] }, homeBuilders: { devs: [], products: [], logs: [], contacts: [] }, cards: [], members: [], history: [] });
  assert.deepEqual(r.unmatched, []);
});

const targets = [
  { user_email: "a@x.com", metric_key: "ae_buy.contact", value: 4 }, { user_email: "a@x.com", metric_key: "ae_sell.sold", value: 1 },
  { user_email: "c@x.com", metric_key: "production.done", value: 2 }, { user_email: "c@x.com", metric_key: "production.ontime", value: 80 },
];
const rep = C.buildReport(users, res.actuals, targets);
await t("buildReport: เฉพาะคนที่มีตำแหน่ง · % = ทำได้/เป้า · ไม่มีเป้า = null · ภาพรวมจำกัดตัวชี้วัดละ 100", () => {
  assert.deepEqual(rep.map((p) => p.email), ["a@x.com", "b@x.com", "c@x.com"]);
  const a = rep[0], buy = a.positions[0].metrics, sell = a.positions[1].metrics;
  assert.equal(buy.find((m) => m.key === "ae_buy.contact")!.pct, 100); // 4/4
  assert.equal(buy.find((m) => m.key === "ae_buy.visited")!.pct, null); // ไม่ตั้งเป้า
  assert.equal(sell.find((m) => m.key === "ae_sell.sold")!.pct, 100);
  assert.equal(a.overall, 100); // (100 + 100) / 2
  const c = rep[2]; assert.equal(c.positions[0].metrics.find((m) => m.key === "production.done")!.pct, 150); // เกินเป้าแสดงเกิน 100 ได้
  assert.equal(c.positions[0].metrics.find((m) => m.key === "production.ontime")!.pct, 62.5); // 50 ÷ เป้า 80
  assert.equal(c.overall, 81.3); // (min(150,100)=100 + 62.5) / 2 = 81.25 → 81.3 (ภาพรวมจำกัดไม่เกิน 100 ต่อตัวชี้วัด)
  assert.equal(rep[1].overall, null); // ไม่มีเป้าเลย
});
await t("pctOf: เป้า 0 / ว่าง / ผลงาน null → null", () => {
  assert.equal(C.pctOf(5, 0), null); assert.equal(C.pctOf(5, null), null); assert.equal(C.pctOf(null, 10), null); assert.equal(C.pctOf(1, 3), 33.3);
});

// ── วันทำการ + รอลูกค้า ──
const W = await import("../src/lib/workdays");
const none = new Set<string>();
await t("วันทำการ: จันทร์–เสาร์ ตัดอาทิตย์ · ตัดวันหยุดบริษัท · [เริ่ม, ตอบ)", () => {
  assert.equal(W.workdaysBetween("2026-11-02", "2026-11-04", none), 2); // จ.→พ. = 2
  assert.equal(W.workdaysBetween("2026-11-02", "2026-11-02", none), 0); // วันเดียวกัน = 0
  assert.equal(W.workdaysBetween("2026-11-06", "2026-11-09", none), 2); // ศ. ส. (อา.ไม่นับ)
  assert.equal(W.workdaysBetween("2026-11-02", "2026-11-09", none), 6); // จ.–ส. (อา.ไม่นับ)
  assert.equal(W.workdaysBetween("2026-11-02", "2026-11-09", new Set(["2026-11-04"])), 5); // หยุดบริษัท พ.
  assert.equal(W.workdaysBetween("bad", "2026-11-09", none), 0);
});
await t("addWorkdays: เลื่อนข้ามอาทิตย์/วันหยุด", () => {
  assert.equal(W.addWorkdays("2026-11-07", 1, none), "2026-11-09"); // ส. +1 → ข้ามอา. ไป จ.
  assert.equal(W.addWorkdays("2026-11-07", 1, new Set(["2026-11-09"])), "2026-11-10");
  assert.equal(W.addWorkdays("2026-11-07", 0, none), "2026-11-07");
  assert.equal(W.addWorkdays("2026-11-02", 6, none), "2026-11-09"); // จ.+6 = จ.ถัดไป
});
await t("waitSummary: แยกช่วงผลิต/ช่วงรายงาน · รอค้าง >3 วันทำการแจ้งเตือน", () => {
  const card = { planned_date: "2026-11-10", published_at: "2026-11-12", report_due_date: "2026-12-12" };
  const s = W.waitSummary(card, [
    { card_id: "k", kind: "รอบรีฟ", started_day: "2026-11-02", ended_day: "2026-11-04" }, // ก่อนเผยแพร่ = ผลิต 2
    { card_id: "k", kind: "คอนเฟิร์มงาน", started_day: "2026-11-13", ended_day: "" }, // หลังเผยแพร่ ยังรออยู่ ถึง 11-18 → 13,14,16,17 = 4
  ], "2026-11-18", none);
  assert.equal(s.prod, 2); assert.equal(s.report, 4);
  assert.equal(s.plannedEff, "2026-11-12"); assert.equal(s.reportDueEff, "2026-12-17");
  assert.ok(s.alert && s.open?.days === 4 && s.open.kind === "คอนเฟิร์มงาน");
  assert.equal(W.waitSummary(card, [{ card_id: "k", kind: "x", started_day: "2026-11-13", ended_day: "" }], "2026-11-16", none).alert, false); // 2 วัน
});
await t("Production: วันที่รอลูกค้าเลื่อนวันลง (เลยวันลงแต่รอลูกค้า = ยังทัน) · รายงานส่งทันเวลา · ทุกคนได้เต็ม", () => {
  const cards = [
    { card_id: "w1", planned_date: "2026-11-10", stage: "PUBLISHED" },   // เผยแพร่ 11-12 แต่รอลูกค้า 2 วันทำการ → due 11-12 → ทัน
    { card_id: "w2", planned_date: "2026-11-10", stage: "PUBLISHED" },   // เผยแพร่ 11-12 ไม่มีรอ → เลย
    { card_id: "r1", planned_date: "", stage: "ส่งให้ลูกค้าแล้ว", report_due_date: "2026-11-20", report_sent_at: "2026-11-19" }, // ทัน
    { card_id: "r2", planned_date: "", stage: "ส่งให้ลูกค้าแล้ว", report_due_date: "2026-11-20", report_sent_at: "2026-11-23" }, // ไม่ทัน
    { card_id: "r3", planned_date: "", stage: "ส่งให้ลูกค้าแล้ว", report_due_date: "2026-11-20", report_sent_at: "2026-11-23" }, // รอลูกค้าช่วงรายงาน 3 วัน → due 11-24 → ทัน
    { card_id: "r4", planned_date: "", stage: "ส่งให้ลูกค้าแล้ว", report_due_date: "2026-11-20", report_sent_at: "2026-10-30" }, // เดือนอื่น
  ].map((c) => ({ published_at: "2026-11-12", ...c }));
  const x = C.computeMonth({
    month: M, users, leadLogs: [], developers: { devs: [], products: [], logs: [], contacts: [] }, homeBuilders: { devs: [], products: [], logs: [], contacts: [] },
    cards, members: cards.flatMap((c) => [mem(c.card_id, "c@x.com"), mem(c.card_id, "a@x.com")]),
    history: [H("w1", "2026-11-12T05:00:00.000Z"), H("w2", "2026-11-12T05:00:00.000Z")],
    waits: [{ card_id: "w1", kind: "รอบรีฟ", started_at: "2026-11-04T03:00:00.000Z", ended_at: "2026-11-06T03:00:00.000Z" }, // พ.→ศ. = 2
            { card_id: "r3", kind: "ตรวจบอร์ด", started_at: "2026-11-13T03:00:00.000Z", ended_at: "2026-11-17T03:00:00.000Z" }], // ศ.ส.จ. = 3 (อา.ไม่นับ) 
    holidays: [], today: "2026-11-30",
  });
  for (const e of ["c@x.com", "a@x.com"]) { // ผู้ร่วมงานทุกคนได้เต็ม
    assert.equal(x.actuals[e]["production.done"], 2); assert.equal(x.actuals[e]["production.ontime"], 50);
    assert.equal(x.actuals[e]["production.reports"], 3); assert.equal(x.actuals[e]["production.report_ontime"], 66.7);
  }
});
await t("วันหยุดบริษัทไม่นับเป็นวันรอ", () => {
  const cards = [{ card_id: "w1", planned_date: "2026-11-10", stage: "PUBLISHED", published_at: "2026-11-12" }];
  const run = (holidays: string[]) => C.computeMonth({ month: M, users, leadLogs: [], developers: { devs: [], products: [], logs: [], contacts: [] }, homeBuilders: { devs: [], products: [], logs: [], contacts: [] }, cards, members: [mem("w1", "c@x.com")],
    history: [H("w1", "2026-11-12T05:00:00.000Z")], waits: [{ card_id: "w1", kind: "รอบรีฟ", started_at: "2026-11-04T03:00:00.000Z", ended_at: "2026-11-06T03:00:00.000Z" }], holidays, today: "2026-11-30" }).actuals["c@x.com"]["production.ontime"];
  assert.equal(run([]), 100); // รอ 2 วัน → due 11-12 → ทัน
  assert.equal(run(["2026-11-04", "2026-11-05"]), 0); // วันที่รอเป็นวันหยุดทั้งคู่ → รอ 0 วัน → due 11-10 → เลย
});
console.log("perf-calc: ผ่านทั้งหมด");
