// 5/11/2026 — ระบบบัญชี: เลขที่เอกสาร · ยอดรวม · ตัวอักษรบาท · ตรวจฟอร์ม · ชำระ/มัดจำ · เช็กลิสต์ Production (อิงใบเสนอราคาต้นแบบ QT2026100009)
// รัน: npx tsx tests/account.test.ts
import assert from "node:assert/strict";
import { bahtText, calcTotals, checklistOf, missingDates, nextDocNo, nextJobCode, parseSeller, statusFromPaid, thaiDate, validateDoc, validatePayment, NEXT_TYPES } from "../src/lib/account";

let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };
const TYPES = ["Top ads", "Super Topads", "แพ็กเกจ STD"], CATS = ["Product", "Service", "Event"];

console.log("1) เลขที่เอกสาร");
assert.equal(nextDocNo("quotation", [], "2026-10-29"), "QT2026100001");
assert.equal(nextDocNo("quotation", ["QT2026100008", "QT2026100009", "QT2026090050", "IV2026100077"], "2026-10-29"), "QT2026100010");
assert.equal(nextDocNo("invoice", ["QT2026100009"], "2026-11-05"), "IV2026110001");
ok("คำนำหน้า + ปีเดือน + ลำดับ 4 หลัก แยกตามชนิดและเดือน");

console.log("2) ยอดรวม / ตัวอักษรบาท");
assert.deepEqual(calcTotals([{ qty: 1, unit_price: 5000 }], 0, 0), { subtotal: 5000, discount: 0, vat_rate: 0, vat: 0, total: 5000 });
assert.equal(calcTotals([{ qty: 2, unit_price: 1000 }, { qty: 1, unit_price: 500.5 }], 500, 7).total, 2140.54);
assert.equal(calcTotals([{ qty: 1, unit_price: 100 }], 999, 0).total, 0); // ส่วนลดเกินยอดรวมไม่ติดลบ
assert.equal(bahtText(5000), "ห้าพันบาทถ้วน");
assert.equal(bahtText(21), "ยี่สิบเอ็ดบาทถ้วน"); assert.equal(bahtText(11), "สิบเอ็ดบาทถ้วน"); assert.equal(bahtText(101), "หนึ่งร้อยเอ็ดบาทถ้วน");
assert.equal(bahtText(1250.5), "หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์"); assert.equal(bahtText(0), "ศูนย์บาทถ้วน"); assert.equal(bahtText(1_000_000), "หนึ่งล้านบาทถ้วน");
assert.equal(thaiDate("2026-10-29"), "29/10/2569");
ok("ยอดรวม/ส่วนลด/VAT ปัดสตางค์ · ตัวอักษรไทย (เอ็ด/ยี่สิบ/ล้าน/สตางค์) · พ.ศ.");

console.log("3) ตรวจฟอร์มใบเสนอราคา (ตามต้นแบบ)");
const DESC = "สิ่งที่โครงการได้รับ\n- Content รวมโครงการที่เข้าแคมเปญ\n- Content กระตุ้นหา User ที่กำลังมองหาบ้าน\n- Code Grab มูลค่า 100 บาท สำหรับคนลงทะเบียน\nสำหรับโครงการที่ต้องการรางวัลพรีเมียมและจ่ายเพิ่ม\n- Code Grab มูลค่า 200 บาท สำหรับคน Walk-in โครงการ 5 Code **(ต้องซื้อเพิ่ม 1,000 บาท)**\n\nแถมพิเศษ\n- ปักหมุดโครงการเปิดตัวเร็วนี้";
const input = { doc_type: "quotation", doc_date: "2026-10-29", customer_id: "dev-1", job_title: "บุรีรัมย์น่าอยู่ (แคมเปญ TopDeal)", contact_name: "คุณ ปริญญาพร บุญประสพ", contact_phone: "0833651355", lines: [{ product: "แพ็กเกจ STD", category: "Product", description: DESC, qty: 1, unit_price: 5000, start_date: "2026-11-01", end_date: "2027-04-30" }] };
const v = validateDoc(input, TYPES, CATS);
assert.ok(v.ok && v.totals.total === 5000 && v.lines[0].amount === 5000 && v.doc.customer_id === "dev-1");
const bad = validateDoc({ doc_date: "2026-02-30", lines: [{ product: "ไม่มีในรายการ", qty: 0, unit_price: -1, start_date: "2026-05-01", end_date: "2026-04-01" }], discount: "x", vat_rate: 120 }, TYPES, CATS);
assert.ok(!bad.ok); assert.deepEqual(Object.keys(bad.errors).sort(), ["customer_id", "discount", "doc_date", "lines.0.end_date", "lines.0.product", "lines.0.qty", "lines.0.unit_price", "vat_rate"]);
assert.ok(!validateDoc({ ...input, lines: [] }, TYPES, CATS).ok);
ok("ต้องเลือกลูกค้า · รายการต้องเป็น Product ในรายการ · จำนวน/ราคา/วันที่/VAT ผิด → ไม่ผ่าน · ต้องมีอย่างน้อย 1 รายการ");

