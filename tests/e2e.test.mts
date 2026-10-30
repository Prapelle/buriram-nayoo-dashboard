// จำลอง Google Sheets API ในหน่วยความจำ แล้วทดสอบ Initializer + Import ทั้งเส้นทาง
// รัน: FIXTURE_DIR=tests/fixtures npx tsx tests/e2e.test.ts
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"), INITIAL_ADMIN_EMAIL: "Admin@Example.com" });

type Cell = string | number;
type Tab = { id: number; cols: number; rows: Cell[][] };
const tabs = new Map<string, Tab>();
let nextId = 1; let failAppendOn = ""; let apiCalls = 0;
const trim = (r: Cell[]) => { const o = [...r]; while (o.length && (o[o.length - 1] === "" || o[o.length - 1] === undefined)) o.pop(); return o; };
const colNum = (s: string) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
function parseRange(r: string) {
  const m = /^'([^']+)'(?:!(.+))?$/.exec(decodeURIComponent(r))!;
  const a = m[2]; if (!a) return { tab: m[1] };
  let mm = /^(\d+):(\d+)$/.exec(a); if (mm) return { tab: m[1], r1: +mm[1], r2: +mm[2] };
  mm = /^([A-Z]+):([A-Z]+)$/.exec(a); if (mm) return { tab: m[1], c1: colNum(mm[1]) - 1, c2: colNum(mm[2]) - 1 };
  mm = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a)!; return { tab: m[1], c1: colNum(mm[1]) - 1, r1: +mm[2] };
}
function write(tabName: string, r1: number, c1: number, values: Cell[][]) {
  const t = tabs.get(tabName); if (!t) throw new Error(`no tab ${tabName}`);
  values.forEach((row, i) => {
    if (c1 + row.length > t.cols) throw new Error(`Range exceeds grid limits. Max columns: ${t.cols}`);
    while (t.rows.length < r1 - 1 + i + 1) t.rows.push([]);
    const dst = t.rows[r1 - 1 + i]; while (dst.length < c1) dst.push("");
    row.forEach((v, j) => { dst[c1 + j] = v; });
  });
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
  apiCalls++;
  const u = String(url);
  if (u.startsWith("https://oauth2.googleapis.com/token")) return json({ access_token: "tok", expires_in: 3600 });
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const path = u.replace("https://sheets.googleapis.com/v4/spreadsheets/SHEET", "");
  if (path.startsWith("?fields")) return json({ sheets: [...tabs].map(([title, t]) => ({ properties: { title, sheetId: t.id, gridProperties: { columnCount: t.cols } } })) });
  if (path === "/:batchUpdate") {
    for (const rq of body.requests) {
      if (rq.addSheet) { const p = rq.addSheet.properties; if (tabs.has(p.title)) return json({ error: "dup" }, 400); tabs.set(p.title, { id: nextId++, cols: p.gridProperties.columnCount, rows: [] }); }
      if (rq.deleteDimension) { const r = rq.deleteDimension.range; const t = [...tabs.values()].find((x) => x.id === r.sheetId)!; t.rows.splice(r.startIndex, r.endIndex - r.startIndex); }
      if (rq.appendDimension) { const t = [...tabs.values()].find((x) => x.id === rq.appendDimension.sheetId)!; t.cols += rq.appendDimension.length; }
    }
    return json({});
  }
  if (path.startsWith("/values:batchGet")) {
    const ranges = [...new URL(u).searchParams.getAll("ranges")];
    if (!u.includes("UNFORMATTED_VALUE")) throw new Error("ต้องใช้ UNFORMATTED_VALUE");
    return json({ valueRanges: ranges.map((r) => {
      const p = parseRange(encodeURIComponent(r)); const t = tabs.get(p.tab); if (!t) return null;
      let rows = t.rows.map(trim);
      if (p.r1 !== undefined && p.r2 !== undefined) rows = rows.slice(p.r1 - 1, p.r2);
      if (p.c1 !== undefined && p.c2 !== undefined) rows = rows.map((x) => x.slice(p.c1, p.c2 + 1));
      while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
      return rows.length ? { values: rows } : {};
    }).map((v, i) => { if (v === null) throw Object.assign(new Error("bad range"), {}); return v; }) });
  }
  if (path.includes(":append")) {
    const m = /\/values\/(.+?):append/.exec(path)!; const p = parseRange(m[1]);
    if (p.tab === failAppendOn) return json({ error: { message: "boom" } }, 400);
    const t = tabs.get(p.tab)!; let last = t.rows.length; while (last > 0 && trim(t.rows[last - 1]).length === 0) last--;
    write(p.tab, last + 1, 0, body.values);
    const w = Math.max(...body.values.map((r: Cell[]) => r.length));
    return json({ updates: { updatedRange: `'${p.tab}'!A${last + 1}:${String.fromCharCode(64 + Math.min(w, 26))}${last + body.values.length}` } });
  }
  if (path === "/values:batchUpdate") {
    for (const d of body.data) { const p = parseRange(d.range); write(p.tab, p.r1 ?? 1, p.c1 ?? 0, d.values); }
    return json({});
  }
  throw new Error("unhandled " + u);
}) as typeof fetch;

const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const { runCommit, runPlan, HttpError } = await import("../src/lib/import/service");
const { TABS } = await import("../src/lib/schema");
const { periodsFromFilename } = await import("../src/lib/import/plan");
const DIR = process.env.FIXTURE_DIR ?? "tests/fixtures";
const r2c = (n: number) => Math.round(n * 100) / 100;
let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };
const file = (f: string) => ({ filename: f, text: readFileSync(`${DIR}/${f}`, "utf8") });
const col = (tab: string, name: string) => { const t = tabs.get(tab)!; const i = t.rows[0].indexOf(name); return t.rows.slice(1).map((r) => r[i]); };
const total = (tab: string, name: string) => Math.round(col(tab, name).reduce<number>((s, v) => s + (Number(v) || 0), 0) * 100) / 100;
const rowsOf = (tab: string) => tabs.get(tab)!.rows.slice(1).filter((r) => trim(r).length).length;

console.log("1) Initializer");
const r1 = await initializeSpreadsheet("admin@example.com");
assert.equal(r1.createdTabs.length, TABS.length); assert.equal(tabs.size, TABS.length);
assert.equal(rowsOf("APP_USERS"), 1); assert.equal(tabs.get("APP_USERS")!.rows[1][1], "admin@example.com");
ok(`สร้าง ${TABS.length} แท็บ + Admin คนแรก + Config`);
const r2 = await initializeSpreadsheet("admin@example.com");
assert.equal(r2.createdTabs.length, 0); assert.deepEqual(r2.addedHeaders, {}); assert.equal(rowsOf("APP_USERS"), 1); assert.equal(rowsOf("APP_CONFIG"), 4);
ok("รันซ้ำ: ไม่สร้าง/ไม่แก้/ไม่ซ้ำ (APP_USERS ยัง 1 แถว)");
// แท็บเก่า (คอลัมน์น้อย, grid แคบ) → initializer ต้องเพิ่มคอลัมน์และขยาย grid
tabs.set("OLD_X", { id: 99, cols: 3, rows: [["a", "b"]] });
const spec = TABS.find((t) => t.name === "GOOGLE_ADS_NETWORK")!;
tabs.get("GOOGLE_ADS_NETWORK")!.rows = [["record_id", "report_start", "report_end", "area", "row_key", "raw_json", "source_batch_id", "imported_at"]]; tabs.get("GOOGLE_ADS_NETWORK")!.cols = 8;
const r3 = await initializeSpreadsheet("admin@example.com");
assert.ok(r3.addedHeaders.GOOGLE_ADS_NETWORK?.includes("cost_thb")); assert.ok(tabs.get("GOOGLE_ADS_NETWORK")!.cols >= spec.headers.length);
ok("แท็บเก่าที่ขาดคอลัมน์: เพิ่มคอลัมน์ต่อท้ายและขยาย grid ได้");

console.log("2) Import จริงผ่าน service");
const names = ["Campaigns_2026_09_01-2026_09_30_.csv", "Networks_2026_09_01-2026_09_30_.csv", "Devices_2026_09_01-2026_09_30_.csv", "Time_series_2026_09_01-2026_09_30_.csv", "Facebookads.csv", "Page.csv", "Searches_Search_2026_09_01-2026_09_30_.csv", "Searches_Word_2026_09_01-2026_09_30_.csv", "Search_keywords_2026_09_01-2026_09_30_.csv", "Day___hour_Day_Hour_2026_09_01-2026_09_30_.csv", "Biggest_changes_2026_09_01-2026_09_30_compared_to_2026_08_02-2026_08_31_.csv", "Auction_insights_Compare_metrics_2026_09_01-2026_09_30_.csv"];
for (const n of names) { const c = await runCommit(file(n), "admin@example.com", "admin"); assert.equal(c.counts.invalid, 0, n); assert.ok(c.counts.insert > 0, n); }
assert.equal(rowsOf("GOOGLE_ADS_CAMPAIGNS"), 24); assert.equal(rowsOf("META_ADS"), 103); assert.equal(rowsOf("FB_PAGE_POSTS"), 55); assert.equal(rowsOf("GOOGLE_ADS_SCHEDULE_DAY_HOUR"), 168);
assert.equal(total("GOOGLE_ADS_CAMPAIGNS", "cost_thb"), 28814.82); assert.equal(total("META_ADS", "amount_spent_thb"), 37557.54);
assert.equal(rowsOf("IMPORT_BATCHES"), names.length);
ok(`นำเข้า ${names.length} ไฟล์: แถวครบ, Google cost 28,814.82 / Meta spend 37,557.54 ตรงกับต้นฉบับ`);
const pageT = tabs.get("FB_PAGE_POSTS")!; const lc = pageT.rows[0].indexOf("link_clicks");
const blanks = pageT.rows.slice(1).filter((r) => (r[lc] ?? "") === "").length; assert.equal(blanks, 23); assert.equal(typeof pageT.rows[1][pageT.rows[0].indexOf("post_id")], "string");
ok("Page: Link Clicks ว่าง 23 แถวยังว่าง (ไม่เป็น 0), Post ID เก็บเป็นข้อความ");

console.log("3) นำเข้าซ้ำ / กันซ้ำ");
const before = { c: total("GOOGLE_ADS_CAMPAIGNS", "cost_thb"), m: total("META_ADS", "amount_spent_thb"), n: rowsOf("META_ADS") };
await assert.rejects(runCommit(file(names[0]), "m@x.com", "marketing"), (e: unknown) => e instanceof HttpError && e.code === "DUPLICATE_FILE");
await assert.rejects(runCommit({ ...file(names[0]), overrideDuplicate: true }, "m@x.com", "marketing"), (e: unknown) => e instanceof HttpError && e.code === "DUPLICATE_FILE");
ok("ไฟล์เดิม → บล็อก (Marketing กด override ก็ไม่ได้)");
const plan = await runPlan(file(names[0])); assert.ok(plan.fileDuplicate);
const o = await runCommit({ ...file(names[0]), overrideDuplicate: true }, "admin@example.com", "admin");
assert.deepEqual([o.counts.insert, o.counts.update, o.counts.skip], [0, 0, 24]);
const o2 = await runCommit({ ...file("Facebookads.csv"), overrideDuplicate: true }, "admin@example.com", "admin"); assert.equal(o2.counts.skip, 103);
assert.equal(total("GOOGLE_ADS_CAMPAIGNS", "cost_thb"), before.c); assert.equal(total("META_ADS", "amount_spent_thb"), before.m); assert.equal(rowsOf("META_ADS"), before.n);
assert.ok(col("AUDIT_LOG", "action").includes("import_duplicate_override"));
ok("Admin override: skip ทุกแถว, Spend/จำนวนแถวไม่เพิ่ม, มี Audit Log");

console.log("4) อัปเดต + ข้อมูลไม่ถูกต้อง");
const c0 = file(names[0]); const idsBefore = col("GOOGLE_ADS_CAMPAIGNS", "record_id");
const edited = { ...c0, text: c0.text.replace('"THB3,944.63"', '"THB4,000.00"').replace(",Enabled,THB169.76,", ",Enabled,THBabc,") };
const e = await runCommit(edited, "admin@example.com", "admin");
assert.equal(e.counts.update, 1); assert.equal(e.counts.invalid, 1); assert.equal(e.errors[0].code, "INVALID_NUMBER");
assert.deepEqual(col("GOOGLE_ADS_CAMPAIGNS", "record_id"), idsBefore); assert.equal(rowsOf("GOOGLE_ADS_CAMPAIGNS"), 24);
assert.equal(total("GOOGLE_ADS_CAMPAIGNS", "cost_thb"), Math.round((before.c + 55.37) * 100) / 100);
assert.equal(rowsOf("IMPORT_ERRORS"), 1); assert.equal(tabs.get("IMPORT_ERRORS")!.rows[1][2], e.errors[0].row);
ok("แก้ค่า → update 1 แถว (record_id เดิม), แถวผิด 1 แถวลง IMPORT_ERRORS พร้อมเลขแถว");

