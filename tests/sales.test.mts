// รัน: npx tsx tests/sales.test.mts  (สร้างไฟล์จำลองด้วย python3 tests/make-sales-fixture.py tests/fixtures/synthetic_SalesReport.xlsx)
// ถ้ามีไฟล์จริง ใส่ใน tests/fixtures/ แล้วตั้ง REAL_SALES_FILE=ชื่อไฟล์ จะรันเกณฑ์ตามสเปก 7.7 กับไฟล์จริงด้วย
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
const { readXlsx } = await import("../src/lib/xlsx");
const { buildSalesPlan, parseDateCell, parseMoney, parseSalesGrid, SalesParseError } = await import("../src/lib/sales/parse");

const DIR = process.env.FIXTURE_DIR ?? "tests/fixtures";
let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };
const load = async (f: string) => { const { sheet, sheetNames } = await readXlsx(new Uint8Array(readFileSync(`${DIR}/${f}`))); return { sheet, sheetNames, parsed: parseSalesGrid(sheet.rows) }; };
const plan = (parsed: ReturnType<typeof parseSalesGrid>, over: Partial<Parameters<typeof buildSalesPlan>[0]> = {}) => buildSalesPlan({ parsed, taxId: parsed.company.taxId, companyName: parsed.company.name, periodStart: parsed.period.start, periodEnd: parsed.period.end, file: "t.xlsx", existing: new Map(), manualInvoices: new Set(), mode: "skip", ...over });

console.log("1) ตัวแปลงค่า");
assert.deepEqual(parseDateCell(46266), { ok: true, v: "2026-09-01" }); assert.deepEqual(parseDateCell("01/09/2569"), { ok: true, v: "2026-09-01" }); assert.deepEqual(parseDateCell("2026-09-30"), { ok: true, v: "2026-09-30" });
assert.deepEqual(parseDateCell("31/02/2026"), { ok: false }); assert.deepEqual(parseDateCell(null), { ok: true, v: "" }); ok("วันที่: Excel serial 46266 = 2026-09-01, พ.ศ. 2569 → 2026, วันที่ผิดถูกปฏิเสธ");
assert.deepEqual(parseMoney("1,234.50"), { ok: true, v: 1234.5 }); assert.deepEqual(parseMoney("(500)"), { ok: true, v: -500 }); assert.deepEqual(parseMoney("-"), { ok: true, v: null }); assert.deepEqual(parseMoney(""), { ok: true, v: null }); assert.deepEqual(parseMoney("฿1,000"), { ok: true, v: 1000 }); assert.deepEqual(parseMoney("abc"), { ok: false }); ok("เงิน: คอมมา/วงเล็บ/฿/ว่าง/ขีด → ตัวเลขหรือ null (ไม่ใช่ 0), ข้อความผิดถูกปฏิเสธ");

