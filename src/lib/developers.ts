/**
 * Developer (ลูกค้าโครงการหมู่บ้านที่ซื้อโฆษณา) — กฎล้วน (ไม่เรียก Google Sheets) ใช้ทั้งฝั่ง Server และหน้าเว็บ
 * Status (ลำดับคอลัมน์บนหน้า Sale developer — ผู้ใช้กำหนด 31/10/2026):
 *   ยังไม่เข้าร่วม → เข้าร่วมแล้ว → มีแผนเข้าพบ → เข้าพบแล้ว → ปิดการขาย → กำลังใช้ Product → ใกล้หมดสัญญา · ไม่ให้เข้าพบ
 * - สิ้นเดือน: มีแผนเข้าพบ / เข้าพบแล้ว ที่ค้างจากเดือนก่อน → กลับไป เข้าร่วมแล้ว (มีแผนเข้าพบ นับเป็น "ไม่ให้เข้าพบ" ในรายงานเดือนนั้น)
 * - กำลังใช้ Product / ใกล้หมดสัญญา เปลี่ยนเองตามวันของ Product: มี Product ที่ใช้อยู่ → กำลังใช้ (เหลือ ≤ 30 วัน → ใกล้หมดสัญญา)
 *   หมดอายุทุกตัว → เข้าร่วมแล้ว · ปิดการขาย ค้างไว้จนกว่า Product จะเริ่ม
 */
export type Dev = Record<string, string>;
export type DevProduct = Record<string, string>;

export const DEV_STATUS = ["ยังไม่เข้าร่วม", "เข้าร่วมแล้ว", "มีแผนเข้าพบ", "เข้าพบแล้ว", "ปิดการขาย", "กำลังใช้ Product", "ใกล้หมดสัญญา", "ไม่ให้เข้าพบ"] as const;
export const DEV_DEFAULT = "ยังไม่เข้าร่วม";
export const AUTO_STATUS = ["กำลังใช้ Product", "ใกล้หมดสัญญา"]; // ระบบกำหนดเองจาก Product (ลากเข้าเองไม่ได้)
export const MONTHLY_RESET = ["มีแผนเข้าพบ", "เข้าพบแล้ว"];
export const TIERS = ["A", "B", "C", "D", "E"];
export const DEFAULT_PRODUCTS = ["Top ads", "Super Topads"];
export const EXPIRING_DAYS = 30;

export const DEV_COLUMNS = ["developer_id", "dev_code", "company_name", "project_main", "project_sub1", "project_sub2", "contact_name", "phone", "line_id", "tier", "nayoo_url",
  "staff", "status", "status_changed_at", "last_contacted_at", "next_follow_up_at", "won_at", "remark", "notes", "created_by", "created_at", "updated_by", "updated_at"];
export const DEV_EDITABLE = ["company_name", "project_main", "project_sub1", "project_sub2", "contact_name", "phone", "line_id", "tier", "nayoo_url", "staff", "status", "last_contacted_at", "next_follow_up_at", "remark", "notes"];
export const PRODUCT_COLUMNS = ["product_id", "developer_id", "product", "start_date", "end_date", "price_thb", "notes", "created_by", "created_at", "updated_by", "updated_at"];
export const LOG_COLUMNS = ["log_id", "developer_id", "staff", "from_status", "to_status", "kind", "counts_as", "month", "changed_by", "changed_at"];

export const LABEL: Record<string, string> = {
  company_name: "ชื่อบริษัท", project_main: "โครงการหลัก", project_sub1: "โครงการรอง 1", project_sub2: "โครงการรอง 2", contact_name: "ชื่อผู้ติดต่อ",
  phone: "เบอร์", line_id: "Line", tier: "Tier", nayoo_url: "Nayoo URL", staff: "Staff", status: "Status", last_contacted_at: "ติดต่อล่าสุด",
  next_follow_up_at: "ติดต่อครั้งถัดไป", remark: "Remark", notes: "Note",
};
const LIMITS: Record<string, number> = { company_name: 200, project_main: 200, project_sub1: 200, project_sub2: 200, contact_name: 150, phone: 40, line_id: 100, nayoo_url: 500, staff: 100, remark: 2000, notes: 2000 };

