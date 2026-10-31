// 31/10/2026 — Developer / Sale developer: ตรวจข้อมูล · ซ้ำ · Status อัตโนมัติ (สิ้นเดือน / ตาม Product) · รายงานรายเดือน · ติดตาม
// รัน: npx tsx tests/developers.test.ts
import assert from "node:assert/strict";
import {
  autoChanges, cantCloseProjects, devFollowUps, expiringProducts, productSaleMonth, findDevDuplicates, IMPORT_HEADERS, monthlyReport, nextDevCode, productDrivenStatus, productState, validateDev, validateProduct, type Dev, type DevProduct,
} from "../src/lib/developers";

let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };
const TODAY = "2026-10-31";
const D = (id: string, o: Dev = {}): Dev => ({ developer_id: id, dev_code: `DV-${id}`, company_name: `บริษัท ${id}`, project_main: `โครงการ ${id}`, status: "เข้าร่วมแล้ว", staff: "เอ", status_changed_at: "2026-10-10T03:00:00Z", updated_at: "2026-10-30T03:00:00Z", ...o });
const P = (dev: string, start: string, end: string, o: DevProduct = {}): DevProduct => ({ product_id: `${dev}-${start}`, developer_id: dev, product: "Top ads", start_date: start, end_date: end, price_thb: "10000", ...o });

console.log("1) ตรวจข้อมูลและรายการซ้ำ");
let v = validateDev({ company_name: "  บริษัท ก ", tier: "b", phone: "081-234-5678", nayoo_url: "https://nayoo.co/p/1" });
assert.ok(v.ok && v.rec.company_name === "บริษัท ก" && v.rec.tier === "B" && v.rec.status === "ยังไม่เข้าร่วม");
v = validateDev({ tier: "F", phone: "12", nayoo_url: "nayoo.co", next_follow_up_at: "2026-02-30", status: "xx" });
assert.ok(!v.ok); assert.deepEqual(Object.keys(v.errors).sort(), ["company_name", "nayoo_url", "next_follow_up_at", "phone", "status", "tier"]);
assert.equal(nextDevCode(["DV-0007", "DV-0012", "LD-2026-0099"]), "DV-0013"); assert.equal(nextDevCode([]), "DV-0001");
const rows = [D("1", { company_name: "บริษัท บ้านดี จำกัด", project_main: "บ้านดี วิลล์", project_sub1: "บ้านดี 2", phone: "0812345678", line_id: "@baandee" }), D("2")];
assert.deepEqual(findDevDuplicates(rows, { company_name: "บริษัท  บ้านดี จำกัด", project_main: "x" })[0].matched, ["company"]);
assert.deepEqual(findDevDuplicates(rows, { project_main: "บ้านดี 2", phone: "+66 81 234 5678", line_id: "BaanDee" })[0].matched, ["project", "phone", "line"]);
assert.equal(findDevDuplicates(rows, { company_name: "บริษัท บ้านดี จำกัด" }, "1").length, 0);
ok("ต้องมีชื่อบริษัทหรือโครงการหลัก · Tier A–E · เบอร์/URL/วันที่/Status ผิด → ไม่ผ่าน · รหัส DV-#### · ซ้ำที่ชื่อบริษัท / โครงการ (รวมโครงการรอง) / เบอร์ (+66) / Line (ไม่สน @ ตัวพิมพ์ ช่องว่าง)");

console.log("2) Product");
const types = ["Top ads", "Super Topads"];
assert.ok(validateProduct({ product: "Top ads", start_date: "2026-11-01", end_date: "2027-01-31", price_thb: "15,000" }, types).ok);
const bad = validateProduct({ product: "x", start_date: "2026-11-01", end_date: "2026-10-01", price_thb: "-5" }, types);
assert.ok(!bad.ok); assert.deepEqual(Object.keys(bad.errors).sort(), ["end_date", "price_thb", "product"]);
assert.equal(productState(P("a", "2026-10-01", "2026-10-31"), TODAY), "active"); assert.equal(productState(P("a", "2026-11-01", "2026-12-31"), TODAY), "future"); assert.equal(productState(P("a", "2026-09-01", "2026-10-30"), TODAY), "expired");
ok("เลือก Product จากรายการ · วันหมดอายุต้องไม่ก่อนวันเริ่ม · ราคา ≥ 0 · ใช้อยู่ / ยังไม่เริ่ม / หมดอายุ (วันหมดอายุยังนับว่าใช้อยู่)");

