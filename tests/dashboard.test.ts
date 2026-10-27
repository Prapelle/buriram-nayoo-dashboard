// รัน: npx tsx tests/dashboard.test.ts (ต้องมีไฟล์ตัวอย่างใน tests/fixtures)
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { buildPlan, detectSpec, parseInput, periodsFromFilename } from "../src/lib/import/plan";
import { computeDashboard, DEFAULT_EXCLUDED_PAGES, type DashData, type Row } from "../src/lib/dashboard";

const DIR = process.env.FIXTURE_DIR ?? "tests/fixtures";
const rows = (file: string): Row[] => {
  const table = parseInput(readFileSync(`${DIR}/${file}`, "utf8")); const spec = detectSpec(table.headers).spec!;
  const p = periodsFromFilename(file);
  const plan = buildPlan({ spec, table, ctx: { filename: file, area: "unknown", reportStart: p.start, reportEnd: p.end, snapshotDate: "2026-10-23" }, existing: new Map(), areaMap: new Map() });
  return plan.planned.map((x) => Object.fromEntries(Object.entries(x.rec!).map(([k, v]) => [k, String(v)])));
};
const base: DashData = {
  meta: rows("Facebookads.csv"), google: rows("Campaigns_2026_09_01-2026_09_30_.csv"), gtime: rows("Time_series_2026_09_01-2026_09_30_.csv"),
  posts: rows("Page.csv"), line: [], leads: [], sales: [], excludedPages: DEFAULT_EXCLUDED_PAGES, lastImport: "2026-10-23T10:00:00.000Z",
};
const kv = (d: ReturnType<typeof computeDashboard>) => Object.fromEntries(d.groups.flatMap((g) => g.items).map((k) => [k.key, k]));
let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };

console.log("1) ข้อมูลจริง (ยังไม่มี LINE/Leads/Sales)");
const d = computeDashboard(base, {}, "admin"); const k = kv(d);
assert.equal(k.meta.value, 37557.54); assert.equal(k.google.value, 28814.82); assert.equal(k.paid.value, 66372.36); ok("Meta 37,557.54 + Google 28,814.82 = Total Paid 66,372.36");
assert.equal(k.posts.value, 54); assert.equal(k.reach.value, 191119); assert.equal(k.clicks.value, 2646); ok("ตัดเพจ BAAN ออก: 54 โพสต์, Reach 191,119, Link Clicks 2,646");
assert.match(k.clicks.note!, /31 จาก 54/); assert.match(k.reach.note!, /สะสม/); ok("Link Clicks บอกว่ามีข้อมูล 31 จาก 54 โพสต์; Reach ระบุว่าเป็นยอดสะสม");
for (const key of ["line_new", "line_inq", "line_leads", "leads", "qualified", "lead_qual"]) assert.equal(k[key].state, "pending", key);
for (const key of ["won", "deal", "revenue", "cost", "gp", "rate"]) assert.equal(k[key], undefined, key); // ตัดออกตามคำขอผู้ใช้
for (const key of ["cpl", "cpl_all", "cplq"]) { assert.equal(k[key].state, "na", key); assert.equal(k[key].value, null); } // Phase 2: ไม่มี Lead → N/A (ไม่ใช่ 0)
assert.ok(k.leads.value === null && k.lead_qual.value === null); ok('ไม่มีข้อมูล → "รอข้อมูล" (value=null ไม่ใช่ 0) ทุกตัว; CPL ที่ไม่มี Lead → N/A · ไม่มีการ์ด Won/Deal/Revenue/Cost/Gross Profit/Lead-to-Sale แล้ว');
assert.equal(d.charts.spendByChannel!.length, 2); assert.equal(d.charts.daily!.length, 30); assert.equal(d.charts.monthly![0].month, "2026-09");
assert.equal(d.charts.leadsByChannel, null); assert.equal(d.charts.pipeline, null); assert.equal(d.charts.lineGrowth, null); ok("กราฟ: มีเฉพาะที่ข้อมูลรองรับ (spend, รายเดือน, รายวัน 30 วัน) ที่เหลือเป็น null");
assert.equal(d.unknownAreaRows, 127); assert.equal(d.warnings.length, 0); ok("Area Unknown 127 แถว (103+24), ไม่มีคำเตือนช่วงทับซ้อน");
assert.equal(computeDashboard({ ...base, excludedPages: [] }, {}, "admin").groups[1].items[0].value, 55); ok("ล้างค่าตัดเพจ → นับ 55 โพสต์");

