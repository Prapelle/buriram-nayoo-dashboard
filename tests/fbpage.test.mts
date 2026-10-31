// Phase 1 — Facebook Page: metric_date + Business Key (page_id + post_id + metric_date)
// รัน: npx tsx tests/fbpage.test.mts  (ต้องมีไฟล์รายวัน Sep-01-2026_Sep-30-2026_*.csv และ Page.csv ใน tests/fixtures)
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const { buildPlan, detectSpec, parseInput, PlanError } = await import("../src/lib/import/plan");
const { toCsv, parseCsv } = await import("../src/lib/csv");
const { summarizeFb, perPost, excludePages } = await import("../src/lib/fbmetrics");
const { TABS } = await import("../src/lib/schema");

const DIR = process.env.FIXTURE_DIR ?? "tests/fixtures";
const DAILY = readdirSync(DIR).find((f) => /^Sep-01-2026_Sep-30-2026_.*\.csv$/.test(f));
if (!DAILY) throw new Error("ไม่พบไฟล์ Facebook Page รายวันใน tests/fixtures");
const dailyText = readFileSync(`${DIR}/${DAILY}`, "utf8"), lifeText = readFileSync(`${DIR}/Page.csv`, "utf8");
let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };
type Existing = Map<string, { rowNumber: number; row: Record<string, string> }>;
const plan = (text: string, existing: Existing = new Map(), snapshotDate = "2026-10-27") => {
  const table = parseInput(text); const spec = detectSpec(table.headers).spec!;
  return { spec, p: buildPlan({ spec, table, ctx: { filename: "f.csv", area: "unknown", snapshotDate }, existing, areaMap: new Map() }) };
};
const store = (p: ReturnType<typeof plan>["p"], into: Existing = new Map()) => {
  let n = into.size + 2;
  for (const x of p.planned) if (x.rec && (x.status === "insert" || x.status === "update")) {
    const row = Object.fromEntries(Object.entries(x.rec).map(([k, v]) => [k, String(v)]));
    const ex = into.get(String(x.rec.row_key)); into.set(String(x.rec.row_key), { rowNumber: ex?.rowNumber ?? n++, row });
  }
  return into;
};
const recsOf = (p: ReturnType<typeof plan>["p"]) => p.planned.filter((x) => x.rec).map((x) => Object.fromEntries(Object.entries(x.rec!).map(([k, v]) => [k, String(v)])));
// ตารางต้นฉบับเพื่อคำนวณค่าที่คาดหวังโดยตรงจากไฟล์ (ไม่ใช้โค้ดที่ทดสอบ)
const src = parseCsv(dailyText); const H = src[0].map((h) => h.trim()); const col = (n: string) => H.indexOf(n);
const srcRows = src.slice(1);
const srcSum = (n: string) => Math.round(srcRows.reduce((s, r) => s + Number(r[col(n)] || 0), 0) * 1000) / 1000;
const rewrite = (fn: (rows: string[][]) => string[][]) => toCsv([src[0], ...fn(srcRows.map((r) => [...r]))]);

