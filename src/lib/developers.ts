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
  "staff", "status", "status_changed_at", "last_contacted_at", "next_follow_up_at", "won_at", "remark", "notes", "created_by", "created_at", "updated_by", "updated_at",
  "last_contact_method"]; // ต่อท้าย 31/10/2026: สถานะการเข้าพบล่าสุด (โทร / Line / เจอหน้า)
export const DEV_EDITABLE = ["company_name", "project_main", "project_sub1", "project_sub2", "contact_name", "phone", "line_id", "tier", "nayoo_url", "staff", "status", "last_contacted_at", "next_follow_up_at", "remark", "notes", "last_contact_method"];
export const PRODUCT_COLUMNS = ["product_id", "developer_id", "product", "start_date", "end_date", "price_thb", "notes", "created_by", "created_at", "updated_by", "updated_at",
  "category"]; // ต่อท้าย 31/10/2026: ประเภท Product / Service / Event
/** ประเภทของสิ่งที่ขาย (31/10/2026) · Product เดิมที่ยังไม่มีประเภท = Product */
export const PRODUCT_CATEGORIES = ["Product", "Service", "Event"];
export const categoryOf = (p: { category?: string }) => (PRODUCT_CATEGORIES.includes(String(p.category ?? "")) ? String(p.category) : "Product");
/** ประวัติการติดต่อ (31/10/2026): หนึ่งแถวต่อการติดต่อ 1 ครั้ง — ใช้นับยอด โทร / Line / เจอหน้า รายเดือน */
export const CONTACT_METHODS = ["โทร", "Line", "เจอหน้า"];
export const CONTACT_COLUMNS = ["contact_id", "developer_id", "staff", "method", "contacted_at", "source", "note", "created_by", "created_at"];
/** ไม่ใส่ ติดต่อครั้งถัดไป → ระบบใส่ = ติดต่อล่าสุด + 30 วัน (ผู้ใช้กำหนด 31/10/2026) */
export const NEXT_CONTACT_DAYS = 30;
export const LOG_COLUMNS = ["log_id", "developer_id", "staff", "from_status", "to_status", "kind", "counts_as", "month", "changed_by", "changed_at"];

export const LABEL: Record<string, string> = {
  company_name: "ชื่อบริษัท", project_main: "โครงการหลัก", project_sub1: "โครงการรอง 1", project_sub2: "โครงการรอง 2", contact_name: "ชื่อผู้ติดต่อ",
  phone: "เบอร์", line_id: "Line", tier: "Tier", nayoo_url: "Nayoo URL", staff: "Staff", status: "Status", last_contacted_at: "ติดต่อล่าสุด",
  next_follow_up_at: "ติดต่อครั้งถัดไป", remark: "Remark", notes: "Note", last_contact_method: "สถานะการเข้าพบ",
};
const LIMITS: Record<string, number> = { company_name: 200, project_main: 200, project_sub1: 200, project_sub2: 200, contact_name: 150, phone: 40, line_id: 100, nayoo_url: 500, staff: 100, remark: 2000, notes: 2000 };

export const todayBkk = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
export const day = (v: unknown) => String(v ?? "").slice(0, 10);
/** วันที่แบบไทย (ใช้ timestamp UTC → เวลาไทย) */
export const bkkDay = (iso: unknown) => { const s = String(iso ?? ""); if (!s) return ""; if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const t = Date.parse(s); return Number.isFinite(t) ? new Date(t + 7 * 3600_000).toISOString().slice(0, 10) : ""; };
export const addDays = (d: string, n: number) => { const t = Date.parse(d + "T00:00:00Z"); return Number.isFinite(t) ? new Date(t + n * 864e5).toISOString().slice(0, 10) : ""; };
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
  if (rec.last_contact_method && !CONTACT_METHODS.includes(rec.last_contact_method)) errors.last_contact_method = "เลือก โทร / Line / เจอหน้า";
  // ไม่ใส่วันติดต่อครั้งถัดไป แต่มีวันติดต่อล่าสุด → ติดต่อล่าสุด + 30 วัน
  if (!rec.next_follow_up_at && isIso(rec.last_contacted_at)) rec.next_follow_up_at = addDays(rec.last_contacted_at, NEXT_CONTACT_DAYS);
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
  const rec: DevProduct = { category: String(input.category ?? "").trim() || "Product", product: String(input.product ?? "").trim(), start_date: String(input.start_date ?? "").trim(), end_date: String(input.end_date ?? "").trim(), price_thb: String(input.price_thb ?? "").replace(/,/g, "").trim(), notes: String(input.notes ?? "").trim() };
  if (!types.includes(rec.product)) errors.product = "เลือก Product";
  if (!PRODUCT_CATEGORIES.includes(rec.category)) errors.category = "เลือก Product / Service / Event";
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

