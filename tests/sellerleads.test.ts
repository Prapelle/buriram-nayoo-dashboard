// Seller Leads (หน้าบอร์ด Sell Status) — รัน: npx tsx tests/sellerleads.test.ts
import assert from "node:assert/strict";
import { CALL_DEFAULT, CALL_STATUS, isContactedCall, isQualifiedCall, isSiteVisitCall, normCall, SELL_DEFAULT, SELL_STATUS } from "../src/lib/lead-options";
import { contactableFor, filterLeads, leadStatusOf, pipelineOf, validateLead, type Lead } from "../src/lib/leads";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const sell = (sell_status: string, call_status = "รอติดต่อ"): Lead => ({ need: "ขาย", sell_status, call_status, buy_status: "" });

t("ลำดับคอลัมน์ตรงตามที่กำหนด", () => assert.deepEqual(SELL_STATUS, ["รอติดต่อ", "สนใจขาย", "นัดทำสัญญา", "เซ็นสัญญา", "สัญญาเปิด", "บ้านไม่พร้อมขาย", "ขายแล้ว", "ยกเลิก"]));
t("ค่าเริ่มต้นคือ รอติดต่อ", () => assert.equal(SELL_DEFAULT, "รอติดต่อ"));
t("ค่าเก่า ทำสัญญา / เป็นนายหน้า ถูกตัดออก", () => { assert.ok(!SELL_STATUS.includes("ทำสัญญา")); assert.ok(!SELL_STATUS.includes("เป็นนายหน้า")); });
t("Pipeline: รอติดต่อ ไม่นับ Qualified", () => { assert.equal(pipelineOf(sell("รอติดต่อ")), "New"); assert.equal(pipelineOf(sell("รอติดต่อ", "ติดต่อได้แล้ว")), "Contacted"); });
t("Pipeline: สนใจขาย / นัดทำสัญญา / เซ็นสัญญา / สัญญาเปิด = Qualified", () => { for (const s of ["สนใจขาย", "นัดทำสัญญา", "เซ็นสัญญา", "สัญญาเปิด"]) assert.equal(pipelineOf(sell(s)), "Qualified", s); });
t("Pipeline: ขายแล้ว = Won · ยกเลิก / บ้านไม่พร้อมขาย = Lost", () => { assert.equal(pipelineOf(sell("ขายแล้ว")), "Won"); assert.equal(pipelineOf(sell("ยกเลิก")), "Lost"); assert.equal(pipelineOf(sell("บ้านไม่พร้อมขาย")), "Lost"); });
t("leadStatusOf อ่าน sell_status เมื่อ Need = ขาย", () => assert.equal(leadStatusOf(sell("สนใจขาย")), "สนใจขาย"));
t("validateLead ยอมรับสถานะใหม่ และปฏิเสธค่าเก่าที่ตัดออก", () => {
  const base = { received_at: "2026-10-30", customer_name: "ทดสอบ", source_channel: "Facebook", need: "ขาย", call_status: "รอติดต่อ", area: "unknown" };
  const ok = validateLead({ ...base, sell_status: "สนใจขาย" });
  const bad = validateLead({ ...base, sell_status: "ทำสัญญา" });
  assert.ok(ok.ok || !("sell_status" in (ok as { errors: Record<string, string> }).errors));
  assert.ok(!bad.ok && "sell_status" in bad.errors);
});

