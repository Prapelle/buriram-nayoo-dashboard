// 31/10/2026 — รูปแบบวันที่ทั้งระบบ "31 ต.ค. 69" + ลิงก์โทร / LINE
import assert from "node:assert/strict";
import { thDate, thDateTime, thDayMonth, thMonth, thRange } from "../src/lib/thdate";
import { lineHref, telHref } from "../src/lib/contact-links";
let n = 0; const ok = (m: string) => { n++; console.log("  ✓ " + m); };

assert.equal(thDate("2026-10-31"), "31 ต.ค. 69"); assert.equal(thDate("2026-01-05"), "5 ม.ค. 69"); assert.equal(thDate("2033-12-01"), "1 ธ.ค. 76");
assert.equal(thDate(""), ""); assert.equal(thDate(undefined), ""); assert.equal(thDate("ไม่ใช่วันที่"), "ไม่ใช่วันที่"); assert.equal(thDate("2026-10-31T10:00:00Z"), "31 ต.ค. 69");
ok("thDate: 2026-10-31 → 31 ต.ค. 69 · ปี พ.ศ. 2 หลัก (2576 → 76) · ค่าว่าง/ไม่ใช่วันที่ คืนค่าเดิม");
assert.equal(thMonth("2026-09"), "ก.ย. 69"); assert.equal(thDayMonth("2026-09-30"), "30 ก.ย."); assert.equal(thRange("2026-09-01", "2026-09-30"), "1 ก.ย. 69 – 30 ก.ย. 69"); assert.equal(thRange("2026-09-01", "2026-09-01"), "1 ก.ย. 69");
ok("thMonth / thDayMonth / thRange");
assert.equal(thDateTime("2026-10-31T03:44:00.000Z"), "31 ต.ค. 69 10:44"); assert.equal(thDateTime("2026-10-31T20:30:00Z"), "1 พ.ย. 69 03:30"); assert.equal(thDateTime("2026-10-31 09:15"), "31 ต.ค. 69 09:15");
ok("thDateTime: เวลา UTC → เวลาไทย (ข้ามวันได้) · ค่าที่ไม่มีโซนเวลาใช้ตามที่เขียน");
assert.equal(telHref("081-234 5678"), "tel:0812345678"); assert.equal(lineHref("@shop"), "https://line.me/R/ti/p/%40shop"); assert.equal(lineHref("my.id"), "https://line.me/ti/p/~my.id"); assert.equal(lineHref("https://lin.ee/abc"), "https://lin.ee/abc");
ok("ลิงก์โทร (ตัดขีด/ช่องว่าง) · LINE OA (@) / LINE ID ส่วนตัว / ลิงก์ที่กรอกมา");
console.log(`\nผ่านทั้งหมด ${n} รายการ`);
