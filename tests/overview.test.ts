// Phase 2 — Marketing Overview: Total Paid Media Spend / Total Leads / CPL
// รัน: npx tsx tests/overview.test.ts (ต้องมีไฟล์ตัวอย่างใน tests/fixtures)
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { buildPlan, detectSpec, parseInput, periodsFromFilename } from "../src/lib/import/plan";
import { computeDashboard, gapsIn, mergeSpans, DEFAULT_EXCLUDED_PAGES, type DashData, type Filters, type Row } from "../src/lib/dashboard";

const DIR = process.env.FIXTURE_DIR ?? "tests/fixtures";
const rows = (file: string): Row[] => {
  const table = parseInput(readFileSync(`${DIR}/${file}`, "utf8")); const spec = detectSpec(table.headers).spec!; const p = periodsFromFilename(file);
  return buildPlan({ spec, table, ctx: { filename: file, area: "unknown", reportStart: p.start, reportEnd: p.end, snapshotDate: "2026-10-27" }, existing: new Map(), areaMap: new Map() })
    .planned.filter((x) => x.rec).map((x) => Object.fromEntries(Object.entries(x.rec!).map(([k, v]) => [k, String(v)])));
};
const meta = rows("Facebookads.csv"), google = rows("Campaigns_2026_09_01-2026_09_30_.csv"), gtime = rows("Time_series_2026_09_01-2026_09_30_.csv");
const L = (id: string, date: string, ch: string, extra: Row = {}): Row => ({ lead_id: id, received_at: date, source_channel: ch, status: "New", service_category: "Product", area: "", campaign_name: "", qualified_at: "", ...extra });
const leads: Row[] = [
  L("A1", "2026-09-02", "Facebook Ads", { status: "Qualified", call_status: "ติดต่อได้แล้ว" }), L("A2", "2026-09-12", "Facebook Ads"), L("A3", "2026-09-18", "Facebook Ads"),
  L("G1", "2026-09-25", "Google Ads", { service_category: "Project" }), L("R1", "2026-09-05", "Referral"), L("R2", "2026-09-29", "Referral"),
  L("X1", "2026-10-03", "Facebook Ads"), // นอกช่วงของรายงานโฆษณา (ก.ย.)
];
const base: DashData = { meta, google, gtime, posts: [], line: [], leads, sales: [], excludedPages: DEFAULT_EXCLUDED_PAGES, lastImport: "" };
const run = (d: Partial<DashData> = {}, f: Filters = {}) => { const r = computeDashboard({ ...base, ...d }, f, "admin"); return { r, k: Object.fromEntries(r.groups.flatMap((g) => g.items).map((x) => [x.key, x])) }; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const PAID = 66372.36;
let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };

console.log("1) Total Paid Media Spend");
let { k, r } = run();
assert.equal(k.meta.value, 37557.54); assert.equal(k.google.value, 28814.82); assert.equal(k.paid.value, PAID); assert.equal(k.paid.incomplete, undefined); assert.match(k.paid.note!, /Meta Ads Spend \+ Google Ads Campaign Spend/);
ok("Meta 37,557.54 + Google Campaign 28,814.82 = 66,372.36 ครอบคลุมช่วงเดียวกัน → ไม่มีสถานะไม่ครบ");
const detail = rows("Networks_2026_09_01-2026_09_30_.csv");
assert.equal(run({ gtime: [...gtime, ...gtime] }).k.paid.value, PAID); assert.equal(run({ posts: rows("Page.csv") }).k.paid.value, PAID); void detail;
ok("รายงาน Google Ads รายละเอียด (Time series ฯลฯ) และ Facebook Page Organic ไม่ถูกบวกเข้าค่าโฆษณา");
({ k } = run({ google: [] }));
assert.equal(k.paid.value, 37557.54); assert.equal(k.paid.state, "value"); assert.match(k.paid.incomplete!, /ไม่มีข้อมูล Google Ads/); assert.equal(k.google.state, "pending");
ok("ไม่มีข้อมูล Google Ads → Total = 37,557.54 พร้อมสถานะ ข้อมูลไม่ครบ (Google = รอข้อมูล ไม่ใช่ 0)");
const gHalf = google.map((x) => ({ ...x, report_end: "2026-09-15" }));
({ k } = run({ google: gHalf }));
assert.equal(k.paid.incomplete, "Google Ads ไม่มีรายงานช่วง 16/09/2026–30/09/2026"); ok("Google มีรายงานแค่ 1–15 ก.ย. แต่ Meta ครบเดือน → ไม่ครบ ระบุช่วงที่ขาด 16/09–30/09/2026");
({ k } = run({}, { from: "2026-10-01", to: "2026-10-31" })); assert.equal(k.paid.state, "pending"); assert.equal(k.paid.value, null); assert.equal(k.cpl.state, "pending");
ok("ช่วงที่ไม่มีรายงานโฆษณาเลย → รอข้อมูล (ไม่ใช่ 0 บาท) และ CPL รอข้อมูล");
({ k } = run({}, { campaign: google[0].campaign_name })); assert.equal(k.paid.incomplete, undefined); ok("กรองแคมเปญ Google แคมเปญเดียว → ไม่ตีว่า Meta ขาดข้อมูล");
({ k } = run({}, { channel: "Facebook Ads" })); assert.equal(k.paid.value, 37557.54); assert.equal(k.paid.incomplete, undefined); assert.equal(k.google.state, "excluded");
ok("กรองช่องทาง Facebook Ads → Total = Meta อย่างเดียว ไม่ถือว่าไม่ครบ");

