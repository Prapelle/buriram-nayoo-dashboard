// KPI ที่ใช้ Call Status (Qualified Leads / Cost per Site Visit) ด้วยข้อมูลจำลอง (ไม่ต้องมีไฟล์ตัวอย่าง)
// รัน: npx tsx tests/callstatus-kpi.test.ts
import assert from "node:assert/strict";
import { computeDashboard, DEFAULT_EXCLUDED_PAGES, type DashData, type Row } from "../src/lib/dashboard";

const t = (name: string, fn: () => void) => { fn(); console.log("  ✓", name); };
const span = { report_start: "2026-09-01", report_end: "2026-09-30" };
const meta: Row[] = [{ ...span, amount_spent_thb: "6000", campaign_name: "M" }];
const google: Row[] = [{ ...span, cost_thb: "3000", campaign_name: "G" }];
const L = (id: string, call_status: string, extra: Row = {}): Row => ({ lead_id: id, received_at: "2026-09-10", source_channel: "Facebook Ads", status: "New", service_category: "Product", area: "", campaign_name: "", qualified_at: "", call_status, ...extra });
const calls = ["รอติดต่อ", "ติดต่อได้แล้ว", "รอเข้าชม", "เข้าชมแล้ว", "จอง", "ซื้อสำเร็จ", "กู้ไม่ผ่าน", "ติดต่อไม่ได้", "ไม่สนใจ"];
const leads = calls.map((c, i) => L("L" + i, c, { source_channel: i % 2 ? "Referral" : "Facebook Ads" }));
const data: DashData = { meta, google, gtime: [], posts: [], line: [], leads, sales: [], excludedPages: DEFAULT_EXCLUDED_PAGES, lastImport: "" };
const d = computeDashboard(data, {}, "admin");
const k = Object.fromEntries(d.groups.flatMap((g) => g.items).map((x) => [x.key, x]));

