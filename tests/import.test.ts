// รัน: FIXTURE_DIR=tests/fixtures npx tsx tests/import.test.ts
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { buildPlan, detectSpec, parseInput, periodsFromFilename, PlanError, type Existing, type Plan } from "../src/lib/import/plan";
import { SPEC_BY_ID } from "../src/lib/import/specs";
import { splitCsv, toCsv as tc, parseCsv as pc } from "../src/lib/csv";
import { TABS } from "../src/lib/schema";

const DIR = process.env.FIXTURE_DIR ?? "tests/fixtures";
const EXPECT: Record<string, string | null> = {
  "Page.csv": "fb_page", "Sep-01-2026_Sep-30-2026_": "fb_page", "Facebookads.csv": "fb_ads",
  "Campaigns_": "gads_campaigns", "Searches_Search_": "gads_search_terms", "Searches_Word_": "gads_search_words",
  "Search_keywords_": "gads_keywords", "Networks_": "gads_network", "Demographics_Age_": "gads_age",
  "Demographics_Gender_2": "gads_gender", "Demographics_Gender_Age_": "gads_gender_age",
  "Day___hour_Day_2": "gads_schedule_day", "Day___hour_Hour_": "gads_schedule_hour", "Day___hour_Day_Hour_": "gads_schedule_day_hour",
  "Optimization_score_": "gads_opt_score", "Biggest_changes_": "gads_changes", "Devices_": "gads_devices",
  "Time_series_": "gads_time_series", "Auction_insights_Compare": "gads_auction", "Auction_insights_Metric": null,
};
const expectFor = (f: string) => Object.entries(EXPECT).find(([k]) => f.startsWith(k))![1];

let pass = 0;
const ok = (name: string) => { pass++; console.log("  ✓", name); };
const emptyMap = new Map<string, string>();
const run = (file: string, existing: Existing = new Map(), over: Partial<Parameters<typeof buildPlan>[0]["ctx"]> = {}) => {
  const text = readFileSync(`${DIR}/${file}`, "utf8");
  const table = parseInput(text);
  const d = detectSpec(table.headers);
  const p = periodsFromFilename(file);
  const ctx = { filename: file, area: "unknown", reportStart: p.start, reportEnd: p.end, comparisonStart: p.cmpStart, comparisonEnd: p.cmpEnd, snapshotDate: "2026-10-23", ...over };
  return { spec: d.spec!, plan: buildPlan({ spec: d.spec!, table, ctx, existing, areaMap: emptyMap }) };
};
const store = (spec: typeof SPEC_BY_ID[string], plan: Plan): Existing => {
  const m: Existing = new Map(); let n = 2;
  for (const x of plan.planned) if (x.rec) m.set(String(x.rec.row_key), { rowNumber: n++, row: Object.fromEntries(Object.entries(x.rec).map(([k, v]) => [k, String(v)])) });
  return m;
};
const sum = (plan: Plan, k: string) => Math.round(plan.planned.reduce((s, x) => s + (Number(x.rec?.[k]) || 0), 0) * 100) / 100;

console.log("1) ตรวจประเภทไฟล์ + นำเข้าครั้งแรก + นำเข้าซ้ำ");
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".csv")).sort()) {
  const table = parseInput(readFileSync(`${DIR}/${file}`, "utf8"));
  const d = detectSpec(table.headers);
  assert.equal(d.spec?.id ?? null, expectFor(file), `detect ${file}`);
  if (!d.spec) { ok(`${file}: ไม่รองรับ (ตามคาด)`); continue; }
  const { spec, plan } = run(file);
  assert.equal(plan.errors.length, 0, `${file} errors: ${JSON.stringify(plan.errors.slice(0, 3))}`);
  assert.equal(plan.counts.insert + plan.counts.invalid + plan.counts.skip, plan.counts.total); // skip = แถวว่างก่อนวันเผยแพร่ (Facebook รายวัน)
  const tab = TABS.find((t) => t.name === spec.tab)!;
  for (const x of plan.planned) {
    if (!x.rec) continue;
    const bad = Object.keys(x.rec).filter((k) => !tab.headers.includes(k));
    assert.deepEqual(bad, [], `${file}: คอลัมน์ไม่มีในแท็บ ${spec.tab}`);
    assert.ok(String(x.rec.raw_json).length < 50000, "raw_json ยาวเกิน");
  }
  const again = run(file, store(spec, plan)).plan;
  assert.equal(again.counts.insert + again.counts.update, 0, `${file}: นำเข้าซ้ำต้องไม่เพิ่ม/แก้`);
  assert.equal(again.counts.skip, plan.counts.insert + plan.counts.skip, `${file}: นำเข้าซ้ำต้องข้ามทุกแถว`);
  ok(`${file.slice(0, 44).padEnd(44)} → ${spec.id} | ${plan.counts.insert} แถว, นำเข้าซ้ำ skip ${again.counts.skip}${plan.warnings.length ? " | warn " + plan.warnings.length : ""}`);
}