/**
 * ติดตาม Developer (31/10/2026):
 * - เลยกำหนด = เลยวันติดต่อครั้งถัดไป 1–3 วัน · วันนี้ = วันติดต่อครั้งถัดไปคือวันนี้
 * - ค้างเกิน 3 วัน = เลยวันติดต่อครั้งถัดไปเกิน 3 วัน และ Status ไม่เปลี่ยนตั้งแต่วันนั้น
 * - เลยกำหนดแต่ Status เปลี่ยนแล้วหลังวันนั้น → ไม่ขึ้นในทั้งสองกลุ่ม · ไม่นับ ไม่ให้เข้าพบ และสถานะที่ระบบตั้งตาม Product
 */
export const DEV_STALE_DAYS = 3;
export function devFollowUps(devs: Dev[], today: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { overdue: [] as Dev[], today: [] as Dev[], stale: [] as Dev[] }; // ยังไม่ได้โหลดข้อมูล
  const open = devs.filter((d) => d.status !== "ไม่ให้เข้าพบ" && !AUTO_STATUS.includes(d.status));
  const cutoff = addDays(today, -DEV_STALE_DAYS);
  const late = open.filter((d) => day(d.next_follow_up_at) && day(d.next_follow_up_at) < today && !(bkkDay(d.status_changed_at) > day(d.next_follow_up_at)));
  const by = (a: Dev, b: Dev) => day(a.next_follow_up_at).localeCompare(day(b.next_follow_up_at));
  return {
    overdue: late.filter((d) => day(d.next_follow_up_at) >= cutoff).sort(by),
    today: open.filter((d) => day(d.next_follow_up_at) === today),
    stale: late.filter((d) => day(d.next_follow_up_at) < cutoff).sort(by),
  };
}

export type DevMonthRow = {
  staff: string; planned: number; met: number; noMeeting: number; won: number; productSales: number;
  calls: number; line: number; meet: number; // ยอดการติดต่อ โทร / Line / เจอหน้า (ประวัติการติดต่อ)
  metProjects: number; productProjects: number; productRatePct: number | null; // โครงการที่เข้าพบ (ไม่ซ้ำ) / โครงการที่เพิ่ม Product ในเดือนนี้
  byCategory: Record<string, number>; // ยอดเงิน Product / Service / Event
};
const isClose = (l: Record<string, string>) => l.to_status === "ปิดการขาย" && l.kind === "manual";
const isMet = (l: Record<string, string>) => l.to_status === "เข้าพบแล้ว" && l.kind === "manual";
/**
 * เดือนที่นับยอดของ Product (31/10/2026): เดือนของการ "ปิดการขาย" ครั้งล่าสุดที่เกิดก่อนหรือวันเดียวกับวันที่เพิ่ม Product
 * ไม่มีการปิดการขายเลย (เพิ่ม Product ตอนอยู่สถานะอื่น / นำเข้าเป็นกำลังใช้ Product / ข้อมูลเก่า) → เดือนที่เพิ่ม Product (ไม่มีวันที่เพิ่ม → วันเริ่ม)
 */
export function productSaleMonth(p: DevProduct, logs: Record<string, string>[]): { month: string; staff?: string } {
  const added = bkkDay(p.created_at) || day(p.start_date);
  const closes = logs.filter((l) => l.developer_id === p.developer_id && isClose(l) && bkkDay(l.changed_at) <= added).sort((a, b) => String(a.changed_at).localeCompare(String(b.changed_at)));
  const c = closes[closes.length - 1];
  return c ? { month: bkkDay(c.changed_at).slice(0, 7), staff: c.staff } : { month: added.slice(0, 7) };
}
/**
 * รายงานรายเดือนต่อ Staff (จากประวัติ Status — ไม่หายเมื่อการ์ดถูกย้ายกลับตอนสิ้นเดือน)
 * นัดเข้าพบ = ย้ายมา มีแผนเข้าพบ · เข้าพบ = ย้ายมา เข้าพบแล้ว · ไม่ให้เข้าพบ = ย้ายมา ไม่ให้เข้าพบ + มีแผนเข้าพบ ที่หมดเดือนโดยไม่ได้เข้าพบ
 * Win = ย้ายมา ปิดการขาย · ยอด Product / Service / Event = ราคาของรายการที่นับเข้าเดือนนั้น (productSaleMonth)
 * โทร / Line / เจอหน้า = ประวัติการติดต่อในเดือน · เข้าพบแล้ว / เพิ่ม Product = จำนวนโครงการไม่ซ้ำ
 */
