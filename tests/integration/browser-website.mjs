// Phase 5 — ทดสอบหน้า Website ในเบราว์เซอร์จริง (Chromium headless) กับ production build + Google Sheets จำลอง
// อัปโหลดไฟล์จริงทั้ง 8 ไฟล์ → อ่านในเบราว์เซอร์ → ตรวจสอบ → นำเข้า → กรอกยอดผู้ใช้ → ดูหน้า Marketing Performance
// รัน: node tests/integration/browser-website.mjs (ต้อง build ก่อน และมีไฟล์ใน tests/fixtures/website)
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { encode } from "next-auth/jwt";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // ติดตั้งแยกจากโปรเจกต์ (ไม่อยู่ใน package.json)

const PORT = 3220, CTRL = 3221, BASE = `http://127.0.0.1:${PORT}`, SECRET = "browser-secret-0123456789abcdef0123456789abcdef";
const DIR = `${process.env.FIXTURE_DIR ?? "tests/fixtures"}/website/`;
const FILES = ["ga4_pages.csv", "gsc_Chart.csv", "gsc_Pages.csv", "gsc_Queries.csv", "gsc_Countries.csv", "gsc_Devices.csv", "gsc_Search_appearance.csv", "gsc_Filters.csv", "ga4_reports_snapshot.csv"].map((f) => DIR + f);
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