console.log("4) ลำดับเอกสาร");
assert.deepEqual(NEXT_TYPES.quotation, ["billing", "invoice"]); assert.deepEqual(NEXT_TYPES.billing, ["invoice"]); assert.deepEqual(NEXT_TYPES.invoice, []);
ok("เสนอราคา → วางบิล → แจ้งหนี้ และข้ามไปใบแจ้งหนี้ตรง ๆ ได้");

console.log("5) ชำระเงิน / มัดจำ");
assert.equal(statusFromPaid("sent", 5000, 0), "sent"); assert.equal(statusFromPaid("approved", 5000, 2000), "paid_partial"); assert.equal(statusFromPaid("sent", 5000, 5000), "paid"); assert.equal(statusFromPaid("cancelled", 5000, 5000), "cancelled");
const today = "2026-11-05";
let p = validatePayment({ amount: "2,000", paid_at: "2026-11-05", method: "โอนเงิน" }, 5000, 0, today);
assert.ok(p.ok && p.amount === 2000 && !p.full);
p = validatePayment({ amount: "3000", paid_at: "2026-11-04", method: "โอนเงิน" }, 5000, 2000, today);
assert.ok(p.ok && p.full);
p = validatePayment({ amount: "3000.01", paid_at: "2026-11-06", method: "x" }, 5000, 2000, today);
assert.ok(!p.ok); assert.deepEqual(Object.keys(p.errors).sort(), ["amount", "method", "paid_at"]);
ok("มัดจำ = ชำระบางส่วน (ไม่เต็ม) · ชำระส่วนที่เหลือ = เต็ม · เกินยอดคงเหลือ/วันที่อนาคต/วิธีชำระผิด → ไม่ผ่าน");

console.log("6) เช็กลิสต์ Production และ Job");
const cl = checklistOf(DESC, "แพ็กเกจ STD");
assert.equal(cl.length, 5); assert.equal(cl[3], "Code Grab มูลค่า 200 บาท สำหรับคน Walk-in โครงการ 5 Code (ต้องซื้อเพิ่ม 1,000 บาท)"); assert.equal(cl[4], "ปักหมุดโครงการเปิดตัวเร็วนี้");
assert.deepEqual(checklistOf("ไม่มีขีด", "Top ads"), ["Top ads"]);
assert.equal(nextJobCode([]), "PJ-0001"); assert.equal(nextJobCode(["PJ-0009", "PJ-0010", "x"]), "PJ-0011");
assert.deepEqual(missingDates([{ start_date: "2026-11-01", end_date: "" }, { start_date: "", end_date: "" }]), { "lines.0.end_date": "ใส่วันสิ้นสุด", "lines.1.start_date": "ใส่วันเริ่ม", "lines.1.end_date": "ใส่วันสิ้นสุด" });
assert.equal(parseSeller("").tax_id, "0325566000476"); assert.equal(parseSeller('{"phone":"0811111111"}').phone, "0811111111");
ok("เช็กลิสต์จากบรรทัดที่ขึ้นต้นด้วย - (ตัด ** ออก) · ไม่มี → ชื่อ Product · รหัส PJ-#### · ตรวจวันเริ่ม/สิ้นสุดก่อนเริ่มงาน · ข้อมูลผู้ขาย");

console.log(`\nผ่านทั้งหมด ${pass} กลุ่ม`);
