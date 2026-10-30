// Phase 6 — Marketing Performance · รัน: npx tsx tests/performance.test.ts
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { buildPlan, detectSpec, parseInput, periodsFromFilename } from "../src/lib/import/plan";
import { DEFAULT_EXCLUDED_PAGES, statusChart, type DashData, type Row } from "../src/lib/dashboard";
import { computePerformance, previousRange } from "../src/lib/performance";
import { BUY_NEEDS, BUY_STATUS, SELL_NEEDS, SELL_STATUS } from "../src/lib/lead-options";

const DIR = process.env.FIXTURE_DIR ?? "tests/fixtures";
const rows = (file: string, snapshotDate = "2026-10-27"): Row[] => {
  const table = parseInput(readFileSync(`${DIR}/${file}`, "utf8")); const spec = detectSpec(table.headers).spec!; const p = periodsFromFilename(file);
  return buildPlan({ spec, table, ctx: { filename: file, area: "unknown", reportStart: p.start ?? "2026-09-01", reportEnd: p.end ?? "2026-09-30", snapshotDate }, existing: new Map(), areaMap: new Map() })
    .planned.filter((x) => x.rec).map((x) => Object.fromEntries(Object.entries(x.rec!).map(([k, v]) => [k, String(v ?? "")])));
};
const meta = rows("Facebookads.csv"), google = rows("Campaigns_2026_09_01-2026_09_30_.csv"), gtime = rows("Time_series_2026_09_01-2026_09_30_.csv");
const daily = rows("Sep-01-2026_Sep-30-2026_4677103402520791.csv"), life = rows("Page.csv");
const base: DashData = { meta, google, gtime, posts: daily, line: [], leads: [], sales: [], excludedPages: DEFAULT_EXCLUDED_PAGES, lastImport: "" };
const run = (d: Partial<DashData> = {}, f: Parameters<typeof computePerformance>[1] = {}) => { const p = computePerformance({ ...base, ...d }, f); return { p, k: Object.fromEntries(p.groups.flatMap((g) => g.items).map((x) => [x.key, x])) }; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const tsSum = (k: string, from: string, to: string) => r2(gtime.filter((r) => r.date >= from && r.date <= to).reduce((s, r) => s + Number(r[k] || 0), 0));
let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };

console.log("1) Google Ads Spend / Clicks / CPC");
let { p, k } = run();
assert.deepEqual(p.range, { from: "2026-09-01", to: "2026-09-30" }); assert.equal(p.defaulted, true);
assert.equal(k.g_spend.value, 28814.82); assert.equal(k.g_clicks.value, 31513); assert.equal(k.g_cpc.value, r2(28814.82 / 31513)); assert.equal(k.g_spend.incomplete, undefined);
assert.match(k.g_spend.note!, /Time series/); assert.equal(p.warnings.length, 0);
ok(`ไม่เลือกช่วง → ใช้ช่วงข้อมูล 01–30/09/2026 · Spend 28,814.82 · Clicks 31,513 · CPC = ${r2(28814.82 / 31513)} (Time series รายวันครบ ตรงกับ Campaign Report ไม่มีคำเตือน)`);
({ p, k } = run({}, { from: "2026-09-10", to: "2026-09-20" }));
assert.equal(k.g_spend.value, tsSum("cost_thb", "2026-09-10", "2026-09-20")); assert.equal(k.g_clicks.value, tsSum("clicks", "2026-09-10", "2026-09-20")); assert.equal(k.g_spend.incomplete, undefined);
assert.equal(k.g_cpc.value, r2(k.g_spend.value! / k.g_clicks.value!));
ok(`เลือก 10–20 ก.ย. → ตัดช่วงจาก Time series ได้ตรง: Spend ${k.g_spend.value!.toLocaleString()} · Clicks ${k.g_clicks.value!.toLocaleString()} · CPC ใช้ตัวเลขชุดเดียวกัน`);
({ k } = run({ gtime: [] }));
assert.equal(k.g_spend.value, 28814.82); assert.equal(k.g_clicks.value, 31513); assert.match(k.g_spend.note!, /Campaign Report/); assert.equal(k.g_spend.incomplete, undefined);
ok("ไม่มี Time series → ใช้ Campaign Report ที่ครอบคลุมช่วงพอดี (ค่าเท่ากัน)");
({ k } = run({ gtime: [] }, { from: "2026-09-10", to: "2026-09-20" }));
assert.equal(k.g_spend.value, 28814.82); assert.match(k.g_spend.incomplete!, /ครอบคลุมเกินช่วงที่เลือก/); assert.match(k.g_cpc.incomplete!, /ครอบคลุมเกินช่วง/);
ok("มีแค่ Campaign Report (ทั้งเดือน) แต่เลือก 10–20 ก.ย. → แสดงพร้อม ข้อมูลไม่ครบ (ตัดรายวันไม่ได้)");
const half = gtime.filter((r) => r.date <= "2026-09-15");
({ k } = run({ gtime: half }));
assert.equal(k.g_spend.value, 28814.82); assert.match(k.g_spend.note!, /Campaign Report/); ok("Time series มีแค่ครึ่งเดือน แต่ Campaign Report ครบ → ใช้ Campaign Report (ไม่ใช้ข้อมูลครึ่งเดียว)");
({ k } = run({ gtime: half, google: [] }));
assert.equal(k.g_spend.value, tsSum("cost_thb", "2026-09-01", "2026-09-15")); assert.equal(k.g_spend.incomplete, "ไม่มีข้อมูลรายวัน 15 วัน (16/09/2026–30/09/2026)");
ok("มีแต่ Time series ครึ่งเดือน → ใช้ที่มี + ข้อมูลไม่ครบ ระบุวันที่ขาด 16/09–30/09/2026");
({ k } = run({ gtime: [{ date: "2026-09-01", cost_thb: "100", clicks: "0", impressions: "50" }], google: [] }, { from: "2026-09-01", to: "2026-09-01" }));
assert.equal(k.g_cpc.state, "na"); assert.equal(k.g_cpc.value, null); assert.equal(k.g_clicks.value, 0); ok("Clicks = 0 → CPC = N/A (ไม่ใช่ 0)");
({ k } = run({ gtime: [], google: [] })); assert.equal(k.g_spend.state, "pending"); assert.equal(k.g_cpc.state, "pending"); ok("ไม่มีข้อมูล Google เลย → รอข้อมูล");
({ p } = run({ google: google.map((r, i) => (i === 0 ? { ...r, cost_thb: String(Number(r.cost_thb) + 500) } : r)) }));
assert.ok(p.warnings.some((w) => w.includes("ไม่ตรงกับ Campaign Report"))); ok("Time series กับ Campaign Report ช่วงเดียวกันยอดไม่ตรง → เตือน");
({ k } = run()); assert.notEqual(k.g_spend.value, 28814.82 + 37557.54); ok("Google Ads Spend ไม่ใช้ Total Paid Media Spend");

console.log("2) Meta Ads (Paid)");
({ k } = run());
assert.equal(k.m_spend.value, 37557.54); assert.equal(k.m_spend.incomplete, undefined); assert.match(k.m_reach.note!, /ไม่ใช่ Unique Reach/);
assert.equal(k.m_impr.value, r2(meta.reduce((s, r) => s + Number(r.impressions || 0), 0)));
ok("Meta Spend 37,557.54 · Impressions รวมตรงกับไฟล์ · Reach ระบุว่าเป็นผลรวมระดับโฆษณา ไม่ใช่ Unique");
({ k, p } = run({}, { from: "2026-09-10", to: "2026-09-20" })); assert.match(k.m_spend.incomplete!, /ครอบคลุมเกินช่วงที่เลือก/);
const act = Object.fromEntries(p.meta.actions.map((a) => [a.label, a])); assert.equal(act.post_engagement.rows, 43); assert.equal(act.like.rows, 16);
ok("Meta รายงานทั้งเดือนแต่เลือกช่วงย่อย → ข้อมูลไม่ครบ · Results แยกตาม Action (ชื่อตัด prefix แล้ว)");