export function monthlyReport(logs: Record<string, string>[], products: DevProduct[], devs: Dev[], month: string, contacts: Record<string, string>[] = []): DevMonthRow[] {
  const m = new Map<string, DevMonthRow & { _met: Set<string>; _prod: Set<string> }>();
  const row = (s: string) => {
    const k = (s ?? "").trim() || "(ไม่ระบุ Staff)";
    if (!m.has(k)) m.set(k, { staff: k, planned: 0, met: 0, noMeeting: 0, won: 0, productSales: 0, calls: 0, line: 0, meet: 0, metProjects: 0, productProjects: 0, productRatePct: null, byCategory: Object.fromEntries(PRODUCT_CATEGORIES.map((c) => [c, 0])), _met: new Set(), _prod: new Set() });
    return m.get(k)!;
  };
  // ประวัติอัตโนมัติอาจถูกบันทึกซ้ำถ้าเปิดหน้าพร้อมกันหลายคน (รหัสเดียวกัน) → นับครั้งเดียวต่อรหัส
  const seenIds = new Set<string>(); const uniq: Record<string, string>[] = [];
  for (const l of logs) { if (l.log_id) { if (seenIds.has(l.log_id)) continue; seenIds.add(l.log_id); } uniq.push(l); }
  for (const l of uniq) {
    if (l.kind === "manual" && bkkDay(l.changed_at).slice(0, 7) === month) {
      if (l.to_status === "มีแผนเข้าพบ") row(l.staff).planned++;
      if (l.to_status === "เข้าพบแล้ว") { const r = row(l.staff); r.met++; r._met.add(l.developer_id); }
      if (l.to_status === "ไม่ให้เข้าพบ") row(l.staff).noMeeting++;
      if (l.to_status === "ปิดการขาย") row(l.staff).won++;
    }
    if (l.counts_as === "no_meeting" && l.month === month) row(l.staff).noMeeting++;
  }
  const staffOf = new Map(devs.map((d) => [d.developer_id, d.staff ?? ""]));
  for (const p of products) {
    const a = productSaleMonth(p, uniq); if (a.month !== month) continue;
    const r = row(a.staff ?? staffOf.get(p.developer_id) ?? ""); const v = Number(p.price_thb) || 0;
    r.productSales += v; r.byCategory[categoryOf(p)] += v; r._prod.add(p.developer_id);
  }
  const seenC = new Set<string>();
  for (const c of contacts) {
    if (c.contact_id) { if (seenC.has(c.contact_id)) continue; seenC.add(c.contact_id); }
    if (day(c.contacted_at).slice(0, 7) !== month) continue;
    const r = row(c.staff); if (c.method === "โทร") r.calls++; else if (c.method === "Line") r.line++; else if (c.method === "เจอหน้า") r.meet++;
  }
  return [...m.values()].map(({ _met, _prod, ...r }) => ({ ...r, metProjects: _met.size, productProjects: _prod.size, productRatePct: _met.size ? Math.round((_prod.size / _met.size) * 1000) / 10 : null }))
    .sort((a, b) => b.won - a.won || b.met - a.met || a.staff.localeCompare(b.staff));
}

/**
 * โครงการที่ปิดไม่ได้ (31/10/2026): นับเดือนที่ "เข้าพบแล้ว" แต่ไม่ได้ปิดการขาย (คำนวณจากประวัติ Status — ไม่ต้องรอวันที่ 1)
 * - นับ 1 ครั้งต่อเดือน (เดือนเดียวเข้าพบหลายรอบ = 1) · นับสะสม ไม่ต้องติดกัน · นับเฉพาะเดือนที่จบแล้ว (ก่อนเดือนปัจจุบัน)
 * - เดือนที่มีการปิดการขาย ไม่นับ · ปิดการขายเมื่อไร เริ่มนับ 0 ใหม่หลังจากนั้น · Status ปัจจุบันเป็น ปิดการขาย = เอาออก
 * - แสดงเมื่อครบ 3 ครั้งขึ้นไป
 */
export const CANT_CLOSE_MIN = 3;
export function cantCloseProjects(logs: Record<string, string>[], devs: Dev[], today: string): { dev: Dev; count: number; months: string[] }[] {
  const cur = today.slice(0, 7);
  const out: { dev: Dev; count: number; months: string[] }[] = [];
  for (const d of devs) {
    if (d.status === "ปิดการขาย") continue;
    const mine = logs.filter((l) => l.developer_id === d.developer_id);
    const lastClose = mine.filter(isClose).map((l) => String(l.changed_at)).sort().pop() ?? "";
    const closeMonths = new Set(mine.filter(isClose).map((l) => bkkDay(l.changed_at).slice(0, 7)));
    const months = [...new Set(mine.filter((l) => isMet(l) && String(l.changed_at) > lastClose).map((l) => bkkDay(l.changed_at).slice(0, 7)))]
      .filter((mo) => mo && mo < cur && !closeMonths.has(mo)).sort();
    if (months.length >= CANT_CLOSE_MIN) out.push({ dev: d, count: months.length, months });
  }
  return out.sort((a, b) => b.count - a.count || (a.dev.company_name || a.dev.project_main).localeCompare(b.dev.company_name || b.dev.project_main, "th"));
}

/** Product ที่จะหมดอายุภายใน n วัน (ยังใช้อยู่) */
export function expiringProducts(products: DevProduct[], devs: Dev[], today: string, days = EXPIRING_DAYS) {
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
