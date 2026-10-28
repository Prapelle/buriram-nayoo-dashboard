// Phase 9 — Integration Test ระดับ HTTP
// เปิดเซิร์ฟเวอร์ Next จริง (ผลจาก next build) แทน Google Sheets/OAuth ด้วยตัวจำลอง แล้วเรียกหน้าเว็บและ API แบบที่ผู้ใช้เรียก
// ล็อกอินด้วยคุกกี้เซสชันจริงของ Auth.js (เข้ารหัสด้วย AUTH_SECRET) — role อ่านจากแท็บ APP_USERS ทุกคำขอ
// รัน: node tests/integration/run.mjs   (ต้อง build ก่อน: npx next build หรือ opennextjs-cloudflare build)
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";

const PORT = 3210, CTRL = 3211, BASE = `http://127.0.0.1:${PORT}`;
const FIX = process.env.FIXTURE_DIR ?? "tests/fixtures";
const SECRET = "integration-secret-0123456789abcdef0123456789abcdef";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const env = {
  ...process.env, PORT: String(PORT), HOSTNAME: "127.0.0.1", NODE_ENV: "production", FAKE_CONTROL_PORT: String(CTRL),
  NODE_OPTIONS: `--import ${new URL("./preload.mjs", import.meta.url).pathname}`,
  AUTH_SECRET: SECRET, AUTH_GOOGLE_ID: "x", AUTH_GOOGLE_SECRET: "x", AUTH_TRUST_HOST: "true",
  GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
  INITIAL_ADMIN_EMAIL: "admin@example.com",
};
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = ""; server.stdout.on("data", (d) => { serverLog += d; }); server.stderr.on("data", (d) => { serverLog += d; });
const stop = () => { try { server.kill("SIGTERM"); } catch { /* */ } };
process.on("exit", stop);

