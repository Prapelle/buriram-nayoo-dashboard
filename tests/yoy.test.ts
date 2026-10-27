// Phase 7 — YoY Comparison · รัน: npx tsx tests/yoy.test.ts
// หมายเหตุ: ข้อมูลปี 2025 ในไฟล์นี้เป็น "ข้อมูลทดสอบ" ที่สร้างในเทสต์เท่านั้น (เลื่อนวันที่/ปรับค่าจากไฟล์ ก.ย. 2026) ระบบจริงไม่สร้างตัวเลขย้อนหลัง
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { buildPlan, detectSpec, parseInput, periodsFromFilename } from "../src/lib/import/plan";
import { computeDashboardCompared, DEFAULT_EXCLUDED_PAGES, type DashData, type Row } from "../src/lib/dashboard";
import { computePerformance } from "../src/lib/performance";
import { changePct, shiftYear, yoyRange } from "../src/lib/compare";

const DIR = process.env.FIXTURE_DIR ?? "tests/fixtures";
const rows = (file: string): Row[] => {
  const table = parseInput(readFileSync(`${DIR}/${file}`, "utf8")); const spec = detectSpec(table.headers).spec!; const p = periodsFromFilename(file);
  return buildPlan({ spec, table, ctx: { filename: file, area: "unknown", reportStart: p.start ?? "2026-09-01", reportEnd: p.end ?? "2026-09-30", snapshotDate: "2026-10-27" }, existing: new Map(), areaMap: new Map() })
    .planned.filter((x) => x.rec).map((x) => Object.fromEntries(Object.entries(x.rec!).map(([k, v]) => [k, String(v ?? "")])));
};
const meta = rows("Facebookads.csv"), google = rows("Campaigns_2026_09_01-2026_09_30_.csv"), gtime = rows("Time_series_2026_09_01-2026_09_30_.csv"), daily = rows("Sep-01-2026_Sep-30-2026_4677103402520791.csv");
const back = (d: string) => (d ? d.replace(/^2026/, "2025") : d);
const scale = (r: Row, keys: string[], f: number) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, r[k] === "" ? "" : String(Math.round(Number(r[k]) * f * 100) / 100)])) });
const gtime25 = gtime.map((r) => scale({ ...r, date: back(r.date) }, ["cost_thb", "clicks"], 0.5));
const meta25 = meta.map((r) => scale({ ...r, report_start: back(r.report_start), report_end: back(r.report_end) }, ["amount_spent_thb"], 0.8));
const daily25 = daily.map((r) => ({ ...r, metric_date: back(r.metric_date), publish_time: back(r.publish_time), post_id: r.post_id + "-25" }));
const base: DashData = { meta, google, gtime, posts: daily, line: [], leads: [], sales: [], excludedPages: DEFAULT_EXCLUDED_PAGES, lastImport: "" };
const perf = (d: Partial<DashData>, f: Parameters<typeof computePerformance>[1]) => { const p = computePerformance({ ...base, ...d }, f); return { p, k: Object.fromEntries(p.groups.flatMap((g) => g.items).map((x) => [x.key, x])) }; };
const SEP = { from: "2026-09-01", to: "2026-09-30" };
const r2 = (n: number) => Math.round(n * 100) / 100;
let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };

console.log("1) ช่วงวันที่ปีก่อนและสูตร");
assert.deepEqual(yoyRange({ from: "2027-01-01", to: "2027-01-31" }), { range: { from: "2026-01-01", to: "2026-01-31" }, note: undefined });
assert.equal(shiftYear("2028-02-29", -1), "2027-02-28"); assert.equal(shiftYear("2027-03-01", -1), "2026-03-01");
const leap = yoyRange({ from: "2028-02-01", to: "2028-02-29" }); assert.deepEqual(leap.range, { from: "2027-02-01", to: "2027-02-28" }); assert.match(leap.note!, /ปีก่อนมี 28 วัน ช่วงปัจจุบันมี 29 วัน/);
ok("1–31 ม.ค. 2027 → 1–31 ม.ค. 2026 · 29 ก.พ. → 28 ก.พ. และแจ้งว่าจำนวนวันไม่เท่ากัน");
assert.deepEqual(changePct(120, 100), { pct: 20 }); assert.deepEqual(changePct(80, 100), { pct: -20 }); assert.deepEqual(changePct(100, 100), { pct: 0 });
assert.deepEqual(changePct(5, 0), { pct: null, reason: "zero" }); assert.deepEqual(changePct(0, 0), { pct: null, reason: "zero" }); assert.deepEqual(changePct(5, null), { pct: null, reason: "missing" });
ok("YoY % = (ปัจจุบัน − ปีก่อน) ÷ ปีก่อน × 100: 120 vs 100 = +20% · 80 vs 100 = −20% · ปีก่อน 0 → N/A · ไม่มีปีก่อน → Missing");