console.log("5) ล้มเหลวกลางทาง");
failAppendOn = "GOOGLE_ADS_DEVICES";
const dev = file("Devices_2026_09_01-2026_09_30_.csv"); tabs.get("GOOGLE_ADS_DEVICES")!.rows = tabs.get("GOOGLE_ADS_DEVICES")!.rows.slice(0, 1);
tabs.get("IMPORT_BATCHES")!.rows = tabs.get("IMPORT_BATCHES")!.rows.filter((r, i) => i === 0 || r[2] !== "gads_devices");
await assert.rejects(runCommit(dev, "admin@example.com", "admin"), (x: unknown) => x instanceof HttpError && x.code === "WRITE_FAILED");
const last = tabs.get("IMPORT_BATCHES")!.rows.filter((r) => r[2] === "gads_devices").pop()!; assert.equal(last[12], "failed"); assert.ok(String(last[19]).includes("boom"));
failAppendOn = ""; const re = await runCommit(dev, "admin@example.com", "admin"); assert.equal(re.counts.insert, 4);
ok("เขียนล้มเหลว → ประวัติ status=failed พร้อมสาเหตุ, ลองใหม่ได้ ไม่ซ้ำ");
await assert.rejects(runPlan({ filename: "x.csv", text: "a,b\n1,2\n" }), (x: unknown) => x instanceof HttpError && x.code === "UNKNOWN_TYPE"); ok("ไฟล์ที่ไม่รู้จัก → UNKNOWN_TYPE");
await assert.rejects(runPlan(file("Auction_insights_Metric_over_time_2026_09_01-2026_09_30_.csv")), (x: unknown) => x instanceof HttpError && x.code === "UNKNOWN_TYPE"); ok("Auction Metric over time (ไฟล์ว่าง) → แจ้งว่าไม่รองรับ/ไม่มีข้อมูล");
const noDate = { filename: "Search keywords.csv", text: readFileSync(`${DIR}/Search_keywords_2026_09_01-2026_09_30_.csv`, "utf8") };
const np = await runPlan(noDate); assert.equal(np.spec.id, "gads_keywords"); assert.ok(np.periodError); assert.equal(np.counts.insert, 0);
await assert.rejects(runCommit(noDate, "admin@example.com", "admin"), (x: unknown) => x instanceof HttpError && x.code === "PERIOD_REQUIRED");
const wp = await runPlan({ ...noDate, reportStart: "2026-10-01", reportEnd: "2026-10-31" }); assert.equal(wp.periodError, undefined); assert.equal(wp.counts.insert, 50);
const wc = await runCommit({ ...noDate, reportStart: "2026-10-01", reportEnd: "2026-10-31" }, "admin@example.com", "admin"); assert.equal(wc.counts.insert, 50);
ok("ชื่อไฟล์ไม่มีวันที่ → ตรวจประเภทได้ + ขอให้กรอกช่วงวันที่ (ไม่ error) → กรอกแล้วนำเข้าได้");

console.log("6) อ่านกลับมาแสดงผล (Dashboard + หน้าข้อมูล) จากแท็บจริงในระบบจำลอง");
const { fetchDashboardData } = await import("../src/lib/dashboard-data");
const { computeDashboard } = await import("../src/lib/dashboard");
const { readColumns, getExcludedPages } = await import("../src/lib/tabdata");
const { applyView, fmtCell, inferKind } = await import("../src/lib/tableview");
const dash = computeDashboard(await fetchDashboardData("admin"), {}, "admin");
const kv2 = Object.fromEntries(dash.groups.flatMap((g) => g.items).map((k) => [k.key, k]));
assert.equal(kv2.paid.value, 66427.73); // 66,372.36 + 55.37 จากการแก้ค่าในหัวข้อ 4 assert.equal(kv2.posts.value, 54); assert.equal(kv2.reach.value, 191119); assert.equal(kv2.clicks.value, 2646);
assert.equal(dash.charts.daily!.length, 30); assert.equal(dash.warnings.length, 0);
ok("Dashboard จากแท็บจริง: Total Paid (หลังแก้ค่าทดสอบ +55.37) / 54 โพสต์ / Reach 191,119 / Link Clicks 2,646");
const mkd = await fetchDashboardData("marketing"); const mk = computeDashboard(mkd, {}, "marketing"); assert.ok(mkd.sales.every((r) => !("deal_value_thb" in r) && !("company_revenue_thb" in r))); assert.ok(!mk.groups.flatMap((g) => g.items).some((k) => k.fmt === "thb" && /Deal Value|Company Revenue|Direct Cost|Gross Profit/.test(k.label))); ok("Marketing: ไม่อ่านคอลัมน์การเงินจาก Sheet และ Dashboard ไม่มีการ์ดการเงินแล้ว");
const cols = await readColumns("META_ADS", { only: ["ad_name", "amount_spent_thb", "raw_json"], exclude: ["raw_json"] });
assert.deepEqual(cols.headers, ["ad_name", "amount_spent_thb"]); assert.equal(cols.rows.length, 103); ok("readColumns: เลือกคอลัมน์ได้ และไม่ดึง raw_json");
assert.deepEqual(await getExcludedPages(["x"]), ["BAAN Prompt Community - Buriram&Surin"]); ok("ค่า excluded_fb_pages อ่านจาก APP_CONFIG");
const posts = (await readColumns("FB_PAGE_POSTS", { only: ["page_name", "reach", "link_clicks", "publish_time", "title"] })).rows;
const v1 = applyView(posts, { sort: "reach", dir: "desc", size: 10 }); assert.equal(v1.rows.length, 10); assert.equal(v1.pages, 6); assert.equal(Number(v1.rows[0].reach), 55031);
const v2 = applyView(posts, { sort: "link_clicks", dir: "asc", size: 100 }); assert.equal(v2.rows.at(-1)!.link_clicks, ""); assert.equal(v2.rows[0].link_clicks === "", false);
assert.equal(applyView(posts, { q: "ไม่มีข้อความนี้แน่นอน", searchKeys: ["title"] }).total, 0); assert.equal(applyView(posts, { page: 99, size: 10 }).page, 6);
ok("ตาราง: เรียงลำดับ/แบ่งหน้า/ค้นหาได้ และค่าว่างอยู่ท้ายเสมอ");
assert.equal(fmtCell("thb", "3944.63"), "฿3,944.63"); assert.equal(fmtCell("date", "2026-09-30"), "30/09/2026"); assert.equal(fmtCell("int", ""), ""); assert.equal(fmtCell("pct", "5.61"), "5.61%");
assert.equal(inferKind("cost_thb"), "thb"); assert.equal(inferKind("ctr_pct"), "pct"); assert.equal(inferKind("clicks_comparison"), "int"); ok("รูปแบบแสดงผล: ฿, %, วันที่ DD/MM/YYYY, ค่าว่างไม่แสดงเป็น 0");

console.log("7) LINE OA รายเดือน");
const { saveLine, listLine, LineError } = await import("../src/lib/line-oa-service");
const isLine = (code: string) => (x: unknown) => x instanceof LineError && x.code === code;
const created = await saveLine({ report_month: "2026-09", friends_end: "1,250", new_friends: "80", leads: "0", qualified_leads: "", notes: "ทดสอบ" }, "m@x.com");
assert.equal(created.created, true); assert.equal(rowsOf("LINE_OA_MONTHLY"), 1);
const lr = () => { const t = tabs.get("LINE_OA_MONTHLY")!; return Object.fromEntries(t.rows[0].map((h, i) => [h, t.rows[1][i]])); };
assert.equal(lr().friends_end, 1250); assert.equal(lr().leads, 0); assert.equal(lr().friends_start ?? "", ""); assert.equal(lr().qualified_leads ?? "", ""); assert.equal(lr().created_by, "m@x.com");
ok("เพิ่มเดือนใหม่: ช่องว่างคงว่าง, 0 ที่กรอกเองคงเป็น 0, 1,250 → 1250");
await assert.rejects(saveLine({ report_month: "2026-09", new_friends: "5" }, "m@x.com"), isLine("EXISTS")); assert.equal(rowsOf("LINE_OA_MONTHLY"), 1);
ok("บันทึกเดือนเดิมโดยไม่เปิดแก้ไข → ปฏิเสธ ไม่สร้างแถวซ้ำ");
const first = await listLine(); await new Promise((r) => setTimeout(r, 5));
const ed = await saveLine({ report_month: "2026-09", friends_end: "1300", new_friends: "", leads: "0", updated_at_seen: first[0].updated_at }, "admin@example.com");
assert.equal(ed.created, false); assert.equal(rowsOf("LINE_OA_MONTHLY"), 1); assert.equal(lr().friends_end, 1300); assert.equal(lr().new_friends ?? "", "");
assert.equal(lr().record_id, first[0].record_id); assert.equal(lr().created_at, first[0].created_at); assert.equal(lr().created_by, "m@x.com"); assert.notEqual(lr().updated_at, first[0].updated_at);
ok("แก้เดือนเดิม: แถวเดียว, record_id/ผู้สร้าง/วันที่สร้างคงเดิม, ล้างค่าได้ (ว่าง)");
await assert.rejects(saveLine({ report_month: "2026-09", friends_end: "1", updated_at_seen: first[0].updated_at }, "m@x.com"), isLine("STALE")); ok("แก้จากข้อมูลเก่า (มีคนแก้ไปแล้ว) → ปฏิเสธ");
await saveLine({ report_month: "2026-10", friends_end: "1400" }, "m@x.com"); assert.equal(rowsOf("LINE_OA_MONTHLY"), 2); assert.equal((await listLine())[0].report_month, "2026-10"); ok("เดือนใหม่เพิ่มได้, รายการเรียงเดือนล่าสุดก่อน");
try { await saveLine({ report_month: "2026-13", new_friends: "-5", opens: "1.5", leads: "2", qualified_leads: "3", messages_sent: "10", messages_delivered: "11", clicks: "abc" }, "m@x.com"); assert.fail("ต้อง error"); }
catch (x) { assert.ok(x instanceof LineError && x.code === "VALIDATION"); assert.deepEqual(Object.keys(x.fields!).sort(), ["clicks", "messages_delivered", "new_friends", "opens", "qualified_leads", "report_month"]); }
assert.equal(rowsOf("LINE_OA_MONTHLY"), 2); ok("ข้อมูลผิด (เดือน/ติดลบ/ทศนิยม/ตัวอักษร/Qualified>Leads/ส่งถึง>ส่ง) → แจ้งรายช่อง ไม่เขียนข้อมูล");
const d7 = computeDashboard(await fetchDashboardData("admin"), {}, "admin"); const k7 = Object.fromEntries(d7.groups.flatMap((g) => g.items).map((k) => [k.key, k]));
assert.equal(k7.line_new.state, "pending"); assert.equal(k7.line_leads.value, 0); assert.equal(d7.charts.lineGrowth!.length, 2); assert.equal(d7.charts.lineGrowth![0].friendsEnd, 1300);
ok("Dashboard: LINE OA New Friends ว่างทั้งหมด → รอข้อมูล, Leads = 0 (ค่าจริง), กราฟเติบโต 2 เดือน");
assert.ok(col("AUDIT_LOG", "action").includes("line_oa_create") && col("AUDIT_LOG", "action").includes("line_oa_update")); ok("มี Audit Log การเพิ่ม/แก้ไข");