export const todayBkk = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
export const day = (v: unknown) => String(v ?? "").slice(0, 10);
/** วันที่แบบไทย (ใช้ timestamp UTC → เวลาไทย) */
export const bkkDay = (iso: unknown) => { const s = String(iso ?? ""); if (!s) return ""; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const t = Date.parse(s); return Number.isFinite(t) ? new Date(t + 7 * 3600_000).toISOString().slice(0, 10) : ""; };
const addDays = (d: string, n: number) => { const t = Date.parse(d + "T00:00:00Z"); return Number.isFinite(t) ? new Date(t + n * 864e5).toISOString().slice(0, 10) : ""; };
const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
export const normPhone = (s: unknown) => { const d = String(s ?? "").replace(/\D/g, ""); return d.startsWith("66") && d.length === 11 ? "0" + d.slice(2) : d.length === 9 && !d.startsWith("0") ? "0" + d : d; };
export const normLine = (s: unknown) => String(s ?? "").trim().replace(/^@/, "").replace(/\s+/g, "").toLowerCase();
export const normName = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function nextDevCode(codes: string[]): string {
  const max = codes.reduce((m, c) => { const x = /^DV-(\d+)$/.exec(c); return x ? Math.max(m, Number(x[1])) : m; }, 0);
  return `DV-${String(max + 1).padStart(4, "0")}`;
}

/** ตรวจ/ทำความสะอาดข้อมูลจากฟอร์ม (Status กลุ่มอัตโนมัติเลือกเองไม่ได้) */
export function validateDev(input: Record<string, unknown>): { ok: true; rec: Dev } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const rec: Dev = {};
  for (const k of DEV_EDITABLE) rec[k] = String(input[k] ?? "").trim();
  rec.tier = rec.tier.toUpperCase();
  if (!rec.company_name && !rec.project_main) errors.company_name = "กรอกชื่อบริษัทหรือชื่อโครงการหลักอย่างน้อย 1 ช่อง";
  for (const [k, n] of Object.entries(LIMITS)) if ((rec[k] ?? "").length > n) errors[k] = `${LABEL[k]} ยาวเกิน ${n} ตัวอักษร`;
  if (rec.tier && !TIERS.includes(rec.tier)) errors.tier = "Tier ต้องเป็น A–E";
  if (rec.phone && normPhone(rec.phone).length < 9) errors.phone = "เบอร์โทรไม่ถูกต้อง";
  if (rec.nayoo_url) { try { const u = new URL(rec.nayoo_url); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { errors.nayoo_url = "URL ต้องขึ้นต้นด้วย https://"; } }
  for (const k of ["last_contacted_at", "next_follow_up_at"]) if (rec[k] && !isIso(rec[k])) errors[k] = "วันที่ไม่ถูกต้อง";
  if (!rec.status) rec.status = DEV_DEFAULT;
  if (!(DEV_STATUS as readonly string[]).includes(rec.status)) errors.status = "Status ไม่ถูกต้อง";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, rec };
}

export type DevDup = { dev_code: string; company_name: string; project_main: string; matched: ("company" | "project" | "phone" | "line")[] };
export function findDevDuplicates(rows: Dev[], rec: Dev, selfId?: string): DevDup[] {
  const c = normName(rec.company_name), p = normName(rec.project_main), ph = normPhone(rec.phone), l = normLine(rec.line_id);
  const out: DevDup[] = [];
  for (const r of rows) {
    if (selfId && r.developer_id === selfId) continue;
    const m: DevDup["matched"] = [];
    if (c && normName(r.company_name) === c) m.push("company");
    if (p && [r.project_main, r.project_sub1, r.project_sub2].some((x) => normName(x) === p)) m.push("project");
    if (ph && normPhone(r.phone) === ph) m.push("phone");
    if (l && normLine(r.line_id) === l) m.push("line");
    if (m.length) out.push({ dev_code: r.dev_code, company_name: r.company_name, project_main: r.project_main, matched: m });
  }
  return out;
}

export type ProductState = "active" | "future" | "expired";
export const productState = (p: DevProduct, today: string): ProductState => (day(p.end_date) && day(p.end_date) < today ? "expired" : day(p.start_date) > today ? "future" : "active");