console.log("2) Marketing Performance — YoY");
let { p, k } = perf({}, { ...SEP, compare: "yoy" });
assert.deepEqual(p.prevRange, { from: "2025-09-01", to: "2025-09-30" }); assert.equal(p.compare, "yoy");
for (const key of ["g_spend", "g_clicks", "g_cpc", "m_spend", "f_eng"]) { assert.equal(k[key].prev, null); assert.equal(k[key].prevLabel, "ปีก่อน"); }
assert.equal(k.w_users.state, "pending");
ok("ข้อมูลจริงมีแค่ ก.ย. 2026 → ทุก KPI ปีก่อน = Missing Data (ไม่สร้างตัวเลขเอง) · Website ยังรอข้อมูล");
({ p, k } = perf({ gtime: [...gtime, ...gtime25], meta: [...meta, ...meta25], posts: [...daily, ...daily25] }, { ...SEP, compare: "yoy" }));
const g25 = r2(gtime25.reduce((s, r) => s + Number(r.cost_thb), 0)), c25 = gtime25.reduce((s, r) => s + Number(r.clicks), 0);
assert.equal(k.g_spend.prev, g25); assert.equal(k.g_clicks.prev, c25); assert.equal(k.g_cpc.prev, r2(g25 / c25)); assert.equal(k.g_spend.prevIncomplete, undefined);
assert.equal(changePct(k.g_spend.value, k.g_spend.prev).pct, Math.round(((28814.82 - g25) / g25) * 1000) / 10);
assert.equal(k.m_spend.prev, r2(meta25.reduce((s, r) => s + Number(r.amount_spent_thb || 0), 0))); assert.equal(k.f_eng.prev, 319);
ok(`มีข้อมูลทดสอบ ก.ย. 2025: Google Spend ปีก่อน ฿${g25.toLocaleString()} (Time series กฎเดียวกัน) · CPC ปีก่อน = Spend ÷ Clicks ปีก่อน · Meta และ Facebook Engagement (319) เทียบได้`);
({ k } = perf({ gtime: [...gtime, ...gtime25.filter((r) => r.date <= "2025-09-15")], google: google }, { ...SEP, compare: "yoy" }));
assert.equal(k.g_spend.prevIncomplete, "ไม่มีข้อมูลรายวัน 15 วัน (16/09/2025–30/09/2025)"); assert.equal(k.g_spend.incomplete, undefined);
ok("ปีก่อนมีข้อมูลแค่ครึ่งเดือน → แสดงค่าปีก่อนพร้อม ปีก่อนข้อมูลไม่ครบ (ระบุวันที่ขาด) ไม่เทียบเงียบ ๆ");
const zero25 = gtime25.map((r) => ({ ...r, cost_thb: "0", clicks: "0" }));
({ k } = perf({ gtime: [...gtime, ...zero25] }, { ...SEP, compare: "yoy" }));
assert.equal(k.g_spend.prev, 0); assert.equal(changePct(k.g_spend.value, k.g_spend.prev).reason, "zero"); assert.equal(k.g_clicks.prev, 0);
assert.equal(k.g_cpc.prev, null); assert.match(k.g_cpc.prevBlocked!, /Clicks ของช่วงเปรียบเทียบ = 0/);
ok("ปีก่อน = 0 (ไม่ได้ยิงโฆษณา): Spend/Clicks ปีก่อน 0 → YoY = N/A · CPC ปีก่อนคำนวณไม่ได้ → แจ้ง N/A");
({ k } = perf({ posts: rows("Page.csv").map((r) => ({ ...r })) }, { from: "2026-09-01", to: "2026-10-31", compare: "yoy" }));
assert.equal(k.f_eng.prev, null); assert.match(k.f_eng.prevBlocked!, /Lifetime/); ok("Facebook ยอดสะสม (Lifetime) → ไม่เทียบ YoY (เทียบข้ามช่วงไม่ได้)");
({ p } = perf({}, { from: "2028-02-01", to: "2028-02-29", compare: "yoy" })); assert.match(p.compareNote!, /29 วัน/); ok("ปีอธิกสุรทิน → แจ้งว่าช่วงเวลาไม่เท่ากัน");
({ k } = perf({ gtime: [...gtime, ...gtime25] }, { ...SEP, compare: "prev" })); assert.equal(k.g_spend.prevLabel, "ช่วงก่อน"); assert.equal(k.g_spend.prev, null);
ok("โหมด ช่วงก่อนหน้า (ส.ค. 2026) ยังทำงาน · ไม่มีข้อมูล → Missing");

