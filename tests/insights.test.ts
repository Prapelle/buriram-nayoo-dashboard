// 30/10/2026 — ติดตามลูกค้า · ผลงานรายพนักงาน · เหตุผลที่ไม่สำเร็จ · Checklist ข้อมูลประจำเดือน · เป้าหมายรายเดือน
// รัน: npx tsx tests/insights.test.ts (ไม่ต้องใช้ไฟล์จริง)
import assert from "node:assert/strict";
import { followUps, isClosedLead, leadsInRange, loanRejectReasons, lostReasons, staffPerformance, staffRow } from "../src/lib/lead-insights";
import { buildChecklist, monthWindow } from "../src/lib/data-checklist";
import { progressMonth, targetProgress } from "../src/lib/target-progress";
import { TargetError, validateTarget } from "../src/lib/targets";
import { DEFAULT_EXCLUDED_PAGES, type DashData, type Row } from "../src/lib/dashboard";

let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };
const L = (id: string, o: Row = {}): Row => ({ lead_id: id, received_at: "2026-10-05", source_channel: "Facebook Ads", need: "ซื้อ", call_status: "รอติดต่อ", staff: "เอ", updated_at: "2026-10-05T03:00:00.000Z", ...o });
const TODAY = "2026-10-30";

console.log("1) รายการติดตามลูกค้า");
const rows: Row[] = [
  L("A", { next_follow_up_at: "2026-10-28" }), L("B", { next_follow_up_at: "2026-10-30" }), L("C", { next_follow_up_at: "2026-11-02" }),
  L("D", { next_follow_up_at: "2026-10-20", call_status: "ซื้อสำเร็จ" }), // จบแล้ว ไม่ต้องติดตาม
  L("E", { updated_at: "2026-10-01T00:00:00Z" }), L("F", { updated_at: "2026-10-25T00:00:00Z" }),
  L("G", { need: "ขาย", sell_status: "ขายแล้ว", next_follow_up_at: "2026-10-01" }), L("H", { need: "ขาย", sell_status: "สนใจขาย", next_follow_up_at: "2026-10-29" }),
  L("I", { call_status: "เข้าชมโครงการแล้ว", updated_at: "2026-09-01T00:00:00Z" }), // ชื่อเดิม ยังไม่จบ → ค้าง
  L("J", { buy_status: "Archive", updated_at: "2026-09-01T00:00:00Z" }),
];
const fu = followUps(rows, TODAY);
assert.deepEqual(fu.overdue.map((r) => r.lead_id), ["A", "H"]); assert.deepEqual(fu.today.map((r) => r.lead_id), ["B"]); assert.deepEqual(fu.stale.map((r) => r.lead_id), ["I", "E", "F"]); // ค้างเกิน 3 วัน: แก้ไขล่าสุด 01/09, 01/10, 25/10 (วันนี้ 30/10)
assert.deepEqual(followUps([L("K", { updated_at: "2026-10-27T10:00:00Z" }), L("M", { updated_at: "2026-10-26T23:00:00Z" })], TODAY).stale.map((r) => r.lead_id), ["M"]);
assert.ok(isClosedLead(rows[3]) && isClosedLead(rows[6]) && isClosedLead(rows[9]) && !isClosedLead(rows[7]));
ok("เลยกำหนด A, H (เรียงตามวัน) · วันนี้ B · ค้างเกิน 3 วัน I, E, F (ไม่มีวันติดตาม · แก้ไขล่าสุด 27/10 ยังไม่ค้าง, 26/10 ค้าง) · ไม่นับ Lead ที่จบแล้ว (ซื้อสำเร็จ / ขายแล้ว / Archive) · วันติดตามในอนาคตไม่ขึ้น");