console.log("2) Total Leads (lead_id ไม่ซ้ำ ตาม Lead Date)");
({ k } = run()); assert.equal(k.leads.value, 7);
({ k, r } = run({ leads: [...leads, { ...leads[0] }, { ...leads[1], status: "Contacted" }, { ...leads[4], lead_id: "" }] }));
assert.equal(k.leads.value, 7); assert.ok(r.warnings.some((w) => w.includes("ไม่มี lead_id"))); ok("แถวซ้ำ lead_id เดียวกัน (เช่น แก้ใน Sheet/คัดลอกซ้ำ) นับครั้งเดียว · แถวไม่มี lead_id ไม่นับและเตือน");
({ k } = run({}, { from: "2026-09-10", to: "2026-09-20" })); assert.equal(k.leads.value, 2); ok("กรองวันที่ 10–20 ก.ย. ตามวันที่รับ Lead → 2 ราย");
({ k } = run({}, { from: "2026-08-01", to: "2026-08-31" })); assert.equal(k.leads.value, 0); assert.equal(k.leads.state, "value"); ok("มี Lead ในระบบแต่ไม่มีในช่วง → 0 (ค่าจริง) ไม่ใช่ รอข้อมูล");
({ k } = run({ leads: [] })); assert.equal(k.leads.state, "pending"); ok("ยังไม่มี Lead ในระบบเลย → รอข้อมูล");

console.log("3) CPL (ช่วงเวลาเดียวกัน)");
({ k } = run());
assert.equal(k.cpl.value, r2(PAID / 4)); assert.equal(k.cpl_all.value, r2(PAID / 6)); assert.equal(k.cplq.value, r2(PAID / 1));
assert.match(k.cpl.note!, /ฐาน 4 Lead ที่รับ 01\/09\/2026–30\/09\/2026/); assert.match(k.cpl_all.note!, /ฐาน 6 Lead/);
ok(`ไม่เลือกช่วง → ใช้ช่วงของรายงานโฆษณา 1–30 ก.ย.: CPL จาก Ads = 66,372.36 ÷ 4 = ${r2(PAID / 4).toLocaleString()} · CPL ทั้งหมด ÷ 6 = ${r2(PAID / 6).toLocaleString()} (Lead ต.ค. ไม่นับ)`);
({ k } = run({ leads: leads.filter((x) => x.source_channel === "Referral") }));
assert.equal(k.cpl.state, "na"); assert.equal(k.cpl.value, null); assert.match(k.cpl.note!, /หารด้วย 0 ไม่ได้/); assert.equal(k.cpl_all.value, r2(PAID / 2));
ok("ไม่มี Lead จากโฆษณา → CPL จาก Ads = N/A (ไม่ใช่ 0) แต่ CPL ทั้งหมดคำนวณได้");
({ k } = run({}, { from: "2026-08-01", to: "2026-08-31" })); assert.equal(k.cpl_all.state, "pending"); ok("ไม่มีทั้งค่าโฆษณาและ Lead ในช่วง → รอข้อมูล");
({ k } = run({}, { service: "Project" })); assert.equal(k.cpl.state, "na"); assert.equal(k.cpl_all.state, "na"); assert.match(k.cpl.note!, /Service/);
ok("กรอง Service → CPL = N/A พร้อมเหตุผล (ค่าโฆษณาไม่ได้แยกตามบริการ จึงเทียบกันไม่ได้)");
({ k } = run({ google: [] })); assert.equal(k.cpl.value, r2(37557.54 / 4)); assert.match(k.cpl.incomplete!, /ไม่มีข้อมูล Google Ads/);
ok("ค่าโฆษณาไม่ครบ → CPL แสดงค่าพร้อมสถานะ ข้อมูลไม่ครบ");
({ k } = run({}, { from: "2026-09-10", to: "2026-09-20" }));
assert.equal(k.cpl.value, r2(PAID / 2)); assert.match(k.cpl.incomplete!, /ครอบคลุมเกินช่วงที่เลือก/);
ok("เลือก 10–20 ก.ย. แต่รายงานโฆษณาเป็นทั้งเดือน → CPL ติดสถานะไม่ครบ (ค่าโฆษณาเกินช่วงของ Lead)");
({ k } = run({}, { channel: "Facebook Ads" })); assert.equal(k.cpl.value, r2(37557.54 / 3)); assert.equal(k.cpl_all.value, r2(37557.54 / 3));
ok("ช่องทาง Facebook Ads: ค่าโฆษณา Meta ÷ Lead จาก Facebook Ads ในช่วงเดียวกัน (3 ราย)");
({ k } = run({}, { channel: "Referral" })); assert.equal(k.cpl.state, "na"); assert.match(k.cpl.note!, /ไม่มีค่าโฆษณา/); ok("ช่องทางที่ไม่มีโฆษณา (Referral) → CPL = N/A");

