// นำเข้า Lead จากไฟล์ (12/11/2026) กับ Google Sheets จำลอง — รัน: npx tsx tests/lead-import.test.mts
import { generateKeyPairSync } from "node:crypto";
import assert from "node:assert/strict";
import { install, tabs } from "./integration/fake-sheets.mjs";
import { makeD1 } from "./integration/fake-d1.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
Object.assign(process.env, { GOOGLE_SHEET_ID: "SHEET", GOOGLE_SERVICE_ACCOUNT_EMAIL: "sa@x.iam.gserviceaccount.com", GOOGLE_PRIVATE_KEY: privateKey, INITIAL_ADMIN_EMAIL: "admin@example.com" });
install("SHEET");
const { initializeSpreadsheet } = await import("../src/lib/init-sheet");
const { saveLead, importLeads, listLeads, LeadError } = await import("../src/lib/leads-service");
const { importDate, LEAD_TEMPLATE, importRowToInput, LEAD_IMPORT_HEADERS } = await import("../src/lib/lead-import");
const { parseCsv, toCsv } = await import("../src/lib/csv");

const t = async (name: string, fn: () => Promise<void> | void) => { await fn(); console.log("  ✓", name); };
const leadRows = () => { const rows = tabs.get("LEADS")!.rows as string[][]; const h = rows[0]; return rows.slice(1).filter((r) => r[h.indexOf("lead_id")]).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])) as Record<string, string>); };
const H = LEAD_TEMPLATE[0];
const row = (o: Record<string, string>) => H.map((h) => o[h] ?? "");

await t("แปลงวันที่: ISO / วว/ดด/ปปปป / พ.ศ. / เลขวันที่ Excel · วันที่ผิดคืนค่าเดิม", () => {
  assert.equal(importDate("2026-11-12"), "2026-11-12"); assert.equal(importDate("12/11/2026"), "2026-11-12"); assert.equal(importDate("12/11/2569"), "2026-11-12");
  assert.equal(importDate("1/2/2026"), "2026-02-01"); assert.equal(importDate("46338"), "2026-11-12"); assert.equal(importDate("31/02/2026"), "31/02/2026"); assert.equal(importDate(""), "");
});
await t("ฟอร์ม CSV: หัวคอลัมน์ทุกช่องรู้จัก · แถวตัวอย่างอ่านกลับได้ (CSV ไป-กลับ)", () => {
  for (const h of H) assert.ok(LEAD_IMPORT_HEADERS[h.trim().replace(/\s+/g, " ").toLowerCase()], `ไม่รู้จักหัวคอลัมน์ ${h}`);
  assert.deepEqual(parseCsv(toCsv(LEAD_TEMPLATE)), LEAD_TEMPLATE);
  const map = H.map((h) => LEAD_IMPORT_HEADERS[h.toLowerCase()]);
  const o = importRowToInput(map, LEAD_TEMPLATE[1], "2026-11-12");
  assert.equal(o.buy_status, "Warm"); assert.equal(o.customer_name, "คุณตัวอย่าง ใจดี"); assert.equal(o.status_in, undefined);
  const s = importRowToInput(map, row({ "ชื่อลูกค้า": "ก", "ความต้องการ": "ขาย", "สถานะ": "สนใจขาย", "ช่องทาง": "facebook ads" }), "2026-11-12");
  assert.equal(s.sell_status, "สนใจขาย"); assert.equal(s.source_channel, "Facebook Ads"); assert.equal(s.received_at, "2026-11-12");
});

await initializeSpreadsheet("admin@example.com");
await saveLead({ received_at: "2026-11-01", source_channel: "Referral", customer_name: "สมชาย เดิม", phone: "081-111-1111", need: "ซื้อ" }, "sales@example.com");
await saveLead({ received_at: "2026-11-01", source_channel: "Referral", customer_name: "สมหญิง ขายบ้าน", phone: "0822222222", line_id: "@somying", need: "ขาย" }, "sales@example.com");
const before = leadRows().length;