console.log("2) ผลงานรายพนักงาน");
const sp: Row[] = [
  L("1", { staff: "เอ", call_status: "ติดต่อได้แล้ว" }), L("2", { staff: "เอ", call_status: "รอเข้าชม" }), L("3", { staff: "เอ", call_status: "เข้าชมแล้ว" }),
  L("4", { staff: "เอ", call_status: "ซื้อสำเร็จ" }), L("5", { staff: " เอ ", need: "ขาย", sell_status: "เซ็นสัญญา" }), L("6", { staff: "เอ", need: "ขาย", sell_status: "ขายแล้ว" }),
  L("7", { staff: "บี", call_status: "ไม่สนใจ" }), L("8", { staff: "", call_status: "จอง" }),
];
const st = Object.fromEntries(staffPerformance(sp, "buyer").map((s) => [s.staff, s]));
// คนต้องการซื้อ: เอ มี 4 ราย (ติดต่อได้แล้ว / รอเข้าชม / เข้าชมแล้ว / ซื้อสำเร็จ) · Qualified 3 · Walk in 2 · ซื้อสำเร็จ 1 → %Conversion 25
assert.deepEqual({ ...st["เอ"] }, { staff: "เอ", leads: 4, qualified: 3, qualifiedPct: 75, walkIn: 2, won: 1, conversionPct: 25 });
assert.equal(st["บี"].conversionPct, 0); assert.equal(st["บี"].qualifiedPct, 0); assert.equal(st["(ไม่ระบุ Staff)"].walkIn, 1);
const ss = Object.fromEntries(staffPerformance(sp, "seller").map((s) => [s.staff, s]));
// คนต้องการขาย: Qualified = เซ็นสัญญา / สัญญาเปิด / ขายแล้ว (ไม่ใช้ Call Status) · %Conversion = ขายแล้ว ÷ Lead
assert.deepEqual({ ...ss["เอ"] }, { staff: "เอ", leads: 2, qualified: 2, qualifiedPct: 100, walkIn: 0, won: 1, conversionPct: 50 });
assert.equal(Object.keys(ss).length, 1);
ok("แยก 2 ฝั่ง · คนต้องการซื้อ เอ: Lead 4 · Qualified 3 (75%) · Walk in 2 · ซื้อสำเร็จ 1 → %Conversion 25% · คนต้องการขาย เอ: Lead 2 · Qualified (สัญญา+ขายแล้ว) 2 · ขายแล้ว 1 → 50% · Staff ว่าง = (ไม่ระบุ Staff)");
assert.deepEqual(loanRejectReasons([L("x", { call_status: "กู้ไม่ผ่าน", lost_reason: "รายได้ไม่พอ" }), L("y", { call_status: "กู้ไม่ผ่าน", lost_reason: " รายได้ไม่พอ " }), L("z", { call_status: "กู้ไม่ผ่าน" }), L("w", { need: "ขาย", call_status: "กู้ไม่ผ่าน", lost_reason: "x" })]),
  [{ reason: "รายได้ไม่พอ", count: 2 }, { reason: "(ไม่ได้กรอกสาเหตุ)", count: 1 }]);
assert.equal(staffRow("รวม", [], "buyer").conversionPct, null);
ok("สาเหตุที่กู้ไม่ผ่าน: รวมข้อความเดียวกัน · ไม่กรอก = (ไม่ได้กรอกสาเหตุ) · ไม่นับคนต้องการขาย · ไม่มี Lead → %Conversion — (ไม่ใช่ 0)");

