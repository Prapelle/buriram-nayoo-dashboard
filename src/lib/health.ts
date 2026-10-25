import { TABS } from "./schema";
import { batchGet, listTabs, readTabs } from "./sheets";

export type Check = { id: string; label: string; status: "ok" | "warn" | "fail"; detail: string };

const REQUIRED_ENV = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "INITIAL_ADMIN_EMAIL", "GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"];

/** ตรวจความพร้อมของระบบ (ไม่แสดงค่า Secret ใดๆ — บอกแค่ว่ามี/ไม่มี) */
export async function systemCheck(): Promise<Check[]> {
  const out: Check[] = [];
  const add = (id: string, label: string, status: Check["status"], detail: string) => out.push({ id, label, status, detail });

  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  add("env", "ตัวแปรลับ (Secrets) ครบ", missing.length ? "fail" : "ok", missing.length ? `ยังไม่ได้ตั้ง: ${missing.join(", ")}` : `ตั้งครบ ${REQUIRED_ENV.length} ตัว`);
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret && secret.length < 32) add("auth_secret", "AUTH_SECRET แข็งแรงพอ", "warn", "สั้นกว่า 32 ตัวอักษร ควรสร้างใหม่ด้วย openssl rand -base64 32");
  const leaked = Object.keys(process.env).filter((k) => k.startsWith("NEXT_PUBLIC_") && /SECRET|PRIVATE|KEY|TOKEN/i.test(k));
  add("public_env", "ไม่มี Secret ใช้คำนำหน้า NEXT_PUBLIC_", leaked.length ? "fail" : "ok", leaked.length ? `พบ: ${leaked.join(", ")} (จะถูกส่งไปที่ Browser) ให้เปลี่ยนชื่อทันที` : "ไม่พบ");

  let tabs;
  try { tabs = await listTabs(); }
  catch (e) { add("sheet", "เชื่อมต่อ Google Sheets ได้", "fail", `${e instanceof Error ? e.message.slice(0, 160) : "error"} — ตรวจ GOOGLE_SHEET_ID, การแชร์ให้ Service Account (Editor) และการเปิด Sheets API`); return out; }
  add("sheet", "เชื่อมต่อ Google Sheets ได้", "ok", `พบ ${tabs.length} แท็บ`);

  const have = new Set(tabs.map((t) => t.title));
  const missingTabs = TABS.filter((t) => !have.has(t.name)).map((t) => t.name);
  if (missingTabs.length) add("tabs", "แท็บครบตามโครงสร้าง", "warn", `ขาด ${missingTabs.length} แท็บ: ${missingTabs.slice(0, 6).join(", ")}${missingTabs.length > 6 ? "…" : ""} — กด เตรียม Google Sheet`);
  else {
    const headers = await batchGet(TABS.map((t) => `'${t.name}'!1:1`));
    const lacking = TABS.map((t, i) => ({ name: t.name, miss: t.headers.filter((h) => !(headers[i][0] ?? []).includes(h)) })).filter((x) => x.miss.length);
    add("tabs", "แท็บและคอลัมน์ครบตามโครงสร้าง", lacking.length ? "warn" : "ok", lacking.length ? `${lacking.length} แท็บขาดคอลัมน์ (เช่น ${lacking[0].name}: ${lacking[0].miss.slice(0, 3).join(", ")}) — กด เตรียม Google Sheet` : `ครบ ${TABS.length} แท็บ`);
  }

  if (have.has("APP_USERS")) {
    const { APP_USERS, APP_CONFIG, IMPORT_BATCHES } = await readTabs(["APP_USERS", "APP_CONFIG", "IMPORT_BATCHES"]);
    const active = APP_USERS.rows.filter((u) => String(u.active).toUpperCase() === "TRUE");
    const admins = active.filter((u) => u.role === "admin").length;
    add("admin", "มีผู้ดูแล (Admin) ที่ใช้งานได้", admins || process.env.INITIAL_ADMIN_EMAIL ? "ok" : "fail", `Admin ${admins} · Marketing ${active.filter((u) => u.role === "marketing").length} · Sales ${active.filter((u) => u.role === "sales").length}${process.env.INITIAL_ADMIN_EMAIL ? " (+ Admin เริ่มต้นจาก INITIAL_ADMIN_EMAIL)" : ""}`);
    const bad = APP_USERS.rows.filter((u) => u.email && !["admin", "marketing", "sales"].includes(u.role));
    if (bad.length) add("roles", "Role ของผู้ใช้ถูกต้อง", "warn", `${bad.length} แถวใน APP_USERS มี role ที่ไม่รู้จัก (ใช้ admin / marketing / sales) ผู้ใช้เหล่านี้จะเข้าระบบไม่ได้`);
    const keys = new Set(APP_CONFIG.rows.map((r) => r.config_key));
    add("config", "ค่า Config เริ่มต้น", ["max_upload_mb", "excluded_fb_pages"].every((k) => keys.has(k)) ? "ok" : "warn", ["max_upload_mb", "excluded_fb_pages"].every((k) => keys.has(k)) ? "ครบ" : "ขาดบางค่า — กด เตรียม Google Sheet");
    const stuck = IMPORT_BATCHES.rows.filter((b) => b.status === "processing" && Date.now() - Date.parse(b.uploaded_at) > 10 * 60_000);
    const failed = IMPORT_BATCHES.rows.slice(-20).filter((b) => b.status === "failed");
    add("imports", "การนำเข้าล่าสุด", stuck.length ? "warn" : "ok", stuck.length ? `${stuck.length} ครั้งค้างสถานะ processing เกิน 10 นาที (อาจล้มกลางทาง ลองนำเข้าไฟล์เดิมอีกครั้ง ข้อมูลจะไม่ซ้ำ)` : failed.length ? `มีที่ล้มเหลว ${failed.length} ครั้งใน 20 ครั้งล่าสุด (ดูประวัติในหน้า นำเข้า CSV)` : "ไม่พบปัญหา");
  }
  add("writer", "ข้อจำกัดการเขียนพร้อมกัน", "warn", "Google Sheets ไม่มี transaction: ใช้ให้มีผู้เขียนข้อมูลทีละคน (Single Writer) ตามที่ออกแบบไว้ — ถ้าจะให้หลายคนบันทึกพร้อมกันเป็นประจำ ควรย้าย Leads/Sales ไปฐานข้อมูลจริง");
  return out;
}