const grid = [H,
  row({ "ชื่อลูกค้า": "ลูกค้าใหม่ 1", "เบอร์โทร": "0891234567", "ความต้องการ": "ซื้อ", "ช่องทาง": "Facebook Ads", "สถานะ": "Hot", "วันที่รับ Lead": "10/11/2569" }), // 2 เพิ่ม
  row({ "ชื่อลูกค้า": "คนอื่น", "เบอร์โทร": "+66 81 111 1111", "ความต้องการ": "เช่า" }), // 3 ซ้ำเบอร์ (ฝั่งซื้อ)
  row({ "ชื่อลูกค้า": "  สมชาย   เดิม ", "เบอร์โทร": "", "ความต้องการ": "สร้าง" }), // 4 ซ้ำชื่อ (ฝั่งซื้อ)
  row({ "ชื่อลูกค้า": "สมชาย เดิม", "เบอร์โทร": "0811111111", "ความต้องการ": "ขาย" }), // 5 ฝั่งขาย ไม่ซ้ำ → เพิ่ม
  row({ "ชื่อลูกค้า": "ลูกค้าใหม่ 1", "เบอร์โทร": "0800000000", "ความต้องการ": "ซื้อ" }), // 6 ซ้ำชื่อกับแถว 2 ในไฟล์
  row({ "ชื่อลูกค้า": "ไลน์ซ้ำ", "Line": "somying", "ความต้องการ": "ขาย" }), // 7 ซ้ำ Line ฝั่งขาย
  row({ "ชื่อลูกค้า": "", "ความต้องการ": "ซื้อ" }), // 8 ไม่มีชื่อ
  row({ "ชื่อลูกค้า": "Need ผิด", "ความต้องการ": "แลก" }), // 9 Need ผิด
  row({ "ชื่อลูกค้า": "Staff ผิด", "ความต้องการ": "ซื้อ", "Staff": "ไม่มีคนนี้" }), // 10 Staff ไม่อยู่ในผู้ใช้
  row({ "ชื่อลูกค้า": "วันที่ผิด", "ความต้องการ": "ซื้อ", "วันที่รับ Lead": "31/02/2026" }), // 11 วันที่ผิด
  row({ "ชื่อลูกค้า": "ผู้ขายใหม่", "เบอร์โทร": "0877777777", "ความต้องการ": "ขาย", "ช่องทาง": "LINE OA" }), // 12 เพิ่ม (ขาย → รอติดต่อ)
  H.map(() => ""), // แถวว่าง → ไม่นับ
];

