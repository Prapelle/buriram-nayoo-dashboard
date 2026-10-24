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
assert.equal(r2.createdTabs.length, 0); assert.deepEqual(r2.addedHeaders, {}); assert.equal(rowsOf("APP_USERS"), 1); assert.equal(rowsOf("APP_CONFIG"), 3);
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
void periodsFromFilename;
console.log(`\nผ่านทั้งหมด ${pass} รายการ (Sheets API calls จำลอง: ${apiCalls})`);