console.log("3) Facebook Page (Organic)");
({ k } = run());
assert.equal(k.f_eng.value, 319); assert.equal(k.f_reach.state, "pending"); assert.match(k.f_reach.note!, /ไม่มีคอลัมน์ Reach/); assert.ok(!("f_views" in k) && !("f_link" in k));
ok("Reactions + Comments + Shares = 319 (รายวัน ไม่รวมเพจ BAAN) · Reach = รอข้อมูล พร้อมเหตุผล · ไม่แสดง Views/Link Clicks ที่ไฟล์ไม่มี");
({ k } = run({ posts: life })); assert.equal(k.f_eng.state, "pending"); // snapshot 27/10 อยู่นอกช่วง ก.ย.
({ k } = run({ posts: life }, { from: "2026-09-01", to: "2026-10-31" }));
assert.match(k.f_reach.label, /Lifetime/); assert.match(k.f_eng.incomplete!, /ยอดสะสม \(Lifetime\)/); assert.ok((k.f_reach.value ?? 0) > 0); assert.ok("f_link" in k);
ok("มีแต่ไฟล์ Lifetime: snapshot อยู่นอกช่วง → รอข้อมูล · อยู่ในช่วง → ป้าย Reach (Lifetime) และติด ข้อมูลไม่ครบ ว่าไม่ใช่ยอดของช่วง");
({ k } = run({}, { from: "2026-09-24", to: "2026-09-30" })); assert.equal(k.f_eng.value, 129); ok("กรอง 24–30 ก.ย. ตามวันที่ของสถิติ: 129 (เท่ากับ Dashboard)");

console.log("4) Website และอัตราส่วน");
({ k } = run());
for (const key of ["w_users", "w_pv", "w_pvu", "w_dur", "x_cppv", "x_spu"]) { assert.equal(k[key].state, "pending"); assert.equal(k[key].value, null); }
ok("Website 4 ตัว + Ads Cost per Page View / Spend per User = รอข้อมูล (ไม่แสดง 0) พร้อมสูตรและหมายเหตุ Attribution");

console.log("5) เปรียบเทียบช่วงเวลา / แนวโน้ม / สถานะความครบ");
assert.deepEqual(previousRange({ from: "2026-09-16", to: "2026-09-30" }), { from: "2026-09-01", to: "2026-09-15" });
({ k, p } = run({}, { from: "2026-09-16", to: "2026-09-30", compare: "prev" }));
assert.equal(k.g_spend.prev, tsSum("cost_thb", "2026-09-01", "2026-09-15")); assert.equal(k.g_spend.value, tsSum("cost_thb", "2026-09-16", "2026-09-30"));
assert.equal(r2(k.g_spend.value! + k.g_spend.prev!), 28814.82); assert.equal(k.g_cpc.prev, r2(k.g_spend.prev! / k.g_clicks.prev!));
ok("16–30 ก.ย. เทียบ 1–15 ก.ย.: ค่าช่วงก่อนคำนวณด้วยกฎเดียวกัน (สองช่วงรวมกัน = 28,814.82)");
({ k } = run({}, { compare: "prev" })); assert.equal(k.g_spend.prev, null); assert.equal(run().k.g_spend.prev, undefined);
ok("ช่วงก่อน (ส.ค.) ไม่มีข้อมูล → แสดง ช่วงก่อน: รอข้อมูล · ไม่ติ๊กเปรียบเทียบ → ไม่แสดง");
({ p } = run());
assert.equal(p.trend.google!.length, 30); assert.equal(r2(p.trend.google!.reduce((s, x) => s + x.cost, 0)), 28814.82);
({ p } = run({}, { gran: "month" })); assert.deepEqual(p.trend.google, [{ x: "2026-09", cost: 28814.82, clicks: 31513 }]); assert.equal(p.trend.fb![0].engagement, 319);
({ p } = run({ gtime: [] })); assert.equal(p.trend.google, null); assert.match(p.trend.googleNote!, /แบ่งรายวันไม่ได้/);
ok("แนวโน้มรายวัน 30 จุด / รายเดือน ก.ย. = 28,814.82 · ไม่มี Time series → ไม่สร้างกราฟจาก Campaign Report (บอกเหตุผล)");
({ p } = run({}, { from: "2026-09-10", to: "2026-09-20" }));
const pf = Object.fromEntries(p.platforms.map((r) => [r.platform, r])); assert.equal(pf["Google Ads"].status, "ครบ"); assert.equal(pf["Meta Ads"].status, "ไม่ครบ"); assert.equal(pf["Website (GA4)"].status, "รอข้อมูล"); assert.equal(pf["Google Search"].status, "รอข้อมูล"); assert.equal(pf["Facebook Page"].spend, null);
const so = Object.fromEntries(p.sources.map((s) => [s.name, s])); assert.equal(so["Google Ads Time series (รายวัน)"].available, "01/09/2026–30/09/2026");
ok("ตารางตามแพลตฟอร์มแยก Paid/Organic/Website พร้อมสถานะ ครบ / ไม่ครบ / รอข้อมูล และช่วงข้อมูลที่มีของแต่ละแหล่ง");
({ p } = run({}, { from: "2026-09-20", to: "2026-09-10" })); assert.ok(p.warnings[0].includes("หลังวันที่สิ้นสุด")); assert.equal(p.groups.length, 0); ok("วันที่เริ่มหลังวันสิ้นสุด → เตือน ไม่คำนวณ");
({ p } = run({ meta: [], google: [], gtime: [], posts: [] })); assert.equal(p.range, null); ok("ไม่มีข้อมูลเลย → ไม่มีช่วง (แสดงข้อความให้นำเข้า)");