let plan: Awaited<ReturnType<typeof importLeads>>;
await t("ตรวจก่อน (plan): เพิ่ม 3 · ซ้ำ 4 (เบอร์ / ชื่อ / Line / แถวก่อนหน้าในไฟล์) · ไม่ถูกต้อง 4 · ยังไม่เขียน Sheet", async () => {
  plan = await importLeads(grid, false, "sales@example.com");
  assert.deepEqual(plan.counts, { insert: 3, duplicate: 4, invalid: 4 });
  const by = (n: number) => plan.results.find((r) => r.n === n)!;
  assert.equal(by(2).status, "insert"); assert.equal(by(5).status, "insert"); assert.equal(by(12).status, "insert");
  assert.equal(by(3).status, "duplicate"); assert.match(by(3).matches![0], /^LD-\d{4}-\d{4} \(เบอร์โทร\)$/);
  assert.equal(by(4).status, "duplicate"); assert.match(by(4).matches![0], /\(ชื่อ\)$/);
  assert.equal(by(6).status, "duplicate"); assert.match(by(6).matches![0], /^แถว 2 ในไฟล์ \(ชื่อ\)$/);
  assert.equal(by(7).status, "duplicate"); assert.match(by(7).matches![0], /\(Line\)$/);
  assert.ok(by(8).errors!.customer_name); assert.ok(by(9).errors!.need); assert.ok(by(10).errors!.staff); assert.ok(by(11).errors!.received_at);
  assert.equal(plan.committed, false); assert.equal(leadRows().length, before);
});
await t("ยืนยัน (commit): เพิ่ม 3 รายการ รหัสต่อเนื่อง · สถานะ/วันที่/ช่องทางถูก · ผู้สร้าง = ผู้นำเข้า · Audit 1 รายการ", async () => {
  const r = await importLeads(grid, true, "sales@example.com");
  assert.equal(r.committed, true); assert.equal(r.codes!.length, 3); assert.equal(leadRows().length, before + 3);
  assert.equal(new Set(leadRows().map((x) => x.lead_code)).size, before + 3, "รหัส Lead ต้องไม่ซ้ำ");
  const n1 = leadRows().find((x) => x.customer_name === "ลูกค้าใหม่ 1")!;
  assert.equal(n1.received_at, "2026-11-10"); assert.equal(n1.buy_status, "Hot"); assert.equal(n1.call_status, "รอติดต่อ"); assert.equal(n1.source_channel, "Facebook Ads"); assert.equal(n1.created_by, "sales@example.com"); assert.equal(n1.status, "New");
  const s1 = leadRows().find((x) => x.customer_name === "ผู้ขายใหม่")!; assert.equal(s1.sell_status, "รอติดต่อ"); assert.equal(s1.buy_status, "");
  const s2 = leadRows().find((x) => x.customer_name === "สมชาย เดิม" && x.need === "ขาย")!; assert.equal(s2.source_channel, "Unknown");
  const audits = (tabs.get("AUDIT_LOG")!.rows as string[][]).filter((x) => x.includes("lead_import")); assert.equal(audits.length, 1);
  const listed = await listLeads(); assert.equal(listed.rows.length, before + 3);
});
await t("นำเข้าไฟล์เดิมซ้ำ: ทุกแถวที่เคยเพิ่มกลายเป็นซ้ำ · ไม่เพิ่มอะไร", async () => {
  const r = await importLeads(grid, true, "sales@example.com");
  assert.equal(r.counts.insert, 0); assert.equal(r.counts.duplicate, 7); assert.equal(r.committed, false); assert.equal(leadRows().length, before + 3);
});
await t("ไฟล์ไม่มีคอลัมน์ ชื่อลูกค้า / ความต้องการ หรือว่าง → 422", async () => {
  for (const g of [[["ชื่อ", "เบอร์"], ["ก", "1"]], [H], "x", [H, ...Array.from({ length: 1001 }, () => row({ "ชื่อลูกค้า": "x", "ความต้องการ": "ซื้อ" }))]]) {
    await assert.rejects(importLeads(g, false, "x@example.com"), (e) => e instanceof LeadError && e.status === 422);
  }
});
await t("หัวคอลัมน์มี BOM / ตัวพิมพ์ใหญ่เล็ก / รหัสคอลัมน์ ก็อ่านได้", async () => {
  const g = [["﻿customer_name", "NEED", "Phone"], ["คนใหม่ BOM", "ซื้อ", "0866666666"]];
  const r = await importLeads(g, false, "x@example.com"); assert.deepEqual(r.counts, { insert: 1, duplicate: 0, invalid: 0 });
});
await t("มี D1: นำเข้าแล้วบันทึกสถานะเริ่มต้นของทุก Lead ลง LEAD_STATUS_LOG (นับผลงานรายคน) ด้วยรหัสจริง", async () => {
  const D = await import("../src/lib/d1"); const ST = await import("../src/lib/d1-state");
  const db = makeD1(); D.setD1ForTest(db as never); ST.invalidateD1State();
  const g = [H, row({ "ชื่อลูกค้า": "D1 ซื้อ", "ความต้องการ": "ซื้อ", "Call Status": "ติดต่อได้แล้ว" }), row({ "ชื่อลูกค้า": "D1 ขาย", "ความต้องการ": "ขาย", "สถานะ": "สนใจขาย" })];
  const r = await importLeads(g, true, "sales@example.com");
  const log = db.rows("LEAD_STATUS_LOG") as Record<string, string>[];
  assert.deepEqual(log.map((x) => [x.lead_code, x.field, x.from_status, x.to_status]).sort(), [[r.codes![0], "call_status", "", "ติดต่อได้แล้ว"], [r.codes![1], "sell_status", "", "สนใจขาย"]].sort());
  assert.equal(leadRows().find((x) => x.customer_name === "D1 ซื้อ")!.contactable, "TRUE");
  D.setD1ForTest(null); ST.invalidateD1State();
});
console.log("ผ่านทั้งหมด (นำเข้า Lead)");