export function validateProduct(input: Record<string, unknown>, types: string[]): { ok: true; rec: DevProduct } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const rec: DevProduct = { product: String(input.product ?? "").trim(), start_date: String(input.start_date ?? "").trim(), end_date: String(input.end_date ?? "").trim(), price_thb: String(input.price_thb ?? "").replace(/,/g, "").trim(), notes: String(input.notes ?? "").trim() };
  if (!types.includes(rec.product)) errors.product = "เลือก Product";
  if (!isIso(rec.start_date)) errors.start_date = "ใส่วันเริ่ม";
  if (!isIso(rec.end_date)) errors.end_date = "ใส่วันหมดอายุ";
  else if (isIso(rec.start_date) && rec.end_date < rec.start_date) errors.end_date = "วันหมดอายุต้องไม่ก่อนวันเริ่ม";
  if (rec.price_thb && (!Number.isFinite(Number(rec.price_thb)) || Number(rec.price_thb) < 0)) errors.price_thb = "ราคาต้องเป็นตัวเลข 0 ขึ้นไป";
  if (rec.notes.length > 500) errors.notes = "หมายเหตุยาวเกิน 500 ตัวอักษร";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, rec };
}

/** Status ที่ควรเป็นตาม Product (null = ไม่ต้องเปลี่ยน) */
export function productDrivenStatus(status: string, products: DevProduct[], today: string): string | null {
  const active = products.filter((p) => productState(p, today) === "active");
  if (active.length) {
    const end = active.map((p) => day(p.end_date)).filter(Boolean).sort().pop();
    const want = end && end <= addDays(today, EXPIRING_DAYS) ? "ใกล้หมดสัญญา" : "กำลังใช้ Product";
    return want === status ? null : want;
  }
  if (AUTO_STATUS.includes(status)) return products.some((p) => productState(p, today) === "future") ? "ปิดการขาย" : "เข้าร่วมแล้ว";
  return null;
}

export type StatusChange = { developer_id: string; from: string; to: string; kind: "auto_month_end" | "auto_product"; counts_as: string; month: string };
/**
 * การเปลี่ยน Status อัตโนมัติ ณ วันนี้ (ทำตอนเปิดหน้า — ไม่ต้องตั้งเวลา)
 * 1) มีแผนเข้าพบ / เข้าพบแล้ว ที่ตั้งก่อนเดือนนี้ → เข้าร่วมแล้ว (มีแผนเข้าพบ นับเป็น ไม่ให้เข้าพบ ของเดือนที่ตั้ง)
 * 2) ตาม Product
 */
export function autoChanges(devs: Dev[], products: DevProduct[], today: string): StatusChange[] {
  const byDev = new Map<string, DevProduct[]>();
  for (const p of products) { if (!byDev.has(p.developer_id)) byDev.set(p.developer_id, []); byDev.get(p.developer_id)!.push(p); }
  const out: StatusChange[] = [];
  for (const d of devs) {
    let status = d.status || DEV_DEFAULT;
    const setMonth = bkkDay(d.status_changed_at || d.updated_at || d.created_at).slice(0, 7);
    if (MONTHLY_RESET.includes(status) && setMonth && setMonth < today.slice(0, 7)) {
      out.push({ developer_id: d.developer_id, from: status, to: "เข้าร่วมแล้ว", kind: "auto_month_end", counts_as: status === "มีแผนเข้าพบ" ? "no_meeting" : "", month: setMonth });
      status = "เข้าร่วมแล้ว";
    }
    const want = productDrivenStatus(status, byDev.get(d.developer_id) ?? [], today);
    if (want) out.push({ developer_id: d.developer_id, from: status, to: want, kind: "auto_product", counts_as: "", month: today.slice(0, 7) });
  }
  return out;
}

/** ติดตาม (เหมือน Leads): เลยกำหนด / วันนี้ / ค้าง (ไม่มีวันติดต่อครั้งถัดไป และไม่ได้แก้ไขเกิน 3 วัน) — ไม่นับ ไม่ให้เข้าพบ */
export const DEV_STALE_DAYS = 3;
export function devFollowUps(devs: Dev[], today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { overdue: [] as Dev[], today: [] as Dev[], stale: [] as Dev[] }; // ยังไม่ได้โหลดข้อมูล
  const open = devs.filter((d) => d.status !== "ไม่ให้เข้าพบ");
  const cutoff = addDays(today, -DEV_STALE_DAYS);
  return {
    overdue: open.filter((d) => day(d.next_follow_up_at) && day(d.next_follow_up_at) < today).sort((a, b) => day(a.next_follow_up_at).localeCompare(day(b.next_follow_up_at))),
    today: open.filter((d) => day(d.next_follow_up_at) === today),
    stale: open.filter((d) => !day(d.next_follow_up_at) && !AUTO_STATUS.includes(d.status) && bkkDay(d.updated_at || d.created_at) && bkkDay(d.updated_at || d.created_at) < cutoff),
  };
}