let pass = 0; const results = [];
const ok = (area, m) => { pass++; results.push([area, m]); console.log(`  ✓ [${area}] ${m}`); };
const ctl = async (p, body) => (await fetch(`http://127.0.0.1:${CTRL}${p}`, body ? { method: "POST", body: JSON.stringify(body) } : undefined)).json();
const cookies = new Map();
async function cookieFor(email) {
  if (!cookies.has(email)) cookies.set(email, await encode({ token: { email, sub: email, roleCheckedAt: 0 }, secret: SECRET, salt: "authjs.session-token" }));
  return `authjs.session-token=${cookies.get(email)}`;
}
async function call(path, { as, method = "GET", body, headers = {} } = {}) {
  const h = { ...headers, "sec-fetch-site": headers["sec-fetch-site"] ?? "same-origin" };
  if (as) h.cookie = await cookieFor(as);
  if (body !== undefined) h["content-type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
  const buf = new Uint8Array(await r.arrayBuffer()); const text = new TextDecoder().decode(buf); const bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  let json = null; try { json = JSON.parse(text); } catch { /* html/csv */ }
  return { status: r.status, location: r.headers.get("location") ?? "", text, json, bom, type: r.headers.get("content-type") ?? "", disposition: r.headers.get("content-disposition") ?? "", html: text.replace(/<!-- -->/g, "") };
}
/** redirect: แบบ HTTP 30x หรือแบบ streaming ของ Next (หน้าที่มี loading.tsx ส่ง 200 แล้วสั่ง redirect ในเนื้อหา) */
const redirectedTo = (r, to) => ([302, 303, 307, 308].includes(r.status) && r.location.includes(to)) || (r.status === 200 && (r.text.includes(`NEXT_REDIRECT;replace;${to};`) || r.text.includes(`NEXT_REDIRECT;push;${to};`) || new RegExp(`http-equiv="refresh" content="[^"]*url=${to}`).test(r.text)));
const file = (name) => readFileSync(`${FIX}/${name}`, "utf8");
const ADMIN = "admin@example.com", MKT = "marketing@example.com", SALES = "sales@example.com", OFF = "inactive@example.com";

async function waitUp() {
  for (let i = 0; i < 120; i++) { try { const r = await fetch(`${BASE}/login`); if (r.status < 500) return; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error("server did not start\n" + serverLog);
}

try {
  await waitUp();
  console.log("เซิร์ฟเวอร์ Next (production build) พร้อม — Google Sheets/OAuth เป็นตัวจำลอง\n");

  console.log("10) Login และสิทธิ์ผู้ใช้");
  let r = await call("/");
  assert.ok(redirectedTo(r, "/login"), `anon / → ${r.status} ${r.location}`);
  for (const p of ["/leads", "/performance", "/export", "/settings"]) { r = await call(p); assert.ok(redirectedTo(r, "/login"), `anon ${p} → ${r.status}`); assert.ok(!r.html.includes("ภาพรวมการตลาด</h1>")); }
  assert.equal((await call("/api/leads")).status, 401); assert.equal((await call("/api/export/leads")).status, 401);
  ok("Login", "ยังไม่ล็อกอิน: หน้าเว็บพาไป /login · API ตอบ 401 (Leads, Export)");
  r = await call("/api/init", { as: ADMIN, method: "POST" }); assert.equal(r.status, 200, r.text); assert.ok(r.json.createdTabs.length > 20);
  ok("Login", `Admin คนแรก (INITIAL_ADMIN_EMAIL) เตรียม Google Sheet ได้ — สร้าง ${r.json.createdTabs.length} แท็บ`);
  // เพิ่มสมาชิกผ่านหน้า ตั้งค่า (API /api/users) แทนการแก้ Sheet ด้วยมือ
  for (const [email, role, active] of [[MKT, "marketing", true], [SALES, "sales", true], [OFF, "sales", false]]) {
    r = await call("/api/users", { as: ADMIN, method: "POST", body: { email: email.toUpperCase(), display_name: role, role, active } }); assert.equal(r.status, 200, r.text);
  }
  r = await call("/api/users", { as: ADMIN }); assert.equal(r.json.users.length, 4); assert.ok(r.json.users.every((u) => u.email === u.email.toLowerCase()));
  assert.equal((await call("/api/users", { as: ADMIN, method: "POST", body: { email: MKT, role: "sales" } })).json.code, "DUPLICATE_EMAIL");
  assert.equal((await call("/api/users", { as: MKT })).status, 403); assert.equal((await call("/api/users", { as: MKT, method: "POST", body: { email: "x@y.com", role: "admin" } })).status, 403);
  const meRow = r.json.users.find((u) => u.email === ADMIN);
  r = await call("/api/users", { as: ADMIN, method: "POST", body: { ...meRow, role: "sales", updated_at_seen: meRow.updated_at } }); assert.equal(r.status, 409); assert.equal(r.json.code, "SELF_CHANGE");
  r = await call("/settings", { as: ADMIN }); assert.ok(r.html.includes("สมาชิกและสิทธิ์"));
  ok("Login", "หน้า ตั้งค่า → เพิ่มสมาชิก 3 คน (อีเมลเก็บเป็นตัวเล็ก) · อีเมลซ้ำ 409 · Marketing จัดการผู้ใช้ไม่ได้ (403) · Admin ลด Role ตัวเองไม่ได้");
  assert.equal((await call("/api/leads", { as: MKT })).status, 403); assert.equal((await call("/api/import/plan", { as: SALES, method: "POST", body: {} })).status, 403);
  assert.equal((await call("/api/init", { as: MKT, method: "POST" })).status, 403);
  assert.equal((await call("/api/leads", { as: OFF })).status, 401); assert.equal((await call("/api/leads", { as: "stranger@example.com" })).status, 401);
  let ul = (await call("/api/users", { as: ADMIN })).json.users; let mrow = ul.find((u) => u.email === MKT);
  r = await call("/api/users", { as: ADMIN, method: "POST", body: { ...mrow, active: false, updated_at_seen: mrow.updated_at } }); assert.equal(r.status, 200);
  assert.equal((await call("/api/export/facebook_ads", { as: MKT })).status, 401);
  ul = (await call("/api/users", { as: ADMIN })).json.users; mrow = ul.find((u) => u.email === MKT);
  r = await call("/api/users", { as: ADMIN, method: "POST", body: { ...mrow, active: true, updated_at_seen: mrow.updated_at } }); assert.equal(r.status, 200);
  assert.equal((await call("/api/export/facebook_ads", { as: MKT })).status, 200);
  ok("Login", "ระงับสมาชิกจากหน้า ตั้งค่า → เข้าไม่ได้ (401 — ในเทสต์ตรวจ Role ทุกคำขอ ใช้งานจริงมีผลภายใน 5 นาที) · เปิดใช้งานใหม่ → กลับมาใช้ได้");
  ok("Login", "Marketing เข้า Leads ไม่ได้ (403) · Sales นำเข้าไม่ได้ (403) · Marketing เตรียม Sheet ไม่ได้ · ผู้ใช้ปิดใช้งาน/ไม่อยู่ในรายชื่อ → 401");
  r = await call("/leads", { as: MKT }); assert.ok(redirectedTo(r, "/"), `/leads as MKT → ${r.status}`); assert.ok(!r.html.includes("เพิ่ม Lead"));
  r = await call("/performance", { as: SALES }); assert.ok(redirectedTo(r, "/"), `/performance as SALES → ${r.status}`); assert.ok(!r.html.includes("Google Ads Spend"));
  for (const p of ["/import", "/settings", "/facebook-ads"]) { r = await call(p, { as: SALES }); assert.ok(redirectedTo(r, "/"), `${p} as SALES → ${r.status}`); }
  r = await call("/performance", { as: MKT }); assert.equal(r.status, 200); assert.ok(!r.html.includes('href="/leads"'));
  r = await call("/", { as: SALES }); assert.equal(r.status, 200); assert.ok(!r.html.includes('href="/performance"') && !r.html.includes('href="/import"'));
  ok("Login", "หน้าเว็บตามสิทธิ์: Marketing → /leads ถูกพาออก · Sales → /performance, /import, /settings, /facebook-ads ถูกพาออก (ไม่แสดงเนื้อหา) · เมนูของ Sales ไม่มี Performance/นำเข้า");
  assert.equal((await call("/api/leads", { as: ADMIN, method: "POST", body: {}, headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  ok("Login", "คำขอข้ามเว็บ (cross-site) แม้มีคุกกี้ Admin → 403");

  console.log("1) Facebook Page Import");
  const daily = { filename: "Sep-01-2026_Sep-30-2026_4677103402520791.csv", text: file("Sep-01-2026_Sep-30-2026_4677103402520791.csv") };
  r = await call("/api/import/plan", { as: MKT, method: "POST", body: daily }); assert.equal(r.status, 200, r.text);
  assert.deepEqual([r.json.counts.insert, r.json.counts.skip], [120, 270]); assert.equal(r.json.spec.id, "fb_page");
  r = await call("/api/import/commit", { as: MKT, method: "POST", body: daily }); assert.equal(r.status, 200, r.text);
  assert.equal((await ctl("/tab?name=FB_PAGE_POSTS")).rows.length - 1, 120);
  ok("FB Page", "ไฟล์รายวันจริง: พรีวิว เพิ่ม 120 / ข้าม 270 → บันทึก 120 แถวใน Sheet");
  r = await call("/api/import/commit", { as: MKT, method: "POST", body: daily }); assert.equal(r.status, 409); assert.equal(r.json.code, "DUPLICATE_FILE");
  r = await call("/api/import/commit", { as: ADMIN, method: "POST", body: { ...daily, overrideDuplicate: true } }); assert.equal(r.status, 200); assert.equal(r.json.counts.insert, 0);
  assert.equal((await ctl("/tab?name=FB_PAGE_POSTS")).rows.length - 1, 120);
  ok("FB Page", "ไฟล์ซ้ำ: Marketing ถูกบล็อก (409) · Admin ยืนยัน → เพิ่ม 0 แถว ไม่นับซ้ำ");
  r = await call("/api/import/plan", { as: MKT, method: "POST", body: { filename: "x.csv", text: "foo,bar\n1,2\n" } }); assert.ok(r.status >= 400 && r.status < 500 && r.json.code, r.text);
  r = await call("/api/import/plan", { as: MKT, method: "POST", body: { filename: "x.csv", text: "" } }); assert.ok(r.status >= 400 && r.status < 500);
  const header = daily.text.replace(/^\ufeff/, "").split(/\r?\n/)[0];
  const cols = header.match(/("[^"]*"|[^,]+)/g).map((h) => h.replace(/"/g, ""));
  const rowOf = (vals) => cols.map((c) => vals[c] ?? "").join(",");
  const base = { "Post ID": "1", "Page ID": "2", "Page name": "เพจทดสอบ", "Publish time": "09/01/2026 10:00", "Post type": "Photo", Permalink: "https://x", Reactions: "1" };
  const conflictCsv = [header, rowOf({ ...base, Date: "13/09/2026" }), rowOf({ ...base, "Post ID": "3", Date: "09/14/2026" })].join("\n");
  r = await call("/api/import/plan", { as: MKT, method: "POST", body: { filename: "conflict.csv", text: conflictCsv } });
  assert.equal(r.status, 422); assert.equal(r.json.code, "DATE_FORMAT_CONFLICT");
  assert.equal((await ctl("/tab?name=FB_PAGE_POSTS")).rows.length - 1, 120);
  ok("FB Page", "ไฟล์ผิด: หัวคอลัมน์ไม่รู้จัก / ไฟล์ว่าง → 4xx · วันที่ปน วัน/เดือน กับ เดือน/วัน → 422 DATE_FORMAT_CONFLICT · ไม่มีการเขียนข้อมูล");

  console.log("2) Facebook Ads + 3) Google Ads");
  r = await call("/api/import/commit", { as: MKT, method: "POST", body: { filename: "Facebookads.csv", text: file("Facebookads.csv") } }); assert.equal(r.status, 200, r.text); assert.equal(r.json.counts.insert, 103);
  ok("FB Ads", "Facebookads.csv นำเข้า 103 แถว");
  for (const n of ["Campaigns_2026_09_01-2026_09_30_.csv", "Time_series_2026_09_01-2026_09_30_.csv"]) { r = await call("/api/import/commit", { as: MKT, method: "POST", body: { filename: n, text: file(n) } }); assert.equal(r.status, 200, r.text); }
  r = await call("/api/import/commit", { as: MKT, method: "POST", body: { filename: "Campaigns.csv", text: file("Campaigns_2026_09_01-2026_09_30_.csv") } }); assert.equal(r.status, 422); assert.equal(r.json.code, "PERIOD_REQUIRED");
  ok("Google Ads", "Campaign Report + Time series นำเข้าได้ · ไฟล์ไม่มีช่วงวันที่ในชื่อและไม่ได้กรอก → 422 PERIOD_REQUIRED");

  console.log("4) Marketing Overview + 5) Lead Management");
  r = await call("/?from=2026-09-01&to=2026-09-30", { as: ADMIN }); assert.equal(r.status, 200);
  assert.ok(r.html.includes("66,372.36"), "Total Paid"); assert.ok(r.html.includes("37,557.54") && r.html.includes("28,814.82"));
  assert.ok(r.html.includes("รอข้อมูล")); ok("Overview", "Total Paid ฿66,372.36 = Meta 37,557.54 + Google 28,814.82 · ยังไม่มี Lead → รอข้อมูล (ไม่ใช่ 0)");
  r = await call("/?from=2026-09-10&to=2026-09-20", { as: ADMIN }); assert.ok(r.html.includes("ช่วงที่เลือกตัดผ่านช่วงของรายงาน"));
  ok("Overview", "กรอง 10–20 ก.ย. (รายงานเป็นยอดทั้งเดือน) → แจ้งเตือนว่าตัวเลขเป็นยอดเต็มของรายงาน");
  const lead = (x) => ({ received_at: "2026-09-05", source_channel: "Referral", customer_name: "ทดสอบ", need: "ซื้อ", ...x });
  r = await call("/api/leads", { as: SALES, method: "POST", body: lead({ customer_name: "ผู้ขาย", phone: "0811111111", need: "ขาย", sell_status: "นัดทำสัญญา", staff: "พี่เอ" }) }); assert.equal(r.status, 200, r.text);
  const sellLead = r.json.lead; assert.equal(sellLead.status, "Qualified");
  r = await call("/?from=2026-09-01&to=2026-09-30", { as: ADMIN }); assert.ok(/CPL \(Lead จากโฆษณา\)[\s\S]{0,400}N\/A/.test(r.html), "CPL N/A");
  ok("Overview", "มี Lead แต่ไม่มี Lead จากโฆษณา → CPL จาก Ads = N/A (หารด้วย 0)");
  r = await call("/api/leads", { as: SALES, method: "POST", body: lead({ customer_name: "ซ้ำ", phone: "+66 81 111 1111" }) }); assert.equal(r.status, 409); assert.equal(r.json.code, "DUPLICATE_WARNING");
  r = await call("/api/leads", { as: SALES, method: "POST", body: lead({ customer_name: "ผิด", phone: "0822222222", need: "ขาย", sell_status: "Hot" }) }); assert.equal(r.status, 422);
  ok("Leads", "เบอร์ซ้ำ (+66) → เตือน 409 ไม่บันทึก · สถานะไม่ตรงกับ Need → 422");
  r = await call("/api/leads", { as: SALES, method: "POST", body: { ...sellLead, need: "ซื้อ", buy_status: "Hot", updated_at_seen: sellLead.updated_at } }); assert.equal(r.status, 409); assert.equal(r.json.code, "NEED_CHANGE");
  r = await call("/api/leads", { as: SALES, method: "POST", body: { ...sellLead, need: "ซื้อ", buy_status: "Hot", updated_at_seen: sellLead.updated_at, confirmNeedChange: true } }); assert.equal(r.status, 200); assert.equal(r.json.lead.sell_status, "");
  ok("Leads", "เปลี่ยน Need ขาย → ซื้อ: ต้องยืนยันก่อน (409) · ยืนยันแล้วล้าง Sell Status เดิม");
  for (const [ch, d] of [["Facebook Ads", "2026-09-12"], ["Google Ads", "2026-09-20"], ["Facebook Ads", "2026-10-03"]]) {
    r = await call("/api/leads", { as: SALES, method: "POST", body: lead({ customer_name: `Ads ${d}`, phone: `08${d.replace(/-/g, "").slice(2)}`, source_channel: ch, received_at: d, buy_status: "Warm" }) }); assert.equal(r.status, 200, r.text);
  }
  r = await call("/?from=2026-09-01&to=2026-09-30", { as: MKT }); assert.ok(r.html.includes("33,186.18"), "CPL ads = 66372.36/2"); assert.ok(r.html.includes("22,124.12"), "CPL all = /3");
  assert.ok(!r.html.includes("0811111111"));
  ok("Overview", "CPL จาก Ads = 66,372.36 ÷ 2 = 33,186.18 · CPL ทั้งหมด ÷ 3 = 22,124.12 (Lead ต.ค. ไม่นับ) · หน้า Marketing ไม่มีเบอร์ลูกค้า");
  r = await call("/api/leads", { as: SALES }); assert.equal(r.json.rows.length, 4); assert.deepEqual(r.json.staff, ["พี่เอ"]);
  const toCall = r.json.rows.find((x) => x.source_channel === "Google Ads");
  r = await call("/api/leads", { as: SALES, method: "POST", body: { ...toCall, call_status: "ติดต่อได้แล้ว", updated_at_seen: toCall.updated_at } }); assert.equal(r.status, 200, r.text);
  r = await call("/?from=2026-09-01&to=2026-09-30", { as: MKT });
  assert.ok(/Qualified Leads<\/div>[\s\S]{0,120}>1</.test(r.html), "Qualified Leads = 1"); assert.ok(r.html.includes("Qualified Leads แยกตามช่องทาง")); assert.ok(!r.html.includes("Lead Qualification"));
  for (const gone of ["Won Deals", "Deal Value", "Company Revenue", "Direct Cost", "Gross Profit", "Lead-to-Sale"]) assert.ok(!r.html.includes(gone), gone);
  ok("Overview", "Qualified Leads = 1 (Call Status ติดต่อได้แล้ว) + กราฟแยกช่องทาง · ไม่มีการ์ด Won/Deal/Revenue/Cost/Gross Profit/Lead-to-Sale");
  ok("Leads", "รายการ Lead 4 ราย · รายชื่อ Staff สำหรับเลือก");

  console.log("6) Website Analytics");
  r = await call("/website", { as: MKT }); assert.equal(r.status, 200); assert.ok(r.html.includes("นำเข้าไฟล์ GA4 / Search Console"));
  r = await call("/website", { as: SALES }); assert.ok(redirectedTo(r, "/")); assert.equal((await call("/api/website", { as: SALES })).status, 403);
  const day = (d, c, i, p) => ({ source: "search_console", property: "Page: +buriram", granularity: "day", report_start: d, report_end: d, search_clicks: c, search_impressions: i, search_ctr_pct: Math.round(c / i * 10000) / 100, search_position: p });
  const chart = { kind: "gsc_chart", filename: "Chart.csv", sha256: "a".repeat(64), period: { start: "2026-10-01", end: "2026-10-02" }, property: "Page: +buriram", summary: [day("2026-10-01", 163, 7379, 6.8), day("2026-10-02", 169, 7529, 6.9)], dims: [] };
  const ga = { kind: "ga4_pages", filename: "pages.csv", sha256: "b".repeat(64), period: { start: "2026-10-01", end: "2026-10-02" }, property: "buriram",
    summary: [{ source: "ga4", property: "buriram", granularity: "period", report_start: "2026-10-01", report_end: "2026-10-02", website_users: "", page_views: 3000, user_engagement_sec: 90000, event_count: 0, key_events: 0, total_revenue: 0, pages_count: 2 }],
    dims: [{ source: "ga4", property: "buriram", report_start: "2026-10-01", report_end: "2026-10-02", dimension_type: "ga4_page", dimension_value: "/buriram", views: 2000, user_engagement_sec: 50000 }, { source: "ga4", property: "buriram", report_start: "2026-10-01", report_end: "2026-10-02", dimension_type: "ga4_page", dimension_value: "/blogs/buriram/x", views: 1000, user_engagement_sec: 40000 }] };
  r = await call("/api/website", { as: MKT, method: "POST", body: { action: "plan", batches: [chart, ga] } }); assert.equal(r.status, 200, r.text); assert.deepEqual(r.json.plans.map((p) => p.counts.insert), [2, 3]);
  r = await call("/api/website", { as: MKT, method: "POST", body: { action: "commit", batches: [chart, ga] } }); assert.equal(r.status, 200, r.text);
  r = await call("/api/website", { as: MKT, method: "POST", body: { action: "commit", batches: [chart] } }); assert.equal(r.status, 409); assert.equal(r.json.code, "DUPLICATE_FILE");
  r = await call("/api/website", { as: MKT, method: "POST", body: { action: "commit", batches: [{ ...ga, sha256: "c".repeat(64), summary: [{ ...ga.summary[0], page_views: 9999 }] }] } }); assert.equal(r.status, 422);
  r = await call("/api/website", { as: MKT, method: "POST", body: { action: "manual", manual: { report_start: "2026-10-01", report_end: "2026-10-02", website_users: "1500" } } }); assert.equal(r.status, 200, r.text);
  r = await call("/performance?from=2026-10-01&to=2026-10-02", { as: MKT });
  assert.ok(/Website Users<\/div>[\s\S]{0,80}>1,500</.test(r.html), "users"); assert.ok(/Website Page Views<\/div>[\s\S]{0,80}>3,000</.test(r.html), "pv"); assert.ok(r.html.includes("1 นาที 0 วินาที"), "duration 60s"); assert.ok(/Search Clicks<\/div>[\s\S]{0,80}>332</.test(r.html), "clicks");
  r = await call("/api/export/website_analytics", { as: MKT }); assert.equal(r.status, 200); assert.ok(r.text.includes("ga4") && r.text.includes("manual"));
  ok("Website", "นำเข้าผ่าน API: พรีวิว → บันทึก · ไฟล์ซ้ำ 409 · ยอดรวมไม่ตรงรายหน้า 422 · กรอก Users 1,500 → หน้า Performance แสดง Users 1,500 / Page Views 3,000 / Duration 1 นาที (90,000 ÷ 1,500) / Search Clicks 332 · Export ได้ · Sales เข้าไม่ได้");
  r = await call("/performance?from=2026-09-01&to=2026-09-30", { as: MKT }); assert.ok(/Website Users[\s\S]{0,200}รอข้อมูล/.test(r.html));
  ok("Website", "ช่วง ก.ย. ไม่มีรายงานเว็บไซต์ → Website Users/Page Views แสดง รอข้อมูล ไม่ใช่ 0");

  console.log("7) Marketing Performance + 8) YoY");
  assert.ok(r.html.includes("28,814.82") && r.html.includes("31,513") && r.html.includes("0.91") && r.html.includes("37,557.54"));
  assert.ok(/Reactions \+ Comments \+ Shares[\s\S]{0,80}319/.test(r.html));
  ok("Performance", "Google Spend ฿28,814.82 / Clicks 31,513 / CPC ฿0.91 · Meta ฿37,557.54 · Facebook Engagement 319");
  r = await call("/performance?from=2026-09-10&to=2026-09-20", { as: MKT }); assert.ok(r.html.includes("9,613.98") && r.html.includes("9,360"));
  ok("Performance", "กรอง 10–20 ก.ย.: Google Spend ฿9,613.98 / Clicks 9,360 จาก Time series");
  r = await call("/performance?from=2026-09-01&to=2026-09-30&compare=yoy", { as: MKT }); assert.ok(r.html.includes("ปีก่อน: Missing Data") && r.html.includes("01/09/2025"));
  r = await call("/?from=2026-09-01&to=2026-09-30&compare=yoy", { as: ADMIN }); assert.ok(r.html.includes("ปีก่อน: Missing Data") && r.html.includes("ช่วงเดียวกันของปีก่อน"));
  r = await call("/?compare=yoy", { as: ADMIN }); assert.ok(r.html.includes("เลือกวันที่"));
  ok("YoY", "เทียบ ก.ย. 2025: ไม่มีข้อมูลปีก่อน → Missing Data ทั้งสองหน้า · ไม่เลือกวันที่ในภาพรวม → บอกให้เลือก");

  console.log("9) Export");
  r = await call("/api/export/marketing_monthly_summary", { as: MKT }); assert.equal(r.status, 200); assert.ok(r.bom, "UTF-8 BOM"); assert.match(r.type, /text\/csv/); assert.match(r.disposition, /marketing_monthly_summary\.csv/);
  const rows = r.text.replace(/^\ufeff/, "").trim().split(/\r?\n/).map((l) => l.split(",")); const H = rows[0]; const sep = Object.fromEntries(H.map((h, i) => [h, rows.find((x) => x[0] === "2026-09")[i]]));
  assert.equal(sep.total_paid_media_spend_thb, "66372.36"); assert.equal(sep.leads_total, "3"); assert.equal(sep.google_ads_campaign_clicks, "31513"); assert.ok(!H.includes("deal_value_thb"));
  ok("Export", "ดาวน์โหลดจริงผ่าน HTTP: text/csv + UTF-8 BOM + ชื่อไฟล์ · สรุปรายเดือน ก.ย.: Total Paid 66372.36 (ตัวเลขล้วน) · Leads 3 · Clicks 31513 · Marketing ไม่มีคอลัมน์การเงิน");
  r = await call("/api/export/facebook_ads", { as: MKT }); assert.ok(r.text.includes(",post_engagement,") && r.text.includes("actions:post_engagement"));
  r = await call("/api/export/marketing_performance_kpis?from=2026-09-01&to=2026-09-30", { as: MKT }); assert.ok(r.text.includes("g_spend") && r.text.includes("28814.82") && r.text.includes("missing"));
  r = await call("/api/export/data_dictionary", { as: SALES }); assert.equal(r.status, 200); assert.ok(r.text.includes("leads.csv") && !r.text.includes("facebook_ads.csv"));
  assert.equal((await call("/api/export/leads", { as: MKT })).status, 403); assert.equal((await call("/api/export/leads?need=ยืม", { as: SALES })).status, 400);
  r = await call("/api/export/leads?need=" + encodeURIComponent("ซื้อ"), { as: SALES }); assert.equal(r.status, 200); assert.equal(r.text.trim().split(/\r?\n/).length - 1, 4);
  ok("Export", "Facebook Ads: ชื่อ Action ตัด prefix + ค่าต้นฉบับ · KPI Export (YoY missing) · Dictionary ตามสิทธิ์ · Leads: Marketing 403, Need ผิด 400, กรอง Need ได้");
  const audit = (await ctl("/tab?name=AUDIT_LOG")).rows; assert.ok(audit.some((x) => x.includes("export")) && audit.some((x) => x.includes("lead_create")) && audit.some((x) => x.includes("import_commit") || x.join("|").includes("import")));
  ok("Export", "Audit Log บันทึกการนำเข้า, การสร้าง Lead และการส่งออก");

  console.log("11) Health");
  r = await call("/api/health", { as: ADMIN }); assert.equal(r.status, 200, r.text); assert.equal((await call("/api/health", { as: SALES })).status, 403);
  ok("Health", "ตรวจสอบระบบ: Admin ได้ · Sales 403");

  const st = await ctl("/stats");
  console.log(`\nผ่านทั้งหมด ${pass} รายการ (เรียก Google Sheets API จำลอง ${st.calls} ครั้ง)`);
} catch (e) {
  console.error("\n✗ FAIL:", e?.message ?? e); console.error(serverLog.split("\n").slice(-30).join("\n")); process.exitCode = 1;
} finally { stop(); }