console.log("1) Mapping จาก Header จริง + Metric Date แยกจาก Publish Time");
assert.deepEqual(H.slice(0, 5), ["Post ID", "Page ID", "Page name", "Title", "Description"]); assert.ok(!H.includes("Reach") && !H.includes("Views"));
const { spec, p: d1 } = plan(dailyText);
assert.equal(spec.id, "fb_page"); assert.deepEqual(spec.keyFields, ["page_id", "post_id", "metric_date"]);
const tabH = TABS.find((t) => t.name === "FB_PAGE_POSTS")!.headers;
for (const r of recsOf(d1)) assert.deepEqual(Object.keys(r).filter((k) => !tabH.includes(k)), []);
assert.deepEqual(tabH.slice(0, 30), ["record_id","page_id","post_id","page_name","title","description","publish_time","permalink","post_type","metric_period_label","snapshot_date","views","reach","reactions_comments_shares","reactions","comments","shares","seconds_viewed","average_seconds_viewed","estimated_earnings_usd","ad_cpm_usd","ad_impressions","total_clicks","other_clicks","link_clicks","raw_json","row_key","source_batch_id","source_filename","imported_at"]);
ok("ไฟล์รายวันตรวจเป็น Facebook Page แม้ไม่มี Reach/Views, คอลัมน์เดิม 30 คอลัมน์ลำดับเดิม คอลัมน์ใหม่ต่อท้ายเท่านั้น");
const r0 = recsOf(d1).find((r) => r.metric_period_label === "09/30/2026")!;
assert.equal(r0.metric_date, "2026-09-30"); assert.equal(r0.metric_scope, "daily"); assert.equal(r0.publish_time.length, 16);
const crossDay = recsOf(d1).find((r) => r.metric_date !== r.publish_time.slice(0, 10))!; assert.ok(crossDay, "ต้องมีแถวที่วันที่สถิติต่างจากวันเผยแพร่");
assert.equal(d1.info!.metric!.order, "MDY"); assert.equal(d1.info!.metric!.ambiguous, false); assert.deepEqual([d1.info!.metric!.from, d1.info!.metric!.to], ["2026-09-03", "2026-09-30"]);
assert.ok(JSON.parse(r0.raw_json)["Date"] === "09/30/2026" && "Funded content status" in JSON.parse(r0.raw_json));
ok("Date 09/30/2026 → metric_date 2026-09-30 (ตรวจลำดับเดือน/วันจากค่าทั้งไฟล์), publish_time เก็บแยก, ต้นฉบับครบใน raw_json");

console.log("2) จำนวนแถวและยอดรวม (ข้อมูลไม่หาย)");
assert.equal(d1.counts.total, srcRows.length); assert.equal(d1.counts.invalid, 0); assert.equal(d1.errors.length, 0);
const zeroPre = srcRows.filter((r) => { const d = r[col("Date")], p = r[col("Publish time")]; const iso = (s: string) => `${s.slice(6, 10)}-${s.slice(0, 2)}-${s.slice(3, 5)}`;
  return iso(d) < iso(p) && ["Reactions, Comments and Shares","Reactions","Comments","Shares","Seconds viewed","Average Seconds viewed","Estimated earnings (USD)","Ad CPM (USD)","Ad impressions"].every((c) => Number(r[col(c)] || 0) === 0); }).length;
assert.equal(d1.counts.skip, zeroPre); assert.equal(d1.counts.insert, srcRows.length - zeroPre); assert.equal(d1.info!.metric!.prePublishZero, zeroPre);
const sumRec = (k: string) => Math.round(recsOf(d1).reduce((s, r) => s + Number(r[k] || 0), 0) * 1000) / 1000;
for (const [c, k] of [["Reactions","reactions"],["Comments","comments"],["Shares","shares"],["Reactions, Comments and Shares","reactions_comments_shares"],["Seconds viewed","seconds_viewed"],["Ad impressions","ad_impressions"]]) assert.equal(sumRec(k), srcSum(c), c);
ok(`${srcRows.length} แถว → เพิ่ม ${d1.counts.insert}, ข้าม ${zeroPre} (วันก่อนเผยแพร่ที่ไม่มีสถิติเลย) · ยอดรวมทุกตัวเท่ากับทั้งไฟล์ (Reactions ${srcSum("Reactions")}, Seconds viewed ${srcSum("Seconds viewed")})`);
const kept = recsOf(d1).filter((r) => r.metric_date < r.publish_time.slice(0, 10));
assert.ok(kept.length >= 1 && kept.every((r) => Number(r.seconds_viewed) > 0 || Number(r.reactions) > 0 || Number(r.ad_impressions) > 0)); assert.ok(d1.warnings.some((w) => w.includes("ก่อนวันเผยแพร่โพสต์")));
ok(`แถวก่อนวันเผยแพร่ที่ "มีสถิติ" ถูกเก็บไว้ (${kept.length} แถว) และแจ้งเตือน`);
assert.equal(new Set(recsOf(d1).map((r) => r.row_key)).size, d1.counts.insert); ok("row_key ไม่ซ้ำ (page_id|post_id|metric_date)");