console.log("4) ฟังก์ชันช่วงวันที่");
assert.deepEqual(mergeSpans([{ report_start: "2026-09-16", report_end: "2026-09-30" }, { report_start: "2026-09-01", report_end: "2026-09-15" }]), [["2026-09-01", "2026-09-30"]]);
assert.deepEqual(gapsIn([["2026-09-01", "2026-09-10"], ["2026-09-21", "2026-09-30"]], "2026-09-01", "2026-09-30"), [["2026-09-11", "2026-09-20"]]);
assert.deepEqual(gapsIn([["2026-09-05", "2026-09-30"]], "2026-09-01", "2026-10-02"), [["2026-09-01", "2026-09-04"], ["2026-10-01", "2026-10-02"]]);
assert.deepEqual(gapsIn([["2026-08-01", "2026-10-31"]], "2026-09-01", "2026-09-30"), []);
ok("รวมช่วงต่อกัน (1–15 + 16–30 = ทั้งเดือน) และหาช่วงที่ขาดได้ถูกต้อง");

console.log("9) Call Status ใหม่ + Cost per Site Visit (คำขอ 28/10/2026)");
{
  const ls = [...leads.slice(0, 6).map((x) => ({ ...x })), L("V1", "2026-09-10", "LINE OA", { call_status: "เข้าชมแล้ว" }), L("V2", "2026-09-11", "Facebook Ads", { call_status: "เข้าชมแล้ว" }), L("S1", "2026-09-12", "Referral", { call_status: "ซื้อสำเร็จ" })];
  const { k: k2, r: r9 } = run({ leads: ls });
  assert.equal(k2.qualified.value, 4); // A1 ติดต่อได้แล้ว + V1 + V2 + S1
  assert.equal(r9.charts.leadQualByChannel!.reduce((s, x) => s + x.value, 0), 4);
  ok("Qualified Leads = ติดต่อได้แล้ว 1 + เข้าชมแล้ว 2 + ซื้อสำเร็จ 1 = 4 (กราฟแยกช่องทางรวมเท่ากัน)");
  assert.equal(k2.cpsv.value, r2(PAID / 2)); assert.match(k2.cpsv.note!, /เข้าชมแล้ว/);
  ok(`Cost per Site Visit = ค่าโฆษณาทั้งหมด ${PAID.toLocaleString()} ÷ 2 Lead ที่เข้าชมแล้ว = ฿${r2(PAID / 2).toLocaleString()}`);
  const { k: k3 } = run();
  assert.equal(k3.cpsv.state, "na"); assert.equal(k3.cpsv.value, null);
  ok("ยังไม่มีใครเข้าชมโครงการ → Cost per Site Visit = N/A (หารด้วย 0 ไม่ได้) ไม่ใช่ 0");
}
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