try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE + "/login")).status < 500) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
  const token = await encode({ token: { email: "admin@example.com", sub: "admin@example.com", roleCheckedAt: 0 }, secret: SECRET, salt: "authjs.session-token" });
  const init = await fetch(BASE + "/api/init", { method: "POST", headers: { cookie: `authjs.session-token=${token}`, "sec-fetch-site": "same-origin" } }); assert.equal(init.status, 200);
  browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: "th-TH" });
  await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE + "/website"); await page.getByText("1. นำเข้าไฟล์ GA4 / Search Console").waitFor();
  assert.ok(await page.getByRole("button", { name: "เลือกไฟล์" }).isVisible()); assert.ok(!(await page.locator('input[type="file"]').isVisible()));
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/website-upload.png", clip: { x: 0, y: 0, width: 1280, height: 520 } });
  ok("หน้า Website: มีปุ่ม \"เลือกไฟล์\" + พื้นที่ลากไฟล์มาวาง (ซ่อนช่อง Choose files เดิม)");
  const t0 = Date.now();
  await page.locator('input[type="file"]').setInputFiles(FILES);
  await page.getByRole("button", { name: "ตรวจสอบก่อนนำเข้า" }).waitFor({ timeout: 60000 });
  const readMs = Date.now() - t0;
  const sec = (h) => page.locator("section", { has: page.getByRole("heading", { name: h }) }).last();
  const text = await sec("1. นำเข้าไฟล์ GA4 / Search Console").innerText();
  assert.ok(text.includes("GA4 — หน้าและหน้าจอ") && text.includes("01/10/2026 – 27/10/2026")); assert.ok(text.includes("views: 35,820")); assert.ok(text.includes("27,361"));
  assert.ok(text.includes("GA4 — Reports snapshot") && text.includes("01/09/2026 – 30/09/2026") && text.includes("users: 17,443"));
  ok(`เลือกไฟล์จริง 9 ไฟล์ (GA4 รายหน้า 2 MB + Reports snapshot) → เบราว์เซอร์อ่านและสรุปใน ${(readMs / 1000).toFixed(1)} วินาที · แสดงช่วง 01/10–27/10/2026, Page Views 35,820 และคำเตือนยอดผู้ใช้รายหน้า`);
  await page.getByRole("button", { name: "ตรวจสอบก่อนนำเข้า" }).click();
  await page.getByText(/เพิ่ม 302 · อัปเดต 0 · ข้าม 0/).waitFor();
  assert.equal((await tab("WEBSITE_ANALYTICS")).length, 1);
  ok("ตรวจสอบก่อนนำเข้า: GA4 เพิ่ม 302 แถว — ยังไม่เขียนลง Sheet");
  await page.getByRole("button", { name: "ยืนยันนำเข้า" }).click();
  await page.getByText(/นำเข้าแล้ว 8 ไฟล์: เพิ่ม 1732/).waitFor({ timeout: 30000 });
  assert.equal((await tab("WEBSITE_ANALYTICS")).length - 1, 29); assert.equal((await tab("WEBSITE_DIMENSIONS")).length - 1, 998 + 705);
  ok("ยืนยันนำเข้า 8 ไฟล์ (รวม Reports snapshot) → เพิ่ม 1,732 แถวใน Google Sheet");
  await page.getByText("GA4 — หน้าที่มีการดูมากที่สุด").waitFor(); const detail = await sec("3. ข้อมูลที่นำเข้าแล้ว").innerText();
  assert.ok(detail.includes("/buriram") && detail.includes("5,164") && detail.includes("Search Console — คำค้นหา") && detail.includes("บุรีรัมย์น่าอยู่"), detail.slice(0, 1500));
  ok("ตารางรายละเอียด: /buriram 5,164 การดู · คำค้น บุรีรัมย์น่าอยู่ · อุปกรณ์/ประเทศ");
  await page.locator('input[type="file"]').setInputFiles([DIR + "gsc_Chart.csv"]);
  await page.getByRole("button", { name: "ตรวจสอบก่อนนำเข้า" }).click();
  await page.getByText(/ไฟล์นี้เคยนำเข้าแล้ว/).waitFor();
  assert.ok(await page.getByRole("button", { name: "ยืนยันนำเข้า" }).isDisabled());
  ok("เลือกไฟล์เดิมซ้ำ → แจ้งว่าเคยนำเข้าแล้ว และปุ่มยืนยันถูกปิดจนกว่า Admin จะติ๊กยืนยัน");
  await page.getByRole("button", { name: "ล้าง" }).click();
  await page.getByRole("button", { name: "01/10/2026–27/10/2026" }).click();
  await page.getByLabel("Users *").fill("21000");
  await page.getByRole("button", { name: "บันทึกยอดผู้ใช้" }).click();
  await page.getByText("บันทึกยอดผู้ใช้แล้ว").waitFor();
  ok("กดช่วงของไฟล์ GA4 แล้วกรอก Users 21,000 → บันทึกแล้ว");
  await page.goto(BASE + "/performance?from=2026-10-01&to=2026-10-27");
  await page.getByText("Website Users", { exact: false }).first().waitFor();
  const perf = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Website Users 21,000/.test(perf), perf.slice(perf.indexOf("Website (GA4)"), perf.indexOf("Website (GA4)") + 900)); assert.ok(/Website Page Views 35,820/.test(perf)); assert.ok(/Page Views per User 1\.71/.test(perf)); assert.ok(perf.includes("47 วินาที") || perf.includes("47.3 วินาที"), "duration");
  assert.ok(/Search Clicks 4,744/.test(perf) && /Search CTR 2\.33%/.test(perf));
  ok("Marketing Performance (เบราว์เซอร์): Users 21,000 · Page Views 35,820 · PV/User 1.71 · Duration 47 วินาที · Search Clicks 4,744 · CTR 2.33%");
  // ข้อมูลตัวอย่างสำหรับ Funnel / ช่องทาง: โฆษณา ก.ย. + Lead 23 ราย
  const setRows = async (name, objs) => { const head = (await tab(name))[0]; const r = await fetch(`http://127.0.0.1:${CTRL}/set`, { method: "POST", body: JSON.stringify({ name, rows: [head, ...objs.map((o) => head.map((h) => o[h] ?? ""))] }) }); assert.equal(r.status, 200); };
  await setRows("META_ADS", [{ row_key: "m1", report_start: "2026-09-01", report_end: "2026-09-30", campaign_name: "Demo", ad_name: "Demo", amount_spent_thb: 37557.54, impressions: 900000, reach: 500000 }]);
  await setRows("GOOGLE_ADS_CAMPAIGNS", [{ row_key: "g1", report_start: "2026-09-01", report_end: "2026-09-30", campaign_name: "Demo", cost_thb: 28814.82, clicks: 31513 }]);
  const LD = []; const add = (n, ch, calls) => { for (let i = 0; i < n; i++) LD.push({ lead_id: `${ch}-${i}`, lead_code: `L${LD.length}`, received_at: `2026-09-${String(1 + (LD.length % 28)).padStart(2, "0")}`, source_channel: ch, call_status: calls[i] ?? "ยังไม่ได้โทร", need: "ซื้อ", status: "New" }); };
  add(12, "Facebook Ads", ["ซื้อสำเร็จ", "เข้าชมโครงการแล้ว", "ติดต่อได้แล้ว", "ติดต่อไม่ได้"]); add(5, "Google Ads", ["เข้าชมโครงการแล้ว", "ติดต่อได้แล้ว"]); add(4, "LINE OA", ["ซื้อสำเร็จ", "ติดต่อได้แล้ว"]); add(2, "Website/SEO", ["ไม่สนใจ"]);
  await setRows("LEADS", LD);
  await page.goto(BASE + "/performance?from=2026-09-01&to=2026-09-30");
  await page.getByText("Website Users", { exact: false }).first().waitFor();
  const sepT = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Website Users 17,443/.test(sepT) && /Website Page Views 42,450/.test(sepT) && /Page Views per User 2\.43/.test(sepT) && sepT.includes("1 นาที 0 วินาที") && /Sessions 22,409/.test(sepT), sepT.slice(sepT.indexOf("Website (GA4)"), sepT.indexOf("Website (GA4)") + 700));
  ok("Performance ก.ย. 2026 (เบราว์เซอร์): Users 17,443 จาก Snapshot · Page Views 42,450 · PV/User 2.43 · Duration 1 นาที · Sessions 22,409");
  assert.ok(/Customer Funnel/.test(sepT) && /เข้าเว็บไซต์ .*22,409/.test(sepT) && /ขายได้ \(ซื้อสำเร็จ\)/.test(sepT) && /ประสิทธิภาพแต่ละช่องทาง/.test(sepT) && /Reach \(ทุก Social\).* 500,000/.test(sepT) && /Leads .* 23 /.test(sepT) && /Qualified Leads .* 7 /.test(sepT) && /ขายได้ \(ซื้อสำเร็จ\) 28\.57% ของขั้นก่อนหน้า · Call Status = ซื้อสำเร็จ 2 /.test(sepT) && /Meta Ads Paid ?ถูกที่สุด ฿37,557\.54 12 ฿3,129\.80 3 ฿12,519\.18 1/.test(sepT) && /Google Ads Paid ฿28,814\.82 5 ฿5,762\.96 2/.test(sepT) && /LINE OA Organic ไม่มีค่าโฆษณา 4 — 2 — 1/.test(sepT), sepT.slice(sepT.indexOf("ประสิทธิภาพแต่ละช่องทาง"), sepT.indexOf("ประสิทธิภาพแต่ละช่องทาง") + 500));
  if (process.env.SHOT_DIR) { const box = await page.getByRole("heading", { name: "Customer Funnel" }).locator("xpath=../..").boundingBox(); const b2 = await page.getByRole("heading", { name: "ประสิทธิภาพแต่ละช่องทาง (Cost per Lead)" }).locator("xpath=../..").boundingBox(); await page.screenshot({ path: process.env.SHOT_DIR + "/perf-funnel.png", fullPage: true, clip: { x: 0, y: Math.max(0, box.y - 10), width: 1280, height: b2.y + b2.height - box.y + 20 } }); }
  const tw = await page.evaluate(() => [...document.querySelectorAll("main table")].map((t) => t.parentElement.scrollWidth - t.parentElement.clientWidth)[0]); assert.ok(tw <= 1, `ตารางช่องทางล้น ${tw}px ที่ 1280px`);
  ok("Performance: Customer Funnel Reach 500,000 → เข้าเว็บ 22,409 Sessions → Leads 23 → Qualified 7 → ขายได้ 2 · ฿/Lead: Meta ฿3,129.80 (ถูกที่สุด) · Google ฿5,762.96 · LINE OA ไม่มีค่าโฆษณา");
  // Facebook ระดับเพจ: ไฟล์จริงจาก Meta Business Suite (UTF-16) ผ่านหน้า นำเข้า CSV
  const FB = `${process.env.FIXTURE_DIR ?? "tests/fixtures"}/fbpage/`;
  for (const [f, label] of [["Viewers.csv", "Facebook Page — Viewers รายวัน (ระดับเพจ)"], ["Link_clicks.csv", "Facebook Page — Link clicks รายวัน (ระดับเพจ)"]]) {
    await page.goto(BASE + "/import"); await page.getByRole("cell", { name: "ga4_pages.csv" }).waitFor(); // ประวัติโหลดแล้ว = หน้าพร้อมรับไฟล์
    await page.locator('input[type="file"]').first().setInputFiles(FB + f);
    await page.getByText(/ช่วงรายงานจากไฟล์: 01\/09\/2026\s*–\s*30\/09\/2026/).waitFor();
    assert.equal(await page.locator("select").first().evaluate((el) => el.options[el.selectedIndex].text), label);
    await page.getByRole("button", { name: "ยืนยันนำเข้า (+30 / อัปเดต 0)" }).click();
    await page.getByText("นำเข้าสำเร็จ — เพิ่ม 30 · อัปเดต 0 · ข้าม 0 · ไม่ถูกต้อง 0").waitFor();
  }
  assert.equal((await tab("FB_PAGE_INSIGHTS")).length - 1, 60);
  ok("หน้า นำเข้า CSV: ไฟล์ Viewers / Link clicks จริง (UTF-16 จาก Meta Business Suite) ตรวจประเภทอัตโนมัติ ช่วง 01–30/09/2026 → นำเข้า 30 + 30 วัน");
  await page.goto(BASE + "/facebook-page?from=2026-09-01&to=2026-09-30"); await page.getByText("Viewers (แทน Reach)").waitFor();
  const fbT = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Viewers \(แทน Reach\) 806,272 ใช้ Viewers เทียบเคียง Reach/.test(fbT) && /Link clicks \(ระดับเพจ\) 6,443/.test(fbT), fbT.slice(0, 900));
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/fb-page.png", fullPage: false });
  assert.match(await page.getByRole("link", { name: "Viewers / Link clicks รายวัน (ระดับเพจ)" }).getAttribute("href"), /view=page/);
  await page.goto(BASE + "/facebook-page?view=page&from=2026-09-01&to=2026-09-30"); await page.getByText("93,295").waitFor();
  const fbD = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/10\/09\/2026 93,295 375/.test(fbD), fbD.slice(fbD.indexOf("วันที่"), fbD.indexOf("วันที่") + 400));
  await page.goto(BASE + "/performance?from=2026-09-01&to=2026-09-30"); await page.getByText("Website Users", { exact: false }).first().waitFor();
  const pfT = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Facebook Viewers \(แทน Reach\) 806,272/.test(pfT) && /Reach \(ทุก Social\) .*1,306,272/.test(pfT), pfT.slice(pfT.indexOf("Facebook Page (Organic)"), pfT.indexOf("Facebook Page (Organic)") + 500));
  ok("หน้า Facebook Page: การ์ด Viewers (แทน Reach) 806,272 + หมายเหตุ ใช้ Viewers เทียบเคียง Reach · Link clicks 6,443 · ตารางรายวัน · Performance/Funnel ใช้ Viewers (500,000 + 806,272)");
  await page.goto(BASE + "/website"); await page.getByText("GA4 Snapshot — Sessions ตามแหล่งที่มา").waitFor({ timeout: 5000 }).catch(() => {});
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(BASE + "/website");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `หน้าเลื่อนแนวนอน ${overflow}px`); await page.screenshot({ path: "/tmp/website-mobile.png", fullPage: false });
  ok("หน้าจอมือถือ (390px): หน้า Website ไม่ล้นแนวนอน");
  assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), []); ok("ไม่มี JavaScript error ในเบราว์เซอร์");
  await browser.close();
  console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
} catch (e) { if (process.env.SHOT_DIR) try { await browser?.contexts()[0]?.pages()[0]?.screenshot({ path: process.env.SHOT_DIR + "/fail.png", fullPage: true }); } catch { /* */ } console.error("\n✗ FAIL:", e?.message ?? e); console.error(log.split("\n").slice(-20).join("\n")); process.exitCode = 1; } finally { try { await browser?.close(); } catch { /* */ } stop(); process.exit(process.exitCode ?? 0); }