console.log("3) กันซ้ำ / วันใหม่ของโพสต์เดิม / ค่าเปลี่ยน");
const db = store(d1);
const again = plan(dailyText, db).p; assert.deepEqual([again.counts.insert, again.counts.update, again.counts.skip], [0, 0, srcRows.length]); ok("นำเข้าไฟล์เดิมซ้ำ: เพิ่ม 0 อัปเดต 0 (ไม่มีข้อมูลซ้ำ)");
const di = (n: string) => col(n);
const newDay = rewrite((rows) => {
  const late = rows.filter((r) => r[di("Date")] >= "09/15/2026");             // ทับกับข้อมูลเดิมบางส่วน (15–30 ก.ย.)
  const oct = rows.filter((r) => r[di("Date")] === "09/30/2026").map((r) => { const x = [...r]; x[di("Date")] = "10/01/2026"; x[di("Reactions")] = "7"; return x; });
  return [...late, ...oct];
});
const p2 = plan(newDay, db).p; const octRows = srcRows.filter((r) => r[di("Date")] === "09/30/2026").length;
assert.equal(p2.counts.insert, octRows); assert.equal(p2.counts.update, 0); assert.equal(p2.counts.invalid, 0);
assert.ok(recsOf(p2).filter((r) => r.metric_date === "2026-10-01").length === octRows);
store(p2, db); const postWithOct = recsOf(p2).find((r) => r.metric_date === "2026-10-01")!;
assert.ok([...db.values()].filter((x) => x.row.post_id === postWithOct.post_id).length >= 2);
ok(`ไฟล์ที่ทับข้อมูลเดิมบางส่วน + วันใหม่: เพิ่มเฉพาะวันใหม่ ${octRows} แถว (โพสต์เดิมมีหลายแถวตามวัน) ส่วนที่ทับถูกข้าม`);
const changed = rewrite((rows) => rows.map((r) => (r[di("Date")] === "09/30/2026" && r[di("Post ID")] === srcRows[0][di("Post ID")] ? Object.assign([...r], { [di("Reactions")]: "999" }) : r)));
const p3 = plan(changed, db).p; assert.equal(p3.counts.update, 1); assert.equal(p3.counts.insert, 0);
assert.equal(p3.planned.find((x) => x.status === "update")!.rec!.reactions, 999);
ok("ค่าของวันเดิมเปลี่ยน (Facebook ปรับตัวเลขย้อนหลัง) → อัปเดต 1 แถวตามคีย์ ไม่สร้างแถวใหม่");
const dupInFile = rewrite((rows) => [...rows, rows.find((r) => r[di("Date")] === "09/30/2026")!]);
const p4 = plan(dupInFile).p; assert.equal(p4.errors.filter((e) => e.code === "DUPLICATE_IN_FILE").length, 1); ok("แถวซ้ำ (Post + Date เดียวกัน) ในไฟล์เดียวกัน → ไม่นับซ้ำ แจ้งเป็นข้อผิดพลาด");