console.log("3) เหตุผลที่ไม่สำเร็จ");
const lr: Row[] = [
  L("a", { call_status: "ไม่สนใจ", lost_reason: "ราคาสูง" }), L("b", { call_status: "กู้ไม่ผ่าน", lost_reason: " ราคาสูง  " }), L("c", { source_channel: "Google Ads", call_status: "ติดต่อไม่ได้" }),
  L("d", { source_channel: "Google Ads", need: "ขาย", sell_status: "บ้านไม่พร้อมขาย" }), L("e", { source_channel: "Google Ads", need: "ขาย", sell_status: "ยกเลิก", call_status: "ไม่สนใจ" }),
  L("f", { buy_status: "Archive" }), L("g"), L("h", { source_channel: "LINE OA" }),
];
const lost = lostReasons(lr);
assert.equal(lost.lost, 6); assert.equal(lost.total, 8);
assert.deepEqual(lost.byReason, [{ reason: "กู้ไม่ผ่าน", count: 1 }, { reason: "ไม่สนใจ", count: 2 }, { reason: "ติดต่อไม่ได้", count: 1 }, { reason: "บ้านไม่พร้อมขาย", count: 1 }, { reason: "Archive (ซื้อ)", count: 1 }]);
const g = lost.byChannel.find((c) => c.channel === "Google Ads")!; assert.equal(g.lost, 3); assert.equal(g.lostPct, 100);
assert.equal(lost.byChannel.find((c) => c.channel === "LINE OA")!.lostPct, 0);
assert.deepEqual(lost.notes, [{ reason: "ราคาสูง", count: 2 }]);
ok("ไม่สำเร็จ 6/8 · Lead หนึ่งรายนับเหตุผลเดียว (Lead ขายที่ Call ไม่สนใจ นับ ไม่สนใจ) · Google Ads ไม่สำเร็จ 100% · เหตุผลที่พิมพ์ไว้รวมกันไม่สนช่องว่าง");
assert.deepEqual(leadsInRange([...lr, L("a"), L("z", { received_at: "2026-11-01" })], "2026-10-01", "2026-10-31").map((r) => r.lead_id), ["a", "b", "c", "d", "e", "f", "g", "h"]);
ok("ช่วงวันที่รับ Lead · lead_id ซ้ำนับครั้งเดียว");

console.log("4) Checklist ข้อมูลประจำเดือน");
assert.deepEqual(monthWindow("2026-10", TODAY), { from: "2026-10-01", to: "2026-10-29" }); assert.equal(monthWindow("2026-10", "2026-10-01"), null);
const days = (from: string, to: string) => { const o: string[] = []; for (let d = from; d <= to; d = new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10)) o.push(d); return o; };
const data: DashData = {
  meta: [{ report_start: "2026-09-01", report_end: "2026-09-30" }], google: [{ report_start: "2026-09-01", report_end: "2026-09-15" }],
  gtime: days("2026-09-01", "2026-09-30").map((date) => ({ date })),
  posts: days("2026-09-01", "2026-09-30").filter((d) => d !== "2026-09-10").map((d) => ({ page_id: "1", post_id: "p", metric_date: d, metric_scope: "daily" })),
  line: [{ report_month: "2026-09" }], leads: [], sales: [], excludedPages: DEFAULT_EXCLUDED_PAGES, lastImport: "",
  fbPage: days("2026-09-01", "2026-09-30").map((d) => ({ metric: "viewers", metric_date: d, value: "1" })),
  web: [{ source: "ga4_snapshot", granularity: "period", report_start: "2026-09-01", report_end: "2026-09-30" }, ...days("2026-09-01", "2026-09-20").map((d) => ({ source: "search_console", granularity: "day", report_start: d, report_end: d }))],
};
const c = buildChecklist(data, "2026-09", TODAY, { salesDates: ["2026-09-03", "2026-08-30"] })!;
const st2 = Object.fromEntries(c.items.map((x) => [x.key, x]));
assert.equal(st2.fb_posts.status, "บางส่วน"); assert.match(st2.fb_posts.detail, /ขาด 10 ก.ย. 69/);
assert.equal(st2.fb_viewers.status, "ครบ"); assert.equal(st2.fb_link.status, "ยังไม่มี"); assert.equal(st2.meta.status, "ครบ");
assert.equal(st2.gads.status, "บางส่วน"); assert.match(st2.gads.detail, /16 ก.ย. 69–30 ก.ย. 69/); assert.equal(st2.gtime.status, "ครบ");
assert.equal(st2.ga4.status, "ครบ"); assert.equal(st2.gsc.status, "บางส่วน"); assert.equal(st2.line.status, "ครบ"); assert.equal(st2.sales.detail, "มี 1 เอกสารในเดือนนี้");
assert.equal(c.done, 6); assert.equal(c.items.length, 10); assert.equal(c.label, "ก.ย. 69");
assert.equal(st2.fb_link.href, "/settings/import-guide/fb-results");
assert.equal(buildChecklist(data, "2026-09", TODAY)!.items.length, 9); // ไม่ใช่ Admin = ไม่มีแถวยอดขาย
const oct = buildChecklist(data, "2026-10", TODAY)!; assert.equal(oct.to, "2026-10-29"); assert.ok(oct.items.every((x) => x.status === "ยังไม่มี"));
ok("ก.ย. 69: Facebook โพสต์ขาด 10/09 · Viewers ครบ · Link clicks ยังไม่มี · Google Campaign ขาด 16–30/09 · GA4 snapshot ครบ · Search Console บางส่วน · LINE ครบ · ยอดขาย 1 เอกสาร (เฉพาะ Admin) · เดือนปัจจุบันตรวจถึงเมื่อวาน · ลิงก์ไปคู่มือของแต่ละรายการ");