console.log("2) ไฟล์ .xlsx จำลอง (โครงสร้างตามสเปก — ไม่ใช่ไฟล์จริง)");
const { sheet, sheetNames, parsed: p } = await load("synthetic_SalesReport.xlsx");
assert.equal(sheet.name, "SalesReport"); assert.deepEqual(sheetNames, ["SalesReport"]); assert.equal(p.headerRowNumber, 6); ok("อ่าน xlsx (zip+XML) ได้, พบชีต SalesReport, หัวตารางอยู่แถว 6 (หาจากชื่อคอลัมน์)");
assert.equal(p.company.name, "บริษัท ทดสอบ ดิจิตอล จำกัด"); assert.equal(p.company.taxId, "0105551234567"); assert.deepEqual([p.period.start, p.period.end, p.period.derived], ["2026-09-01", "2026-09-30", false]); ok("อ่านชื่อบริษัท เลขผู้เสียภาษี และช่วงรายงานจากส่วนหัว");
assert.equal(p.items.length, 12); assert.equal(p.errors.length, 0); assert.equal(p.rowsSeen, 12); assert.ok(!p.items.some((i) => /ยอดรวม/.test(i.customer_name))); assert.equal(p.items[0].invoice_date, "2026-09-01"); ok("12 รายการขาย ข้ามแถวว่างและแถวสรุป 'ยอดรวมทั้งหมด'");
const pl = plan(p), t = pl.totals;
assert.equal(pl.counts.insert, 12); assert.equal(t.docs, 12); assert.equal(t.customers, 11); assert.equal(t.gross, 199576); assert.equal(t.discount, 35000); assert.equal(t.totalNet, 164576); assert.equal(t.vat, 0); assert.equal(t.paidNet, 164576);
ok("KPI ตามเกณฑ์: 12 ใบ / 11 ราย / ก่อนส่วนลด 199,576 / ส่วนลด 35,000 / สุทธิ 164,576 / VAT 0 / เก็บเงินแล้ว 164,576");
const by = (k: string) => Object.fromEntries([...pl.items.reduce((m, x) => m.set(String(x.rec[k]), (m.get(String(x.rec[k])) ?? 0) + Number(x.rec.total_net)), new Map<string, number>())]);
assert.deepEqual(by("salesperson"), { "ชนิกานต์ มณีวรรณ": 125000, "Suparkit Jaturapatpaibul": 25000, "บุรีรัมย์น่าอยู่": 14576 }); ok("ยอดสุทธิแยกพนักงานขาย 125,000 / 25,000 / 14,576");
assert.equal(pl.items.find((x) => x.invoice_no === "IV2609-0009")!.rec.discount_amount, 1000); assert.equal(p.items.find((i) => i.invoice_no === "IV2609-0001")!.discount_before_vat, 10000);
ok("ส่วนลด: ถ้า 'ตามเอกสาร' ว่างใช้ 'ก่อน VAT' แทน (เอกสารที่ 9 = 1,000) และไม่บวกสองคอลัมน์");
assert.equal(pl.warnings.filter((w) => w.includes("ไม่ตรงกับยอดรวม")).length, 0); ok("ยอดรวมจากรายการตรงกับแถวสรุปในไฟล์ → ไม่มีคำเตือน");

