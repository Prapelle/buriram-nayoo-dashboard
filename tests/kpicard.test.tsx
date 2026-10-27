// การ์ด KPI แสดงผลการเปรียบเทียบถูกต้อง (เรนเดอร์ HTML จริง) · รัน: npx tsx --tsconfig tests/tsconfig.jsx.json tests/kpicard.test.tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { KpiCard } from "../src/components/KpiCard";
import type { Kpi } from "../src/lib/dashboard";
const base: Kpi = { key: "x", label: "Google Ads Spend", fmt: "thb", value: 120, state: "value" };
const html = (k: Partial<Kpi>) => renderToStaticMarkup(<KpiCard k={{ ...base, ...k }} />);
let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };
assert.ok(!html({}).includes("ปีก่อน") && !html({}).includes("ช่วงก่อน")); ok("ไม่เปรียบเทียบ → ไม่มีบรรทัดเทียบ");
assert.ok(html({ prev: 100, prevLabel: "ปีก่อน" }).includes("ปีก่อน ฿100.00 · +20%")); ok("ปีก่อน ฿100.00 · +20%");
assert.ok(html({ prev: 150, prevLabel: "ปีก่อน" }).includes("−20%") || html({ prev: 150, prevLabel: "ปีก่อน" }).includes("-20%")); ok("ลดลง → −20%");
assert.ok(html({ prev: 0, prevLabel: "ปีก่อน" }).includes("N/A (ปีก่อน = 0)")); ok("ปีก่อน = 0 → N/A");
assert.ok(html({ prev: null, prevLabel: "ปีก่อน" }).includes("ปีก่อน: Missing Data")); ok("ไม่มีข้อมูลปีก่อน → Missing Data");
assert.ok(html({ prev: 100, prevLabel: "ปีก่อน", prevIncomplete: "ไม่มีข้อมูลรายวัน 15 วัน" }).includes("ปีก่อน ข้อมูลไม่ครบ: ไม่มีข้อมูลรายวัน 15 วัน")); ok("ปีก่อนข้อมูลไม่ครบ → ป้ายเตือน");
assert.ok(html({ prev: null, prevLabel: "ปีก่อน", prevBlocked: "เป็นยอดสะสม" }).includes("ปีก่อน: เทียบไม่ได้ — เป็นยอดสะสม")); ok("เทียบไม่ได้ → บอกเหตุผล");
assert.ok(!html({ state: "pending", value: null, prev: 5, prevLabel: "ปีก่อน" }).includes("ปีก่อน ")); ok("ค่าปัจจุบัน รอข้อมูล → ไม่แสดงการเทียบ");
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