t("เตรียมข้อมูล: ค่าโฆษณา 9,000 · Lead 9 ราย", () => { assert.equal(k.paid.value, 9000); assert.equal(k.leads.value, 9); });
t("Qualified Leads = 5 (รอเข้าชม, เข้าชมแล้ว, จอง, ซื้อสำเร็จ, กู้ไม่ผ่าน) · ติดต่อได้แล้วไม่นับ", () => {
  assert.equal(k.qualified.value, 5); assert.equal(d.charts.leadQualByChannel!.reduce((s, x) => s + x.value, 0), 5); assert.match(k.qualified_buy.note!, /ติดต่อได้แล้วยังไม่นับ/); assert.equal(k.qualified_buy.value, 5); assert.equal(k.qualified_sell.value, 0);
});
t("Cost per Site Visit = 9,000 ÷ 4 (เข้าชมแล้ว, จอง, ซื้อสำเร็จ, กู้ไม่ผ่าน) = 2,250", () => { assert.equal(k.cpsv.value, 2250); assert.match(k.cpsv.note!, /เข้าชมแล้ว \/ จอง \/ ซื้อสำเร็จ \/ กู้ไม่ผ่าน/); });
t("Lead เก่าที่ยังใช้ชื่อเดิม (เข้าชมโครงการแล้ว) ยังนับ Qualified และ Site Visit", () => {
  const d2 = computeDashboard({ ...data, leads: [L("O1", "เข้าชมโครงการแล้ว"), L("O2", "ยังไม่ได้โทร")] }, {}, "admin");
  const k2 = Object.fromEntries(d2.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  assert.equal(k2.qualified.value, 1); assert.equal(k2.cpsv.value, 9000);
});
t("ไม่มีใครเข้าชม → Cost per Site Visit = N/A ไม่ใช่ 0", () => {
  const d3 = computeDashboard({ ...data, leads: [L("N1", "ติดต่อได้แล้ว"), L("N2", "รอเข้าชม")] }, {}, "admin");
  const k3 = Object.fromEntries(d3.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  assert.equal(k3.cpsv.state, "na"); assert.equal(k3.cpsv.value, null); assert.equal(k3.qualified.value, 1);
});
t("Pipeline สะสม แยกซื้อ/ขาย (1/11/2026): ขั้นถัดไปไม่เกินขั้นก่อน · Qualified ตรงกับการ์ด", () => {
  const sl = [L("S1", "", { need: "ขาย", sell_status: "ขายแล้ว" }), L("S2", "", { need: "ขาย", sell_status: "เซ็นสัญญา" }), L("S3", "", { need: "ขาย", sell_status: "สนใจขาย" }), L("S4", "", { need: "ขาย", sell_status: "ยกเลิก" })];
  const dp = computeDashboard({ ...data, leads: [...leads, ...sl] }, {}, "admin"); const kp = Object.fromEntries(dp.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  const b = Object.fromEntries(dp.charts.pipelineBuy!.map((x) => [x.label, x.value])), s = Object.fromEntries(dp.charts.pipelineSell!.map((x) => [x.label, x.value]));
  assert.deepEqual(dp.charts.pipelineBuy!.map((x) => x.value), [9, 6, 5, 4, 1]); assert.equal(b.Qualified, kp.qualified_buy.value);
  assert.deepEqual(dp.charts.pipelineSell!.map((x) => x.value), [4, 3, 2, 1]); assert.equal(s["Qualified (สัญญา + ขายแล้ว)"], kp.qualified_sell.value);
  assert.equal(kp.leads_buy.value, 9); assert.equal(kp.leads_sell.value, 4); assert.equal(kp.qualified.value, 7);
  for (const p of [dp.charts.pipelineBuy!, dp.charts.pipelineSell!]) p.forEach((x, i) => assert.ok(!i || x.value <= p[i - 1].value));
});
t("CPL N/A บอกเหตุผลชัด: ค่าโฆษณามีช่วงไหน และ Lead อยู่นอกช่วง", () => {
  const dn = computeDashboard({ ...data, leads: [L("O1", "รอเข้าชม", { received_at: "2026-10-05" })] }, {}, "admin"); const kn = Object.fromEntries(dn.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  assert.equal(kn.cpl.state, "na"); assert.match(kn.cpl.note!, /ค่าโฆษณามีช่วง 1 ก\.ย\. 69.*Lead ที่รับในช่วงนั้น = 0.*มี 1 Lead แต่รับนอกช่วง/);
});
t("CPL นับเฉพาะคนต้องการซื้อ (1/11/2026) · กราฟช่องทางแยกฝั่ง", () => {
  const sl = [L("S1", "", { need: "ขาย", sell_status: "ขายแล้ว" }), L("S2", "", { need: "ขาย", sell_status: "สนใจขาย", source_channel: "LINE OA" })];
  const dc = computeDashboard({ ...data, leads: [...leads, ...sl] }, {}, "admin"); const kc = Object.fromEntries(dc.groups.flatMap((g) => g.items).map((x) => [x.key, x]));
  assert.equal(kc.cpl.value, k.cpl.value); assert.equal(kc.cpl_all.value, k.cpl_all.value); assert.equal(kc.cpl_meta.value, k.cpl_meta.value); // Lead คนขายไม่เปลี่ยน CPL
  assert.match(kc.cpl.note!, /คนต้องการซื้อ/);
  const sum = (x: { value: number }[] | null) => (x ?? []).reduce((a, b) => a + b.value, 0);
  assert.equal(sum(dc.charts.leadsByChannelBuy), 9); assert.equal(sum(dc.charts.leadsByChannelSell), 2);
  assert.equal(sum(dc.charts.qualByChannelBuy), kc.qualified_buy.value); assert.equal(sum(dc.charts.qualByChannelSell), kc.qualified_sell.value);
  assert.deepEqual(dc.charts.leadsByChannelSell!.map((x) => x.label).sort(), ["Facebook Ads", "LINE OA"]);
});
console.log("ผ่านทั้งหมด");
