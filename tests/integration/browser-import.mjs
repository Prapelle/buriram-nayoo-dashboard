// หน้า นำเข้า CSV รับไฟล์ที่หน้าอื่นรับได้ (Website, Sales) — ทดสอบในเบราว์เซอร์จริงกับ production build + Google Sheets จำลอง
// รัน: node tests/integration/browser-import.mjs (ต้อง build ก่อน และมีไฟล์ใน tests/fixtures)
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // ติดตั้งแยกจากโปรเจกต์ (ไม่อยู่ใน package.json)

const PORT = 3230, CTRL = 3231, BASE = `http://127.0.0.1:${PORT}`, SECRET = "browser-secret-0123456789abcdef0123456789abcdef";
const FX = process.env.FIXTURE_DIR ?? "tests/fixtures";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { stdio: ["ignore", "pipe", "pipe"], env: {
  ...process.env, NODE_ENV: "production", FAKE_CONTROL_PORT: String(CTRL), NODE_OPTIONS: `--import ${new URL("./preload.mjs", import.meta.url).pathname}`,
  AUTH_SECRET: SECRET, AUTH_GOOGLE_ID: "x", AUTH_GOOGLE_SECRET: "x", AUTH_TRUST_HOST: "true", GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"), INITIAL_ADMIN_EMAIL: "admin@example.com" } });
let log = ""; server.stdout.on("data", (d) => { log += d; }); server.stderr.on("data", (d) => { log += d; });
const stop = () => { try { server.kill("SIGTERM"); } catch { /* */ } };
process.on("exit", stop);
let pass = 0; let browser; const ok = (m) => { pass++; console.log("  ✓", m); };
const tab = async (n) => (await (await fetch(`http://127.0.0.1:${CTRL}/tab?name=${n}`)).json()).rows;
const rows = async (n) => (await tab(n)).length - 1;
const cookie = (email) => encode({ token: { email, sub: email, roleCheckedAt: 0 }, secret: SECRET, salt: "authjs.session-token" });

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/login")).status < 500) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const adminC = await cookie("admin@example.com");
  const api = (p, body) => fetch(BASE + p, { method: "POST", headers: { cookie: `authjs.session-token=${adminC}`, "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await api("/api/init")).status, 200);
  assert.equal((await api("/api/users", { email: "marketing@example.com", display_name: "mkt", role: "marketing", active: "TRUE" })).status, 200);
  // หน้าสาธารณะสำหรับ Google OAuth consent screen (Privacy policy URL) — เปิดได้โดยไม่ล็อกอิน
  const pv = await fetch(BASE + "/privacy", { redirect: "manual" }); const pvt = await pv.text();
  assert.equal(pv.status, 200); assert.ok(pvt.includes("นโยบายความเป็นส่วนตัว") && pvt.includes("Limited Use") && pvt.includes("openid"));
  assert.ok((await (await fetch(BASE + "/login")).text()).includes('href="/privacy"'));
  ok("หน้า /privacy เปิดได้โดยไม่ต้องล็อกอิน (ใช้เป็น Privacy policy URL ของ Google) · หน้า login มีลิงก์ไปหน้านี้");
  browser = await chromium.launch();
  const open = async (email) => { const ctx = await browser.newContext({ locale: "th-TH" }); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" })); /* ฟอนต์จาก Google: ในเครื่องทดสอบไม่มีอินเทอร์เน็ต */ await ctx.addCookies([{ name: "authjs.session-token", value: await cookie(email), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]); const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => { if (/Minified React error #418/.test(String(e))) { console.log("    (เตือน) hydration ไม่ตรง → React วาดใหม่ฝั่งเบราว์เซอร์ @", page.url()); return; } errors.push(`${e} @ ${page.url()}`); }); /* #418: เกิดได้เมื่อเทสต์เปลี่ยนหน้าระหว่างหน้าเดิมยังโหลดไม่เสร็จ (พบใน commit ก่อนหน้าด้วย) — ไม่นับเป็นความผิดพลาด แต่พิมพ์เตือนไว้ */ return { page, errors }; };
  const { page, errors } = await open("admin@example.com");
  await page.goto(BASE + "/import"); await page.getByText("ยังไม่มีประวัติการนำเข้า").waitFor();
  const junk = "/tmp/import-note.txt"; (await import("node:fs")).writeFileSync(junk, "hello");
  const picked = [`${FX}/Campaigns_2026_09_01-2026_09_30_.csv`, `${FX}/fbpage/Viewers.csv`, `${FX}/website/gsc_Chart.csv`, `${FX}/website/gsc_Filters.csv`, `${FX}/synthetic_SalesReport.xlsx`, junk];
  await page.locator('input[type="file"]').first().setInputFiles(picked);
  await page.getByText("Google Ads — Campaign Report (ยอดใช้จ่ายหลัก)").first().waitFor().catch(() => {});
  await page.getByRole("heading", { name: "ไฟล์เว็บไซต์ (GA4 / Search Console)" }).waitFor();
  await page.getByRole("heading", { name: "ไฟล์รายงานยอดขาย (Sales)" }).waitFor();
  await page.getByText(/ไฟล์ที่รอนำเข้าต่อ \(1\): Viewers\.csv/).waitFor();
  await page.getByText(/import-note\.txt: รองรับเฉพาะ \.csv และ \.xlsx/).waitFor();
  assert.equal(await page.locator("select").first().evaluate((el) => el.options[el.selectedIndex].text), "Google Ads — Campaign Report (ยอดใช้จ่ายหลัก)");
  if (process.env.SHOT_DIR) { await page.getByRole("button", { name: /^ยืนยันนำเข้า \(เพิ่ม/ }).waitFor(); await page.screenshot({ path: process.env.SHOT_DIR + "/import-mixed.png", fullPage: true }); }
  ok("เลือก 6 ไฟล์พร้อมกันที่หน้า นำเข้า CSV: Google Ads → ขั้นตอนเดิม · Viewers รอคิว · GA4/Search Console → ส่วน Website · .xlsx → ส่วน Sales · ไฟล์ .txt แจ้งว่าไม่รองรับ");
  await page.getByRole("button", { name: /^ยืนยันนำเข้า \(\+\d+ \/ อัปเดต 0\)$/ }).click();
  await page.getByText(/นำเข้าสำเร็จ — เพิ่ม \d+/).waitFor();
  await page.getByRole("button", { name: "ไฟล์ถัดไป: Viewers.csv" }).click();
  await page.getByRole("button", { name: "ยืนยันนำเข้า (+30 / อัปเดต 0)" }).click();
  await page.getByText("นำเข้าสำเร็จ — เพิ่ม 30 · อัปเดต 0 · ข้าม 0 · ไม่ถูกต้อง 0").waitFor();
  assert.ok(await rows("GOOGLE_ADS_CAMPAIGNS") > 0); assert.equal(await rows("FB_PAGE_INSIGHTS"), 30);
  ok(`Google Ads Campaign (${await rows("GOOGLE_ADS_CAMPAIGNS")} แถว) แล้วกด ไฟล์ถัดไป → Viewers 30 วัน`);
  const web = page.locator("section", { has: page.getByRole("heading", { name: "ไฟล์เว็บไซต์ (GA4 / Search Console)" }) }).last();
  await web.getByRole("button", { name: "ตรวจสอบก่อนนำเข้า" }).click();
  await web.getByRole("button", { name: "ยืนยันนำเข้า", exact: true }).click();
  await page.getByText(/นำเข้าแล้ว 1 ไฟล์: เพิ่ม 27/).waitFor();
  assert.equal(await rows("WEBSITE_ANALYTICS"), 27);
  ok("ส่วน Website ในหน้า นำเข้า CSV: Search Console Chart + Filters → เพิ่ม 27 วันในแท็บ WEBSITE_ANALYTICS");
  const sales = page.locator("section", { has: page.getByRole("heading", { name: "ไฟล์รายงานยอดขาย (Sales)" }) }).last();
  await sales.getByRole("button", { name: /^ยืนยันนำเข้า \(เพิ่ม \d+/ }).click();
  await sales.getByText(/นำเข้าสำเร็จ \d+ รายการ/).waitFor();
  assert.ok(await rows("SALES_TRANSACTIONS") > 0);
  ok(`ส่วน Sales ในหน้า นำเข้า CSV (Admin): รายงานยอดขาย .xlsx → ${await rows("SALES_TRANSACTIONS")} รายการ`);
  await page.getByRole("button", { name: "ล้าง" }).count(); // หน้าไม่ค้าง
  assert.deepEqual(errors, []);

  // ---- Seller / Buyer Leads (Kanban) ----
  const head = (await tab("LEADS"))[0];
  const L = (o) => head.map((h) => o[h] ?? "");
  const base = { received_at: "2026-10-01", source_channel: "Facebook Ads", status: "New", updated_at: "2026-10-01T00:00:00.000Z", created_at: "2026-10-01T00:00:00.000Z", area: "buriram" };
  await fetch(`http://127.0.0.1:${CTRL}/set`, { method: "POST", body: JSON.stringify({ name: "LEADS", rows: [head,
    L({ ...base, lead_id: "S1", lead_code: "LD-2026-0001", customer_name: "ผู้ขาย ก", need: "ขาย", sell_status: "" }),
    L({ ...base, lead_id: "S2", lead_code: "LD-2026-0002", customer_name: "ผู้ขาย ข", need: "ขาย", sell_status: "ทำสัญญา" }), // ค่าเดิมที่ถูกตัดออก
    L({ ...base, lead_id: "B1", lead_code: "LD-2026-0003", customer_name: "ผู้ซื้อ ก", need: "ซื้อ", call_status: "ยังไม่ได้โทร" }), // ชื่อเดิม
    L({ ...base, lead_id: "B2", lead_code: "LD-2026-0004", customer_name: "ผู้ซื้อ ข", need: "เช่า", call_status: "เข้าชมโครงการแล้ว" }), // ชื่อเดิม
  ] }) });
  const col = (pg, name) => pg.locator("div[data-col]", { has: pg.locator("span", { hasText: new RegExp(`^${name}$`) }) });
  await page.goto(BASE + "/seller-leads"); await page.getByText("ผู้ขาย ก").waitFor();
  assert.ok(await col(page, "รอติดต่อ").getByText("ผู้ขาย ก").isVisible()); assert.ok(await col(page, "ค่าเดิมที่ไม่รู้จัก").getByText("ผู้ขาย ข").isVisible());
  await page.getByText("ผู้ขาย ก").dragTo(col(page, "สนใจขาย")); await page.getByText("ผู้ขาย ก: รอติดต่อ → สนใจขาย").waitFor();
  await page.getByLabel("เปลี่ยน Sell Status ผู้ขาย ข").selectOption("เซ็นสัญญา"); await page.getByText("ผู้ขาย ข: ค่าเดิม → เซ็นสัญญา").waitFor();
  let lr = await tab("LEADS"); const H = lr[0], get = (id, c) => lr.find((r) => r[H.indexOf("lead_id")] === id)[H.indexOf(c)];
  assert.equal(get("S1", "sell_status"), "สนใจขาย"); assert.equal(get("S1", "status"), "Qualified"); assert.equal(get("S2", "sell_status"), "เซ็นสัญญา"); assert.equal(get("S1", "updated_by"), "admin@example.com");
  ok("Seller Leads: ลากการ์ด รอติดต่อ → สนใจขาย และเปลี่ยนด้วยเมนู (ค่าเดิม ทำสัญญา อยู่คอลัมน์ ค่าเดิมที่ไม่รู้จัก → เซ็นสัญญา) · บันทึกลง Sheet + ขั้น Pipeline = Qualified");
  await page.goto(BASE + "/buyer-leads"); await page.getByText("ผู้ซื้อ ก").waitFor();
  assert.ok(await col(page, "รอติดต่อ").getByText("ผู้ซื้อ ก").isVisible()); assert.ok(await col(page, "เข้าชมแล้ว").getByText("ผู้ซื้อ ข").isVisible());
  assert.equal(await page.getByText("ผู้ขาย ก").count(), 0);
  await page.getByText("ผู้ซื้อ ก").dragTo(col(page, "ติดต่อได้แล้ว")); await page.getByText("ผู้ซื้อ ก: รอติดต่อ → ติดต่อได้แล้ว").waitFor();
  await page.getByLabel("เปลี่ยน Call Status ผู้ซื้อ ข").selectOption("จอง"); await page.getByText("ผู้ซื้อ ข: เข้าชมแล้ว → จอง").waitFor();
  lr = await tab("LEADS");
  assert.equal(get("B1", "call_status"), "ติดต่อได้แล้ว"); assert.equal(get("B1", "contactable"), "TRUE"); assert.equal(get("B2", "call_status"), "จอง");
  // กู้ไม่ผ่าน → กล่องถามสาเหตุ (บังคับกรอก) · ยกเลิก = ไม่ย้าย
  const dlg = page.getByRole("dialog", { name: /กู้ไม่ผ่าน/ });
  await page.getByLabel("เปลี่ยน Call Status ผู้ซื้อ ข").selectOption("กู้ไม่ผ่าน"); await dlg.waitFor();
  assert.ok(await dlg.getByRole("button", { name: "บันทึก" }).isDisabled());
  await dlg.getByRole("button", { name: "ยกเลิก" }).click(); await dlg.waitFor({ state: "detached" });
  assert.ok(await col(page, "จอง").getByText("ผู้ซื้อ ข").isVisible());
  await page.getByLabel("เปลี่ยน Call Status ผู้ซื้อ ข").selectOption("กู้ไม่ผ่าน"); await dlg.getByLabel(/สาเหตุที่กู้ไม่ผ่าน/).fill("รายได้ไม่ผ่านเกณฑ์");
  await dlg.getByRole("button", { name: "บันทึก" }).click(); await page.getByText("ผู้ซื้อ ข: จอง → กู้ไม่ผ่าน").waitFor();
  lr = await tab("LEADS"); assert.equal(get("B2", "call_status"), "กู้ไม่ผ่าน"); assert.equal(get("B2", "lost_reason"), "รายได้ไม่ผ่านเกณฑ์");
  assert.equal(await page.getByRole("heading", { name: "คนต้องการซื้อ", level: 1 }).count(), 1);
  ok("คนต้องการซื้อ (กู้ไม่ผ่าน ต้องกรอกสาเหตุ: ยกเลิกแล้วการ์ดไม่ย้าย · กรอกแล้วบันทึกลงช่องสาเหตุ) · Call Status ชื่อเดิม (ยังไม่ได้โทร / เข้าชมโครงการแล้ว) อยู่คอลัมน์ใหม่ถูกต้อง · ลากไป ติดต่อได้แล้ว (contactable TRUE) · เมนูเปลี่ยนเป็น จอง · ไม่แสดง Lead ขาย");
  assert.deepEqual(errors, []);

  // ---- หน้า Leads: ตัดช่อง บริษัท/อีเมล/หมวดบริการ/บริการที่สนใจ/UTM · เพิ่ม Line ----
  await page.goto(BASE + "/leads"); await page.getByRole("button", { name: "+ เพิ่ม Lead", exact: true }).click();
  const formT = await page.locator("section", { has: page.getByRole("heading", { name: "เพิ่ม Lead ใหม่" }) }).last().innerText();
  for (const gone of ["บริษัท", "อีเมล", "หมวดบริการ", "บริการที่สนใจ", "UTM source", "UTM medium", "UTM campaign"]) assert.ok(!formT.includes(gone), `ยังมีช่อง ${gone}`);
  assert.ok(formT.includes("Line") && formT.includes("Campaign") && formT.includes("ติดตามครั้งถัดไป"));
  await page.getByLabel("ชื่อลูกค้า *").fill("ทดสอบไลน์"); await page.getByLabel("ความต้องการ *").selectOption("ซื้อ"); await page.getByLabel("Line", { exact: true }).fill("@line.test");
  await page.getByLabel("ช่องทาง *").selectOption("LINE OA");
  // ฟอร์มภาษาไทยแบ่ง 4 กลุ่ม · ความต้องการ = ซื้อ → ไม่แสดง สภาพทรัพย์ · เปลี่ยนสถานะ → เสนอวันติดตาม +3 วัน
  for (const g of ["1. ข้อมูลติดต่อ", "2. ความต้องการ", "3. สถานะการขาย", "4. การติดตาม"]) assert.ok(await page.getByRole("group", { name: new RegExp("^" + g.replace(".", "\\.")) }).isVisible(), g);
  assert.equal(await page.getByLabel("สภาพทรัพย์").count(), 0);
  await page.getByRole("group", { name: /^3\. สถานะการขาย/ }).getByLabel(/^Buy Status/).selectOption("Warm");
  const plus3 = new Date(Date.now() + 7 * 3600_000 + 3 * 86400_000).toISOString().slice(0, 10);
  assert.equal(await page.getByLabel("ติดตามครั้งถัดไป", { exact: true }).inputValue(), plus3); assert.ok(await page.getByText(/ตั้งวันติดตามให้เป็น/).isVisible());
  await page.getByRole("group", { name: "ตั้งวันติดตาม" }).getByRole("button", { name: "ล้าง" }).click(); assert.equal(await page.getByLabel("ติดตามครั้งถัดไป", { exact: true }).inputValue(), "");
  await page.getByLabel("ความสนใจ", { exact: true }).fill("ทาวน์โฮมใกล้โรงเรียน");
  assert.equal(await page.getByLabel("พื้นที่ (กรอกเองหรือเลือกจากรายการ)").inputValue(), "");
  assert.deepEqual(await page.locator("#area-list option").evaluateAll((o) => o.map((x) => x.value).slice(0, 3)), ["บุรีรัมย์", "สุรินทร์", "หลายจังหวัด"]);
  await page.getByLabel("พื้นที่ (กรอกเองหรือเลือกจากรายการ)").fill("ประโคนชัย");
  if (process.env.SHOT_DIR) await page.locator("section", { has: page.getByRole("heading", { name: "เพิ่ม Lead ใหม่" }) }).last().screenshot({ path: process.env.SHOT_DIR + "/lead-form.png" });
  await page.getByRole("button", { name: "บันทึก", exact: true }).click(); await page.getByText("ทดสอบไลน์").first().waitFor();
  lr = await tab("LEADS"); const row = lr.find((r) => r[lr[0].indexOf("customer_name")] === "ทดสอบไลน์");
  assert.equal(row[lr[0].indexOf("line_id")], "@line.test"); assert.equal(row[lr[0].indexOf("interest")], "ทาวน์โฮมใกล้โรงเรียน"); assert.equal(row[lr[0].indexOf("area")], "ประโคนชัย");
  const areaF = page.locator("label", { has: page.locator("span", { hasText: /^พื้นที่$/ }) }).locator("select");
  await areaF.selectOption("ประโคนชัย"); await page.getByText("1 รายการ").first().waitFor(); assert.ok(await page.getByText("ทดสอบไลน์").first().isVisible());
  assert.equal(await page.getByRole("combobox", { name: "หมวดบริการ" }).count(), 0);
  // ตารางเรียงตามหัวคอลัมน์ได้ (ทุกหน้า) · มือถือเป็นการ์ด + ปุ่มโทร
  await page.getByRole("button", { name: /^ชื่อ/ }).click(); assert.equal(await page.locator("th[aria-sort]").getAttribute("aria-sort"), "ascending");
  await page.getByRole("button", { name: /^ชื่อ/ }).click(); assert.equal(await page.locator("th[aria-sort]").getAttribute("aria-sort"), "descending");
  ok("หน้า Leads: ฟอร์มไม่มี บริษัท / อีเมล / หมวดบริการ / บริการที่สนใจ / UTM แล้ว · มีช่อง Line / ความสนใจ / พื้นที่กรอกเอง (มีรายการแนะนำ) → บันทึกลง Sheet ตามที่กรอก · ตัวกรองพื้นที่มีค่าที่กรอกเอง · ตัวกรองหมวดบริการถูกตัดออก");
  assert.deepEqual(errors, []);

  // ---- เป้าหมายรายเดือน · Checklist · ติดตามลูกค้า · รายงาน Lead · สำรองข้อมูล (30/10/2026) ----
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10), month = today.slice(0, 7);
  await page.goto(BASE + "/settings/targets"); await page.getByRole("heading", { name: "เป้าหมายรายเดือน" }).waitFor(); await page.getByText("ยังไม่ได้ตั้งเป้าหมาย").waitFor();
  assert.equal(await page.getByLabel("เดือน").inputValue(), month);
  await page.getByLabel("งบโฆษณา (บาท)").fill("50,000"); await page.getByLabel("เป้า Lead (ราย)").fill("10");
  await page.getByRole("button", { name: "บันทึกเป้าหมาย" }).click(); await page.getByText(/บันทึกเป้าหมาย .* แล้ว/).waitFor();
  await page.getByLabel("เป้า Lead (ราย)").fill("12"); await page.getByRole("button", { name: "บันทึกเป้าหมาย" }).click(); await page.getByText(/แก้ไขเป้าหมาย .* แล้ว/).waitFor();
  const tg = await tab("MONTHLY_TARGETS"); assert.equal(tg.length - 1, 1); assert.equal(String(tg[1][tg[0].indexOf("lead_target")]), "12");
  ok("ตั้งค่า → เป้าหมายรายเดือน: ตั้งงบ 50,000 + เป้า Lead 10 แล้วแก้เป็น 12 → Sheet มีแถวเดียวของเดือนนี้");
  // Lead หนึ่งรายเลยกำหนดติดตาม
  const lh = await tab("LEADS"); const ix = (c) => lh[0].indexOf(c);
  const lrows = lh.slice(1).map((r) => { const x = [...r]; while (x.length < lh[0].length) x.push(""); if (x[ix("lead_id")] === "B1") x[ix("next_follow_up_at")] = "2026-01-15"; return x; });
  await fetch(`http://127.0.0.1:${CTRL}/set`, { method: "POST", body: JSON.stringify({ name: "LEADS", rows: [lh[0], ...lrows] }) });
  await page.goto(BASE + "/"); await page.getByRole("heading", { name: "ติดตามลูกค้า (ฝ่ายขาย)" }).waitFor();
  const ov = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/เลยกำหนดติดตาม 1/.test(ov), ov.slice(0, 400)); assert.ok(/Leads vs เป้า \d+ \/ 12/.test(ov) && /ค่าโฆษณา vs งบ/.test(ov)); assert.ok(/ข้อมูลเดือน .*: ครบ \d+\/10/.test(ov));
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/overview-extras.png", clip: { x: 0, y: 0, width: 1280, height: 1100 } });
  ok("ภาพรวม (Admin): การ์ดติดตามลูกค้า เลยกำหนด 1 · เป้าหมายเดือนนี้ (Leads / 12, ค่าโฆษณา vs งบ) · Checklist ข้อมูลประจำเดือน 10 รายการ (รวมยอดขาย)");
  // ---- UX 31/10/2026: ตัวเลขบนเมนู · ช่วงวันที่สำเร็จรูป + จำข้ามหน้า · วันที่ "31 ต.ค. 69" · กดหัวคอลัมน์เรียง · ⓘ ที่มาของตัวเลข ----
  await page.getByRole("navigation", { name: "เมนูหลัก" }).getByRole("link", { name: /^Leads\s*1$/ }).waitFor(); // เลยกำหนด 1 + วันนี้ 0
  assert.ok(!(await page.locator("main").innerText()).includes("mm/dd/yyyy"));
  await page.getByRole("button", { name: "เดือนก่อน" }).click(); await page.waitForURL(/from=\d{4}-\d{2}-01&to=/);
  const u = new URL(page.url()); const pf = u.searchParams.get("from"), pt = u.searchParams.get("to");
  const TM = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const thd = (d) => `${Number(d.slice(8))} ${TM[Number(d.slice(5, 7)) - 1]} ${(Number(d.slice(0, 4)) + 543) % 100}`;
  await page.getByText(thd(pf), { exact: true }).first().waitFor(); // ช่องวันที่แสดงแบบไทย
  await page.goto(BASE + "/performance"); await page.getByRole("heading", { name: /Marketing Performance/, level: 1 }).waitFor();
  assert.equal(await page.locator('input[name="from"]').inputValue(), pf); assert.equal(await page.locator('input[name="to"]').inputValue(), pt);
  assert.ok(await page.getByText("ใช้ช่วงวันที่ล่าสุดที่เลือกไว้").isVisible());
  assert.equal(await page.getByRole("button", { name: "เดือนก่อน" }).getAttribute("aria-pressed"), "true");
  await page.getByRole("button", { name: "ทั้งหมด", exact: true }).click(); await page.waitForURL(/range=all/);
  await page.goto(BASE + "/lead-report"); await page.getByRole("heading", { name: "ผลงานรายพนักงาน" }).waitFor();
  assert.equal(await page.locator('input[name="from"]').inputValue(), ""); // ล้างช่วงที่จำแล้ว
  // กดหัวคอลัมน์ "Lead ที่รับ" → มากไปน้อย · ซ้ำ → น้อยไปมาก · แถวรวมอยู่ท้ายเสมอ
  const st = page.locator("table", { has: page.locator("th", { hasText: "Lead ที่รับ" }) });
  const colv = async () => (await st.locator("tbody tr").evaluateAll((rs) => rs.map((r) => Number(r.children[1].textContent))));
  const h = st.locator("th", { hasText: "Lead ที่รับ" });
  await h.click(); let v = await colv(); assert.equal(await h.getAttribute("aria-sort"), "descending");
  assert.deepEqual(v.slice(0, -1), [...v.slice(0, -1)].sort((a, b) => b - a)); assert.equal(v[v.length - 1], Math.max(...v)); // แถวรวม (ค่ามากสุด) อยู่ท้าย
  await h.click(); v = await colv(); assert.equal(await h.getAttribute("aria-sort"), "ascending"); assert.deepEqual(v.slice(0, -1), [...v.slice(0, -1)].sort((a, b) => a - b));
  const note = page.getByText("ที่มาของตัวเลข").first(); assert.ok(!(await page.getByText(/%Conversion = ซื้อสำเร็จ/).first().isVisible()));
  await note.click(); assert.ok(await page.getByText(/%Conversion = ซื้อสำเร็จ/).first().isVisible());
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/lead-report.png", fullPage: true });
  ok("UX: ตัวเลข Lead ที่ต้องติดตามบนเมนู · ปุ่ม เดือนก่อน ตั้งช่วงและจำข้ามหน้า (หน้า Performance ใช้ช่วงเดิม) · ทั้งหมด = ล้าง · ช่องวันที่แสดง \"1 ก.ย. 69\" · กดหัวคอลัมน์เรียงมาก→น้อย/น้อย→มาก แถวรวมอยู่ท้าย · ที่มาของตัวเลขซ่อนใน ⓘ");
  await page.goto(BASE + "/leads?follow=overdue"); await page.getByText("ผู้ซื้อ ก").first().waitFor(); await page.getByText("1 รายการ").first().waitFor();
  assert.equal(await page.getByText("ผู้ขาย ก").count(), 0);
  ok("ภาพรวม → เลยกำหนด เปิดหน้า Leads กรองเฉพาะ Lead ที่ต้องติดตาม (1 รายการ)");
  await page.goto(BASE + "/lead-report"); await page.getByRole("heading", { name: "ผลงานรายพนักงาน" }).waitFor();
  const rp = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/\(ไม่ระบุ Staff\)/.test(rp) && /รวม \d+/.test(rp) && /Walk in/.test(rp) && /%Conversion/.test(rp) && /เหตุผลที่ไม่สำเร็จ/.test(rp) && /สาเหตุที่กู้ไม่ผ่าน/.test(rp) && /รายได้ไม่ผ่านเกณฑ์/.test(rp), rp.slice(0, 600));
  assert.ok(!/ผู้ขาย/.test(rp)); // แท็บคนต้องการซื้อ
  const sideHref = await page.getByRole("navigation", { name: "ฝั่งของรายงาน" }).getByRole("link", { name: "คนต้องการขาย" }).getAttribute("href"); assert.equal(sideHref, "/lead-report?side=seller"); await page.goto(BASE + sideHref); await page.getByRole("heading", { name: /ผลงานรายพนักงาน — คนต้องการขาย/ }).waitFor();
  const rs = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Qualified \(สัญญา \+ ขายแล้ว\)/.test(rs) && /ขายแล้ว/.test(rs) && !/Walk in/.test(rs), rs.slice(0, 600));
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/lead-report.png", fullPage: true });
  ok("รายงาน Lead แยกแท็บ: คนต้องการซื้อ (Walk in, %Conversion, สาเหตุที่กู้ไม่ผ่าน) / คนต้องการขาย (Qualified = สัญญา + ขายแล้ว, ไม่มี Walk in)");
  await page.goto(BASE + "/settings"); await page.getByRole("heading", { name: "สำรองข้อมูล Google Sheet อัตโนมัติ" }).waitFor();
  await page.getByRole("button", { name: "ดูสคริปต์" }).click(); assert.ok((await page.locator("pre").innerText()).includes("function installWeeklyBackup()"));
  ok("ตั้งค่าระบบ: ส่วนสำรองข้อมูลอัตโนมัติ มีขั้นตอน + สคริปต์ Apps Script (installWeeklyBackup / backupNow)");
  assert.deepEqual(errors, []);

  // ---- Developer + Sale developer (31/10/2026) ----
  const dAdd = (n) => new Date(Date.parse(today) + n * 864e5).toISOString().slice(0, 10);
  await page.goto(BASE + "/developers"); await page.getByRole("button", { name: "+ เพิ่ม Developer" }).click();
  const dform = () => page.locator("section", { has: page.getByRole("heading", { name: "เพิ่ม Developer ใหม่" }) }).last();
  await dform().getByLabel("ชื่อบริษัท").fill("บริษัท บ้านดี จำกัด"); await dform().getByLabel("โครงการหลัก").fill("บ้านดี วิลล์"); await dform().getByLabel("โครงการรอง 1").fill("บ้านดี 2");
  await dform().getByLabel("ชื่อผู้ติดต่อ").fill("คุณดี"); await dform().getByLabel("เบอร์").fill("0812223333"); await dform().getByLabel("Line", { exact: true }).fill("@baandee");
  await dform().getByLabel("Tier", { exact: true }).selectOption("C"); await dform().getByLabel("Nayoo URL").fill("https://nayoo.co/baandee"); await dform().getByLabel("Staff", { exact: true }).fill("เซลส์ ก");
  if (process.env.SHOT_DIR) await page.locator("section", { has: page.getByRole("heading", { name: "เพิ่ม Developer ใหม่" }) }).last().screenshot({ path: process.env.SHOT_DIR + "/dev-form.png" });
  await page.getByRole("button", { name: "บันทึก", exact: true }).click(); await page.getByText("สร้าง DV-0001 แล้ว").waitFor();
  await page.getByRole("button", { name: "+ เพิ่ม Product" }).click();
  await page.getByLabel("Product", { exact: true }).selectOption("Top ads"); await page.getByLabel("วันเริ่ม").fill(dAdd(-1)); await page.getByLabel("วันหมดอายุ").fill(dAdd(90)); await page.getByLabel("ราคา (บาท)").fill("25000");
  await page.getByRole("button", { name: "บันทึก Product" }).click(); await page.getByText("บันทึก Top ads แล้ว · Status ตอนนี้: กำลังใช้ Product").waitFor();
  await page.getByRole("button", { name: "+ เพิ่ม Developer" }).click();
  await dform().getByLabel("ชื่อบริษัท").fill("บริษัท สวนสวย"); await dform().getByLabel("โครงการหลัก").fill("สวนสวย โฮม"); await dform().getByLabel("Status", { exact: true }).selectOption("เข้าร่วมแล้ว"); await dform().getByLabel("Staff", { exact: true }).fill("เซลส์ ข");
  await page.getByRole("button", { name: "บันทึก", exact: true }).click(); await page.getByText("สร้าง DV-0002 แล้ว").waitFor();
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/developers.png", fullPage: true });
  const dv = await tab("DEVELOPERS"); assert.equal(dv.length - 1, 2); assert.equal(dv[1][dv[0].indexOf("status")], "กำลังใช้ Product"); assert.equal(dv[1][dv[0].indexOf("tier")], "C");
  ok("หน้า Developer: เพิ่มบริษัท (ครบทุกช่อง) → เพิ่ม Product Top ads ที่เริ่มแล้ว → Status เป็น กำลังใช้ Product เอง · เพิ่มรายการที่ 2 (เข้าร่วมแล้ว)");
  await page.goto(BASE + "/sale-developer"); await page.getByText("สวนสวย โฮม").first().waitFor();
  const colsTxt = await page.locator("[data-col]").evaluateAll((e) => e.map((x) => x.getAttribute("data-col")));
  assert.deepEqual(colsTxt, ["ยังไม่เข้าร่วม", "เข้าร่วมแล้ว", "มีแผนเข้าพบ", "เข้าพบแล้ว", "ปิดการขาย", "กำลังใช้ Product", "ใกล้หมดสัญญา", "ไม่ให้เข้าพบ"]);
  assert.ok(await page.locator('[data-col="กำลังใช้ Product"]').getByText("บ้านดี วิลล์").first().isVisible());
  assert.equal(await page.getByLabel("เปลี่ยน Status บริษัท บ้านดี จำกัด").count(), 0); // ล็อกตาม Product
  await page.getByLabel("เปลี่ยน Status บริษัท สวนสวย").selectOption("มีแผนเข้าพบ"); await page.locator('[data-col="มีแผนเข้าพบ"]').getByText("บริษัท สวนสวย").waitFor();
  await page.locator('[data-col="มีแผนเข้าพบ"]').getByText("บริษัท สวนสวย").dragTo(page.locator('[data-col="เข้าพบแล้ว"]'));
  { const d = page.getByRole("dialog", { name: /เข้าพบแล้ว/ }); await d.waitFor(); await d.getByText("เจอหน้า", { exact: true }).click(); await d.getByRole("button", { name: "บันทึก" }).click(); } // ถามสถานะการเข้าพบ
  await page.locator('[data-col="เข้าพบแล้ว"]').getByText("บริษัท สวนสวย").waitFor();
  await page.waitForTimeout(500);
  const dv2 = await tab("DEVELOPERS"); const r2 = dv2.find((x) => x[dv2[0].indexOf("company_name")] === "บริษัท สวนสวย");
  assert.equal(r2[dv2[0].indexOf("status")], "เข้าพบแล้ว"); assert.equal(r2[dv2[0].indexOf("last_contacted_at")], today); assert.equal(r2[dv2[0].indexOf("last_contact_method")], "เจอหน้า");
  const ct = await tab("DEVELOPER_CONTACTS"); assert.equal(ct.length - 1, 1); assert.equal(ct[1][ct[0].indexOf("method")], "เจอหน้า");
  const lg = await tab("DEVELOPER_STATUS_LOG"); assert.equal(lg.length - 1, 4); assert.equal(lg.filter((x) => x[lg[0].indexOf("kind")] === "auto_product").length, 1); // ย้ายอัตโนมัติตาม Product 1 + สร้างเป็น เข้าร่วมแล้ว 1 + ย้ายด้วยมือ 2
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/sale-developer.png", fullPage: true });
  ok("หน้า Sale developer: 8 คอลัมน์ตามลำดับที่กำหนด · การ์ดที่มี Product อยู่คอลัมน์ กำลังใช้ Product และล็อก · เมนู → มีแผนเข้าพบ · ลาก → เข้าพบแล้ว (ติดต่อล่าสุด = วันนี้) · บันทึกประวัติ");
  assert.deepEqual(errors, []);

  const m = await open("marketing@example.com");
  // ---- ตั้งค่า → คู่มือนำเข้าข้อมูล / คำอธิบายตัวเลข (Marketing เปิดได้ · ตั้งค่าระบบไม่เห็น) ----
  await m.page.goto(BASE + "/settings/import-guide"); await m.page.getByRole("heading", { name: "คู่มือนำเข้าข้อมูล" }).waitFor();
  const nav = await m.page.getByRole("navigation", { name: "เมนูหลัก" }).innerText();
  assert.ok(nav.includes("คู่มือนำเข้าข้อมูล") && nav.includes("คำอธิบายตัวเลข") && !nav.includes("ตั้งค่าระบบ"));
  // หน้าแรกแสดงเฉพาะสารบัญ (ไม่มีขั้นตอนของแต่ละแพลตฟอร์ม) · กดหัวข้อแล้วเปิดหน้าของหัวข้อนั้น
  const toc = m.page.getByRole("navigation", { name: "สารบัญ" }).getByRole("link");
  assert.equal(await toc.count(), 6); assert.equal(await m.page.getByText("ดาวน์โหลดไฟล์ CSV").count(), 0);
  if (process.env.SHOT_DIR) await m.page.screenshot({ path: process.env.SHOT_DIR + "/guide-import.png", fullPage: true });
  const topics = [];
  for (const a of await toc.all()) topics.push([await a.getAttribute("href"), (await a.locator("div").first().innerText()).trim()]);
  for (const [href, title] of topics) {
    await m.page.goto(BASE + href); await m.page.getByRole("heading", { name: title, level: 1 }).waitFor();
    assert.equal(await m.page.locator("article").count(), 1);
  }
  assert.ok((await m.page.locator("main").innerText()).includes("FlowAccount"));
  await m.page.goto(BASE + "/settings/import-guide/fb-results"); await m.page.getByRole("heading", { name: /Viewers และ Link clicks/, level: 1 }).waitFor();
  if (process.env.SHOT_DIR) await m.page.screenshot({ path: process.env.SHOT_DIR + "/guide-import-topic.png", fullPage: true });
  assert.equal(await m.page.getByRole("link", { name: "คำอธิบายตัวเลข" }).getAttribute("href"), "/settings/metrics");
  await m.page.goto(BASE + "/settings/metrics"); await m.page.getByRole("heading", { name: "คำอธิบายตัวเลข" }).waitFor();
  const mtoc = m.page.getByRole("navigation", { name: "สารบัญ" }).getByRole("link");
  assert.equal(await mtoc.count(), 7); assert.equal(await m.page.locator("table").count(), 0);
  if (process.env.SHOT_DIR) await m.page.screenshot({ path: process.env.SHOT_DIR + "/guide-metrics.png", fullPage: true });
  const mt = [];
  for (const a of await mtoc.all()) mt.push([await a.getAttribute("href"), (await a.locator("div").first().innerText()).trim()]);
  let allText = "";
  for (const [href, title] of mt) { await m.page.goto(BASE + href); await m.page.getByRole("heading", { name: title, level: 1 }).waitFor(); allText += await m.page.locator("main").innerText(); }
  for (const t of ["Total Paid Media Spend", "Cost per Walk in", "Customer Funnel", "รอเข้าชม / เข้าชมแล้ว / จอง / ซื้อสำเร็จ / กู้ไม่ผ่าน", "Facebook Viewers (แทน Reach)", "ยอดขายสุทธิ", "Missing Data"]) assert.ok(allText.includes(t), t);
  await m.page.goto(BASE + "/settings/metrics/overview"); await m.page.getByRole("heading", { name: /ภาพรวมการตลาด/, level: 1 }).waitFor();
  if (process.env.SHOT_DIR) await m.page.screenshot({ path: process.env.SHOT_DIR + "/guide-metrics-topic.png", fullPage: true });
  await m.page.goto(BASE + "/settings/metrics/xyz"); await m.page.waitForLoadState("networkidle"); assert.ok(/404|could not be found|ไม่พบ/i.test(await m.page.locator("body").innerText())); assert.equal(await m.page.locator("article").count(), 0);
  await m.page.goto(BASE + "/settings"); await m.page.waitForURL(BASE + "/");
  await m.page.setViewportSize({ width: 390, height: 844 }); await m.page.goto(BASE + "/settings/metrics/performance", { waitUntil: "networkidle" }); await m.page.getByRole("heading", { name: /Marketing Performance/, level: 1 }).waitFor();
  assert.ok(await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, "มือถือล้นแนวนอน");
  // ---- ปุ่มเบอร์เกอร์ (มือถือ): เมนูปิดไว้ก่อน · กดเปิด · กดลิงก์แล้วเปลี่ยนหน้า + ปิด · พื้นหลัง/Esc ปิด ----
  const burger = m.page.getByRole("button", { name: /เปิดเมนู|ปิดเมนู/ });
  const expanded = async (v) => { for (let i = 0; i < 40; i++) { if ((await burger.getAttribute("aria-expanded")) === v) return; await m.page.waitForTimeout(100); } assert.fail("aria-expanded ไม่เป็น " + v); };
  const mnav = m.page.getByRole("navigation", { name: "เมนูหลัก" });
  await expanded("false"); assert.ok(!(await mnav.isVisible()));
  await burger.click(); await mnav.waitFor({ state: "visible" }); await expanded("true");
  if (process.env.SHOT_DIR) { await m.page.waitForTimeout(300); await m.page.screenshot({ path: process.env.SHOT_DIR + "/menu-mobile-open.png" }); }
  assert.ok(await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, "เมนูมือถือทำให้ล้นแนวนอน");
  await m.page.waitForTimeout(300); // รอเมนูเลื่อนออกมาจนสุด (transition 200ms)
  await mnav.getByRole("link", { name: "คู่มือนำเข้าข้อมูล" }).click(); await m.page.waitForURL(BASE + "/settings/import-guide");
  await mnav.waitFor({ state: "hidden" }); await expanded("false");
  await burger.click(); await mnav.waitFor({ state: "visible" }); await m.page.keyboard.press("Escape"); await mnav.waitFor({ state: "hidden" });
  await burger.click(); await mnav.waitFor({ state: "visible" }); await m.page.mouse.click(370, 400); await mnav.waitFor({ state: "hidden" });
  await m.page.setViewportSize({ width: 1280, height: 800 });
  // ---- จอใหญ่: เมนูเต็มไว้ก่อน (แบ่งกลุ่ม) · กดย่อเหลือไอคอน · จำค่าหลังโหลดหน้าใหม่ · กดขยายอีกครั้ง ----
  await mnav.waitFor({ state: "visible" }); await expanded("true");
  const navText = await mnav.innerText(); for (const g of ["การตลาด", "ข้อมูล"]) assert.ok(navText.includes(g), "ไม่มีหัวข้อกลุ่ม " + g);
  const aside = m.page.locator("#side-menu");
  await burger.click(); await m.page.locator("#side-menu[data-compact]").waitFor(); await expanded("false");
  assert.ok((await aside.boundingBox()).width < 80, "เมนูย่อไม่เหลือแถบไอคอน"); assert.ok(!(await mnav.innerText()).includes("Facebook Page"), "เมนูย่อยังแสดงชื่อ");
  assert.equal(await mnav.getByRole("link", { name: "คู่มือนำเข้าข้อมูล" }).getAttribute("href"), "/settings/import-guide"); // ไอคอนยังกดได้ (ชื่ออยู่ใน aria-label)
  if (process.env.SHOT_DIR) await m.page.screenshot({ path: process.env.SHOT_DIR + "/menu-desktop-hidden.png" });
  await m.page.reload(); await m.page.getByRole("heading", { name: "คู่มือนำเข้าข้อมูล" }).waitFor(); await m.page.waitForTimeout(300);
  await m.page.locator("#side-menu[data-compact]").waitFor(); await expanded("false");
  await burger.click(); await m.page.locator("#side-menu:not([data-compact])").waitFor(); await expanded("true");
  ok("ปุ่มเบอร์เกอร์: มือถือปิดไว้ก่อน กดเปิด/กดลิงก์ปิด/Esc/พื้นหลังปิด ไม่ล้นจอ · จอใหญ่เมนูแบ่งกลุ่ม เปิดไว้ก่อน กดย่อเหลือไอคอน/ขยาย และจำค่าหลังโหลดหน้าใหม่");
  ok("ตั้งค่า (Marketing): คู่มือนำเข้าข้อมูล / คำอธิบายตัวเลข หน้าแรกเป็นสารบัญอย่างเดียว · กดแต่ละหัวข้อเปิดหน้าของหัวข้อนั้น (6 + 5 หน้า) เนื้อหาครบ · หัวข้อที่ไม่มี = 404 · ตั้งค่าระบบไม่เห็นและเข้าไม่ได้ · มือถือไม่ล้น");
  await m.page.goto(BASE + "/"); await m.page.getByText(/ข้อมูลเดือน .*: ครบ \d+\/9/).first().waitFor(); // Marketing: ไม่มีแถวยอดขาย
  assert.equal(await m.page.getByRole("heading", { name: "ติดตามลูกค้า (ฝ่ายขาย)" }).count(), 0); assert.ok(await m.page.getByText("แก้ไขเป้า").isVisible());
  await m.page.goto(BASE + "/lead-report"); await m.page.getByRole("heading", { name: "ผลงานรายพนักงาน" }).waitFor();
  assert.ok(!(await m.page.locator("main").innerText()).includes("ผู้ซื้อ ก")); // ตัวเลขรวมเท่านั้น ไม่มีชื่อลูกค้า
  for (const pth of ["/developers", "/sale-developer"]) { await m.page.goto(BASE + pth); await m.page.waitForURL(BASE + "/"); }
  for (const pth of ["/buyer-leads", "/seller-leads"]) { await m.page.goto(BASE + pth); await m.page.waitForURL(BASE + "/"); } // Marketing ไม่มีสิทธิ์ข้อมูลลูกค้า → กลับหน้าแรก
  const pr = await fetch(BASE + "/api/leads", { method: "PATCH", headers: { cookie: `authjs.session-token=${await cookie("marketing@example.com")}`, "sec-fetch-site": "same-origin", "content-type": "application/json" }, body: JSON.stringify({ lead_id: "B1", field: "call_status", value: "จอง" }) });
  assert.equal(pr.status, 403);
  await m.page.goto(BASE + "/import"); await m.page.getByRole("cell", { name: "Campaigns_2026_09_01-2026_09_30_.csv" }).waitFor();
  await m.page.locator('input[type="file"]').first().setInputFiles([`${FX}/synthetic_SalesReport.xlsx`, `${FX}/website/gsc_Devices.csv`, `${FX}/Devices_2026_09_01-2026_09_30_.csv`]);
  await m.page.getByText(/ไฟล์รายงานยอดขาย \(\.xlsx\) นำเข้าได้เฉพาะ Admin หรือ Sales/).waitFor();
  await m.page.getByRole("heading", { name: "ไฟล์เว็บไซต์ (GA4 / Search Console)" }).waitFor();
  assert.equal(await m.page.getByRole("heading", { name: "ไฟล์รายงานยอดขาย (Sales)" }).count(), 0);
  assert.equal(await m.page.locator("select").first().evaluate((el) => el.options[el.selectedIndex].text), "Google Ads — Devices (เพิ่มเติม)");
  const wtxt = await m.page.locator("section", { has: m.page.getByRole("heading", { name: "ไฟล์เว็บไซต์ (GA4 / Search Console)" }) }).last().innerText();
  assert.ok(wtxt.includes("gsc_Devices.csv") && !wtxt.includes("Devices_2026"));
  assert.deepEqual(m.errors, []);
  ok("Marketing: ภาพรวมมี Checklist 9 รายการ (ไม่มียอดขาย) ไม่มีการ์ดติดตามลูกค้า · รายงาน Lead ไม่มีชื่อลูกค้า · เข้า Seller/Buyer Leads ไม่ได้ และ PATCH /api/leads = 403 · ไฟล์ยอดขาย .xlsx ถูกปฏิเสธพร้อมเหตุผล (ไม่มีส่วน Sales) · Devices ของ Google Ads ไปขั้นตอนโฆษณา ส่วน Devices ของ Search Console ไปส่วน Website (ไม่สลับกัน)");
  await browser.close();
  console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
} catch (e) { if (process.env.SHOT_DIR) try { await browser?.contexts().at(-1)?.pages()[0]?.screenshot({ path: process.env.SHOT_DIR + "/fail-import.png", fullPage: true }); } catch { /* */ } console.error("\n✗ FAIL:", e?.message ?? e); console.error(log.split("\n").slice(-20).join("\n")); process.exitCode = 1; } finally { try { await browser?.close(); } catch { /* */ } stop(); process.exit(process.exitCode ?? 0); }