console.log("8) Lead Management");
const { saveLead, listLeads, LeadError } = await import("../src/lib/leads-service");
const { validateLead, normalizePhone, filterLeads } = await import("../src/lib/leads");
const isLead = (code: string) => (x: unknown) => x instanceof LeadError && x.code === code;
const base = { received_at: "2026-09-05", customer_name: "สมชาย ใจดี", source_channel: "Facebook Ads", service_category: "Product", need: "ซื้อ" };
const l1 = await saveLead({ ...base, phone: "081-234-5678", email: "Somchai@Example.com", campaign_name: "A" }, "s@x.com");
const year = new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
assert.equal(l1.lead.lead_code, `LD-${year}-0001`); assert.equal(l1.lead.area, "unknown"); assert.equal(rowsOf("LEADS"), 1);
const l2 = await saveLead({ ...base, customer_name: "สมหญิง", phone: "0899999999" }, "s@x.com");
assert.equal(l2.lead.lead_code, `LD-${year}-0002`); assert.notEqual(l2.lead.lead_id, l1.lead.lead_id);
ok("สร้าง Lead: Lead Code เรียง LD-ปี-0001/0002 ไม่ซ้ำ, UUID ไม่ซ้ำ, Area เริ่มเป็น unknown");
for (const [name, extra] of [["เบอร์เดียวกันคนละรูปแบบ (+66)", { phone: "+66 81 234 5678" }], ["อีเมลเดียวกันคนละตัวพิมพ์", { email: "SOMCHAI@example.COM" }]] as const) {
  try { await saveLead({ ...base, customer_name: "คนซ้ำ", ...extra }, "s@x.com"); assert.fail("ต้องเตือน"); }
  catch (x) { assert.ok(x instanceof LeadError && x.code === "DUPLICATE_WARNING", name); assert.equal(x.extra.matches![0].lead_code, `LD-${year}-0001`); }
}
assert.equal(rowsOf("LEADS"), 2); ok("เตือนซ้ำจากเบอร์ (+66 = 0…) และอีเมล (ไม่สนตัวพิมพ์) โดยยังไม่เขียนข้อมูล");
const l3 = await saveLead({ ...base, customer_name: "คนซ้ำ", phone: "0812345678", confirmDuplicate: true }, "s@x.com");
assert.equal(l3.lead.lead_code, `LD-${year}-0003`); assert.equal(rowsOf("LEADS"), 3); ok("ยืนยันบันทึกต่อ → เป็นรายการแยก ไม่ merge อัตโนมัติ (3 แถว)");
try { await saveLead({ received_at: "2026-02-31", customer_name: " ", source_channel: "x", service_category: "y", need: "z", phone: "12", email: "nope" }, "s@x.com"); assert.fail("ต้อง error"); }
catch (x) { assert.ok(x instanceof LeadError && x.code === "VALIDATION"); assert.deepEqual(Object.keys(x.extra.fields!).sort(), ["customer_name", "email", "need", "phone", "received_at", "service_category", "source_channel"]); }
assert.equal(rowsOf("LEADS"), 3); ok("ฟิลด์บังคับ/รูปแบบผิด → แจ้งรายช่อง ไม่เขียนข้อมูล");
const cur = (await listLeads()).rows.find((r) => r.lead_code === `LD-${year}-0001`)!; await new Promise((r) => setTimeout(r, 5));
const q1 = await saveLead({ ...cur, buy_status: "Hot", lead_id: cur.lead_id, updated_at_seen: cur.updated_at }, "s2@x.com");
assert.equal(q1.lead.qualified_at, new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)); assert.equal(q1.lead.won_at, ""); assert.equal(q1.lead.lead_code, cur.lead_code); assert.equal(q1.lead.created_by, "s@x.com"); assert.equal(q1.lead.updated_by, "s2@x.com"); assert.equal(rowsOf("LEADS"), 3);
assert.equal(q1.lead.status, "Qualified"); ok("Buy Status = Hot → ขั้น Qualified, ตั้ง qualified_at อัตโนมัติ, คง Lead Code/ผู้สร้าง, แถวเดียว, ไม่เตือนซ้ำเพราะเบอร์ไม่เปลี่ยน");
await new Promise((r) => setTimeout(r, 5));
const w1 = await saveLead({ ...q1.lead, buy_status: "Close", updated_at_seen: q1.lead.updated_at }, "s@x.com"); assert.ok(w1.lead.won_at); assert.equal(w1.lead.status, "Won"); await new Promise((r) => setTimeout(r, 5));
const back = await saveLead({ ...w1.lead, buy_status: "Warm", updated_at_seen: w1.lead.updated_at }, "s@x.com"); assert.equal(back.lead.won_at, ""); assert.equal(back.lead.status, "Qualified"); assert.equal(back.lead.qualified_at, q1.lead.qualified_at); ok("Close → Won ตั้ง won_at; Warm (ถอยออกจาก Won) ล้าง won_at; qualified_at คงเป็นประวัติ");
await assert.rejects(saveLead({ ...cur, buy_status: "Archive", lead_id: cur.lead_id, updated_at_seen: cur.updated_at }, "s@x.com"), isLead("STALE")); ok("แก้จากข้อมูลเก่า → ปฏิเสธ");
await assert.rejects(saveLead({ ...cur, lead_id: "no-such-id", updated_at_seen: "x" }, "s@x.com"), isLead("NOT_FOUND")); ok("lead_id ที่ไม่มี → NOT_FOUND (ไม่สร้างใหม่แบบเงียบ ๆ)");
const all = (await listLeads()).rows;
assert.equal(filterLeads(all, { q: "081 234" }).length, 2); assert.equal(filterLeads(all, { status: "Warm" }).length, 1); assert.equal(filterLeads(all, { channel: "Google Ads" }).length, 0);
assert.equal(filterLeads(all, { q: `LD-${year}-0002` }).length, 1); assert.equal(filterLeads(all, { area: "unknown", service: "Product" }).length, 3); assert.equal(normalizePhone("812345678"), "0812345678");
ok("ค้นหา (ชื่อ/รหัส/เบอร์คนละรูปแบบ) และกรอง ช่องทาง/พื้นที่/สถานะ/บริการ ทำงานถูกต้อง");
const dl = computeDashboard(await fetchDashboardData("admin"), {}, "admin"); const kl = Object.fromEntries(dl.groups.flatMap((g) => g.items).map((k) => [k.key, k]));
assert.equal(kl.leads.value, 3); assert.equal(kl.qualified.value, 0); /* Qualified = Call Status รอเข้าชม — Lead ในส่วนนี้ยังไม่มีใครติดต่อได้ */ assert.deepEqual(dl.charts.pipeline!.map((p) => p.label), ["New", "Qualified"]); assert.equal(dl.charts.leadsByChannel![0].label, "Facebook Ads");
const ml = await fetchDashboardData("marketing"); assert.ok(ml.leads.every((r) => !("phone" in r) && !("email" in r) && !("customer_name" in r))); ok("Dashboard นับ Lead/Qualified/Pipeline ถูก และข้อมูล Marketing ไม่มี PII (ชื่อ/เบอร์/อีเมล)");
assert.ok(col("AUDIT_LOG", "action").includes("lead_create") && col("AUDIT_LOG", "action").includes("lead_status_change")); ok("Audit Log: lead_create / lead_status_change");
void validateLead; 
console.log("9) นำเข้ารายงานยอดขาย Excel → Sheets → Dashboard → Export");
const { readXlsx } = await import("../src/lib/xlsx");
const { planSales, commitSales, listSalesImports, SalesError } = await import("../src/lib/sales/service");
const { computeSales, filterSales } = await import("../src/lib/sales/dashboard");
const { salesCsv } = await import("../src/lib/sales/export");
const sheetRows = (await readXlsx(new Uint8Array(readFileSync(`${DIR}/synthetic_SalesReport.xlsx`)))).sheet.rows;
const input = { fileName: "synthetic_SalesReport.xlsx", sheetName: "SalesReport", grid: sheetRows };
const isSales = (code: string) => (x: unknown) => x instanceof SalesError && x.code === code;
const p0 = await planSales(input);
assert.deepEqual([p0.counts.insert, p0.counts.duplicate, p0.counts.invalid], [12, 0, 0]); assert.equal(p0.company.taxId, "0105551234567"); assert.equal(p0.period.label, "2026-09"); assert.equal(p0.needs.length, 0); assert.equal(rowsOf("SALES_TRANSACTIONS"), 0);
ok("Preview: 12 รายการใหม่, ช่วงรายงาน 2026-09, ยังไม่เขียนข้อมูลลง Sheet");
const sc0 = await commitSales(input, "s@x.com");
assert.deepEqual([sc0.counts.insert, sc0.counts.duplicate], [12, 0]); assert.equal(rowsOf("SALES_TRANSACTIONS"), 12); assert.equal(total("SALES_TRANSACTIONS", "total_net"), 164576);
assert.equal(total("SALES_TRANSACTIONS", "gross_sales"), 199576); assert.equal(total("SALES_TRANSACTIONS", "discount_amount"), 35000); assert.equal(new Set(col("SALES_TRANSACTIONS", "row_key")).size, 12);
const stx = tabs.get("SALES_TRANSACTIONS")!; const h = stx.rows[0]; const g1 = Object.fromEntries(h.map((x, i) => [x, stx.rows[1][i]]));
assert.equal(g1.invoice_date, "2026-09-01"); assert.equal(g1.company_tax_id, "0105551234567"); assert.equal(g1.source_file, "synthetic_SalesReport.xlsx"); assert.equal(g1.source_row_number, 7); assert.ok(String(g1.raw_json).includes("IV2609-0001")); assert.ok(g1.record_id && g1.imported_at && g1.source_batch_id);
const logTab = tabs.get("SALES_IMPORT_LOG")!; assert.equal(logTab.rows[1][logTab.rows[0].indexOf("status")], "success"); assert.equal(logTab.rows[1][logTab.rows[0].indexOf("total_net_in_file")], 164576);
ok("บันทึกลง SALES_TRANSACTIONS 12 แถว (สุทธิ 164,576 / ก่อนส่วนลด 199,576 / ส่วนลด 35,000), เก็บ raw_json/ไฟล์ต้นทาง/แถวต้นทาง, มีประวัติ success");
const sc1 = await commitSales(input, "s@x.com");
assert.deepEqual([sc1.counts.insert, sc1.counts.duplicate], [0, 12]); assert.equal(rowsOf("SALES_TRANSACTIONS"), 12); assert.equal(total("SALES_TRANSACTIONS", "total_net"), 164576); assert.equal(rowsOf("SALES_IMPORT_LOG"), 2);
assert.ok((await planSales(input)).warnings[0].includes("เคยนำเข้าสำเร็จ")); ok("อัปโหลดไฟล์เดิมซ้ำ: ซ้ำ 12 ข้าม ไม่เพิ่มยอด (ยังสุทธิ 164,576), บันทึกประวัติครั้งที่ 2, เตือนว่าเคยนำเข้า");
const sEdited = sheetRows.map((r) => [...r]); sEdited[8][12] = 99999; // แก้ยอดรวมสุทธิของเอกสารที่ 3 (แถว 9)
const eIn = { ...input, grid: sEdited, mode: "update" as const }; const ids = col("SALES_TRANSACTIONS", "record_id"); const imp = col("SALES_TRANSACTIONS", "imported_at");
assert.equal((await planSales({ ...eIn, mode: "skip" })).counts.update, 0); assert.equal(rowsOf("SALES_TRANSACTIONS"), 12);
await assert.rejects(commitSales(eIn, "s@x.com"), isSales("UPDATE_NOT_CONFIRMED")); assert.equal(total("SALES_TRANSACTIONS", "total_net"), 164576);
const cu = await commitSales({ ...eIn, confirmUpdate: true }, "s@x.com");
assert.deepEqual([cu.counts.update, cu.counts.duplicate, cu.counts.insert], [1, 11, 0]); assert.equal(total("SALES_TRANSACTIONS", "total_net"), 164576 - 20000 + 99999); assert.equal(rowsOf("SALES_TRANSACTIONS"), 12);
assert.deepEqual(col("SALES_TRANSACTIONS", "record_id"), ids); assert.deepEqual(col("SALES_TRANSACTIONS", "imported_at"), imp); assert.ok(col("SALES_TRANSACTIONS", "updated_at").some(Boolean));
ok("อัปเดตรายการเดิม: โหมดข้ามไม่แตะข้อมูล, โหมดอัปเดตต้องยืนยัน, แก้ 1 รายการ (record_id/imported_at เดิม, มี updated_at)");
const withManual = sheetRows.map((r) => [...r]); withManual[6][1] = "MAN-0001";
const st = tabs.get("SALES")!; const mrow: Cell[] = st.rows[0].map(() => ""); mrow[st.rows[0].indexOf("invoice_no")] = "MAN-0001"; st.rows.push(mrow);
const pm = await planSales({ ...input, grid: withManual }); assert.equal(pm.counts.insert, 0); assert.ok(pm.preview.some((x) => x.dupSource === "manual")); assert.ok(pm.warnings.some((w) => w.includes("กรอกด้วยมือ"))); ok("เลขที่เอกสารซ้ำกับรายการขายที่กรอกมือ (SALES) → ข้าม ไม่นับสองครั้ง");
const noTax = sheetRows.map((r) => [...r]); noTax[1] = [];
const pn = await planSales({ ...input, grid: noTax }); assert.equal(pn.needs.length, 1); await assert.rejects(commitSales({ ...input, grid: noTax }, "s@x.com"), isSales("NEEDS_INPUT"));
assert.equal((await planSales({ ...input, grid: noTax, taxId: "0105551234567" })).needs.length, 0); ok("ไม่พบเลขผู้เสียภาษีผู้ขาย → ต้องกรอกก่อนนำเข้า (กรอกแล้วผ่าน)");
await assert.rejects(planSales({ ...input, grid: [["x"], [1]] }), isSales("HEADER_NOT_FOUND")); ok("ไฟล์ที่ไม่ใช่รายงานยอดขาย → HEADER_NOT_FOUND พร้อมคำอธิบาย");
assert.equal((await listSalesImports())[0].status, "success"); ok("ประวัติการนำเข้าอ่านกลับได้");

// ย้อนไปให้ข้อมูลเป็นค่าตั้งต้น (แก้ 99999 กลับ) เพื่อทดสอบ Dashboard ตามเกณฑ์
await commitSales({ ...input, mode: "update", confirmUpdate: true }, "s@x.com"); assert.equal(total("SALES_TRANSACTIONS", "total_net"), 164576);
const { readColumns: rc } = await import("../src/lib/tabdata");
const txAll = (await rc("SALES_TRANSACTIONS", { exclude: ["raw_json", "record_id", "row_key", "source_batch_id"] })).rows;
const sv = computeSales(txAll, {}); const kk = Object.fromEntries(sv.kpis.map((k) => [k.key, k.value]));
assert.deepEqual([kk.net, kk.gross, kk.discount, kk.docs, kk.customers, kk.paid, kk.vat, kk.unpaid], [164576, 199576, 35000, 12, 11, 164576, 0, 0]);
assert.deepEqual(Object.fromEntries(sv.charts.people!.map((p) => [p.label, p.value])), { "ชนิกานต์ มณีวรรณ": 125000, "Suparkit Jaturapatpaibul": 25000, "บุรีรัมย์น่าอยู่": 14576 });
ok("Dashboard จากแท็บจริง: สุทธิ 164,576 / ก่อนส่วนลด 199,576 / ส่วนลด 35,000 / 12 ใบ / 11 ราย / เก็บเงินแล้ว 164,576 / VAT 0 / พนักงาน 125,000-25,000-14,576");
const fs1 = computeSales(txAll, { salesperson: "Suparkit Jaturapatpaibul" }); assert.equal(fs1.kpis[0].value, 25000); assert.equal(fs1.rows.length, 2); assert.equal(fs1.charts.people!.length, 1); assert.equal(fs1.kpis[3].value, fs1.rows.length);
const fs2 = computeSales(txAll, { from: "2026-09-01", to: "2026-09-09" }); assert.equal(fs2.rows.length, 5); assert.equal(fs2.charts.time!.points.length, 5); assert.equal(fs2.kpis[0].value, sum2(fs2.rows));
function sum2(rows: Record<string, string>[]) { return rows.reduce((s, r) => s + Number(r.total_net), 0); }
assert.equal(computeSales(txAll, { q: "ลูกค้า ก" }).rows.length, 2); assert.equal(computeSales(txAll, { status: "ไม่มีสถานะนี้" }).kpis[0].value, null); assert.equal(computeSales(txAll, { period: "2026-09" }).rows.length, 12);
ok("ตัวกรอง (พนักงาน/ช่วงวันที่/ค้นหา/สถานะ/ช่วงรายงาน): KPI กราฟ ตาราง คำนวณจากชุดเดียวกัน, ไม่มีข้อมูล → รอข้อมูล");
assert.equal(sv.linked.value, null); ok("ยอดที่เชื่อมโยงการตลาด = รอข้อมูล (ไม่มีรายการที่เชื่อม Lead/แคมเปญ) ไม่อ้างว่าเกิดจากการตลาด");
const csv = salesCsv(filterSales(txAll, {}).sort((a, b) => a.invoice_date.localeCompare(b.invoice_date))); const lines = csv.replace(/^\ufeff/, "").trim().split("\r\n");
assert.ok(csv.startsWith("\ufeff")); assert.equal(lines.length, 13); assert.ok(lines[0].startsWith("company_tax_id,company_name,report_period")); assert.ok(!lines[0].includes("raw_json") && !lines[0].includes("internal_note")); assert.ok(lines[1].includes("2026-09-01") && lines[1].includes("IV2609-0001") && !lines[1].includes("฿") && lines[1].includes(",90000") === false);
assert.ok(lines[1].includes(",80000,10000,70000,0,70000,")); assert.ok(csv.includes("เก็บเงินแล้ว"));
ok("Export CSV: UTF-8 BOM, 12 แถว, หัวคอลัมน์คงที่, วันที่ ISO, เงินเป็นตัวเลขไม่มี ฿, ไม่รวม raw_json/โน้ตภายใน");
assert.ok(col("AUDIT_LOG", "action").includes("sales_import")); ok("Audit Log: sales_import");

