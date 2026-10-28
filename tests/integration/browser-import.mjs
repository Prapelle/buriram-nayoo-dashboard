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

  const m = await open("marketing@example.com");
  await m.page.goto(BASE + "/import"); await m.page.getByRole("cell", { name: "Campaigns_2026_09_01-2026_09_30_.csv" }).waitFor();
  await m.page.locator('input[type="file"]').first().setInputFiles([`${FX}/synthetic_SalesReport.xlsx`, `${FX}/website/gsc_Devices.csv`, `${FX}/Devices_2026_09_01-2026_09_30_.csv`]);
  await m.page.getByText(/ไฟล์รายงานยอดขาย \(\.xlsx\) นำเข้าได้เฉพาะ Admin หรือ Sales/).waitFor();
  await m.page.getByRole("heading", { name: "ไฟล์เว็บไซต์ (GA4 / Search Console)" }).waitFor();
  assert.equal(await m.page.getByRole("heading", { name: "ไฟล์รายงานยอดขาย (Sales)" }).count(), 0);
  assert.equal(await m.page.locator("select").first().evaluate((el) => el.options[el.selectedIndex].text), "Google Ads — Devices (เพิ่มเติม)");
  const wtxt = await m.page.locator("section", { has: m.page.getByRole("heading", { name: "ไฟล์เว็บไซต์ (GA4 / Search Console)" }) }).last().innerText();
  assert.ok(wtxt.includes("gsc_Devices.csv") && !wtxt.includes("Devices_2026"));
  assert.deepEqual(m.errors, []);
  ok("Marketing: ไฟล์ยอดขาย .xlsx ถูกปฏิเสธพร้อมเหตุผล (ไม่มีส่วน Sales) · Devices ของ Google Ads ไปขั้นตอนโฆษณา ส่วน Devices ของ Search Console ไปส่วน Website (ไม่สลับกัน)");
  await browser.close();
  console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
} catch (e) { if (process.env.SHOT_DIR) try { await browser?.contexts().at(-1)?.pages()[0]?.screenshot({ path: process.env.SHOT_DIR + "/fail-import.png", fullPage: true }); } catch { /* */ } console.error("\n✗ FAIL:", e?.message ?? e); console.error(log.split("\n").slice(-20).join("\n")); process.exitCode = 1; } finally { try { await browser?.close(); } catch { /* */ } stop(); process.exit(process.exitCode ?? 0); }