console.log("3) ซ้ำ / อัปเดต / ผิดพลาด");
const keyOf = (n: number) => `0105551234567|IV2609-${String(n).padStart(4, "0")}`;
const ex = new Map(pl.items.map((x, i) => [String(x.rec.row_key), { rowNumber: i + 2, row: Object.fromEntries(Object.entries(x.rec).map(([k, v]) => [k, String(v)])) }]));
const again = plan(p, { existing: ex }); assert.deepEqual([again.counts.insert, again.counts.duplicate, again.counts.update], [0, 12, 0]); ok("อัปโหลดไฟล์เดิมซ้ำ: ซ้ำ 12 / เพิ่ม 0 (ค่าเริ่มต้นคือข้าม)");
ex.get(keyOf(3))!.row.total_net = "1";
const skip = plan(p, { existing: ex }), upd = plan(p, { existing: ex, mode: "update" });
assert.equal(skip.counts.update, 0); assert.equal(upd.counts.update, 1); assert.equal(upd.counts.duplicate, 11); assert.equal(upd.items.find((x) => x.status === "update")!.invoice_no, "IV2609-0003"); ok("โหมดอัปเดต: แก้เฉพาะรายการที่ค่าเปลี่ยน (1 รายการ) โหมดข้ามไม่แตะข้อมูลเดิม");
const man = plan(p, { manualInvoices: new Set(["IV2609-0002"]) }); assert.equal(man.counts.duplicate, 1); assert.equal(man.items.find((x) => x.dupSource === "manual")!.invoice_no, "IV2609-0002"); assert.ok(man.warnings.some((w) => w.includes("กรอกด้วยมือ"))); ok("เลขที่เอกสารซ้ำกับรายการกรอกมือ (SALES) → ข้าม + เตือน ไม่นับซ้ำ");
assert.equal(plan(p, { taxId: "9999999999999" }).counts.insert, 12); ok("คีย์ซ้ำใช้เลขผู้เสียภาษีผู้ขาย + เลขที่เอกสาร (คนละบริษัทเลขเดียวกันไม่ซ้ำกัน)");
const g = sheet.rows.map((r) => [...r]);
g[7][12] = "abc"; g[8][0] = "99/99/2026"; g[9][1] = g[6][1]; g[10][12] = null; g[10][10] = null; g[11][2] = "";
const bad = parseSalesGrid(g); const badPlan = plan(bad);
assert.ok(bad.errors.some((e) => e.code === "INVALID_NUMBER" && e.row === 8)); assert.ok(bad.errors.some((e) => e.code === "INVALID_DATE" && e.row === 9)); assert.ok(bad.errors.some((e) => e.code === "REQUIRED_BLANK" && e.row === 12 && e.column === "ชื่อลูกค้า")); assert.ok(bad.errors.some((e) => e.row === 11 && /ไม่มียอดรวมสุทธิ/.test(e.message)));
assert.equal(badPlan.counts.invalid, 5); assert.ok(bad.errors.some((e) => e.code === "DUPLICATE_IN_FILE" && e.row === 10)); assert.ok(badPlan.items.length === 7);
assert.ok(badPlan.warnings.some((w) => w.includes("ไม่ตรงกับยอดรวมในไฟล์"))); ok("แถวผิด (เงิน/วันที่/ไม่มีลูกค้า/ไม่มียอดสุทธิ) ถูกรายงานพร้อมเลขแถว และแจ้งว่ายอดรวมไม่ตรงกับไฟล์");
const noHeader = readFileSync(`${DIR}/synthetic_SalesReport.xlsx`); void noHeader;
assert.throws(() => parseSalesGrid([["a", "b"], [1, 2]]), (e: unknown) => e instanceof SalesParseError && e.code === "HEADER_NOT_FOUND"); ok("ไม่ใช่ไฟล์รายงานยอดขาย → HEADER_NOT_FOUND พร้อมคำอธิบาย");
const shifted = [["x"], [], [], [], [], [], [], [], ...sheet.rows.slice(5)]; assert.equal(parseSalesGrid(shifted).items.length, 12); assert.equal(parseSalesGrid(shifted).headerRowNumber, 9); ok("หัวตารางเลื่อนตำแหน่ง (แถว 9) ก็ยังหาเจอ");
const buddhist = sheet.rows.map((r) => [...r]); buddhist[3] = ["ระหว่างวันที่ 01/09/2569 ถึง 30/09/2569"]; assert.deepEqual([parseSalesGrid(buddhist).period.start, parseSalesGrid(buddhist).period.end], ["2026-09-01", "2026-09-30"]); ok("ช่วงรายงานเป็น พ.ศ. แปลงเป็น ค.ศ. ถูกต้อง");
const noPeriod = sheet.rows.map((r) => [...r]); noPeriod[3] = []; const np = parseSalesGrid(noPeriod); assert.equal(np.period.derived, true); assert.equal(np.period.end, "2026-09-23"); ok("ไม่พบช่วงรายงานในส่วนหัว → ใช้ช่วงวันที่ของเอกสาร (ระบุว่า derived ให้ผู้ใช้ตรวจ)");

const real = process.env.REAL_SALES_FILE;
if (real && existsSync(`${DIR}/${real}`)) {
  console.log("4) ไฟล์จริง"); const rp = plan((await load(real)).parsed);
  assert.equal(rp.totals.docs, 12); assert.equal(rp.totals.customers, 11); assert.equal(rp.totals.gross, 199576); assert.equal(rp.totals.discount, 35000); assert.equal(rp.totals.totalNet, 164576); assert.equal(rp.totals.paidNet, 164576); ok("ไฟล์จริงผ่านเกณฑ์ 7.7");
}
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