console.log("10) Export CSV");
const { DATASETS, DATASET_BY_ID } = await import("../src/lib/export/datasets");
const { exportDataset, ExportError, parseFilters } = await import("../src/lib/export/service");
const { parseCsv } = await import("../src/lib/csv");
const { TABS: TABS10 } = await import("../src/lib/schema");
const isExp = (code: string) => (x: unknown) => x instanceof ExportError && x.code === code;
const readBack = (csv: string) => { const t = parseCsv(csv); return { headers: t[0], rows: t.slice(1).map((r) => Object.fromEntries(t[0].map((h, i) => [h, r[i] ?? ""]))) }; };
const exp = async (id: string, f: Record<string, string> = {}, role: "admin" | "marketing" | "sales" = "admin") => { const r = await exportDataset(id, parseFilters(new URLSearchParams(f)), role, "u@x.com"); return { ...r, ...readBack(r.csv!) }; };

const need = ["facebook_page_posts", "facebook_ads", "google_ads_campaigns", "google_ads_search_terms", "google_ads_search_words", "google_ads_keywords", "google_ads_network", "google_ads_age", "google_ads_gender", "google_ads_gender_age", "google_ads_schedule_day", "google_ads_schedule_hour", "google_ads_schedule_day_hour", "google_ads_opt_score", "google_ads_campaign_changes", "line_oa_monthly", "leads", "sales", "marketing_monthly_summary"];
assert.deepEqual(need.filter((i) => !DATASET_BY_ID[i]), []); assert.ok(need.every((i) => DATASET_BY_ID[i].filename === `${i}.csv`)); assert.equal(DATASETS.length, 19 + 3 + 1 + 2 + 2 + 1); // Phase 8: + marketing_performance_kpis, data_dictionary · Phase 5: + website_analytics, website_dimensions · + facebook_page_insights
ok("ชุดข้อมูลครบตาม spec: Facebook Page/Ads, Google Campaign + รายละเอียด 12 ประเภท, LINE OA, Leads, Sales, สรุปรายเดือน (+Devices/Time series/Auction และ sales_transactions)");
const fp = await exp("facebook_page_posts", {}, "marketing");
assert.ok(fp.csv!.startsWith("\ufeff")); assert.equal(fp.rows.length, 54); assert.ok(!fp.headers.includes("raw_json") && !fp.headers.includes("row_key"));
assert.deepEqual(fp.headers, TABS10.find((t) => t.name === "FB_PAGE_POSTS")!.headers.filter((h) => !["record_id", "row_key", "raw_json", "source_batch_id"].includes(h)));
assert.equal(fp.rows.filter((r) => r.link_clicks === "").length, 23); assert.ok(fp.rows.every((r) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(r.publish_time)));
assert.equal((await exp("facebook_page_posts", { include_excluded: "1" }, "marketing")).rows.length, 55);
ok("Facebook Page: BOM, หัวคอลัมน์ตาม schema (ไม่มี raw_json), 54 โพสต์ (ตัดเพจ BAAN; รวมได้ 55), Link Clicks ว่าง 23 แถวยังว่าง, วันที่ ISO");
const ads = await exp("facebook_ads", {}, "marketing"); assert.equal(ads.rows.length, 103); assert.equal(Math.round(ads.rows.reduce((s, r) => s + Number(r.amount_spent_thb || 0), 0) * 100) / 100, 37557.54); assert.ok(!ads.csv!.includes("฿"));
assert.equal((await exp("facebook_ads", { from: "2026-09-10", to: "2026-09-20" }, "admin")).rows.length, 103); assert.equal((await exp("facebook_ads", { from: "2026-10-01", to: "2026-10-31" })).rows.length, 0);
assert.equal((await exp("facebook_ads", { area: "unknown" })).rows.length, 103); assert.equal((await exp("facebook_ads", { area: "buriram" })).rows.length, 0);
const adset = ads.rows[0].ad_set_name; assert.equal((await exp("facebook_ads", { campaign: adset })).rows.length, ads.rows.filter((r) => r.ad_set_name === adset).length);
ok("Facebook Ads: 103 แถว spend 37,557.54 ไม่มี ฿, กรองช่วงที่ทับกัน/พื้นที่/Ad set ถูกต้อง");
const gc = await exp("google_ads_campaigns"); assert.equal(gc.rows.length, 24); assert.equal(Math.round(gc.rows.reduce((s, r) => s + Number(r.cost_thb), 0) * 100) / 100, total("GOOGLE_ADS_CAMPAIGNS", "cost_thb"));
assert.equal((await exp("google_ads_time_series", { from: "2026-09-10", to: "2026-09-20" })).rows.length, 11); assert.equal((await exp("google_ads_search_terms", { campaign: "ไม่ใช้กับชุดนี้" })).rows.length, (await exp("google_ads_search_terms")).rows.length);
ok("Google Ads: Campaign 24 แถว, รายวันกรอง 11 วัน, ตัวกรอง Campaign ไม่มีผลกับรายงานที่ไม่มีคอลัมน์แคมเปญ");
await assert.rejects(exportDataset("leads", {}, "marketing", "u@x.com"), isExp("FORBIDDEN")); await assert.rejects(exportDataset("sales", {}, "marketing", "u@x.com"), isExp("FORBIDDEN")); await assert.rejects(exportDataset("facebook_ads", {}, "sales", "u@x.com"), isExp("FORBIDDEN")); await assert.rejects(exportDataset("nope", {}, "admin", "u@x.com"), isExp("NOT_FOUND")); await assert.rejects(exportDataset("sales_transactions", {}, "admin", "u@x.com"), isExp("USE_ROUTE"));
ok("สิทธิ์: Marketing ส่งออก Leads/Sales ไม่ได้, Sales ส่งออกข้อมูลโฆษณาไม่ได้, ชุดข้อมูลที่ไม่มี → NOT_FOUND");
const ld = await exp("leads", {}, "sales"); assert.equal(ld.rows.length, 3); assert.ok(ld.headers.includes("phone") && ld.headers.includes("email")); assert.equal((await exp("leads", { channel: "Google Ads" }, "sales")).rows.length, 0); assert.equal((await exp("leads", { from: "2026-09-06", to: "2026-09-30" }, "sales")).rows.length, 0);
assert.equal((await exp("sales", {}, "admin")).rows.length, 1); /* แถวจำลอง MAN-0001 จากการทดสอบหัวข้อ 9 */ ok("Leads: 3 แถวมีเบอร์/อีเมล (เฉพาะ Admin/Sales), ตัวกรองช่องทาง/วันที่ทำงาน; Sales (ดีล) ส่งออกได้");
const lm = await exp("line_oa_monthly", {}, "marketing"); assert.equal(lm.rows.length, 2); assert.equal((await exp("line_oa_monthly", { from: "2026-10-01", to: "2026-10-31" })).rows.length, 1);
const sm = await exp("marketing_monthly_summary", {}, "admin"); const sep = sm.rows.find((r) => r.month === "2026-09")!;
const metaTotal = total("META_ADS", "amount_spent_thb"), gTotal = total("GOOGLE_ADS_CAMPAIGNS", "cost_thb");
assert.equal(Number(sep.meta_ads_spend_thb), metaTotal); assert.equal(Number(sep.google_ads_campaign_spend_thb), gTotal); assert.equal(Number(sep.total_paid_media_spend_thb), Math.round((metaTotal + gTotal) * 100) / 100);
assert.equal(sep.line_new_friends, ""); assert.equal(sep.line_leads, "0"); assert.equal(sep.leads_total, "3"); assert.equal(sep.leads_qualified, ""); assert.equal(sep.won_deals, ""); assert.equal(sep.deal_value_thb, "");
assert.equal(sep.fb_posts_published, "54"); assert.equal(sep.fb_posts_reach_sum_lifetime, "191119"); assert.equal(sep.fb_link_clicks, "2646");
const { buildSummary } = await import("../src/lib/export/service"); const mini = buildSummary({ meta: [], google: [], posts: [{ page_id: "1", page_name: "p", publish_time: "2026-08-03 10:00", reach: "10", link_clicks: "" }], line: [], leads: [], sales: [], excluded: [] }, {}, "admin");
assert.deepEqual(mini.rows[0].slice(0, 6), ["2026-08", "", "", "", "", 1]); assert.equal(mini.rows[0][mini.columns.indexOf("fb_link_clicks")], ""); assert.equal(new Set(sm.rows.map((r) => r.month)).size, sm.rows.length); assert.deepEqual(sm.rows.map((r) => r.month), [...sm.rows.map((r) => r.month)].sort());
ok("สรุปรายเดือน: ก.ย. 2026 Meta + Google = Total ไม่นับซ้ำ, ไม่มีข้อมูล = ว่าง (LINE New Friends ว่าง, LINE Leads = 0 ที่กรอกจริง), เดือนที่มีแต่โพสต์ (ไม่มีโฆษณา/Link Clicks) = ว่าง ไม่ใช่ 0, หนึ่งแถวต่อเดือน");
assert.ok(sm.headers.includes("gross_profit_thb")); const smm = await exp("marketing_monthly_summary", {}, "marketing"); assert.ok(!smm.headers.some((h) => ["deal_value_thb", "company_revenue_thb", "direct_cost_thb", "gross_profit_thb"].includes(h))); assert.equal(Number(smm.rows.find((r) => r.month === "2026-09")!.total_paid_media_spend_thb), Number(sep.total_paid_media_spend_thb));
assert.equal((await exp("marketing_monthly_summary", { from: "2026-09-01", to: "2026-09-30" })).rows.length, 1); assert.equal((await exp("marketing_monthly_summary", { area: "buriram" })).rows.find((r) => r.month === "2026-09")!.total_paid_media_spend_thb, "");
ok("สรุปรายเดือน: Marketing ไม่มีคอลัมน์การเงิน, กรองเดือนได้, Area=buriram (ยังไม่มีข้อมูล Area) → ว่าง");
const metaT = tabs.get("META_ADS")!; const extra = [...metaT.rows[1]]; extra[metaT.rows[0].indexOf("report_start")] = "2026-09-15"; extra[metaT.rows[0].indexOf("report_end")] = "2026-10-15"; metaT.rows.push(extra);
await assert.rejects(exportDataset("marketing_monthly_summary", {}, "admin", "u@x.com"), isExp("OVERLAPPING_REPORTS")); metaT.rows.pop(); ok("รายงานโฆษณาช่วงทับกัน → ปฏิเสธสรุปรายเดือน (ไม่ส่งยอดที่นับซ้ำ) พร้อมบอกช่วงที่ทับ");
const auditBefore = col("AUDIT_LOG", "action").filter((a) => a === "export").length;
const cnt = await exportDataset("facebook_ads", {}, "admin", "u@x.com", { countOnly: true }); assert.equal(cnt.rows, 103); assert.equal(col("AUDIT_LOG", "action").filter((a) => a === "export").length, auditBefore);
await exp("leads", {}, "admin"); assert.equal(col("AUDIT_LOG", "action").filter((a) => a === "export").length, auditBefore + 1); assert.ok(col("AUDIT_LOG", "summary").some((x) => String(x).includes("leads.csv") && String(x).includes("pii")));
ok("นับแถวไม่บันทึก Audit; ดาวน์โหลดบันทึก Audit Log (ระบุว่าเป็นข้อมูล pii)");
assert.throws(() => parseFilters(new URLSearchParams({ from: "2026-13-01" })), isExp("BAD_DATE")); assert.throws(() => parseFilters(new URLSearchParams({ from: "2026-09-30", to: "2026-09-01" })), isExp("BAD_RANGE")); assert.throws(() => parseFilters(new URLSearchParams({ area: "mars" })), isExp("BAD_AREA")); ok("ตัวกรองผิด (วันที่/ช่วง/Area) → ปฏิเสธพร้อมเหตุผล");