console.log("6) กราฟ Lead ตาม Buy / Sell Status");
const leads: Row[] = [{ need: "ซื้อ", buy_status: "Hot" }, { need: "เช่า", buy_status: "Hot" }, { need: "สร้าง", buy_status: "Cold" }, { need: "ซื้อ", buy_status: "" }, { need: "ขาย", sell_status: "ขายแล้ว" }, { need: "", status: "New" }];
assert.deepEqual(statusChart(leads, BUY_NEEDS, "buy_status", BUY_STATUS), [{ label: "Hot", value: 2 }, { label: "Warm", value: 0 }, { label: "Cold", value: 1 }, { label: "Archive", value: 0 }, { label: "Close", value: 0 }, { label: "(ยังไม่ระบุสถานะ)", value: 1 }]);
assert.equal(statusChart(leads, SELL_NEEDS, "sell_status", SELL_STATUS)!.find((x) => x.label === "ขายแล้ว")!.value, 1); assert.equal(statusChart([], BUY_NEEDS, "buy_status", BUY_STATUS), null);
ok("Buy Status: Hot 2, Warm 0, Cold 1, Archive 0, Close 0, ยังไม่ระบุ 1 (Lead ขาย/ไม่มี Need ไม่ปน) · Sell Status แยกกราฟ · ไม่มี Lead = รอข้อมูล");