console.log("3) Status ตาม Product");
assert.equal(productDrivenStatus("ปิดการขาย", [P("a", "2026-10-01", "2027-03-31")], TODAY), "กำลังใช้ Product");
assert.equal(productDrivenStatus("ปิดการขาย", [P("a", "2026-10-01", "2026-11-30")], TODAY), "ใกล้หมดสัญญา"); // เหลือ 30 วัน
assert.equal(productDrivenStatus("ปิดการขาย", [P("a", "2026-10-01", "2026-12-01")], TODAY), "กำลังใช้ Product"); // เหลือ 31 วัน
assert.equal(productDrivenStatus("ปิดการขาย", [P("a", "2026-11-15", "2027-01-31")], TODAY), null); // ปิดแล้วแต่ยังไม่เริ่ม → ค้างที่ ปิดการขาย
assert.equal(productDrivenStatus("กำลังใช้ Product", [P("a", "2026-01-01", "2026-10-30")], TODAY), "เข้าร่วมแล้ว");
assert.equal(productDrivenStatus("ใกล้หมดสัญญา", [P("a", "2026-01-01", "2026-10-30"), P("a", "2026-12-01", "2027-01-31")], TODAY), "ปิดการขาย");
assert.equal(productDrivenStatus("กำลังใช้ Product", [P("a", "2026-10-01", "2026-11-10"), P("a", "2026-10-15", "2027-06-30")], TODAY), null); // ดูวันหมดอายุตัวที่หลังสุด
assert.equal(productDrivenStatus("เข้าร่วมแล้ว", [P("a", "2026-01-01", "2026-03-31")], TODAY), null);
ok("มี Product ใช้อยู่ → กำลังใช้ Product (เหลือ ≤ 30 วัน → ใกล้หมดสัญญา · หลาย Product ดูตัวที่หมดหลังสุด) · ยังไม่เริ่ม → ค้างที่ ปิดการขาย · หมดทุกตัว → เข้าร่วมแล้ว");

console.log("4) สิ้นเดือน + เปลี่ยนอัตโนมัติ");
const devs = [
  D("plan", { status: "มีแผนเข้าพบ", status_changed_at: "2026-09-20T05:00:00Z" }), D("met", { status: "เข้าพบแล้ว", status_changed_at: "2026-09-28T05:00:00Z" }),
  D("planNow", { status: "มีแผนเข้าพบ", status_changed_at: "2026-10-03T05:00:00Z" }), D("late", { status: "มีแผนเข้าพบ", status_changed_at: "2026-09-30T18:00:00Z" }), // 01/10 เวลาไทย
  D("won", { status: "ปิดการขาย" }), D("using", { status: "กำลังใช้ Product" }),
];
const ch = autoChanges(devs, [P("won", "2026-10-01", "2027-03-31"), P("using", "2026-01-01", "2026-10-30")], TODAY);
assert.deepEqual(ch.map((c) => [c.developer_id, c.from, c.to, c.kind, c.counts_as, c.month]), [
  ["plan", "มีแผนเข้าพบ", "เข้าร่วมแล้ว", "auto_month_end", "no_meeting", "2026-09"],
  ["met", "เข้าพบแล้ว", "เข้าร่วมแล้ว", "auto_month_end", "", "2026-09"],
  ["won", "ปิดการขาย", "กำลังใช้ Product", "auto_product", "", "2026-10"],
  ["using", "กำลังใช้ Product", "เข้าร่วมแล้ว", "auto_product", "", "2026-10"],
]);
assert.equal(autoChanges(devs, [], "2026-11-01").filter((c) => c.kind === "auto_month_end").map((c) => c.developer_id).join(), "plan,met,planNow,late");
ok("ขึ้นเดือนใหม่: มีแผนเข้าพบ → เข้าร่วมแล้ว (นับ ไม่ให้เข้าพบ ของเดือนที่ตั้ง) · เข้าพบแล้ว → เข้าร่วมแล้ว · ตั้งในเดือนนี้ยังไม่ย้าย · เวลาไทยข้ามเที่ยงคืนนับถูกเดือน · Product เริ่ม/หมดแล้วย้ายเอง");