console.log("3) ภาพรวมการตลาด — YoY (Leads, Spend, CPL)");
const L = (id: string, d: string, ch = "Facebook Ads", extra: Row = {}): Row => ({ lead_id: id, received_at: d, source_channel: ch, status: "New", qualified_at: "", area: "", service_category: "", campaign_name: "", ...extra });
const leads = [L("a", "2026-09-02"), L("b", "2026-09-10"), L("c", "2026-09-20", "Referral"), L("d", "2026-09-25", "Google Ads", { status: "Qualified" }), L("e", "2025-09-05"), L("f", "2025-09-15", "Referral")];
const dash = (d: Partial<DashData>, f: Record<string, string>, mode?: "yoy" | "prev") => { const r = computeDashboardCompared({ ...base, leads, ...d }, f, "admin", mode); return { r, k: Object.fromEntries(r.dash.groups.flatMap((g) => g.items).map((x) => [x.key, x])) }; };
let o = dash({}, SEP, "yoy");
assert.deepEqual(o.r.prevRange, { from: "2025-09-01", to: "2025-09-30" }); assert.equal(o.k.leads.value, 4); assert.equal(o.k.leads.prev, 2); assert.equal(changePct(o.k.leads.value, o.k.leads.prev!).pct, 100);
assert.equal(o.k.paid.prev, null); assert.equal(o.k.cpl.prev, null); assert.equal(o.k.leads.prevLabel, "ปีก่อน");
ok("Total Leads ก.ย. 2026 = 4 เทียบ ก.ย. 2025 = 2 → +100% · ค่าโฆษณา/CPL ปีก่อนไม่มีข้อมูล → Missing");
o = dash({ meta: [...meta, ...meta25] }, SEP, "yoy");
assert.equal(o.k.meta.prev, r2(meta25.reduce((s, r) => s + Number(r.amount_spent_thb || 0), 0))); assert.ok(o.k.cpl_all.prev !== null && o.k.cpl_all.prev !== undefined);
assert.match(o.k.paid.prevIncomplete ?? "", /Google Ads/); ok("มี Meta ปีก่อนแต่ไม่มี Google ปีก่อน → Total Paid ปีก่อนแสดงพร้อม ปีก่อนข้อมูลไม่ครบ · CPL ปีก่อนคำนวณด้วยกฎเดียวกัน");
o = dash({ leads: leads.filter((r) => r.received_at.startsWith("2026")) }, SEP, "yoy"); assert.equal(o.k.leads.prev, 0); assert.equal(changePct(o.k.leads.value, 0).reason, "zero");
ok("ปีก่อนไม่มี Lead (= 0 จริง เพราะมี Lead ในระบบ) → YoY = N/A");
o = dash({}, SEP, "yoy"); const rate = o.k.rate; assert.equal(rate.prevBlocked, "เป็นอัตราส่วน ดูค่าของแต่ละช่วงแทน % เปลี่ยนแปลง"); ok("Lead-to-Sale Rate (%) ไม่คิด % ซ้อน");
o = dash({}, {}, "yoy"); assert.equal(o.r.prevRange, null); assert.match(o.r.note!, /เลือกวันที่/); assert.equal(o.k.leads.prev, undefined); ok("ไม่เลือกช่วงวันที่ → ไม่เปรียบเทียบ และบอกให้เลือกวันที่");
o = dash({}, SEP); assert.equal(o.k.leads.prev, undefined); ok("ไม่เลือกโหมดเปรียบเทียบ → การ์ดเหมือนเดิม");
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