console.log("2) ตัวเลขตรงกัน / ไม่แปลงค่าว่างเป็น 0");
const camp = run("Campaigns_2026_09_01-2026_09_30_.csv").plan;
assert.equal(sum(camp, "cost_thb"), 28814.82); assert.equal(sum(camp, "clicks"), 31513);
assert.equal(sum(run("Networks_2026_09_01-2026_09_30_.csv").plan, "cost_thb"), 28814.83);
assert.equal(sum(run("Time_series_2026_09_01-2026_09_30_.csv").plan, "cost_thb"), 28814.82);
ok("Campaign cost 28,814.82 ตรงกับ Network/Time series (ต่าง 0.01 จากการปัดเศษ) และไม่ถูกรวมข้ามรายงาน");
assert.equal(camp.planned[0].rec!.ctr_pct, 5.61); assert.equal(camp.planned[0].rec!.cost_thb, 3944.63); ok("THB/comma/% แปลงเป็นตัวเลข (5.61 = 5.61%)");
const pg = run("Page.csv").plan;
const blankLink = pg.planned.filter((x) => x.rec!.link_clicks === "").length;
assert.equal(blankLink, 23); assert.ok(pg.planned.every((x) => x.rec!.metric_period_label === "Lifetime")); assert.equal(pg.planned[0].rec!.snapshot_date, "2026-10-23");
ok(`Page.csv: Lifetime ครบ 55 แถว, Link Clicks ว่าง ${blankLink} แถวคงเป็นค่าว่าง (ไม่เป็น 0)`);
const fa = run("Facebookads.csv").plan;
assert.equal(sum(fa, "amount_spent_thb"), 37557.54);
assert.equal(new Set(fa.planned.map((x) => x.rec!.row_key)).size, 103);
assert.ok(fa.warnings.some((w) => w.includes("ซ้ำ")));
const inds = new Set(fa.planned.map((x) => x.rec!.result_indicator)); assert.ok(inds.has("actions:like") && inds.has("actions:post_engagement"));
ok("Facebookads: spend 37,557.54, key ไม่ซ้ำ 103 แถว (มี 10 กลุ่มชื่อซ้ำ → แจ้งเตือน), แยก result_indicator");
const auc = run("Auction_insights_Compare_metrics_2026_09_01-2026_09_30_.csv").plan;
assert.equal(auc.planned[0].rec!.outranking_share_pct, ""); assert.equal(auc.planned[1].rec!.impression_share_pct, ""); ok('"No data" และ "< 10%" เป็นค่าว่าง ไม่ใช่ 0');
const hr = run("Day___hour_Hour_2026_09_01-2026_09_30_.csv").plan; assert.equal(hr.planned[0].rec!.hour_24, 0); assert.equal(hr.planned[12].rec!.hour_24, 12); ok("12 AM → 0, 12 PM → 12");