console.log("4) รูปแบบวันที่ / ข้อมูลผิด");
const dmy = rewrite((rows) => rows.map((r) => { const x = [...r]; const [m, d, y] = x[di("Date")].split("/"); x[di("Date")] = `${d}/${m}/${y}`; return x; }));
const p5 = plan(dmy).p; assert.equal(p5.info!.metric!.order, "DMY"); assert.deepEqual(recsOf(p5).map((r) => r.row_key).sort(), recsOf(d1).map((r) => r.row_key).sort());
const isoF = rewrite((rows) => rows.map((r) => { const x = [...r]; const [m, d, y] = x[di("Date")].split("/"); x[di("Date")] = `${y}-${m}-${d}`; return x; }));
assert.deepEqual(recsOf(plan(isoF).p).map((r) => r.row_key).sort(), recsOf(d1).map((r) => r.row_key).sort());
ok("ไฟล์รูปแบบ วัน/เดือน/ปี และ YYYY-MM-DD ได้ metric_date ตรงกับไฟล์ต้นฉบับทุกแถว");
const amb = rewrite((rows) => rows.filter((r) => Number(r[di("Date")].slice(3, 5)) <= 12));
const p6 = plan(amb).p; assert.equal(p6.info!.metric!.ambiguous, true); assert.ok(p6.warnings.some((w) => w.includes("แยก วัน/เดือน ไม่ได้")));
ok("วันที่ทุกค่า ≤ 12 (แยกวัน/เดือนไม่ได้) → ใช้ เดือน/วัน ตาม Facebook และแจ้งเตือนให้ตรวจ");
const mixed = rewrite((rows) => rows.map((r, i) => { const x = [...r]; if (i === 0) x[di("Date")] = "25/09/2026"; return x; }));
assert.throws(() => plan(mixed), (e: unknown) => e instanceof PlanError && e.code === "DATE_FORMAT_CONFLICT"); ok("ไฟล์มีทั้ง วัน/เดือน และ เดือน/วัน ปนกัน → ปฏิเสธ (ไม่เดา)");
const bad = rewrite((rows) => rows.map((r, i) => { const x = [...r]; if (i === 300) x[di("Date")] = "02/30/2026"; if (i === 301) x[di("Date")] = ""; if (i === 302) x[di("Reactions")] = "abc"; return x; }));
const p7 = plan(bad).p; assert.deepEqual(p7.errors.map((e) => e.code).sort(), ["INVALID_DATE", "INVALID_NUMBER", "REQUIRED_BLANK"]); assert.deepEqual(p7.errors.map((e) => e.row).sort(), [302, 303, 304]);
ok("วันที่ไม่มีจริง (30 ก.พ.) / Date ว่าง / ตัวเลขผิด → แจ้งรายแถวพร้อมเลขแถว ไม่หยุดทั้งไฟล์");
const noDate = toCsv([src[0].filter((_, i) => i !== di("Date")), ...srcRows.map((r) => r.filter((_, i) => i !== di("Date")))]);
assert.equal(detectSpec(parseInput(noDate).headers).spec, undefined); ok("ไฟล์ที่ไม่มีคอลัมน์ Date → ไม่ถูกตีเป็น Facebook Page (ไม่สร้าง metric_date ขึ้นเอง)");
assert.ok(d1.warnings.some((w) => w.includes("Views") && w.includes("Reach"))); ok("คอลัมน์ที่ไม่มีในไฟล์ (Views, Reach, Clicks) → เตือนและเว้นว่าง ไม่ทำให้นำเข้าล้มเหลว");

console.log("5) Lifetime (Page.csv) ยังใช้ได้");
const { p: l1 } = plan(lifeText); const lrec = recsOf(l1);
assert.equal(l1.counts.insert, lrec.length); assert.ok(lrec.every((r) => r.metric_scope === "lifetime" && r.metric_date === "2026-10-27"));
const l2 = plan(lifeText, store(l1), "2026-11-05").p; assert.equal(l2.counts.insert, lrec.length); ok("Lifetime: metric_date = วันส่งออกที่ยืนยัน; ส่งออกวันอื่นได้เป็นอีก snapshot (ไม่ทับของเดิม)");