console.log("5) รายงานรายเดือน + ติดตาม + ใกล้หมดอายุ");
const logs: Record<string, string>[] = [
  { kind: "manual", to_status: "มีแผนเข้าพบ", staff: "เอ", changed_at: "2026-10-02T03:00:00Z" }, { kind: "manual", to_status: "เข้าพบแล้ว", staff: "เอ", changed_at: "2026-10-09T03:00:00Z" },
  { kind: "manual", to_status: "ปิดการขาย", staff: "เอ", changed_at: "2026-10-20T03:00:00Z" }, { kind: "manual", to_status: "ไม่ให้เข้าพบ", staff: "บี", changed_at: "2026-10-21T03:00:00Z" },
  { kind: "auto_month_end", counts_as: "no_meeting", month: "2026-10", staff: "บี", changed_at: "2026-11-01T01:00:00Z" },
  { kind: "manual", to_status: "เข้าพบแล้ว", staff: "เอ", changed_at: "2026-09-30T18:00:00Z" }, // 01/10 เวลาไทย
  { kind: "auto_product", to_status: "กำลังใช้ Product", staff: "เอ", changed_at: "2026-10-22T03:00:00Z" },
];
const rep = monthlyReport(logs, [P("x", "2026-10-05", "2027-01-31", { price_thb: "25000" }), P("y", "2026-09-05", "2026-12-31")], [D("x", { staff: "เอ" }), D("y", { staff: "บี" })], "2026-10");
const core = (r: (typeof rep)[number]) => ({ staff: r.staff, planned: r.planned, met: r.met, noMeeting: r.noMeeting, won: r.won, productSales: r.productSales });
assert.deepEqual(rep.map(core), [{ staff: "เอ", planned: 1, met: 2, noMeeting: 0, won: 1, productSales: 25000 }, { staff: "บี", planned: 0, met: 0, noMeeting: 2, won: 0, productSales: 0 }]);
assert.deepEqual(rep[0].byCategory, { Product: 25000, Service: 0, Event: 0 }); // Product เดิมไม่มีประเภท = Product
// เปิดหน้าพร้อมกัน 2 คนตอนต้นเดือน → ประวัติอัตโนมัติรหัสเดียวกันถูกบันทึก 2 แถว → รายงานต้องนับครั้งเดียว
const dupAuto = { log_id: "auto:y:auto_month_end:มีแผนเข้าพบ>เข้าร่วมแล้ว:2026-10", kind: "auto_month_end", counts_as: "no_meeting", month: "2026-10", staff: "บี", changed_at: "2026-11-01T01:00:00Z" };
assert.equal(monthlyReport([dupAuto, { ...dupAuto }], [], [], "2026-10")[0].noMeeting, 1);
// ติดตาม (31/10/2026): เลยกำหนด 1–3 วัน · ค้าง = เลยเกิน 3 วันและ Status ไม่เปลี่ยนตั้งแต่วันนั้น · ไม่มีวันติดต่อครั้งถัดไป = ไม่ขึ้น
const fu = devFollowUps([D("a", { next_follow_up_at: "2026-10-30" }), D("b", { next_follow_up_at: "2026-10-31" }), D("c", { updated_at: "2026-10-27T03:00:00Z" }),
  D("d", { next_follow_up_at: "2026-10-20", status_changed_at: "2026-10-10T03:00:00Z" }), D("g", { next_follow_up_at: "2026-10-20", status_changed_at: "2026-10-25T03:00:00Z" }),
  D("h", { next_follow_up_at: "2026-10-28" }), D("e", { status: "ไม่ให้เข้าพบ", next_follow_up_at: "2026-10-01" }), D("f", { status: "กำลังใช้ Product", next_follow_up_at: "2026-10-01" })], TODAY);