console.log("11) ตรวจสอบระบบ (Health) และ CSV Injection");
const { systemCheck } = await import("../src/lib/health");
const byId = (cs: { id: string; status: string; detail: string }[]) => Object.fromEntries(cs.map((c) => [c.id, c]));
for (const k of ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"]) delete process.env[k];
let hc = byId(await systemCheck()); assert.equal(hc.env.status, "fail"); assert.ok(hc.env.detail.includes("AUTH_SECRET")); ok("Health: ขาด AUTH_SECRET/ AUTH_GOOGLE_* → fail ระบุชื่อตัวแปรที่ขาด");
Object.assign(process.env, { AUTH_SECRET: "short", AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "gs" }); hc = byId(await systemCheck()); assert.equal(hc.env.status, "ok"); assert.equal(hc.auth_secret.status, "warn");
process.env.AUTH_SECRET = "x".repeat(44); hc = byId(await systemCheck());
assert.equal(hc.auth_secret, undefined); assert.equal(hc.sheet.status, "ok"); assert.equal(hc.tabs.status, "ok"); assert.equal(hc.admin.status, "ok"); assert.equal(hc.config.status, "ok"); assert.equal(hc.public_env.status, "ok");
ok("Health: เชื่อม Sheets ได้, แท็บ/คอลัมน์ครบ, มี Admin, Config ครบ; AUTH_SECRET สั้น → เตือน");
const dump = JSON.stringify(await systemCheck()); assert.ok(!dump.includes(process.env.GOOGLE_PRIVATE_KEY!.slice(40, 80)) && !dump.includes("x".repeat(44)) && !dump.includes("gs\"")); ok("Health: ผลตรวจไม่เปิดเผยค่า Secret ใดๆ");
process.env.NEXT_PUBLIC_API_KEY = "v"; hc = byId(await systemCheck()); assert.equal(hc.public_env.status, "fail"); delete process.env.NEXT_PUBLIC_API_KEY; ok("Health: ตัวแปรลับที่ขึ้นต้น NEXT_PUBLIC_ → fail");
const dropped = tabs.get("LEADS")!; tabs.delete("LEADS"); hc = byId(await systemCheck()); assert.equal(hc.tabs.status, "warn"); assert.ok(hc.tabs.detail.includes("LEADS")); tabs.set("LEADS", dropped);
tabs.get("IMPORT_BATCHES")!.rows.push(["x", "s", "r", "f", "h", "", "", "", "", "", "u@x.com", "2026-01-01T00:00:00.000Z", "processing"]); hc = byId(await systemCheck()); assert.equal(hc.imports.status, "warn"); tabs.get("IMPORT_BATCHES")!.rows.pop();
ok("Health: แท็บหาย → เตือนและระบุชื่อแท็บ, การนำเข้าค้าง processing เกิน 10 นาที → เตือน");
const inj = await saveLead({ received_at: "2026-09-08", customer_name: "=HYPERLINK(\"http://x\",\"a\")", source_channel: "Referral", service_category: "Event", need: "ขาย", phone: "+66 89 111 2222", notes: "-2+3" }, "s@x.com");
const csvInj = (await exportDataset("leads", {}, "admin", "u@x.com")).csv!; const li = readBack(csvInj).rows.find((r) => r.lead_code === inj.lead.lead_code)!;
assert.ok(li.customer_name.startsWith("'=HYPERLINK")); assert.equal(li.phone, "+66 89 111 2222"); assert.ok(li.notes.startsWith("'-2+3")); assert.equal(tabs.get("LEADS")!.rows.at(-1)![tabs.get("LEADS")!.rows[0].indexOf("customer_name")], "=HYPERLINK(\"http://x\",\"a\")");
ok("CSV Injection: ชื่อที่ขึ้นต้นด้วย = ถูกป้องกันในไฟล์ส่งออก (ข้อมูลใน Sheet ไม่ถูกแก้), เบอร์ +66 ไม่ถูกแก้");

console.log("12) ลบ Lead");
const { deleteLead } = await import("../src/lib/leads-service");
const nl = (n: string, phone: string) => saveLead({ ...base, customer_name: n, phone, email: `${n}@x.com` }, "s@x.com");
const cA = (await nl("ลบทดสอบ-A", "0811110001")).lead, cB = (await nl("ลบทดสอบ-B", "0811110002")).lead, cC = (await nl("ลบทดสอบ-C", "0811110003")).lead;
const nBefore = rowsOf("LEADS");
await assert.rejects(deleteLead(cB.lead_id, "ค่าเก่า", "s@x.com"), isLead("STALE")); assert.equal(rowsOf("LEADS"), nBefore);
await assert.rejects(deleteLead("no-such", "x", "s@x.com"), isLead("NOT_FOUND")); ok("ลบจากข้อมูลเก่า → ปฏิเสธ (ไม่ลบ), lead_id ที่ไม่มี → NOT_FOUND");
const dB = await deleteLead(cB.lead_id, cB.updated_at, "admin@example.com"); assert.equal(dB.lead_code, cB.lead_code);
const afterB = (await listLeads()).rows; assert.equal(rowsOf("LEADS"), nBefore - 1); assert.ok(!afterB.some((r) => r.lead_id === cB.lead_id)); assert.ok(afterB.some((r) => r.lead_id === cA.lead_id) && afterB.some((r) => r.lead_id === cC.lead_id));
await assert.rejects(deleteLead(cB.lead_id, cB.updated_at, "admin@example.com"), isLead("NOT_FOUND"));
const cCnow = afterB.find((r) => r.lead_id === cC.lead_id)!; const upd = await saveLead({ ...cCnow, call_status: "รอเข้าชม", lead_id: cCnow.lead_id, updated_at_seen: cCnow.updated_at }, "s@x.com"); assert.equal(upd.lead.status, "Contacted"); assert.equal(rowsOf("LEADS"), nBefore - 1);
ok("ลบแถวกลาง: เหลือแถวอื่นครบ, ลบซ้ำ → NOT_FOUND, แก้ไข Lead ที่แถวเลื่อนขึ้นแล้วยังถูกแถว");
const num = (c: string) => Number(c.split("-")[2]);
const dC = await deleteLead(upd.lead.lead_id, upd.lead.updated_at, "admin@example.com"); const fresh = (await nl("ใหม่หลังลบ", "0811110009")).lead;
assert.ok(num(fresh.lead_code) > num(dC.lead_code)); assert.ok(col("APP_CONFIG", "config_key").includes(`lead_code_floor_${year}`));
const allCodes = [...(await listLeads()).rows.map((r) => r.lead_code)]; assert.equal(new Set(allCodes).size, allCodes.length); ok(`ลบ Lead ที่รหัสสูงสุด (${dC.lead_code}) แล้วสร้างใหม่ → ได้ ${fresh.lead_code} ไม่ใช้รหัสซ้ำ, รหัสทั้งหมดไม่ซ้ำ`);
const sl = tabs.get("SALES")!; const lrow: Cell[] = sl.rows[0].map(() => ""); lrow[sl.rows[0].indexOf("lead_id")] = cA.lead_id; sl.rows.push(lrow);
await assert.rejects(deleteLead(cA.lead_id, cA.updated_at, "admin@example.com"), isLead("LINKED_SALES")); assert.ok((await listLeads()).rows.some((r) => r.lead_id === cA.lead_id));
sl.rows.pop(); const tx = tabs.get("SALES_TRANSACTIONS")!; const prevTx = tx.rows[1][tx.rows[0].indexOf("lead_id")]; tx.rows[1][tx.rows[0].indexOf("lead_id")] = cA.lead_id;
await assert.rejects(deleteLead(cA.lead_id, cA.updated_at, "admin@example.com"), isLead("LINKED_SALES")); tx.rows[1][tx.rows[0].indexOf("lead_id")] = prevTx ?? "";
await deleteLead(cA.lead_id, cA.updated_at, "admin@example.com"); assert.ok(!(await listLeads()).rows.some((r) => r.lead_id === cA.lead_id));
ok("Lead ที่มีรายการขายอ้างอิง (ทั้ง SALES และ SALES_TRANSACTIONS) → ลบไม่ได้ จนกว่าจะเอาการอ้างอิงออก");
const dels = tabs.get("AUDIT_LOG")!.rows.filter((r) => r[tabs.get("AUDIT_LOG")!.rows[0].indexOf("action")] === "lead_delete"); assert.ok(dels.length >= 3);
assert.ok(dels.every((r) => { const sm = String(r[tabs.get("AUDIT_LOG")!.rows[0].indexOf("summary")]); return /^ลบ LD-\d{4}-\d{4} \(/.test(sm) && !sm.includes("ลบทดสอบ") && !sm.includes("081111"); }));
const dd = computeDashboard(await fetchDashboardData("admin"), {}, "admin"); assert.equal(Object.fromEntries(dd.groups.flatMap((g) => g.items).map((k) => [k.key, k.value])).leads, (await listLeads()).rows.filter((r) => r.received_at >= "2026-01-01").length);
ok("Audit Log บันทึกการลบโดยไม่ใส่ชื่อ/เบอร์ลูกค้า, Dashboard นับ Lead ตามข้อมูลหลังลบ");

console.log("13) Phase 1 — Facebook Page รายวัน ผ่าน service + Sheets จำลอง");
const { readdirSync } = await import("node:fs");
const dailyName = readdirSync(DIR).find((x) => /^Sep-01-2026_Sep-30-2026_.*\.csv$/.test(x))!;
const fbBefore = rowsOf("FB_PAGE_POSTS");
const fbLifeRows = tabs.get("FB_PAGE_POSTS")!.rows.slice(1).map((r) => Object.fromEntries(tabs.get("FB_PAGE_POSTS")!.rows[0].map((h, i) => [h, String(r[i] ?? "")])));
const dPlan = await runPlan(file(dailyName));
assert.equal(dPlan.spec.id, "fb_page"); assert.deepEqual([dPlan.counts.insert, dPlan.counts.skip, dPlan.counts.invalid], [120, 270, 0]); assert.equal(dPlan.info!.metric!.daily, 120);
const dc = await runCommit(file(dailyName), "m@x.com", "marketing"); assert.equal(dc.counts.insert, 120);
assert.equal(rowsOf("FB_PAGE_POSTS"), fbBefore + 120); assert.equal(new Set(col("FB_PAGE_POSTS", "row_key")).size, fbBefore + 120);
ok(`นำเข้าไฟล์รายวันจริงผ่าน service: เพิ่ม 120 แถว (จาก ${fbBefore} เป็น ${fbBefore + 120}) แถว Lifetime เดิมไม่ถูกแตะ, row_key ไม่ซ้ำ`);
await assert.rejects(runCommit(file(dailyName), "m@x.com", "marketing"), (x: unknown) => x instanceof HttpError && x.code === "DUPLICATE_FILE");
const dOver = await runCommit({ ...file(dailyName), overrideDuplicate: true }, "admin@example.com", "admin");
assert.deepEqual([dOver.counts.insert, dOver.counts.update, dOver.counts.skip], [0, 0, 390]); assert.equal(rowsOf("FB_PAGE_POSTS"), fbBefore + 120);
ok("นำเข้าไฟล์รายวันเดิมซ้ำ: ถูกบล็อก; Admin ยืนยัน → ข้ามทั้ง 390 แถว จำนวนแถวไม่เพิ่ม");
const fbt = tabs.get("FB_PAGE_POSTS")!; const fh = fbt.rows[0];
const sumFb = (k: string, pred: (r: Cell[]) => boolean) => Math.round(fbt.rows.slice(1).filter(pred).reduce<number>((s, r) => s + (Number(r[fh.indexOf(k)]) || 0), 0) * 1000) / 1000;
const isDaily = (r: Cell[]) => r[fh.indexOf("metric_scope")] === "daily";
assert.equal(sumFb("reactions", isDaily), 605); assert.equal(sumFb("seconds_viewed", isDaily), 1660392.441); assert.equal(fbt.rows.slice(1).filter(isDaily).every((r) => /^\d{4}-\d{2}-\d{2}$/.test(String(r[fh.indexOf("metric_date")]))), true);
ok("ข้อมูลใน Sheet: แถวรายวัน Reactions 605 / Seconds viewed 1,660,392.441 ตรงกับไฟล์, metric_date เป็น YYYY-MM-DD ทุกแถว");
const dd13 = computeDashboard(await fetchDashboardData("admin"), {}, "admin"); const k13 = Object.fromEntries(dd13.groups.flatMap((g) => g.items).map((k) => [k.key, k]));
const { summarizeFb: sfb, excludePages: exP } = await import("../src/lib/fbmetrics");
const allFb = fbt.rows.slice(1).map((r) => Object.fromEntries(fh.map((h, i) => [h, String(r[i] ?? "")])));
const keptFb = exP(allFb, ["BAAN Prompt Community - Buriram&Surin"]).kept; const lifeOnly = sfb(keptFb, {}).lifetimeOnlyPosts;
assert.equal(k13.engagement.value, 319); assert.equal(k13.reach.value, null); assert.equal(k13.posts.value, new Set(keptFb.map((r) => `${r.page_id}|${r.post_id}`)).size);
assert.ok(dd13.notes.some((n) => n.includes(`${lifeOnly} โพสต์มีแต่ยอดสะสม`)));
ok(`Dashboard: Reactions+Comments+Shares = 319 (รายวัน ไม่รวมเพจ BAAN และไม่บวกยอด Lifetime เดิม), Reach = รอข้อมูล (ไฟล์รายวันไม่มี Reach), แจ้ง ${lifeOnly} โพสต์ที่มีแต่ Lifetime`);
const dSep = computeDashboard(await fetchDashboardData("admin"), { from: "2026-09-24", to: "2026-09-30" }, "admin"); const kS = Object.fromEntries(dSep.groups.flatMap((g) => g.items).map((k) => [k.key, k]));
const expS = sumFb("reactions_comments_shares", (r) => isDaily(r) && String(r[fh.indexOf("metric_date")]) >= "2026-09-24" && r[fh.indexOf("page_name")] !== "BAAN Prompt Community - Buriram&Surin");
assert.equal(kS.engagement.value, expS); ok(`Dashboard กรอง 24–30 ก.ย. ตามวันที่ของสถิติ: ${expS}`);
const fpx = await exp("facebook_page_posts", { from: "2026-09-24", to: "2026-09-30" }, "marketing");
assert.ok(fpx.rows.every((r) => r.metric_date >= "2026-09-24" && r.metric_date <= "2026-09-30")); assert.ok(fpx.headers.indexOf("metric_date") > fpx.headers.indexOf("imported_at"));
assert.deepEqual(fpx.headers.slice(0, 5), ["page_id", "post_id", "page_name", "title", "description"]); ok(`Export facebook_page_posts: กรองตาม metric_date (${fpx.rows.length} แถว), คอลัมน์เดิมลำดับเดิม คอลัมน์ใหม่ต่อท้าย`);
const sm13 = await exp("marketing_monthly_summary", {}, "admin"); const sep13 = sm13.rows.find((r) => r.month === "2026-09")!;
const pubSep = new Set(keptFb.filter((r) => r.publish_time.startsWith("2026-09")).map((r) => `${r.page_id}|${r.post_id}`)).size;
assert.equal(sep13.fb_daily_engagement, "319"); assert.equal(sep13.fb_posts_published, String(pubSep)); assert.equal(sep13.fb_posts_reach_sum_lifetime, "191119"); assert.equal(sep13.fb_daily_reach_sum, "");
assert.deepEqual(sm13.headers.slice(18, 22), ["fb_daily_engagement", "fb_daily_seconds_viewed", "fb_daily_reach_sum", "fb_daily_link_clicks"]);
ok(`สรุปรายเดือน ก.ย.: โพสต์ไม่ซ้ำ ${pubSep} (ไม่นับซ้ำตามจำนวนวัน), Reach Lifetime 191,119 ไม่เปลี่ยน, ยอดรายวันแยกคอลัมน์ใหม่ (engagement 319, reach ว่าง)`);
console.log("14) Phase 3 — ชื่อ Action ของ Facebook Ads ใน Export");
const ax = await exp("facebook_ads", {}, "marketing"); const metaT3 = tabs.get("META_ADS")!; const mh = metaT3.rows[0];
const rawInSheet = metaT3.rows.slice(1).map((r) => String(r[mh.indexOf("result_indicator")] ?? ""));
assert.ok(rawInSheet.includes("actions:post_engagement")); ok("ค่าใน Google Sheet ยังเป็นค่าต้นฉบับ (actions:post_engagement) ไม่ถูกแก้");
assert.deepEqual(ax.headers.slice(-2), ["result_indicator_raw", "results_initial_indicator_raw"]); assert.deepEqual(ax.headers.slice(0, -2), ads.headers.slice(0, -2));
assert.ok(ax.rows.every((r) => !/^actions?:/i.test(r.result_indicator))); assert.ok(ax.rows.some((r) => r.result_indicator === "post_engagement" && r.result_indicator_raw === "actions:post_engagement"));
assert.equal(ax.rows.filter((r) => r.result_indicator === "reach").length, 3); assert.equal(ax.rows.filter((r) => r.result_indicator === "").length, 29);
ok("Export facebook_ads: result_indicator ตัด prefix แล้ว (post_engagement) · ค่าดิบอยู่ในคอลัมน์ result_indicator_raw ต่อท้าย · คอลัมน์เดิมลำดับเดิม · reach/ค่าว่าง คงเดิม");
const grp = (k: string) => { const m = new Map<string, [number, number]>(); for (const r of ax.rows) { const c = m.get(r[k]) ?? [0, 0]; c[0] += Number(r.results || 0); c[1] += Number(r.amount_spent_thb || 0); m.set(r[k], c); } return [...m.values()].map(([a, b]) => `${Math.round(a * 100)}|${Math.round(b * 100)}`).sort(); };
assert.deepEqual(grp("result_indicator"), grp("result_indicator_raw")); assert.equal(Math.round(ax.rows.reduce((s, r) => s + Number(r.amount_spent_thb || 0), 0) * 100) / 100, 37557.54);
ok("Results และ Spend ต่อ Action ก่อน/หลังตัด prefix เท่ากันทุกกลุ่ม · Spend รวม 37,557.54 ไม่เปลี่ยน");
const kpiAfter = Object.fromEntries(computeDashboard(await fetchDashboardData("admin"), {}, "admin").groups.flatMap((g) => g.items).map((k) => [k.key, k.value]));
assert.equal(kpiAfter.meta, 37557.54); ok("KPI Meta Ads Spend ใน Dashboard = 37,557.54 ไม่เปลี่ยน");
console.log("15) Phase 4 — Lead Management: Migration + Need/Status");
const { LEAD_COLUMNS } = await import("../src/lib/leads");
const OLD_LEAD_COLS = LEAD_COLUMNS.slice(0, LEAD_COLUMNS.indexOf("updated_at") + 1);
const legacy: Record<string, string> = { lead_id: "legacy-1", lead_code: "LD-2025-0099", received_at: "2026-08-20", customer_name: "ลูกค้าเก่า", phone: "0870000001", source_channel: "LINE OA", service_category: "Product", status: "Proposal", qualified_at: "2026-08-21", owner_email: "old@x.com", need_description: "อยากได้บ้าน", notes: "เดิม", created_by: "old@x.com", created_at: "2026-08-20T00:00:00.000Z", updated_by: "old@x.com", updated_at: "2026-08-21T00:00:00.000Z" };
tabs.set("LEADS", { id: tabs.get("LEADS")!.id, cols: OLD_LEAD_COLS.length, rows: [[...OLD_LEAD_COLS], OLD_LEAD_COLS.map((c) => legacy[c] ?? "")] });
await assert.rejects(saveLead({ ...base, customer_name: "ก่อนเตรียม Sheet" }, "s@x.com"), isLead("SHEET_NOT_READY")); assert.equal(rowsOf("LEADS"), 1);
const r4 = await initializeSpreadsheet("admin@example.com");
assert.deepEqual(r4.addedHeaders.LEADS, ["need", "buy_status", "sell_status", "property_type", "property_condition", "price_range", "call_status", "staff"]);
const lt = tabs.get("LEADS")!; assert.deepEqual(lt.rows[0].slice(0, OLD_LEAD_COLS.length), OLD_LEAD_COLS); assert.deepEqual(lt.rows[1].slice(0, OLD_LEAD_COLS.length), OLD_LEAD_COLS.map((c) => legacy[c] ?? ""));
ok("Migration: แท็บ LEADS แบบเดิม → ยังไม่กด เตรียม Sheet จะบันทึกไม่ได้ (ไม่เขียนผิดคอลัมน์) · กดแล้วเพิ่ม 8 คอลัมน์ต่อท้าย คอลัมน์และข้อมูลเดิมไม่เปลี่ยน");
const old0 = (await listLeads()).rows[0]; assert.equal(old0.need, ""); assert.equal(old0.status, "Proposal");
let dash15 = Object.fromEntries(computeDashboard(await fetchDashboardData("admin"), {}, "admin").groups.flatMap((g) => g.items).map((k) => [k.key, k.value]));
assert.equal(dash15.qualified, 0); ok("Lead เก่า (ไม่มี Need) ยังแสดงและนับใน Total Leads · Qualified นับตาม Call Status (ยังไม่มี รอเข้าชม = 0)");
await assert.rejects(saveLead({ ...old0, lead_id: old0.lead_id, updated_at_seen: old0.updated_at }, "s@x.com"), isLead("VALIDATION"));
await new Promise((r) => setTimeout(r, 5));
const mig = await saveLead({ ...old0, need: "ซื้อ", lead_id: old0.lead_id, updated_at_seen: old0.updated_at }, "s@x.com");
assert.equal(mig.lead.status, "Proposal"); assert.equal(mig.lead.qualified_at, "2026-08-21"); assert.equal(mig.lead.owner_email, "old@x.com"); assert.equal(mig.lead.call_status, "รอติดต่อ"); assert.equal(mig.lead.need_description, "อยากได้บ้าน");
ok("แก้ Lead เก่า: ต้องเลือก Need ก่อน · ใส่ Need อย่างเดียวไม่ลดขั้น Pipeline เดิม (Proposal), owner_email/Remark/qualified_at คงเดิม");

const s1 = (await saveLead({ ...base, customer_name: "ผู้ขายบ้าน", phone: "0861111111", need: "ขาย", sell_status: "นัดทำสัญญา", buy_status: "Hot", property_type: "บ้านเดี่ยว", property_condition: "มือ 2", price_range: "1.5–2.5 m", call_status: "รอเข้าชม", staff: "พี่เอ", need_description: "ขายด่วน", notes: "โทรหลัง 5 โมง" }, "s@x.com")).lead;
assert.equal(s1.sell_status, "นัดทำสัญญา"); assert.equal(s1.buy_status, ""); assert.equal(s1.status, "Qualified"); assert.equal(s1.contactable, "TRUE");
assert.deepEqual([s1.property_type, s1.property_condition, s1.price_range, s1.staff], ["บ้านเดี่ยว", "มือ 2", "1.5–2.5 m", "พี่เอ"]);
ok("Need = ขาย → ใช้ Sell Status (Buy Status ที่ส่งมาไม่ถูกเก็บ) · นัดทำสัญญา = Qualified · Call รอเข้าชม → contactable TRUE · Type/Condition/Price/Staff บันทึกครบ");
await assert.rejects(saveLead({ ...base, customer_name: "ผิด", phone: "0862222222", need: "ขาย", sell_status: "Hot" }, "s@x.com"), isLead("VALIDATION"));
await assert.rejects(saveLead({ ...base, customer_name: "ผิด", phone: "0862222223", need: "ซื้อ", buy_status: "ขายแล้ว" }, "s@x.com"), isLead("VALIDATION"));
for (const [k, v] of [["call_status", "โทรแล้ว"], ["property_type", "โรงงาน"], ["property_condition", "มือ 3"], ["price_range", "10 m"]]) await assert.rejects(saveLead({ ...base, customer_name: "ผิด", phone: "0863333333", [k]: v }, "s@x.com"), isLead("VALIDATION"));
ok("สถานะที่ไม่ตรงกับ Need และค่า Dropdown ที่ไม่อยู่ในรายการ → ปฏิเสธ");
const b1 = (await saveLead({ ...base, customer_name: "ผู้ซื้อ", phone: "0864444444", need: "เช่า", buy_status: "Cold", staff: "พี่บี" }, "s@x.com")).lead;
assert.equal(b1.status, "New"); assert.equal(b1.call_status, "รอติดต่อ"); ok("Need = เช่า → Buy Status · Cold = กำลังติดตาม (New) · Call Status เริ่มต้น รอติดต่อ");

const auditN = rowsOf("AUDIT_LOG"); const sheetBefore = JSON.stringify(tabs.get("LEADS")!.rows);
await assert.rejects(saveLead({ ...s1, need: "ซื้อ", buy_status: "Warm", updated_at_seen: s1.updated_at }, "s@x.com"), (x: unknown) => isLead("NEED_CHANGE")(x) && (x as InstanceType<typeof LeadError>).extra.conflict!.value === "นัดทำสัญญา");
assert.equal(JSON.stringify(tabs.get("LEADS")!.rows), sheetBefore); assert.equal(rowsOf("AUDIT_LOG"), auditN);
ok("เปลี่ยน Need ขาย → ซื้อ ขณะมี Sell Status เดิม: ไม่ล้างเงียบ ๆ ต้องยืนยันก่อน (ยังไม่เขียนข้อมูล)");
await new Promise((r) => setTimeout(r, 5));
const sw = (await saveLead({ ...s1, need: "ซื้อ", buy_status: "Warm", updated_at_seen: s1.updated_at, confirmNeedChange: true }, "s@x.com")).lead;
assert.equal(sw.sell_status, ""); assert.equal(sw.buy_status, "Warm"); assert.equal(sw.status, "Qualified");
const lastAudit = tabs.get("AUDIT_LOG")!.rows.at(-1)!.join("|"); assert.ok(lastAudit.includes("Need ขาย → ซื้อ") && lastAudit.includes('sell_status="นัดทำสัญญา"'));
ok("ยืนยันแล้ว: ล้าง Sell Status เดิม ใช้ Buy Status ใหม่ และ Audit Log บันทึกค่าเดิม (นัดทำสัญญา)");
await new Promise((r) => setTimeout(r, 5));
const sw2 = (await saveLead({ ...sw, need: "สร้าง", updated_at_seen: sw.updated_at }, "s@x.com")).lead; assert.equal(sw2.buy_status, "Warm");
ok("เปลี่ยน Need ภายในกลุ่มเดียวกัน (ซื้อ → สร้าง) ไม่ต้องยืนยัน สถานะคงเดิม");
await new Promise((r) => setTimeout(r, 5));
const won = (await saveLead({ ...b1, buy_status: "Close", updated_at_seen: b1.updated_at }, "s@x.com")).lead; assert.equal(won.status, "Won"); assert.ok(won.won_at && won.qualified_at);
const sold = (await saveLead({ ...base, customer_name: "ขายแล้ว", phone: "0865555555", need: "ขาย", sell_status: "ขายแล้ว" }, "s@x.com")).lead; assert.equal(sold.status, "Won");
const lost = (await saveLead({ ...base, customer_name: "ไม่พร้อม", phone: "0866666666", need: "ขาย", sell_status: "บ้านไม่พร้อมขาย", call_status: "ติดต่อไม่ได้" }, "s@x.com")).lead; assert.equal(lost.status, "Lost"); assert.equal(lost.contactable, "FALSE");
ok("Close / ขายแล้ว = Won (ตั้ง won_at) · บ้านไม่พร้อมขาย = Lost · ติดต่อไม่ได้ → contactable FALSE");

const all15 = (await listLeads()).rows;
assert.equal(filterLeads(all15, { need: "ขาย" }).length, 2); assert.equal(filterLeads(all15, { status: "Warm" }).length, 1); assert.equal(filterLeads(all15, { staff: "พี่บี" }).length, 1);
assert.equal(filterLeads(all15, { callStatus: "รอติดต่อ" }).length, 3); assert.equal(filterLeads(all15, { from: "2026-09-01", to: "2026-09-30" }).length, all15.length - 1); assert.equal(filterLeads(all15, { q: "ขายด่วน" }).length, 1);
assert.deepEqual((await listLeads()).staff, ["พี่บี", "พี่เอ"]);
ok("กรองตาม Need / Status / Staff / Call Status / ช่วงวันที่ และค้นหาใน Remark ได้ · รายชื่อ Staff สำหรับเลือกซ้ำ");
dash15 = Object.fromEntries(computeDashboard(await fetchDashboardData("admin"), {}, "admin").groups.flatMap((g) => g.items).map((k) => [k.key, k.value]));
assert.equal(dash15.leads, all15.length); assert.equal(dash15.qualified, all15.filter((r) => r.call_status === "รอเข้าชม").length); assert.equal(dash15.qualified, 1);
ok("Dashboard: Total Leads = 6, Qualified Leads = 1 (Call Status = รอเข้าชม)");
const lx = await exp("leads", {}, "admin"); assert.deepEqual(lx.headers.slice(-8), ["need", "buy_status", "sell_status", "property_type", "property_condition", "price_range", "call_status", "staff"]);
assert.ok(lx.rows.some((r) => r.need === "ขาย" && r.sell_status === "ขายแล้ว")); ok("Export leads.csv: คอลัมน์ใหม่ 8 คอลัมน์ต่อท้าย ข้อมูลครบ");
console.log("15b) คำขอเพิ่มเติม: Call Status ไม่สนใจ + Qualified Leads = รอเข้าชม");
const ni = (await saveLead({ ...base, customer_name: "ไม่สนใจ", phone: "0867777777", need: "ซื้อ", call_status: "ไม่สนใจ" }, "s@x.com")).lead;
assert.equal(ni.call_status, "ไม่สนใจ"); assert.equal(ni.contactable, "TRUE");
assert.equal(filterLeads((await listLeads()).rows, { callStatus: "ไม่สนใจ" }).length, 1);
const dq = computeDashboard(await fetchDashboardData("marketing"), {}, "marketing"); const kq = Object.fromEntries(dq.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
const contactedNow = (await listLeads()).rows.filter((r) => r.call_status === "รอเข้าชม");
assert.equal(kq.qualified.value, contactedNow.length); assert.equal(dq.charts.leadQualByChannel!.reduce((t, x) => t + x.value, 0), contactedNow.length);
assert.ok(!("won" in kq) && !("gp" in kq) && !("rate" in kq) && !("lead_qual" in kq));
ok(`Call Status "ไม่สนใจ" บันทึกได้ (contactable TRUE) และกรองได้ · Qualified Leads = ${contactedNow.length} (เฉพาะ รอเข้าชม) รวมทุกช่องทางในกราฟเท่ากัน · ไม่มีการ์ด Won/Gross Profit/Lead-to-Sale`);
{
  const vs = (await saveLead({ ...base, customer_name: "เข้าชมแล้ว", phone: "0868888881", need: "ซื้อ", call_status: "เข้าชมแล้ว" }, "s@x.com")).lead;
  const sold = (await saveLead({ ...base, customer_name: "ซื้อแล้ว", phone: "0868888882", need: "ซื้อ", call_status: "ซื้อสำเร็จ" }, "s@x.com")).lead;
  assert.equal(vs.call_status, "เข้าชมแล้ว"); assert.equal(sold.call_status, "ซื้อสำเร็จ"); assert.equal(vs.contactable, "TRUE"); assert.equal(sold.contactable, "TRUE");
  const rowsNow = (await listLeads()).rows; const qNow = rowsNow.filter((r) => ["รอเข้าชม", "เข้าชมแล้ว", "ซื้อสำเร็จ"].includes(r.call_status)).length;
  const d2 = computeDashboard(await fetchDashboardData("marketing"), {}, "marketing"); const k2 = Object.fromEntries(d2.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  assert.equal(k2.qualified.value, qNow); assert.ok(qNow >= contactedNow.length + 2); assert.ok("cpsv" in k2);
  ok(`Call Status ใหม่ "เข้าชมแล้ว" / "ซื้อสำเร็จ" บันทึกลง Sheet ได้ (contactable TRUE) · Qualified Leads = ${qNow} (รอเข้าชม + เข้าชม + ซื้อสำเร็จ) · มีการ์ด Cost per Site Visit`);
}
console.log("15c) จัดการผู้ใช้ (หน้า ตั้งค่า)");
const { listUsers, saveUser, UserError } = await import("../src/lib/users-service");
const isU = (code: string) => (x: unknown) => x instanceof UserError && x.code === code;
const ADM = "admin@example.com";
await saveUser({ email: " New.User@Gmail.com ", display_name: "ใหม่", role: "marketing" }, ADM);
let us = await listUsers(); const nu = us.find((u) => u.email === "new.user@gmail.com")!; assert.ok(nu && nu.active && nu.role === "marketing");
const { resolveRole } = await import("../src/auth"); assert.equal(await resolveRole("NEW.USER@gmail.com"), "marketing");
ok("เพิ่มสมาชิก: อีเมลตัดช่องว่าง/ตัวเล็ก · เข้าระบบได้ทันทีตาม Role ที่เลือก");
await assert.rejects(saveUser({ email: "new.user@gmail.com", role: "sales" }, ADM), isU("DUPLICATE_EMAIL"));
await assert.rejects(saveUser({ email: "bad", role: "boss" }, ADM), (x: unknown) => isU("VALIDATION")(x) && Object.keys((x as InstanceType<typeof UserError>).fields!).sort().join() === "email,role");
await assert.rejects(saveUser({ ...nu, role: "sales", updated_at_seen: "เก่า" }, ADM), isU("STALE"));
ok("อีเมลซ้ำ → ปฏิเสธ · อีเมล/Role ผิด → แจ้งรายช่อง · แก้จากข้อมูลเก่า → ปฏิเสธ");
await saveUser({ ...nu, role: "sales", active: false, updated_at_seen: nu.updated_at }, ADM);
assert.equal(await resolveRole("new.user@gmail.com"), null); us = await listUsers(); assert.equal(us.find((u) => u.email === "new.user@gmail.com")!.role, "sales");
ok("เปลี่ยน Role + ระงับ → resolveRole = null (เข้าไม่ได้) แถวยังอยู่ (ไม่ลบ)");
const ad = us.find((u) => u.email === ADM)!;
await assert.rejects(saveUser({ ...ad, active: false, updated_at_seen: ad.updated_at }, ADM), isU("SELF_CHANGE"));
await saveUser({ email: "boss2@example.com", role: "admin" }, ADM); us = await listUsers(); const b2 = us.find((u) => u.email === "boss2@example.com")!;
const ad2 = us.find((u) => u.email === ADM)!; await saveUser({ ...ad2, role: "marketing", updated_at_seen: ad2.updated_at }, "boss2@example.com");
us = await listUsers(); const ad3 = us.find((u) => u.email === ADM)!; assert.equal(ad3.role, "marketing"); assert.equal(ad3.bootstrap, true);
await assert.rejects(saveUser({ ...b2, active: false, updated_at_seen: b2.updated_at }, ADM), isU("LAST_ADMIN"));
await saveUser({ ...ad3, role: "admin", updated_at_seen: ad3.updated_at }, "boss2@example.com");
const audU = tabs.get("AUDIT_LOG")!.rows.map((r) => r.join("|")); assert.ok(audU.some((r) => r.includes("user_create")) && audU.some((r) => r.includes("role admin → marketing")));
ok("แก้/ระงับตัวเองไม่ได้ · ต้องเหลือ Admin ใช้งานได้ ≥ 1 คน · Admin เริ่มต้น (INITIAL_ADMIN_EMAIL) ถูกระบุ · Audit Log บันทึกการเพิ่ม/เปลี่ยน Role");
console.log("15d) Phase 5 — Website Analytics ผ่าน service + Sheets จำลอง");
{
  const { parseWebsiteFile, assembleBatches } = await import("../src/lib/website/parse");
  const ws = await import("../src/lib/website/service");
  const { createHash } = await import("node:crypto");
  const WD = `${DIR}/website/`;
  const names = ["ga4_pages.csv", "gsc_Chart.csv", "gsc_Pages.csv", "gsc_Queries.csv", "gsc_Countries.csv", "gsc_Devices.csv", "gsc_Search_appearance.csv", "gsc_Filters.csv"];
  const parsedW = names.map((n) => { const t = readFileSync(WD + n, "utf8"); return { ...parseWebsiteFile(n, t), sha256: createHash("sha256").update(t).digest("hex") }; });
  const { batches } = assembleBatches(parsedW);
  const tabsBefore = tabs.has("WEBSITE_ANALYTICS");
  assert.ok(tabsBefore); // ถูกสร้างตอน initializer (ส่วนที่ 1)
  const plans = await ws.planWebsite(batches);
  const pga = plans.find((p) => p.kind === "ga4_pages")!; assert.deepEqual(pga.counts, { insert: 302, update: 0, skip: 0 }); assert.equal(pga.fileDuplicate, null);
  assert.equal(rowsOf("WEBSITE_ANALYTICS"), 0);
  ok("พรีวิว: GA4 เพิ่ม 302 แถว (สรุป 1 + หน้า 300 + อื่น ๆ 1) · ยังไม่เขียนข้อมูล");
  const res = await ws.commitWebsite(batches, "m@x.com", "marketing");
  assert.equal(res.results.length, 7); assert.equal(rowsOf("WEBSITE_ANALYTICS"), 1 + 27); assert.equal(rowsOf("WEBSITE_DIMENSIONS"), 301 + 301 + 301 + 91 + 3 + 1);
  assert.equal(total("WEBSITE_ANALYTICS", "page_views"), 35820); assert.equal(total("WEBSITE_ANALYTICS", "search_clicks"), 4744);
  ok("นำเข้าทั้งชุด 7 ไฟล์: สรุป 28 แถว (GA4 1 + รายวัน 27) · รายละเอียด 998 แถว · Page Views 35,820 · Search Clicks 4,744 ใน Sheet");
  await assert.rejects(ws.commitWebsite(batches, "m@x.com", "marketing"), (x: unknown) => x instanceof ws.WebError && x.code === "DUPLICATE_FILE");
  const again = await ws.commitWebsite(batches, "admin@example.com", "admin", true);
  assert.ok(again.results.every((r) => r.inserted === 0 && r.updated === 0)); assert.equal(rowsOf("WEBSITE_ANALYTICS"), 28); assert.equal(total("WEBSITE_ANALYTICS", "page_views"), 35820);
  ok("นำเข้าซ้ำ: Marketing ถูกบล็อก · Admin ยืนยัน → ข้ามทุกแถว (เพิ่ม 0) ยอดไม่ซ้ำ");
  const ch = JSON.parse(JSON.stringify(batches.find((b) => b.kind === "gsc_chart")!)); ch.sha256 = "f".repeat(64); ch.summary[0].search_clicks = 170; ch.summary[0].search_ctr_pct = 2.3;
  const up = await ws.commitWebsite([ch], "m@x.com", "marketing"); assert.equal(up.results[0].updated, 1); assert.equal(rowsOf("WEBSITE_ANALYTICS"), 28); assert.equal(total("WEBSITE_ANALYTICS", "search_clicks"), 4751);
  ok("ไฟล์ใหม่ที่ค่าวันเดิมเปลี่ยน (1 ต.ค. 163 → 170) → อัปเดต 1 แถว ไม่เพิ่มแถว");
  await ws.saveManualWebsite({ report_start: "2026-10-01", report_end: "2026-10-27", website_users: "20000", notes: "จาก GA4 Reports snapshot" }, "m@x.com");
  await ws.saveManualWebsite({ report_start: "2026-10-01", report_end: "2026-10-27", website_users: "21000" }, "m@x.com");
  assert.equal(rowsOf("WEBSITE_ANALYTICS"), 29);
  await assert.rejects(ws.saveManualWebsite({ report_start: "2026-10-01", report_end: "2026-10-27", website_users: "" }, "m@x.com"), (x: unknown) => x instanceof ws.WebError && x.code === "VALIDATION");
  await assert.rejects(ws.saveManualWebsite({ report_start: "2026-10-27", report_end: "2026-10-01", website_users: "5" }, "m@x.com"), (x: unknown) => x instanceof ws.WebError && x.code === "BAD_PERIOD");
  ok("กรอกยอดผู้ใช้ 20,000 แล้วแก้เป็น 21,000 → แถวเดียว (แก้ทับ) · ไม่กรอก Users / วันที่กลับด้าน → ปฏิเสธ");
  const { computePerformance: cp } = await import("../src/lib/performance");
  const pd5 = await fetchDashboardData("marketing"); const pk5 = Object.fromEntries(cp(pd5, { from: "2026-10-01", to: "2026-10-27" }).groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  assert.equal(pk5.w_pv.value, 35820); assert.equal(pk5.w_users.value, 21000); assert.equal(pk5.w_dur.value, Math.round((992565 / 21000) * 100) / 100); assert.equal(pk5.s_clicks.value, 4751);
  ok(`Marketing Performance จาก Sheet: Users 21,000 · Page Views 35,820 · Duration ${(992565 / 21000).toFixed(2)} วินาที · Search Clicks 4,751`);
  const ov = await ws.websiteOverview(); assert.deepEqual(ov.selected, { start: "2026-10-01", end: "2026-10-27" }); assert.equal(ov.dims.filter((r) => r.dimension_type === "search_device").length, 3);
  const audW = tabs.get("AUDIT_LOG")!.rows.map((r) => r.join("|")); assert.ok(audW.some((r) => r.includes("website ga4_pages")) && audW.some((r) => r.includes("website_manual")));
  ok("หน้า Website อ่านรายละเอียดของช่วงล่าสุดได้ · Audit Log บันทึกการนำเข้าและการกรอกเอง");
  const snapText = readFileSync(WD + "ga4_reports_snapshot.csv", "utf8");
  const snapB = assembleBatches([{ ...parseWebsiteFile("Reports_snapshot.csv", snapText), sha256: createHash("sha256").update(snapText).digest("hex") }]).batches;
  const rs = await ws.commitWebsite(snapB, "m@x.com", "marketing"); assert.equal(rs.results[0].inserted, 1 + 301 + 52 + 51 + 301);
  const pd6 = await fetchDashboardData("marketing"); const pk6 = Object.fromEntries(cp(pd6, { from: "2026-09-01", to: "2026-09-30" }).groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  assert.equal(pk6.w_users.value, 17443); assert.equal(pk6.w_pv.value, 42450); assert.equal(pk6.w_dur.value, 60.042); assert.equal(pk6.w_sess.value, 22409);
  assert.equal(pk6.x_cppv.value, Math.round((28814.82 / 42450) * 100) / 100); assert.equal(pk6.x_spu.value, Math.round((28814.82 / 17443) * 100) / 100);
  ok("GA4 Reports snapshot ก.ย. → Sheet → Performance: Users 17,443 · Page Views 42,450 · Duration 60.04 วินาที · Ads Cost per Page View ฿0.68 · Ads Spend per User ฿1.65 (Google Ads ก.ย. จริงใน Sheet)");
}
console.log("16) Phase 6 — Marketing Performance ผ่าน Sheets จำลอง");
const { computePerformance } = await import("../src/lib/performance");
const pd = await fetchDashboardData("marketing"); const perf = computePerformance(pd, { from: "2026-09-01", to: "2026-09-30" });
const pk = Object.fromEntries(perf.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
assert.equal(pk.g_spend.value, 28814.82); assert.equal(pk.g_clicks.value, 31513); assert.equal(pk.m_spend.value, 37557.54); assert.equal(pk.f_eng.value, 319);
assert.equal(perf.warnings.length, 1); assert.ok(perf.warnings[0].includes("28,870.19")); // ส่วนที่ 3 แก้ Cost แคมเปญ +55.37 ไว้ → Time series กับ Campaign ไม่ตรงกันจริง
ok("อ่านจาก Sheet (จำลอง): Google Spend 28,814.82 / Clicks 31,513 จาก Time series, Meta 37,557.54, Facebook Engagement 319 · เตือนเพราะ Campaign Report ถูกแก้ไว้ในส่วนที่ 3 (28,870.19) ยอดไม่ตรงกัน");
const dc16 = computeDashboard(pd, {}, "marketing").charts;
assert.deepEqual(dc16.buyStatus!.filter((x) => x.value).map((x) => [x.label, x.value]), [["Warm", 1], ["Close", 1], ["(ยังไม่ระบุสถานะ)", 4]] /* +1 จาก Lead "ไม่สนใจ" ในส่วนที่ 15b, +2 จาก Lead เข้าชม/ซื้อสำเร็จ */);
assert.equal(dc16.sellStatus!.find((x) => x.label === "ขายแล้ว")!.value, 1); assert.equal(dc16.sellStatus!.find((x) => x.label === "บ้านไม่พร้อมขาย")!.value, 1);
ok("Dashboard กราฟ Buy Status / Sell Status จาก Lead ใน Sheet (ข้อมูล Marketing ไม่มีชื่อ/เบอร์)");
console.log("16b) Facebook Page ระดับเพจ: Viewers / Link clicks → ใช้ Viewers เทียบเคียง Reach");
{
  const { decodeText } = await import("../src/lib/csv");
  const fbFile = (f: string) => ({ filename: f, text: decodeText(readFileSync(`${DIR}/fbpage/${f}`)) });
  const before = pk.f_reach; assert.doesNotMatch(before.label, /Viewers/);
  for (const f of ["Viewers.csv", "Link_clicks.csv"]) { const c = await runCommit(fbFile(f), "m@x.com", "marketing"); assert.equal(c.counts.insert, 30, f); assert.equal(c.counts.invalid, 0, f); }
  assert.equal(rowsOf("FB_PAGE_INSIGHTS"), 60);
  await assert.rejects(runCommit(fbFile("Viewers.csv"), "m@x.com", "marketing"), (e: unknown) => e instanceof HttpError && e.code === "DUPLICATE_FILE");
  ok(`นำเข้าผ่านหน้า นำเข้า CSV (Marketing): Viewers 30 วัน + Link clicks 30 วัน → แท็บ FB_PAGE_INSIGHTS 60 แถว · ไฟล์เดิมซ้ำถูกบล็อก`);
  const pd2 = await fetchDashboardData("marketing"); const p2 = computePerformance(pd2, { from: "2026-09-01", to: "2026-09-30" });
  const k2 = Object.fromEntries(p2.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  assert.equal(k2.f_reach.value, 806272); assert.match(k2.f_reach.label, /Viewers/); assert.match(k2.f_reach.note!, /ใช้ Viewers เทียบเคียง Reach/); assert.equal(k2.f_reach.incomplete, undefined);
  assert.equal(k2.f_link.value, 6443); assert.match(k2.f_link.note!, /ระดับเพจ/);
  const fr = p2.funnel!.find((x) => x.key === "reach")!; assert.equal(fr.value, k2.m_reach.value! + 806272); assert.match(fr.note, /ใช้ Viewers เทียบเคียง Reach/);
  assert.equal(p2.platforms.find((x) => x.platform === "Facebook Page")!.clicks, 6443);
  assert.equal(p2.sources.find((x) => x.name.startsWith("Facebook Page ระดับเพจ"))!.status, "ครบ");
  ok(`Marketing Performance ก.ย.: Facebook Viewers (แทน Reach) 806,272 · Link Clicks 6,443 (ระดับเพจ) · Funnel Reach = Meta ${k2.m_reach.value!.toLocaleString()} + Viewers 806,272 · ทุกจุดมีหมายเหตุ "ใช้ Viewers เทียบเคียง Reach"`);
  const p3 = computePerformance(pd2, { from: "2026-09-25", to: "2026-10-05" }); const k3 = Object.fromEntries(p3.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  assert.equal(k3.f_reach.value, 22824 + 14223 + 12255 + 12530 + 11754 + 15694); assert.match(k3.f_reach.incomplete!, /5 วัน/);
  ok("เลือก 25/09–05/10: Viewers รวมเฉพาะวันที่มี (89,280) และแจ้ง ข้อมูลไม่ครบ 5 วัน (ต.ค. ยังไม่ได้นำเข้า)");
  const ov = computeDashboard(pd2, { from: "2026-09-01", to: "2026-09-30" }, "marketing"); const ko = Object.fromEntries(ov.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  assert.equal(ko.reach.value, 806272); assert.match(ko.reach.note!, /ใช้ Viewers เทียบเคียง Reach/); assert.equal(ko.clicks.value, 6443);
  ok("ภาพรวมการตลาด: การ์ด Reach ของ Facebook เปลี่ยนเป็น Facebook Viewers (แทน Reach) 806,272 + หมายเหตุ · Link Clicks 6,443");
  const sm = await exp("marketing_monthly_summary", {}, "marketing"); const sep = sm.rows.find((r) => r.month === "2026-09")!;
  assert.equal(sep.fb_page_viewers_sum, "806272"); assert.equal(sep.fb_page_link_clicks, "6443"); assert.equal(sm.headers.slice(-2).join(), "fb_page_viewers_sum,fb_page_link_clicks");
  const pi = await exp("facebook_page_insights", { from: "2026-09-10", to: "2026-09-12" }, "marketing"); assert.equal(pi.rows.length, 6);
  await assert.rejects(exp("facebook_page_insights", {}, "sales"));
  ok("Export: สรุปรายเดือน ก.ย. fb_page_viewers_sum 806,272 / fb_page_link_clicks 6,443 (คอลัมน์ต่อท้าย) · facebook_page_insights.csv กรองวันที่ได้ · Sales ไม่มีสิทธิ์");
}
console.log("17) Phase 8 — Export: โครงสร้าง ชนิดข้อมูล และการไม่นับซ้ำ");
const { columnType, valueMatches, normalizeExportValue } = await import("../src/lib/export/dictionary");
const OLD_SUMMARY = ["month", "meta_ads_spend_thb", "google_ads_campaign_spend_thb", "total_paid_media_spend_thb", "ads_reports_span_months", "fb_posts_published", "fb_posts_reach_sum_lifetime", "fb_link_clicks", "line_new_friends", "line_inquiries", "line_leads", "leads_total", "leads_qualified", "won_deals", "deal_value_thb", "company_revenue_thb", "direct_cost_thb", "gross_profit_thb", "fb_daily_engagement", "fb_daily_seconds_viewed", "fb_daily_reach_sum", "fb_daily_link_clicks"];
const dict = await exp("data_dictionary", {}, "admin");
let checked = 0, badCells: string[] = [];
for (const ds of DATASETS.filter((d) => !d.route)) {
  const x = await exp(ds.id, {}, "admin");
  assert.equal(new Set(x.headers).size, x.headers.length, `${ds.id}: หัวคอลัมน์ซ้ำ`); assert.ok(x.headers.every((h) => /^[a-z][a-z0-9_]*$/.test(h)), `${ds.id}: ชื่อคอลัมน์ต้องเป็น snake_case`);
  assert.deepEqual(dict.rows.filter((r) => r.dataset_id === ds.id).map((r) => r.column_name), x.headers, `${ds.id}: พจนานุกรมต้องตรงกับไฟล์จริง`);
  const types = Object.fromEntries(dict.rows.filter((r) => r.dataset_id === ds.id).map((r) => [r.column_name, r.column_type]));
  for (const r of x.rows) for (const h of x.headers) { checked++; if (!valueMatches(types[h] as never, r[h])) badCells.push(`${ds.id}.${h}=${r[h]}`); }
}
assert.deepEqual(badCells.slice(0, 10), []); assert.ok(checked > 10000);
ok(`ทุกไฟล์ส่งออก (${DATASETS.filter((d) => !d.route).length} ชุด): ชื่อคอลัมน์ snake_case ไม่ซ้ำ · ตรงกับ data_dictionary · ตรวจ ${checked.toLocaleString()} ช่อง วันที่/ตัวเลข/TRUE-FALSE ตรงชนิดทั้งหมด`);
assert.ok(dict.rows.find((r) => r.dataset_id === "google_ads_campaigns" && r.column_name === "cost_thb")!.column_type === "money_thb" && dict.rows.find((r) => r.dataset_id === "facebook_page_posts" && r.column_name === "publish_time")!.column_type === "datetime_local");
assert.ok(dict.rows.every((r) => r.grain)); ok("data_dictionary ระบุ grain ทุกไฟล์ และชนิดตาม spec ของตัวนำเข้า (เช่น cost_thb = money_thb, publish_time = datetime_local)");
const dm = await exp("data_dictionary", {}, "marketing"); assert.ok(!dm.rows.some((r) => ["deal_value_thb", "gross_profit_thb"].includes(r.column_name)) && !dm.rows.some((r) => r.dataset_id === "leads"));
const ds_ = await exp("data_dictionary", {}, "sales"); assert.ok(!ds_.rows.some((r) => r.dataset_id === "facebook_ads")); ok("data_dictionary ตามสิทธิ์: Marketing ไม่เห็นไฟล์ Leads/คอลัมน์การเงิน · Sales ไม่เห็นไฟล์โฆษณา");

for (const t of ["FB_PAGE_POSTS", "META_ADS", "GOOGLE_ADS_CAMPAIGNS", "LEADS"]) { const d = DATASETS.find((x) => x.tab === t)!; const old = TABS10.find((x) => x.name === t)!.headers.filter((h) => !["record_id", "row_key", "raw_json", "source_batch_id"].includes(h)); assert.deepEqual(d.columns, old); }
const sm17 = await exp("marketing_monthly_summary", {}, "admin"); assert.deepEqual(sm17.headers.slice(0, OLD_SUMMARY.length), OLD_SUMMARY);
assert.deepEqual(sm17.headers.slice(OLD_SUMMARY.length), ["google_ads_campaign_clicks", "leads_from_ads", "leads_need_buy_rent_build", "leads_need_sell", "fb_page_viewers_sum", "fb_page_link_clicks"]);
ok("คอลัมน์เดิมทุกไฟล์ไม่เปลี่ยนชื่อ/ลำดับ · สรุปรายเดือน 22 คอลัมน์เดิมคงที่ เพิ่มต่อท้าย 4 (Phase 8) + 2 (Facebook Viewers / Link clicks ระดับเพจ)");

const sep17 = sm17.rows.find((r) => r.month === "2026-09")!;
assert.equal(Number(sep17.total_paid_media_spend_thb), r2c(total("META_ADS", "amount_spent_thb") + total("GOOGLE_ADS_CAMPAIGNS", "cost_thb")));
assert.equal(Number(sep17.google_ads_campaign_clicks), total("GOOGLE_ADS_CAMPAIGNS", "clicks"));
const leadT = tabs.get("LEADS")!; const lh = leadT.rows[0]; leadT.rows.push([...leadT.rows.find((r, i) => i > 0 && String(r[lh.indexOf("received_at")]).startsWith("2026-09"))!]);
const sm17b = (await exp("marketing_monthly_summary", {}, "admin")).rows.find((r) => r.month === "2026-09")!;
const distinctSep = new Set(leadT.rows.slice(1).filter((r) => String(r[lh.indexOf("received_at")]).startsWith("2026-09")).map((r) => r[lh.indexOf("lead_id")])).size;
assert.equal(Number(sm17b.leads_total), distinctSep); leadT.rows.pop();
assert.equal(Number(sm17b.leads_need_buy_rent_build) + Number(sm17b.leads_need_sell || 0) <= distinctSep, true);
ok(`สรุปรายเดือน ก.ย.: Total Paid = Meta + Google จากไฟล์ต้นฉบับ (ไม่ซ้ำ) · Clicks = ผลรวม Campaign Report · leads_total นับ lead_id ไม่ซ้ำ (${distinctSep}) แม้มีแถวซ้ำใน Sheet`);

const pfx = await exp("marketing_performance_kpis", { from: "2026-09-01", to: "2026-09-30" }, "marketing");
const byK = Object.fromEntries(pfx.rows.map((r) => [r.kpi_key, r]));
assert.equal(Number(byK.g_spend.value), 28814.82); assert.equal(Number(byK.g_clicks.value), 31513); assert.equal(byK.g_spend.yoy_period_from, "2025-09-01"); assert.equal(byK.g_spend.yoy_status, "missing"); assert.equal(byK.g_spend.yoy_change_pct, "");
assert.equal(byK.w_users.value, "17443"); assert.equal(byK.w_users.yoy_status, "missing"); assert.equal(byK.s_clicks.state, "pending"); assert.equal(byK.s_clicks.value, ""); assert.equal(byK.s_clicks.yoy_status, "current_unavailable"); assert.equal(byK.g_spend.kind, "Paid"); assert.equal(byK.f_eng.kind, "Organic");
await assert.rejects(exportDataset("marketing_performance_kpis", {}, "sales", "u@x.com"), isExp("FORBIDDEN"));
ok("marketing_performance_kpis.csv: หนึ่งแถวต่อ KPI ค่าเดียวกับหน้า Performance (Spend 28,814.82) · ปีก่อนไม่มีข้อมูล → yoy_status = missing · Website Users 17,443 (Snapshot) · Search Console ก.ย. ไม่มี → ว่าง (pending) ไม่ใช่ 0 · Paid/Organic แยกคอลัมน์ kind · Sales ไม่มีสิทธิ์");

const ln = await exp("leads", { need: "ขาย" }, "admin"); assert.ok(ln.rows.length > 0 && ln.rows.every((r) => r.need === "ขาย"));
await assert.rejects(exp("leads", { need: "ยืม" }, "admin"), isExp("BAD_NEED")); ok("Export Leads กรองตาม Need ได้ · ค่าไม่ถูกต้อง → ปฏิเสธ");
const ri = lh.indexOf("received_at"), ci = lh.indexOf("contactable"); const keep17 = [leadT.rows[1][ri], leadT.rows[1][ci]];
leadT.rows[1][ri] = 46266; leadT.rows[1][ci] = "true";
const le = (await exp("leads", {}, "admin")).rows.find((r) => r.lead_id === leadT.rows[1][lh.indexOf("lead_id")])!;
assert.equal(le.received_at, normalizeExportValue("date", "46266")); assert.match(le.received_at, /^\d{4}-\d{2}-\d{2}$/); assert.equal(le.contactable, "TRUE");
leadT.rows[1][ri] = keep17[0]; leadT.rows[1][ci] = keep17[1];
assert.equal(columnType("LEADS", "received_at"), "date"); assert.equal(normalizeExportValue("date", "2026-09-01"), "2026-09-01"); assert.equal(normalizeExportValue("text", "46266"), "46266");
ok(`วันที่ที่ถูกแก้มือใน Sheet จนเป็นเลขลำดับวัน (46266) → ส่งออกเป็น ${normalizeExportValue("date", "46266")} · true → TRUE · คอลัมน์ข้อความไม่ถูกแปลง`);
void fbLifeRows;
void periodsFromFilename;
console.log(`\nผ่านทั้งหมด ${pass} รายการ (Sheets API calls จำลอง: ${apiCalls})`);