console.log("2) ตัวกรอง");
let x = kv(computeDashboard(base, { channel: "Google Ads" }, "admin")); assert.equal(x.meta.state, "excluded"); assert.equal(x.paid.value, 28814.82); assert.equal(x.posts.state, "excluded"); ok("ช่องทาง Google Ads: Meta/Facebook Page ถูกซ่อน, Total = Google อย่างเดียว");
x = kv(computeDashboard(base, { area: "buriram" }, "admin")); assert.equal(x.paid.state, "pending"); ok("Area=buriram (ยังไม่มีข้อมูล Area) → รอข้อมูล ไม่ใช่ 0");
x = kv(computeDashboard(base, { area: "unknown" }, "admin")); assert.equal(x.paid.value, 66372.36); ok("Area=unknown ได้ยอดเต็ม");
x = kv(computeDashboard(base, { campaign: "Display-BuriramNaYoo" }, "admin")); assert.equal(x.google.value, 1799.21); assert.equal(x.meta.state, "pending"); ok("Campaign filter: Google 1,799.21 / Meta ไม่มีชื่อตรงกัน");
let dd = computeDashboard(base, { from: "2026-09-10", to: "2026-09-20" }, "admin"); assert.ok(dd.warnings.some((w) => w.includes("ไม่แบ่งรายวัน"))); assert.equal(dd.charts.daily!.length, 11); ok("ช่วงตัดผ่านรายงานรายเดือน → เตือน + กราฟรายวันกรองได้ 11 วัน");
dd = computeDashboard(base, { from: "2026-10-01", to: "2026-10-31" }, "admin"); assert.equal(kv(dd).paid.state, "pending"); ok("ช่วงที่ไม่มีข้อมูล → รอข้อมูล");

console.log("3) Leads / Sales / สิทธิ์ (ข้อมูลสมมติ)");
const leads: Row[] = [
  { lead_id: "L1", call_status: "ติดต่อได้แล้ว", received_at: "2026-09-02", source_channel: "Facebook Ads", status: "Won", service_category: "Product", area: "buriram", campaign_name: "A", qualified_at: "2026-09-03" },
  { lead_id: "L2", call_status: "ติดต่อได้แล้ว", received_at: "2026-09-05", source_channel: "Google Ads", status: "Qualified", service_category: "Project", area: "buriram", campaign_name: "B", qualified_at: "" },
  { lead_id: "L3", call_status: "ไม่สนใจ", received_at: "2026-09-06", source_channel: "Google Ads", status: "New", service_category: "Project", area: "surin", campaign_name: "B", qualified_at: "" },
  { lead_id: "L4", call_status: "ติดต่อไม่ได้", received_at: "2026-09-07", source_channel: "Referral", status: "Lost", service_category: "Event", area: "", campaign_name: "", qualified_at: "" },
];
const sales: Row[] = [
  { closing_date: "2026-09-10", revenue_date: "2026-09-12", service_category: "Product", source_channel: "Facebook Ads", campaign_name: "A", payment_status: "Paid", deal_value_thb: "5000000", company_revenue_thb: "50000", direct_cost_thb: "10000" },
  { closing_date: "2026-09-15", revenue_date: "", service_category: "Project", source_channel: "Google Ads", campaign_name: "B", payment_status: "Unpaid", deal_value_thb: "3000000", company_revenue_thb: "30000", direct_cost_thb: "" },
  { closing_date: "2026-09-16", revenue_date: "", service_category: "Project", source_channel: "Google Ads", campaign_name: "B", payment_status: "Cancelled", deal_value_thb: "999", company_revenue_thb: "999", direct_cost_thb: "1" },
];
const full = { ...base, leads, sales };
x = kv(computeDashboard(full, {}, "admin"));
assert.equal(x.leads.value, 4); assert.equal(x.qualified.value, 2); assert.equal(x.lead_qual.value, 2);
const lq = computeDashboard(full, {}, "admin").charts.leadQualByChannel!; assert.deepEqual(lq, [{ label: "Facebook Ads", value: 1 }, { label: "Google Ads", value: 1 }, { label: "Referral", value: 0 }]);
ok("Leads 4 / Qualified 2 / Lead Qualification 2 (Call Status = ติดต่อได้แล้ว; ไม่สนใจ/ติดต่อไม่ได้ ไม่นับ) แยกช่องทาง: Facebook Ads 1, Google Ads 1, Referral 0");
assert.equal(x.cpl.value, Math.round((66372.36 / 3) * 100) / 100); assert.equal(x.cplq.value, Math.round((66372.36 / 2) * 100) / 100); ok("CPL = ค่าโฆษณา ÷ Lead ช่องทางโฆษณา 3 ราย, Cost/Qualified ÷ 2");
x = kv(computeDashboard(full, {}, "marketing")); assert.equal(x.leads.value, 4); assert.equal(x.lead_qual.value, 2); assert.ok(!Object.values(x).some((v) => v.state === "restricted")); ok("Marketing: นับ Lead / Lead Qualification ได้ (ไม่มีการ์ดการเงินแล้ว)");
x = kv(computeDashboard(full, { service: "Project" }, "sales")); assert.equal(x.leads.value, 2); assert.equal(x.lead_qual.value, 1); ok("Service=Project: Leads 2, Lead Qualification 1");
x = kv(computeDashboard(full, { channel: "Referral" }, "admin")); assert.equal(x.leads.value, 1); assert.equal(x.lead_qual.value, 0); assert.equal(x.lead_qual.state, "value"); assert.equal(x.paid.state, "pending"); ok("ช่องทาง Referral: Lead 1, Lead Qualification 0 (ค่าจริง ไม่ใช่ รอข้อมูล), ไม่มีค่าโฆษณา");
const dup = computeDashboard({ ...base, meta: [...base.meta, { ...base.meta[0], report_start: "2026-09-15", report_end: "2026-10-15" }] }, {}, "admin");
assert.ok(dup.warnings.some((w) => w.includes("ทับซ้อน"))); ok("นำเข้ารายงานช่วงทับกัน → เตือนว่าอาจนับซ้ำ");
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