assert.deepEqual([fu.overdue.map((d) => d.developer_id), fu.today.map((d) => d.developer_id), fu.stale.map((d) => d.developer_id)], [["h", "a"], ["b"], ["d"]]);
const ex = expiringProducts([P("a", "2026-10-01", "2026-11-15"), P("b", "2026-10-01", "2027-06-30"), P("c", "2026-10-01", "2026-12-20"), P("zz", "2026-10-01", "2026-11-01")], [D("a"), D("b"), D("c")], TODAY);
assert.deepEqual(ex.map((x) => [x.dev.developer_id, x.daysLeft]), [["a", 15]]); // 30 วัน (เดิม 60)
ok("ประวัติอัตโนมัติที่บันทึกซ้ำ (เปิดหน้าพร้อมกัน) นับครั้งเดียว · ต่อ Staff: นัดเข้าพบ / เข้าพบแล้ว / ไม่ให้เข้าพบ (+ นัดที่หมดเดือน) / Win / ยอด Product ที่เริ่มเดือนนี้ · ติดตาม เลยกำหนด/วันนี้/ค้าง 3 วัน (ไม่นับ ไม่ให้เข้าพบ และที่ใช้ Product อยู่) · Product หมดใน 30 วัน เรียงใกล้สุดก่อน · ค้าง = เลยวันติดต่อเกิน 3 วันและ Status ไม่เปลี่ยน");