console.log("6) กฎการสรุป (ไม่นับซ้ำ)");
const dailyRows = recsOf(d1);
const s1 = summarizeFb(dailyRows, {}); assert.equal(s1.basis, "daily"); assert.equal(s1.daily.reactions, srcSum("Reactions")); assert.equal(s1.daily.reach, null); assert.equal(s1.daily.link_clicks, null);
assert.equal(s1.publishedPosts, new Set(srcRows.map((r) => r[0])).size); ok("รายวัน: รวมข้ามวันได้; Reach/Link Clicks ที่ไม่มีในไฟล์ = ไม่มีข้อมูล (ไม่ใช่ 0)");
const week = summarizeFb(dailyRows, { from: "2026-09-24", to: "2026-09-30" });
const expWeek = srcRows.filter((r) => r[di("Date")] >= "09/24/2026").reduce((s, r) => s + Number(r[di("Reactions")]), 0);
assert.equal(week.daily.reactions, expWeek); assert.equal(week.daily.from >= "2026-09-24", true);
const pubWeek = new Set(srcRows.filter((r) => r[di("Publish time")].slice(0, 10) >= "09/24/2026").map((r) => r[0])).size; assert.equal(week.publishedPosts, pubWeek);
ok(`กรองวันที่ 24–30 ก.ย.: สถิติตามวันที่ของสถิติ (Reactions ${expWeek}) แยกจากจำนวนโพสต์ตามวันเผยแพร่ (${pubWeek} โพสต์)`);
const snapA = lrec.map((r) => ({ ...r })), snapB = lrec.map((r) => ({ ...r, metric_date: "2026-11-05", reach: String(Number(r.reach || 0) + 10) }));
const s2 = summarizeFb([...snapA, ...snapB], {});
assert.equal(s2.basis, "lifetime"); assert.equal(s2.lifetime.reach, lrec.reduce((s, r) => s + Number(r.reach || 0), 0) + 10 * lrec.filter((r) => r.reach !== undefined).length); assert.equal(s2.lifetime.snapshot, "2026-11-05");
ok("Lifetime 2 ครั้งส่งออก: ใช้เฉพาะครั้งล่าสุดของแต่ละโพสต์ ไม่บวก snapshot ซ้ำ");
const s3 = summarizeFb([...dailyRows, ...snapA], {}); const dailyPostSet = new Set(dailyRows.map((r) => `${r.page_id}|${r.post_id}`));
assert.equal(s3.basis, "daily"); assert.equal(s3.daily.reactions, srcSum("Reactions")); assert.equal(s3.lifetimeOnlyPosts, new Set(snapA.filter((r) => !dailyPostSet.has(`${r.page_id}|${r.post_id}`)).map((r) => r.post_id)).size);
ok(`มีทั้งรายวันและ Lifetime: ยอดใช้รายวันเท่านั้น ไม่บวก Lifetime (แจ้งว่ามี ${s3.lifetimeOnlyPosts} โพสต์ที่มีแต่ Lifetime)`);
const pp = perPost(dailyRows, {}); assert.equal(pp.length, s1.daily.posts); assert.equal(pp.reduce((s, r) => s + Number(r.reactions), 0), srcSum("Reactions"));
assert.ok(pp.every((r) => r.average_seconds_viewed === undefined || !isNaN(Number(r.average_seconds_viewed)))); ok("สรุปรายโพสต์: 1 แถวต่อโพสต์ รวมแล้วเท่ากับยอดทั้งหมด");
const ex = excludePages(dailyRows, ["BAAN Prompt Community - Buriram&Surin"]); const sEx = summarizeFb(ex.kept, {});
const expEx = srcRows.filter((r) => r[di("Page name")] !== "BAAN Prompt Community - Buriram&Surin").reduce((s, r) => s + Number(r[di("Reactions, Comments and Shares")]), 0);
assert.equal(ex.excludedPosts, 1); assert.equal(sEx.daily.reactions_comments_shares, expEx); ok(`ตัดเพจ BAAN: ตัด 1 โพสต์, Reactions+Comments+Shares เหลือ ${expEx}`);