// ---- Buyer Leads: Call Status ชุดใหม่
const buyBase = { received_at: "2026-10-30", customer_name: "ผู้ซื้อ", source_channel: "Referral", need: "ซื้อ", area: "unknown" };
t("Call Status เรียงตามคอลัมน์ Buyer Leads", () => assert.deepEqual(CALL_STATUS, ["รอติดต่อ", "ติดต่อได้แล้ว", "รอเข้าชม", "เข้าชมแล้ว", "จอง", "ซื้อสำเร็จ", "กู้ไม่ผ่าน", "ติดต่อไม่ได้", "ไม่สนใจ"]));
t("ค่าเริ่มต้น = รอติดต่อ · ชื่อเดิมถูกแปลงเป็นชื่อใหม่", () => { assert.equal(CALL_DEFAULT, "รอติดต่อ"); assert.equal(normCall("ยังไม่ได้โทร"), "รอติดต่อ"); assert.equal(normCall("เข้าชมโครงการแล้ว"), "เข้าชมแล้ว"); assert.equal(normCall("จอง"), "จอง"); assert.equal(normCall(undefined), ""); });
t("Qualified = รอเข้าชม/เข้าชมแล้ว/จอง/ซื้อสำเร็จ/กู้ไม่ผ่าน (รวมชื่อเดิม) · ติดต่อได้แล้ว/รอติดต่อ/ติดต่อไม่ได้/ไม่สนใจ ไม่นับ", () => {
  for (const s of ["รอเข้าชม", "เข้าชมแล้ว", "จอง", "ซื้อสำเร็จ", "กู้ไม่ผ่าน", "เข้าชมโครงการแล้ว"]) assert.ok(isQualifiedCall(s), s);
  for (const s of ["ติดต่อได้แล้ว", "รอติดต่อ", "ยังไม่ได้โทร", "ติดต่อไม่ได้", "ไม่สนใจ", ""]) assert.ok(!isQualifiedCall(s), s);
});
t("Site Visit = เข้าชมแล้ว/จอง/ซื้อสำเร็จ/กู้ไม่ผ่าน (รอเข้าชมยังไม่ใช่การเข้าชม)", () => {
  for (const s of ["เข้าชมแล้ว", "จอง", "ซื้อสำเร็จ", "กู้ไม่ผ่าน", "เข้าชมโครงการแล้ว"]) assert.ok(isSiteVisitCall(s), s);
  for (const s of ["รอเข้าชม", "ติดต่อได้แล้ว", "รอติดต่อ", "ติดต่อไม่ได้", "ไม่สนใจ", ""]) assert.ok(!isSiteVisitCall(s), s);
});
t("Contacted (Pipeline / contactable) = ติดต่อได้แล้ว + Qualified · ยังไม่ใช่ Qualified", () => {
  assert.ok(isContactedCall("ติดต่อได้แล้ว") && isContactedCall("จอง")); assert.ok(!isContactedCall("รอติดต่อ") && !isContactedCall("ติดต่อไม่ได้"));
  assert.equal(pipelineOf({ need: "ซื้อ", buy_status: "Cold", call_status: "ติดต่อได้แล้ว" } as Lead), "Contacted");
  assert.equal(pipelineOf({ need: "ซื้อ", buy_status: "Cold", call_status: "รอติดต่อ" } as Lead), "New");
});
t("contactable: คุยได้/ไม่สนใจ = TRUE · ติดต่อไม่ได้ = FALSE · รอติดต่อ คงค่าเดิม", () => {
  assert.equal(contactableFor("จอง", ""), "TRUE"); assert.equal(contactableFor("ติดต่อได้แล้ว", ""), "TRUE"); assert.equal(contactableFor("ไม่สนใจ", ""), "TRUE"); assert.equal(contactableFor("ติดต่อไม่ได้", "TRUE"), "FALSE");
  assert.equal(contactableFor("รอติดต่อ", "TRUE"), "TRUE"); assert.equal(contactableFor("รอติดต่อ", ""), "");
});
t("validateLead: ว่าง → รอติดต่อ · ชื่อเดิมถูกแปลง · ค่าไม่รู้จักถูกปฏิเสธ", () => {
  const v = (call_status: string) => validateLead({ ...buyBase, call_status });
  const a = v(""); assert.ok(a.ok && a.rec.call_status === "รอติดต่อ");
  const b = v("เข้าชมโครงการแล้ว"); assert.ok(b.ok && b.rec.call_status === "เข้าชมแล้ว");
  const c = v("ยังไม่ได้โทร"); assert.ok(c.ok && c.rec.call_status === "รอติดต่อ");
  const d = validateLead({ ...buyBase, call_status: "กู้ไม่ผ่าน", lost_reason: "รายได้ไม่พอ" }); assert.ok(d.ok && d.rec.call_status === "กู้ไม่ผ่าน");
  const d2 = v("กู้ไม่ผ่าน"); assert.ok(!d2.ok && "lost_reason" in d2.errors); // 31/10/2026: กู้ไม่ผ่าน ต้องกรอกสาเหตุ
  const e = v("โทรแล้ว"); assert.ok(!e.ok && "call_status" in e.errors);
});
t("กรองตาม Call Status รวม Lead เก่าที่ยังเป็นชื่อเดิม", () => {
  const rows = [{ call_status: "ยังไม่ได้โทร" }, { call_status: "" }, { call_status: "รอติดต่อ" }, { call_status: "จอง" }] as Lead[];
  assert.equal(filterLeads(rows, { callStatus: "รอติดต่อ" }).length, 3); assert.equal(filterLeads(rows, { callStatus: "จอง" }).length, 1);
});
console.log("ผ่านทั้งหมด");