console.log("3) กรณีผิดพลาด");
const t = (text: string, id: string, ctx = {}) => buildPlan({ spec: SPEC_BY_ID[id], table: parseInput(text), ctx: { filename: "x.csv", area: "unknown", reportStart: "2026-09-01", reportEnd: "2026-09-30", ...ctx }, existing: new Map(), areaMap: emptyMap });
assert.throws(() => t("Campaign Name,Cost\nA,THB1", "gads_campaigns"), (e: unknown) => e instanceof PlanError && e.code === "MISSING_HEADERS"); ok("Header ขาด → MISSING_HEADERS");
assert.throws(() => parseInput('Campaign Name,Cost\n"abc,THB1\n'), /ไม่ปิด/); ok("CSV เสีย (quote ไม่ปิด) → แจ้งชัดเจน");
const hdr = "Campaign Name,Campaign Group Name,Campaign Status,Cost,Clicks,CTR\n";
const bad = t(hdr + 'A,,Enabled,THB1,x,5%\n,,Enabled,THB1,2,5%\nB,,Enabled,THB1,2,5%\nB,,Enabled,THB9,3,5%\n', "gads_campaigns");
assert.deepEqual(bad.errors.map((e) => [e.row, e.code]), [[2, "INVALID_NUMBER"], [3, "REQUIRED_BLANK"], [5, "DUPLICATE_IN_FILE"]]);
assert.equal(bad.counts.insert, 1); assert.equal(bad.counts.invalid, 3); ok("ตัวเลขผิด / ค่าว่างที่จำเป็น / แถวซ้ำในไฟล์ → invalid พร้อมเลขแถวและเหตุผล");
assert.throws(() => t(hdr + "A,,Enabled,THB1,2,5%\n", "gads_campaigns", { reportStart: "2026-02-31" }), (e: unknown) => e instanceof PlanError && e.code === "PERIOD_REQUIRED"); ok("ช่วงวันที่ผิด (31 ก.พ.) → ถูกปฏิเสธ");
const fbh = readFileSync(`${DIR}/Facebookads.csv`, "utf8").split("\n")[0] + "\n";
const row = '2026-13-01,2026-09-30,X,active,"7-day",3,actions:like,1,500,Daily,7.24,125,100,3,Ongoing,2,ABSOLUTE_OCPM,2026-06-10T16:28:22+0700,-,-,-,Buriram,,\n';
const fe = t(fbh + row, "fb_ads"); assert.equal(fe.errors[0].code, "INVALID_DATE"); ok("วันที่ผิดในไฟล์ (เดือน 13) → INVALID_DATE");
const upd = (() => { const a = run("Campaigns_2026_09_01-2026_09_30_.csv"); const st = store(a.spec, a.plan); const first = [...st.values()][0]; first.row.cost_thb = "1"; return run("Campaigns_2026_09_01-2026_09_30_.csv", st).plan.counts; })();
assert.equal(upd.update, 1); assert.equal(upd.skip, 23); ok("ค่าเปลี่ยน → update 1 แถว ที่เหลือ skip (ไม่เพิ่มซ้ำ)");
const mapped = buildPlan({ spec: SPEC_BY_ID.gads_campaigns, table: parseInput(readFileSync(`${DIR}/Campaigns_2026_09_01-2026_09_30_.csv`, "utf8")), ctx: { filename: "c", area: "unknown", reportStart: "2026-09-01", reportEnd: "2026-09-30" }, existing: new Map(), areaMap: new Map([["google_ads|มือสอง-ซื้อ/เช่า-คอนโด-คำกว้าง", "buriram"]]) });
assert.equal(mapped.planned.find((x) => x.rec!.campaign_name === "มือสอง-ซื้อ/เช่า-คอนโด-คำกว้าง")!.rec!.area, "buriram"); ok("AREA_MAPPINGS ที่ยืนยันแล้วถูกใช้ แถวอื่นเป็น unknown");
console.log("ช่วงวันที่จากชื่อไฟล์ / หัวรายงาน (1/11/2026)");
{
  const P = (n: string) => periodsFromFilename(n);
  assert.deepEqual(P("Campaigns_2026_09_01-2026_09_30_ (1).csv"), { start: "2026-09-01", end: "2026-09-30" });
  assert.deepEqual(P("Campaigns(2026-10-01 - 2026-10-31).csv"), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(P("Campaign report 20261001-20261031.csv"), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(P("Campaigns_Oct 1, 2026 - Oct 31, 2026.csv"), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(P("แคมเปญ_1 ต.ค. 2569 - 31 ต.ค. 2569.csv"), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(P("Campaigns_2569_10_01-2569_10_31_.csv"), { start: "2026-10-01", end: "2026-10-31" });
  assert.deepEqual(P("Biggest_changes_2026_09_01-2026_09_30_compared_to_2026_08_02-2026_08_31_.csv"), { start: "2026-09-01", end: "2026-09-30", cmpStart: "2026-08-02", cmpEnd: "2026-08-31" });
  assert.deepEqual(P("Campaign report.csv"), {}); assert.deepEqual(P("Campaigns_2026_02_30-2026_03_31.csv").start, undefined);
  ok("ชื่อไฟล์หลายรูปแบบ (_ - . ติดกัน ชื่อเดือนอังกฤษ/ไทย ปี พ.ศ. ไฟล์ซ้ำ (1)) → ช่วงวันที่ถูก · วันที่ไม่มีจริง (30 ก.พ.) ไม่นับ · ไม่มีวันที่ → ว่าง");
  const raw = readFileSync(`${DIR}/Campaigns_2026_09_01-2026_09_30_.csv`, "utf8");
  const t = parseInput("Campaign report\nSeptember 1, 2026 - September 30, 2026\n" + raw.replace(/^\uFEFF/, ""));
  assert.equal(detectSpec(t.headers).spec?.id, "gads_campaigns"); assert.deepEqual(periodsFromFilename(t.preamble!), { start: "2026-09-01", end: "2026-09-30" });
  assert.equal(t.records.length, parseInput(raw).records.length);
  ok("ไฟล์ที่มีบรรทัดหัวรายงานก่อนตาราง → ข้ามหัวเรื่อง ตรวจประเภทได้ จำนวนแถวเท่าเดิม และอ่านช่วงวันที่จากหัวรายงาน");
}
console.log("ไฟล์ Facebook Page ใหญ่ (1/11/2026)");
{
  const head = ["Post ID", "Page ID", "Page name", "Title", "Description", "Publish time", "Permalink", "Post type", "Date", "Reactions, Comments and Shares", "Reactions", "Comments", "Shares"];
  const long = "ข้อความโพสต์ยาว ".repeat(150);
  const body = Array.from({ length: 400 }, (_, i) => [`p${i % 40}`, "1", "เพจ", "หัวเรื่อง " + i, long + "\n\"บรรทัดใหม่\", มีจุลภาค", "09/01/2026 10:00", "https://fb.com/x", "Photo", `09/${String(1 + (i % 28)).padStart(2, "0")}/2026`, "3", "2", "1", "0"]);
  const text = tc([head, ...body]);
  const parts = splitCsv("Sep-01-2026_Sep-30-2026_1.csv", text, 400_000);
  assert.ok(parts.length > 1); assert.ok(parts.every((p) => pc(p.text.replace(/^\uFEFF/, ""))[0].join() === head.join()));
  assert.equal(parts.reduce((a, p) => a + pc(p.text.replace(/^\uFEFF/, "")).length - 1, 0), 400); // แถวครบ ไม่หาย ไม่ซ้ำ (ข้อความหลายบรรทัด / มีจุลภาค ไม่แตก)
  assert.deepEqual(splitCsv("a.csv", text, 400_000).map((p) => p.text), parts.map((p) => p.text)); // แบ่งแบบเดิมทุกครั้ง → กันไฟล์ซ้ำได้
  assert.equal(splitCsv("s.csv", "sep=,\n" + text, 400_000).length, 1);
  const t = parseInput(parts[0].text); const sp = detectSpec(t.headers).spec!; assert.equal(sp.id, "fb_page");
  const pl = buildPlan({ spec: sp, table: t, ctx: { filename: parts[0].name, area: "unknown", snapshotDate: "2026-10-01" }, existing: new Map(), areaMap: emptyMap });
  const rec = pl.planned.find((x) => x.rec)!.rec!;
  assert.ok(String(rec.description).length <= 501 && !String(rec.raw_json).includes("ข้อความโพสต์ยาว") && String(rec.title).startsWith("หัวเรื่อง"));
  ok(`ไฟล์ใหญ่แบ่งเป็น ${parts.length} ส่วน (หัวตารางทุกส่วน · แถวครบ 400 · ข้อความหลายบรรทัดไม่แตก · แบ่งเหมือนเดิมทุกครั้ง · ไฟล์ sep= ไม่แบ่ง) · Facebook Page: raw_json ไม่เก็บ Title/Description ซ้ำ · Description ตัดที่ 500 ตัวอักษร`);
}
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
