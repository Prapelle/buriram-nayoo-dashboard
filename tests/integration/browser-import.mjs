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
  browser = await chromium.launch();
  const open = async (email) => { const ctx = await browser.newContext({ locale: "th-TH" }); await ctx.addCookies([{ name: "authjs.session-token", value: await cookie(email), domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]); const page = await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(String(e))); return { page, errors }; };
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
  const col = (pg, name) => pg.locator("div.w-64", { has: pg.locator("span", { hasText: new RegExp(`^${name}$`) }) });
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
  ok("Buyer Leads: Call Status ชื่อเดิม (ยังไม่ได้โทร / เข้าชมโครงการแล้ว) อยู่คอลัมน์ใหม่ถูกต้อง · ลากไป ติดต่อได้แล้ว (contactable TRUE) · เมนูเปลี่ยนเป็น จอง · ไม่แสดง Lead ขาย");
  assert.deepEqual(errors, []);

  // ---- หน้า Leads: ตัดช่อง บริษัท/อีเมล/หมวดบริการ/บริการที่สนใจ/UTM · เพิ่ม Line ----
  await page.goto(BASE + "/leads"); await page.getByRole("button", { name: "+ เพิ่ม Lead" }).click();
  await page.getByRole("button", { name: /ข้อมูลเพิ่มเติม/ }).click();
  const formT = await page.locator("section", { has: page.getByRole("heading", { name: "เพิ่ม Lead ใหม่" }) }).last().innerText();
  for (const gone of ["บริษัท", "อีเมล", "หมวดบริการ", "บริการที่สนใจ", "UTM source", "UTM medium", "UTM campaign"]) assert.ok(!formT.includes(gone), `ยังมีช่อง ${gone}`);
  assert.ok(formT.includes("Line") && formT.includes("Campaign") && formT.includes("ติดตามครั้งถัดไป"));
  await page.getByLabel("Name *").fill("ทดสอบไลน์"); await page.getByLabel("Need *").selectOption("ซื้อ"); await page.getByLabel("Line", { exact: true }).fill("@line.test");
  await page.getByLabel("Channel *").selectOption("LINE OA");
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
  ok("หน้า Leads: ฟอร์มไม่มี บริษัท / อีเมล / หมวดบริการ / บริการที่สนใจ / UTM แล้ว · มีช่อง Line / ความสนใจ / พื้นที่กรอกเอง (มีรายการแนะนำ) → บันทึกลง Sheet ตามที่กรอก · ตัวกรองพื้นที่มีค่าที่กรอกเอง · ตัวกรองหมวดบริการถูกตัดออก");
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
  assert.equal(await mtoc.count(), 5); assert.equal(await m.page.locator("table").count(), 0);
  if (process.env.SHOT_DIR) await m.page.screenshot({ path: process.env.SHOT_DIR + "/guide-metrics.png", fullPage: true });
  const mt = [];
  for (const a of await mtoc.all()) mt.push([await a.getAttribute("href"), (await a.locator("div").first().innerText()).trim()]);
  let allText = "";
  for (const [href, title] of mt) { await m.page.goto(BASE + href); await m.page.getByRole("heading", { name: title, level: 1 }).waitFor(); allText += await m.page.locator("main").innerText(); }
  for (const t of ["Total Paid Media Spend", "Cost per Site Visit", "Customer Funnel", "รอเข้าชม / เข้าชมแล้ว / จอง / ซื้อสำเร็จ / กู้ไม่ผ่าน", "Facebook Viewers (แทน Reach)", "ยอดขายสุทธิ", "Missing Data"]) assert.ok(allText.includes(t), t);
  await m.page.goto(BASE + "/settings/metrics/overview"); await m.page.getByRole("heading", { name: /ภาพรวมการตลาด/, level: 1 }).waitFor();
  if (process.env.SHOT_DIR) await m.page.screenshot({ path: process.env.SHOT_DIR + "/guide-metrics-topic.png", fullPage: true });
  await m.page.goto(BASE + "/settings/metrics/xyz"); await m.page.waitForLoadState("networkidle"); assert.ok(/404|could not be found|ไม่พบ/i.test(await m.page.locator("body").innerText())); assert.equal(await m.page.locator("article").count(), 0);
  await m.page.goto(BASE + "/settings"); await m.page.waitForURL(BASE + "/");
  await m.page.setViewportSize({ width: 390, height: 844 }); await m.page.goto(BASE + "/settings/metrics/performance"); await m.page.getByRole("heading", { name: /Marketing Performance/, level: 1 }).waitFor();
  assert.ok(await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, "มือถือล้นแนวนอน");
  await m.page.setViewportSize({ width: 1280, height: 800 });
  ok("ตั้งค่า (Marketing): คู่มือนำเข้าข้อมูล / คำอธิบายตัวเลข หน้าแรกเป็นสารบัญอย่างเดียว · กดแต่ละหัวข้อเปิดหน้าของหัวข้อนั้น (6 + 5 หน้า) เนื้อหาครบ · หัวข้อที่ไม่มี = 404 · ตั้งค่าระบบไม่เห็นและเข้าไม่ได้ · มือถือไม่ล้น");
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
  ok("Marketing: เข้า Seller/Buyer Leads ไม่ได้ และ PATCH /api/leads = 403 · ไฟล์ยอดขาย .xlsx ถูกปฏิเสธพร้อมเหตุผล (ไม่มีส่วน Sales) · Devices ของ Google Ads ไปขั้นตอนโฆษณา ส่วน Devices ของ Search Console ไปส่วน Website (ไม่สลับกัน)");
  await browser.close();
  console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
} catch (e) { if (process.env.SHOT_DIR) try { await browser?.contexts().at(-1)?.pages()[0]?.screenshot({ path: process.env.SHOT_DIR + "/fail-import.png", fullPage: true }); } catch { /* */ } console.error("\n✗ FAIL:", e?.message ?? e); console.error(log.split("\n").slice(-20).join("\n")); process.exitCode = 1; } finally { try { await browser?.close(); } catch { /* */ } stop(); process.exit(process.exitCode ?? 0); }
