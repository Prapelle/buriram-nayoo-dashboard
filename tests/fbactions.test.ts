// Phase 3 — ชื่อ Action ของ Facebook Ads · รัน: npx tsx tests/fbactions.test.ts
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { buildPlan, detectSpec, parseInput } from "../src/lib/import/plan";
import { actionCollisions, actionLabels, normalizeActionRows, stripActionPrefix } from "../src/lib/fbactions";

let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };
const DIR = process.env.FIXTURE_DIR ?? "tests/fixtures";

console.log("1) กฎการตัด prefix");
assert.equal(stripActionPrefix("Action:post_engagement"), "post_engagement"); assert.equal(stripActionPrefix("Action:link_click"), "link_click");
ok("ตัวอย่างใน Master: Action:post_engagement → post_engagement, Action:link_click → link_click");
assert.equal(stripActionPrefix("actions:post_engagement"), "post_engagement"); assert.equal(stripActionPrefix("actions:leadgen.other"), "leadgen.other");
assert.equal(stripActionPrefix("ACTIONS:like"), "like"); ok("รูปแบบจริงในไฟล์ (actions:) และตัวพิมพ์ใหญ่");
assert.equal(stripActionPrefix("reach"), "reach"); assert.equal(stripActionPrefix(""), "");
assert.equal(stripActionPrefix("offsite_conversion.custom_action"), "offsite_conversion.custom_action"); assert.equal(stripActionPrefix("onsite_conversion.action:x"), "onsite_conversion.action:x");
assert.equal(stripActionPrefix("transaction:x"), "transaction:x"); assert.equal(stripActionPrefix("actions:"), "actions:");
ok("ไม่แตะคำว่า action ตำแหน่งอื่น (custom_action, .action:, transaction:) · ค่าที่ไม่มี prefix และค่าว่างคงเดิม · 'actions:' เปล่าไม่กลายเป็นค่าว่าง");

console.log("2) ไม่รวม Action ต่างประเภท");
const m = actionLabels(["actions:like", "like", "actions:link_click", "Action:link_click"]);
assert.equal(m.get("actions:like"), "actions:like"); assert.equal(m.get("like"), "like"); assert.equal(m.get("actions:link_click"), "actions:link_click"); assert.equal(m.get("Action:link_click"), "Action:link_click");
assert.deepEqual(actionCollisions(["actions:like", "like", "x"]).sort(), ["like"]);
ok("ค่าดิบที่ตัดแล้วชื่อชนกัน → แสดงค่าดิบแยกกัน และแจ้งเตือน ไม่ถูกรวมเป็นกลุ่มเดียว");
assert.equal(actionLabels(["actions:like", "actions:link_click"]).get("actions:like"), "like"); assert.equal(new Set(actionLabels(["actions:like", "actions:link_click", "reach"]).values()).size, 3);
ok("ไม่มีชื่อชน → จำนวนประเภทหลังตัด prefix เท่ากับก่อนตัด");

console.log("3) ไฟล์ Facebookads.csv จริง");
const table = parseInput(readFileSync(`${DIR}/Facebookads.csv`, "utf8")); const spec = detectSpec(table.headers).spec!;
const rows = buildPlan({ spec, table, ctx: { filename: "Facebookads.csv", area: "unknown", reportStart: "2026-09-01", reportEnd: "2026-09-30", snapshotDate: "" }, existing: new Map(), areaMap: new Map() })
  .planned.filter((x) => x.rec).map((x) => Object.fromEntries(Object.entries(x.rec!).map(([k, v]) => [k, String(v ?? "")])));
assert.equal(rows.length, 103); assert.ok(rows.some((r) => r.result_indicator === "actions:post_engagement"));
ok("การนำเข้ายังเก็บค่าต้นฉบับ (actions:post_engagement) ในฟิลด์เดิม — ไม่เปลี่ยนข้อมูลใน Sheet");
const out = normalizeActionRows(rows);
const count = (k: string) => Object.fromEntries([...out.reduce((m, r) => m.set(r[k], (m.get(r[k]) ?? 0) + 1), new Map<string, number>())].sort());
assert.deepEqual(count("result_indicator"), { "": 29, "leadgen.other": 1, like: 16, link_click: 11, post_engagement: 43, reach: 3 });
ok("หลังตัด: post_engagement 43, (ว่าง) 29, like 16, link_click 11, reach 3, leadgen.other 1 — จำนวนแถวต่อประเภทเท่าเดิม");
const agg = (k: string) => { const g = new Map<string, number[]>(); for (const r of out) { const c = g.get(r[k]) ?? [0, 0, 0, 0]; c[0] += +r.results || 0; c[1] += +r.amount_spent_thb || 0; c[2] += +r.impressions || 0; c[3] += +r.reach || 0; g.set(r[k], c); } return [...g.values()].map((c) => c.map((x) => Math.round(x * 100)).join("|")).sort(); };
assert.deepEqual(agg("result_indicator"), agg("result_indicator_raw"));
const tot = (k: string) => Math.round(out.reduce((s, r) => s + (+r[k] || 0), 0) * 100) / 100;
assert.equal(tot("amount_spent_thb"), 37557.54); assert.equal(tot("results"), Math.round(rows.reduce((s, r) => s + (+r.results || 0), 0) * 100) / 100);
assert.ok(out.every((r, i) => r.amount_spent_thb === rows[i].amount_spent_thb && r.results === rows[i].results && r.impressions === rows[i].impressions));
ok(`Results / Spend / Impressions / Reach ต่อ Action ก่อน-หลังเท่ากันทุกกลุ่ม · Spend รวม 37,557.54 · Results รวม ${tot("results").toLocaleString()} ไม่เปลี่ยน`);
assert.ok(out.every((r) => r.results_initial_indicator === "" && r.results_initial_indicator_raw === "")); ok("Results (initial) indicator ว่างทั้งไฟล์ → คงว่าง");
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