console.log("9) Facebook Page ระดับเพจ: Viewers / Link clicks รายวัน (Meta Business Suite, UTF-16)");
{
  const { decodeText } = await import("../src/lib/csv");
  const { pageMetric, VIEWERS_REMARK } = await import("../src/lib/fbmetrics");
  const raw = (f: string) => readFileSync(`${DIR}/fbpage/${f}`);
  const vBytes = raw("Viewers.csv"), cBytes = raw("Link_clicks.csv");
  assert.equal(vBytes[0], 0xff); assert.equal(vBytes[1], 0xfe); // UTF-16 LE BOM จากไฟล์จริง
  const vText = decodeText(vBytes), cText = decodeText(cBytes);
  assert.ok(vText.startsWith("sep=,")); assert.equal(decodeText(new TextEncoder().encode("﻿a,b")), "a,b");
  // ค่าที่คาดหวังจากไฟล์ต้นฉบับโดยตรง (ไม่ผ่านโค้ดที่ทดสอบ)
  const expect = (t: string) => t.split(/\r?\n/).map((l) => /^"(\d{4}-\d{2}-\d{2})T00:00:00","(\d+)"$/.exec(l.trim())).filter(Boolean).map((m) => [m![1], Number(m![2])] as const);
  const ev = expect(vText), ec = expect(cText);
  assert.equal(ev.length, 30); assert.equal(ec.length, 30);
  const sumV = ev.reduce((a, [, v]) => a + v, 0), sumC = ec.reduce((a, [, v]) => a + v, 0);
  const pv = plan(vText), pc = plan(cText);
  assert.equal(pv.spec.id, "fb_page_viewers"); assert.equal(pc.spec.id, "fb_page_link_clicks"); assert.equal(pv.spec.tab, "FB_PAGE_INSIGHTS");
  assert.deepEqual(pv.p.counts, { total: 30, insert: 30, update: 0, skip: 0, invalid: 0 }); assert.deepEqual(pv.p.errors, []); assert.deepEqual(pv.p.period, { start: "2026-09-01", end: "2026-09-30" });
  const rv = recsOf(pv.p), rc = recsOf(pc.p);
  assert.ok(rv.every((r) => r.metric === "viewers" && /^\d{4}-\d{2}-\d{2}$/.test(r.metric_date))); assert.equal(rv[8].metric_date, "2026-09-09"); assert.equal(rv[8].value, "72580");
  assert.equal(rv.reduce((a, r) => a + Number(r.value), 0), sumV); assert.equal(rc.reduce((a, r) => a + Number(r.value), 0), sumC);
  ok(`ไฟล์จริง UTF-16 + บรรทัด sep= + ชื่อตัวชี้วัด → ตรวจเป็น Viewers / Link clicks รายวัน · 30 วัน (01–30/09/2026) · Viewers รวม ${sumV.toLocaleString()} · Link clicks รวม ${sumC.toLocaleString()} ตรงกับไฟล์`);
  assert.ok(TABS.find((t) => t.name === "FB_PAGE_INSIGHTS")!.headers.every((h) => ["record_id", "metric", "metric_date", "value", "row_key", "raw_json", "source_batch_id", "source_filename", "imported_at"].includes(h)));
  assert.notEqual(rv[0].row_key, rc[0].row_key); // วันเดียวกันคนละตัวชี้วัด ไม่ทับกัน
  const exV = store(pv.p); const again = plan(vText, exV);
  assert.deepEqual(again.p.counts, { total: 30, insert: 0, update: 0, skip: 30, invalid: 0 });
  const fixed = plan(vText.replace('"2026-09-09T00:00:00","72580"', '"2026-09-09T00:00:00","72600"'), exV);
  assert.equal(fixed.p.counts.update, 1); assert.equal(fixed.p.counts.skip, 29);
  ok("นำเข้าซ้ำ → ข้ามทั้ง 30 วัน (ไม่นับซ้ำ) · แก้ค่าวันเดียว → อัปเดต 1 วัน · Viewers กับ Link clicks วันเดียวกันใช้คีย์ต่างกัน");
  const bad = plan(vText.replace('"2026-09-09T00:00:00"', '"2026-02-30T00:00:00"')).p; assert.equal(bad.counts.invalid, 1); assert.equal(bad.errors[0].code, "INVALID_DATE");
  assert.equal(plan(vText.replace('"72580"', '"7,25x"')).p.counts.invalid, 1);
  ok("วันที่ผิด (30 ก.พ.) / ตัวเลขผิด → แถวนั้นไม่ผ่าน (ไม่เขียนลง Sheet)");
  const rows = [...rv, ...rc].map((r) => ({ ...r, imported_at: "2026-10-28T00:00:00Z" }));
  const all = pageMetric(rows, "viewers", { from: "2026-09-01", to: "2026-09-30" })!;
  assert.equal(all.sum, sumV); assert.equal(all.days, 30); assert.equal(all.incomplete, undefined);
  const part = pageMetric(rows, "viewers", { from: "2026-09-10", to: "2026-09-12" })!;
  assert.equal(part.sum, 93295 + 46502 + 34273);
  const over = pageMetric(rows, "viewers", { from: "2026-08-30", to: "2026-10-02" })!;
  assert.equal(over.sum, sumV); assert.match(over.incomplete!, /4 วัน \(30 ส.ค. 69–31 ส.ค. 69, 1 ต.ค. 69–2 ต.ค. 69\)/);
  assert.equal(pageMetric(rows, "viewers", { from: "2026-10-01", to: "2026-10-31" }), null);
  const dupDay = [...rows, { metric: "viewers", metric_date: "2026-09-01", value: "99999", imported_at: "2026-10-29T00:00:00Z" }];
  assert.equal(pageMetric(dupDay, "viewers", { from: "2026-09-01", to: "2026-09-01" })!.sum, 99999);
  assert.equal(VIEWERS_REMARK, "ใช้ Viewers เทียบเคียง Reach");
  ok("รวมตามช่วงได้ (10–12 ก.ย. = 174,070) · ช่วงเกินข้อมูล → ข้อมูลไม่ครบ ระบุวันที่ขาด · ไม่มีข้อมูล = รอข้อมูล (ไม่ใช่ 0) · วันเดียวกันนำเข้าซ้ำใช้ค่าล่าสุด");
}
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