console.log("5) เป้าหมายรายเดือน");
assert.deepEqual(validateTarget({ month: "2026-11", ad_budget_thb: "60,000", lead_target: "120" }), { month: "2026-11", budget: 60000, leads: 120, notes: "" });
assert.deepEqual(validateTarget({ month: "2026-11", ad_budget_thb: "", lead_target: "" }), { month: "2026-11", budget: null, leads: null, notes: "" });
for (const bad of [{ month: "2026-13" }, { month: "2026-11", ad_budget_thb: "-1" }, { month: "2026-11", lead_target: "1.5" }, { month: "2026-11", ad_budget_thb: "abc" }])
  assert.throws(() => validateTarget(bad), (e: unknown) => e instanceof TargetError && e.code === "VALIDATION");
ok("งบใส่คอมมาได้ · ว่าง = ไม่ตั้งเป้า (ไม่ใช่ 0) · เดือนผิด / งบติดลบ / เป้า Lead ไม่ใช่จำนวนเต็ม / ไม่ใช่ตัวเลข → ไม่ผ่าน");
assert.equal(progressMonth("2026-09-01", "2026-09-30", TODAY), "2026-09"); assert.equal(progressMonth("2026-09-01", "2026-09-15", TODAY), "2026-10"); assert.equal(progressMonth(undefined, undefined, TODAY), "2026-10");
const td: DashData = { ...data, meta: [{ report_start: "2026-10-01", report_end: "2026-10-31", amount_spent_thb: "30000", ad_set_name: "x" }], google: [], gtime: [],
  leads: [L("x1", { received_at: "2026-10-02" }), L("x2", { received_at: "2026-10-20" }), L("x3", { received_at: "2026-09-20" })],
  targets: [{ month: "2026-10", ad_budget_thb: "60000", lead_target: "10" }, { month: "2026-09", ad_budget_thb: "", lead_target: "" }] };
const p = targetProgress(td, "2026-10", TODAY, "admin")!;
assert.equal(p.spend, 30000); assert.equal(p.spendPct, 50); assert.equal(p.leads, 2); assert.equal(p.leadPct, 20); assert.equal(p.current, true); assert.equal(p.elapsedPct, Math.round((30 / 31) * 1000) / 10);
assert.equal(targetProgress(td, "2026-09", TODAY, "admin"), null); assert.equal(targetProgress(td, "2026-08", TODAY, "admin"), null);
ok("ต.ค. 69: ค่าโฆษณา 30,000 / งบ 60,000 = 50% · Lead 2 / 10 = 20% · ผ่านไป 96.8% ของเดือน · เดือนที่ไม่ได้ตั้งเป้า = ไม่แสดง · ตัวกรองเดือนเต็มพอดีใช้เดือนนั้น");

console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
