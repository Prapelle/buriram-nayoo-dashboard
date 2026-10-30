// Seller Leads (หน้าบอร์ด Sell Status) — รัน: npx tsx tests/sellerleads.test.ts
import assert from "node:assert/strict";
import { SELL_DEFAULT, SELL_STATUS } from "../src/lib/lead-options";
import { leadStatusOf, pipelineOf, validateLead, type Lead } from "../src/lib/leads";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const sell = (sell_status: string, call_status = "ยังไม่ได้โทร"): Lead => ({ need: "ขาย", sell_status, call_status, buy_status: "" });

t("ลำดับคอลัมน์ตรงตามที่กำหนด", () => assert.deepEqual(SELL_STATUS, ["รอติดต่อ", "สนใจขาย", "นัดทำสัญญา", "เซ็นสัญญา", "สัญญาเปิด", "บ้านไม่พร้อมขาย", "ขายแล้ว", "ยกเลิก"]));
t("ค่าเริ่มต้นคือ รอติดต่อ", () => assert.equal(SELL_DEFAULT, "รอติดต่อ"));
t("ค่าเก่า ทำสัญญา / เป็นนายหน้า ถูกตัดออก", () => { assert.ok(!SELL_STATUS.includes("ทำสัญญา")); assert.ok(!SELL_STATUS.includes("เป็นนายหน้า")); });
t("Pipeline: รอติดต่อ ไม่นับ Qualified", () => { assert.equal(pipelineOf(sell("รอติดต่อ")), "New"); assert.equal(pipelineOf(sell("รอติดต่อ", "ติดต่อได้แล้ว")), "Contacted"); });
t("Pipeline: สนใจขาย / นัดทำสัญญา / เซ็นสัญญา / สัญญาเปิด = Qualified", () => { for (const s of ["สนใจขาย", "นัดทำสัญญา", "เซ็นสัญญา", "สัญญาเปิด"]) assert.equal(pipelineOf(sell(s)), "Qualified", s); });
t("Pipeline: ขายแล้ว = Won · ยกเลิก / บ้านไม่พร้อมขาย = Lost", () => { assert.equal(pipelineOf(sell("ขายแล้ว")), "Won"); assert.equal(pipelineOf(sell("ยกเลิก")), "Lost"); assert.equal(pipelineOf(sell("บ้านไม่พร้อมขาย")), "Lost"); });
t("leadStatusOf อ่าน sell_status เมื่อ Need = ขาย", () => assert.equal(leadStatusOf(sell("สนใจขาย")), "สนใจขาย"));
t("validateLead ยอมรับสถานะใหม่ และปฏิเสธค่าเก่าที่ตัดออก", () => {
  const base = { received_at: "2026-10-30", customer_name: "ทดสอบ", source_channel: "Facebook", need: "ขาย", call_status: "ยังไม่ได้โทร", area: "unknown" };
  const ok = validateLead({ ...base, sell_status: "สนใจขาย" });
  const bad = validateLead({ ...base, sell_status: "ทำสัญญา" });
  assert.ok(ok.ok || !("sell_status" in (ok as { errors: Record<string, string> }).errors));
  assert.ok(!bad.ok && "sell_status" in bad.errors);
});
console.log("ผ่านทั้งหมด");