console.log("5b) คำขอ 31/10/2026: ติดต่อครั้งถัดไปอัตโนมัติ · เดือนที่นับยอด · ประเภท · โทร/Line/เจอหน้า · โครงการที่ปิดไม่ได้");
{
  const v1 = validateDev({ company_name: "x", last_contacted_at: "2026-10-05" }); assert.ok(v1.ok && v1.rec.next_follow_up_at === "2026-11-04");
  const v2 = validateDev({ company_name: "x", last_contacted_at: "2026-10-05", next_follow_up_at: "2026-10-10" }); assert.ok(v2.ok && v2.rec.next_follow_up_at === "2026-10-10");
  const v3 = validateDev({ company_name: "x" }); assert.ok(v3.ok && v3.rec.next_follow_up_at === "");
  assert.ok(!validateDev({ company_name: "x", last_contact_method: "อีเมล" }).ok);
  ok("ไม่ใส่ติดต่อครั้งถัดไป = ติดต่อล่าสุด + 30 วัน · ใส่เอง = ใช้ค่าที่ใส่ · ไม่มีติดต่อล่าสุด = ว่าง · สถานะการเข้าพบต้องเป็น โทร / Line / เจอหน้า");
  const L = (dev: string, to: string, at: string, staff = "เอ") => ({ log_id: `${dev}${to}${at}`, developer_id: dev, kind: "manual", to_status: to, staff, changed_at: at });
  const lg = [L("p", "ปิดการขาย", "2026-09-28T03:00:00Z", "บี"), L("p", "ปิดการขาย", "2026-10-03T03:00:00Z")];
  const pr = (o: DevProduct) => ({ ...P("p", "2026-12-01", "2027-02-28"), ...o });
  assert.deepEqual(productSaleMonth(pr({ created_at: "2026-10-05T03:00:00Z" }), lg), { month: "2026-10", staff: "เอ" }); // ปิดการขาย ต.ค. แต่ Product เริ่ม ธ.ค. → นับ ต.ค.
  assert.deepEqual(productSaleMonth(pr({ created_at: "2026-09-29T03:00:00Z" }), lg), { month: "2026-09", staff: "บี" });
  assert.deepEqual(productSaleMonth(pr({ created_at: "2026-08-15T03:00:00Z" }), lg), { month: "2026-08" }); // ก่อนปิดการขาย → เดือนที่เพิ่ม
  assert.deepEqual(productSaleMonth({ ...P("q", "2026-07-10", "2026-12-31") }, lg), { month: "2026-07" }); // ข้อมูลเก่าไม่มีวันที่เพิ่ม → วันเริ่ม
  const r2 = monthlyReport(lg, [pr({ created_at: "2026-10-05T03:00:00Z", category: "Event", price_thb: "9000" }), pr({ product_id: "p2", created_at: "2026-10-06T03:00:00Z", category: "Service", price_thb: "1000" })], [D("p", { staff: "เอ" })], "2026-10",
    [{ contact_id: "1", staff: "เอ", method: "โทร", contacted_at: "2026-10-02" }, { contact_id: "1", staff: "เอ", method: "โทร", contacted_at: "2026-10-02" }, { contact_id: "2", staff: "เอ", method: "Line", contacted_at: "2026-10-03" }, { contact_id: "3", staff: "เอ", method: "เจอหน้า", contacted_at: "2026-09-30" }]);
  assert.deepEqual([r2[0].byCategory, r2[0].productSales, r2[0].calls, r2[0].line, r2[0].meet, r2[0].productProjects, r2[0].metProjects, r2[0].productRatePct], [{ Product: 0, Service: 1000, Event: 9000 }, 10000, 1, 1, 0, 1, 0, null]);
  ok("ยอด Product / Service / Event นับเข้าเดือนที่ปิดการขาย (ครั้งล่าสุดก่อนวันที่เพิ่ม) · ไม่มีการปิดการขาย = เดือนที่เพิ่ม · โทร / Line / เจอหน้า นับตามเดือน (รหัสซ้ำนับครั้งเดียว) · ไม่มีการเข้าพบ → % = —");
  const met = (dev: string, at: string) => L(dev, "เข้าพบแล้ว", at);
  const cl = [met("x", "2026-06-10T03:00:00Z"), met("x", "2026-07-02T03:00:00Z"), met("x", "2026-07-20T03:00:00Z"), met("x", "2026-08-05T03:00:00Z"), met("x", "2026-10-05T03:00:00Z"),
    met("y", "2026-06-10T03:00:00Z"), met("y", "2026-07-10T03:00:00Z"), L("y", "ปิดการขาย", "2026-07-25T03:00:00Z"), met("y", "2026-08-10T03:00:00Z"), met("y", "2026-09-10T03:00:00Z"),
    met("z", "2026-07-10T03:00:00Z"), met("z", "2026-08-10T03:00:00Z"), met("z", "2026-09-10T03:00:00Z"), met("w", "2026-07-10T03:00:00Z"), met("w", "2026-08-10T03:00:00Z"), met("w", "2026-09-10T03:00:00Z")];
  const cc = cantCloseProjects(cl, [D("x"), D("y"), D("z"), D("w", { status: "ปิดการขาย" })], "2026-10-31");
  assert.deepEqual(cc.map((c) => [c.dev.developer_id, c.count]), [["x", 3], ["z", 3]]);
  assert.deepEqual(cc[0].months, ["2026-06", "2026-07", "2026-08"]);
  ok("โครงการที่ปิดไม่ได้: เดือนละ 1 ครั้ง (ก.ค. เข้าพบ 2 รอบ = 1) · ไม่นับเดือนปัจจุบัน · ปิดการขายแล้วเริ่มนับใหม่ (y เหลือ 2) · Status ปัจจุบัน ปิดการขาย = ไม่แสดง · ครบ 3 ขึ้นไปจึงแสดง");
}

console.log("6) หัวคอลัมน์ไฟล์นำเข้า");
for (const [h, k] of [["ชื่อบริษัท", "company_name"], ["โครงการหลัก", "project_main"], ["โครงการรอง 2", "project_sub2"], ["ชื่อผู้ติดต่อ", "contact_name"], ["เบอร์", "phone"], ["line", "line_id"], ["nayoo url", "nayoo_url"], ["ติดต่อครั้งถัดไป", "next_follow_up_at"], ["company_name", "company_name"]])
  assert.equal(IMPORT_HEADERS[h], k, h);
ok("หัวคอลัมน์ภาษาไทยตามฟอร์ม หรือรหัสคอลัมน์ อ่านได้ทั้งคู่");
assert.deepEqual(devFollowUps([D("a", { next_follow_up_at: "2026-10-01" })], ""), { overdue: [], today: [], stale: [] });
assert.deepEqual(expiringProducts([P("x", "2026-10-01", "2026-11-01")], [D("x")], "", 60), []);
ok("ก่อนโหลดข้อมูล (ยังไม่มีวันที่วันนี้) ไม่ทำให้หน้าพัง");
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
