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
  assert.equal(k.qualified.value, 5); assert.equal(d.charts.leadQualByChannel!.reduce((s, x) => s + x.value, 0), 5); assert.match(k.qualified.note!, /ติดต่อได้แล้วยังไม่นับ/);
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
console.log("ผ่านทั้งหมด");
