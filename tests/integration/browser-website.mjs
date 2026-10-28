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
const FILES = ["ga4_pages.csv", "gsc_Chart.csv", "gsc_Pages.csv", "gsc_Queries.csv", "gsc_Countries.csv", "gsc_Devices.csv", "gsc_Search_appearance.csv", "gsc_Filters.csv"].map((f) => DIR + f);
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
  const t0 = Date.now();
  await page.locator('input[type="file"]').setInputFiles(FILES);
  await page.getByRole("button", { name: "ตรวจสอบก่อนนำเข้า" }).waitFor({ timeout: 60000 });
  const readMs = Date.now() - t0;
  const sec = (h) => page.locator("section", { has: page.getByRole("heading", { name: h }) }).last();
  const text = await sec("1. นำเข้าไฟล์ GA4 / Search Console").innerText();
  assert.ok(text.includes("GA4 — หน้าและหน้าจอ") && text.includes("01/10/2026 – 27/10/2026")); assert.ok(text.includes("views: 35,820")); assert.ok(text.includes("27,361"));
  ok(`เลือกไฟล์จริง 8 ไฟล์ (GA4 2 MB) → เบราว์เซอร์อ่านและสรุปใน ${(readMs / 1000).toFixed(1)} วินาที · แสดงช่วง 01/10–27/10/2026, Page Views 35,820 และคำเตือนยอดผู้ใช้รายหน้า`);
  await page.getByRole("button", { name: "ตรวจสอบก่อนนำเข้า" }).click();
  await page.getByText(/เพิ่ม 302 · อัปเดต 0 · ข้าม 0/).waitFor();
  assert.equal((await tab("WEBSITE_ANALYTICS")).length, 1);
  ok("ตรวจสอบก่อนนำเข้า: GA4 เพิ่ม 302 แถว — ยังไม่เขียนลง Sheet");
  await page.getByRole("button", { name: "ยืนยันนำเข้า" }).click();
  await page.getByText(/นำเข้าแล้ว 7 ไฟล์: เพิ่ม 1026/).waitFor({ timeout: 30000 });
  assert.equal((await tab("WEBSITE_ANALYTICS")).length - 1, 28); assert.equal((await tab("WEBSITE_DIMENSIONS")).length - 1, 998);
  ok("ยืนยันนำเข้า → เพิ่ม 1,026 แถว (สรุป 28 + รายละเอียด 998) ใน Google Sheet");
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
  const perf = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  assert.ok(/Website Users 21,000/.test(perf), perf.slice(perf.indexOf("Website (GA4)"), perf.indexOf("Website (GA4)") + 900)); assert.ok(/Website Page Views 35,820/.test(perf)); assert.ok(/Page Views per User 1\.71/.test(perf)); assert.ok(perf.includes("47 วินาที") || perf.includes("47.3 วินาที"), "duration");
  assert.ok(/Search Clicks 4,744/.test(perf) && /Search CTR 2\.33%/.test(perf));
  ok("Marketing Performance (เบราว์เซอร์): Users 21,000 · Page Views 35,820 · PV/User 1.71 · Duration 47 วินาที · Search Clicks 4,744 · CTR 2.33%");
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(BASE + "/website");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `หน้าเลื่อนแนวนอน ${overflow}px`); await page.screenshot({ path: "/tmp/website-mobile.png", fullPage: false });
  ok("หน้าจอมือถือ (390px): หน้า Website ไม่ล้นแนวนอน");
  assert.deepEqual(errors.filter((e) => !/favicon/.test(e)), []); ok("ไม่มี JavaScript error ในเบราว์เซอร์");
  await browser.close();
  console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
} catch (e) { console.error("\n✗ FAIL:", e?.message ?? e); console.error(log.split("\n").slice(-20).join("\n")); process.exitCode = 1; } finally { try { await browser?.close(); } catch { /* */ } stop(); process.exit(process.exitCode ?? 0); }