console.log("8) Customer Funnel + ประสิทธิภาพแต่ละช่องทาง (คำขอ 28/10/2026)");
{
  const Ld = (id: string, day: string, ch: string, call = ""): Row => ({ lead_id: id, received_at: day, source_channel: ch, call_status: call });
  const fl: Row[] = [Ld("F1", "2026-09-02", "Facebook Ads", "ซื้อสำเร็จ"), Ld("F2", "2026-09-03", "Facebook Ads", "เข้าชมแล้ว"), Ld("F3", "2026-09-04", "Facebook Ads", "ติดต่อไม่ได้"), Ld("F4", "2026-09-05", "Facebook Ads", "ไม่สนใจ"),
    Ld("G1", "2026-09-06", "Google Ads", "รอเข้าชม"), Ld("G2", "2026-09-07", "Google Ads"), Ld("L1", "2026-09-08", "LINE OA", "ซื้อสำเร็จ"), Ld("F1", "2026-09-09", "Facebook Ads", "ซื้อสำเร็จ") /* ซ้ำ */, Ld("X1", "2026-10-02", "LINE OA")];
  const web: Row[] = [{ source: "ga4_snapshot", granularity: "period", report_start: "2026-09-01", report_end: "2026-09-30", website_users: "17443", sessions: "22409", page_views: "42450", avg_engagement_sec_per_user: "60.042" }];
  const { p: fp, k: fk } = run({ leads: fl, web });
  const by = Object.fromEntries(fp.funnel!.map((x) => [x.key, x]));
  assert.equal(by.reach.value, fk.m_reach.value! + fk.f_reach.value!); assert.match(by.reach.note, /ไม่ใช่ Unique Reach/);
  assert.equal(by.visits.value, 22409); assert.match(by.visits.note, /Sessions/);
  assert.equal(by.leads.value, 7); assert.equal(by.qualified.value, 4); assert.equal(by.sold.value, 2);
  assert.equal(by.qualified.conv, r2(4 / 7 * 100)); assert.equal(by.sold.conv, 50); assert.equal(by.leads.change, undefined);
  ok(`Funnel ก.ย.: Reach ${by.reach.value!.toLocaleString()} (Meta + Facebook Page) → เข้าเว็บ 22,409 Sessions → Leads 7 (ไม่นับซ้ำ/นอกช่วง) → Qualified 4 (รอเข้าชม/เข้าชม/ซื้อสำเร็จ) → ขายได้ 2`);
  const ch = Object.fromEntries(fp.channels!.map((c) => [c.channel, c]));
  assert.equal(ch["Meta Ads"].leads, 4); assert.equal(ch["Meta Ads"].cpl, r2(37557.54 / 4)); assert.equal(ch["Meta Ads"].cpql, r2(37557.54 / 2)); assert.equal(ch["Meta Ads"].sold, 1);
  assert.equal(ch["Google Ads"].cpl, r2(28814.82 / 2)); assert.equal(ch["Google Ads"].qualified, 1);
  assert.equal(ch["LINE OA"].kind, "Organic"); assert.equal(ch["LINE OA"].cpl, null); assert.equal(ch["LINE OA"].leads, 1); assert.equal(ch["LINE OA"].sold, 1);
  ok(`ค่าใช้จ่าย/Lead: Meta ฿${ch["Meta Ads"].cpl} (4 Lead จาก Facebook Ads) · Google ฿${ch["Google Ads"].cpl} · LINE OA ไม่มีค่าโฆษณา → ไม่คำนวณ (ไม่ใช่ 0)`);
  const { p: e } = run({ leads: [], web: [], posts: [], meta: [] });
  const be = Object.fromEntries(e.funnel!.map((x) => [x.key, x]));
  assert.equal(be.reach.value, null); assert.equal(be.visits.value, null); assert.equal(be.leads.value, null); assert.equal(be.qualified.conv, null);
  assert.equal(Object.fromEntries(run({ leads: [{ lead_id: "Z", received_at: "2026-08-01", source_channel: "LINE OA" }] }).p.funnel!.map((x) => [x.key, x])).leads.value, 0);
  assert.equal(e.channels!.find((c) => c.channel === "Google Ads")!.cpl, null);
  ok("ไม่มี Reach/เว็บ/Lead ในระบบ → รอข้อมูล (ไม่ใช่ 0) · มี Lead แต่ไม่มีในช่วง → 0 · Lead 0 → CPL ไม่คำนวณ (หารด้วย 0 ไม่ได้)");
  const { p: y } = run({ leads: [...fl, Ld("P1", "2025-09-03", "Facebook Ads", "ซื้อสำเร็จ"), Ld("P2", "2025-09-04", "Facebook Ads")] }, { from: "2026-09-01", to: "2026-09-30", compare: "yoy" });
  const byY = Object.fromEntries(y.funnel!.map((x) => [x.key, x]));
  assert.equal(byY.leads.prev, 2); assert.equal(byY.leads.change, 250); assert.equal(byY.sold.change, 100);
  assert.equal(y.channels!.find((c) => c.channel === "Meta Ads")!.prevCpl, null); // ไม่มีค่าโฆษณา ก.ย. 2025
  ok("เทียบปีก่อน: Leads 7 vs 2 → +250% · ขายได้ 2 vs 1 → +100% · ไม่มีค่าโฆษณาปีก่อน → แนวโน้ม CPL ว่าง");
}
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