export type DevMonthRow = { staff: string; planned: number; met: number; noMeeting: number; won: number; productSales: number };
/**
 * รายงานรายเดือนต่อ Staff (จากประวัติ Status — ไม่หายเมื่อการ์ดถูกย้ายกลับตอนสิ้นเดือน)
 * นัดเข้าพบ = ย้ายมา มีแผนเข้าพบ · เข้าพบ = ย้ายมา เข้าพบแล้ว · ไม่ให้เข้าพบ = ย้ายมา ไม่ให้เข้าพบ + มีแผนเข้าพบ ที่หมดเดือนโดยไม่ได้เข้าพบ
 * Win = ย้ายมา ปิดการขาย · ยอด Product = ราคา Product ที่เริ่มในเดือนนั้น
 */
export function monthlyReport(logs: Record<string, string>[], products: DevProduct[], devs: Dev[], month: string): DevMonthRow[] {
  const m = new Map<string, DevMonthRow>();
  const row = (s: string) => { const k = s.trim() || "(ไม่ระบุ Staff)"; if (!m.has(k)) m.set(k, { staff: k, planned: 0, met: 0, noMeeting: 0, won: 0, productSales: 0 }); return m.get(k)!; };
  // ประวัติอัตโนมัติอาจถูกบันทึกซ้ำถ้าเปิดหน้าพร้อมกันหลายคน (รหัสเดียวกัน) → นับครั้งเดียวต่อรหัส
  const seenIds = new Set<string>();
  for (const l of logs) {
    if (l.log_id) { if (seenIds.has(l.log_id)) continue; seenIds.add(l.log_id); }
    if (l.kind === "manual" && bkkDay(l.changed_at).slice(0, 7) === month) {
      if (l.to_status === "มีแผนเข้าพบ") row(l.staff).planned++;
      if (l.to_status === "เข้าพบแล้ว") row(l.staff).met++;
      if (l.to_status === "ไม่ให้เข้าพบ") row(l.staff).noMeeting++;
      if (l.to_status === "ปิดการขาย") row(l.staff).won++;
    }
    if (l.counts_as === "no_meeting" && l.month === month) row(l.staff).noMeeting++;
  }
  const staffOf = new Map(devs.map((d) => [d.developer_id, d.staff ?? ""]));
  for (const p of products) if (day(p.start_date).slice(0, 7) === month) row(staffOf.get(p.developer_id) ?? "").productSales += Number(p.price_thb) || 0;
  return [...m.values()].sort((a, b) => b.won - a.won || b.met - a.met || a.staff.localeCompare(b.staff));
}

/** Product ที่จะหมดอายุภายใน n วัน (ยังใช้อยู่) */
export function expiringProducts(products: DevProduct[], devs: Dev[], today: string, days = 60) {
  const byId = new Map(devs.map((d) => [d.developer_id, d]));
  const until = addDays(today, days);
  return products.filter((p) => productState(p, today) === "active" && day(p.end_date) <= until && byId.has(p.developer_id))
    .map((p) => ({ p, dev: byId.get(p.developer_id)!, daysLeft: Math.round((Date.parse(day(p.end_date)) - Date.parse(today)) / 864e5) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** หัวคอลัมน์ไฟล์นำเข้า (ไทยหรือรหัสคอลัมน์) → ช่องข้อมูล */
export const IMPORT_HEADERS: Record<string, string> = Object.fromEntries([
  ...Object.entries(LABEL).map(([k, v]) => [normName(v), k]), ...DEV_EDITABLE.map((k) => [k, k]),
  ["บริษัท", "company_name"], ["โครงการ", "project_main"], ["ชื่อโครงการหลัก", "project_main"], ["ชื่อโครงการ รอง", "project_sub1"], ["ผู้ติดต่อ", "contact_name"], ["ชื่อคนติดต่อ", "contact_name"],
  ["เบอร์โทร", "phone"], ["โทรศัพท์", "phone"], ["line id", "line_id"], ["nayoo url", "nayoo_url"], ["ลิงก์ nayoo", "nayoo_url"], ["หมายเหตุ", "remark"],
]);
