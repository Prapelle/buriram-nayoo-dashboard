/**
 * ระบบบัญชี (5/11/2026) — กฎล้วน (ไม่เรียก Google Sheets) ใช้ทั้งฝั่ง Server และหน้าเว็บ
 * ลำดับเอกสาร: ใบเสนอราคา → ใบวางบิล → ใบแจ้งหนี้ (ข้ามได้) · ยืนยันชำระเงินได้ทุกใบ
 * รายการสินค้า = Product เดียวกับของ Developer / Home Builder (ชื่อ Product มาจากรายการเดียวกัน)
 * ยืนยันชำระเต็ม → เพิ่ม Product ให้ลูกค้า + สร้าง Production Job อัตโนมัติ · ชำระมัดจำ → กดปุ่ม "เริ่มงาน" เอง
 */
export type Rec = Record<string, string>;
/** ลูกค้าที่เลือกในเอกสาร = แถวใน DEVELOPERS (Developer / Home Builder) */
export type Customer = { developer_id: string; code: string; kind: string; name: string; project: string; contact_name: string; phone: string };

export const DOC_TYPES = ["quotation", "billing", "invoice"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_LABEL: Record<DocType, string> = { quotation: "ใบเสนอราคา", billing: "ใบวางบิล", invoice: "ใบแจ้งหนี้" };
export const DOC_PREFIX: Record<DocType, string> = { quotation: "QT", billing: "BL", invoice: "IV" };
export const parseDocType = (v: unknown): DocType => (DOC_TYPES as readonly string[]).includes(String(v)) ? (String(v) as DocType) : "quotation";
/** ใบถัดไปที่สร้างต่อได้ (ข้ามได้: ใบเสนอราคา → ใบแจ้งหนี้ ตรง ๆ) */
export const NEXT_TYPES: Record<DocType, DocType[]> = { quotation: ["billing", "invoice"], billing: ["invoice"], invoice: [] };

export const DOC_STATUS = ["draft", "sent", "approved", "paid_partial", "paid", "cancelled"] as const;
export type DocStatus = (typeof DOC_STATUS)[number];
export const STATUS_LABEL: Record<DocStatus, string> = { draft: "แบบร่าง", sent: "ส่งแล้ว", approved: "ลูกค้าตกลง", paid_partial: "ชำระบางส่วน", paid: "ชำระแล้ว", cancelled: "ยกเลิก" };
/** สถานะที่ตั้งเองได้ (ชำระบางส่วน/ชำระแล้ว ระบบตั้งจากยอดชำระ) */
export const MANUAL_STATUS: DocStatus[] = ["draft", "sent", "approved", "cancelled"];
export const PAY_METHODS = ["โอนเงิน", "เงินสด", "เช็ค", "อื่น ๆ"];
export const JOB_STATUS = ["รอเริ่ม", "กำลังทำ", "รอตรวจ", "เสร็จแล้ว", "ยกเลิก"] as const;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FILE_TYPES = ["application/pdf", "image/png", "image/jpeg"];

export const DOC_COLUMNS = ["doc_id", "doc_type", "doc_no", "doc_date", "due_date", "status", "root_id", "parent_doc_id",
  "customer_id", "customer_kind", "customer_name", "customer_contact", "customer_address", "customer_tax_id", "job_title", "contact_name", "contact_phone", "seller_name",
  "subtotal", "discount", "vat_rate", "vat", "total", "paid_amount", "work_started_at", "note", "created_by", "created_at", "updated_by", "updated_at",
  "wht_rate", "wht"]; // ต่อท้าย 5/11/2026: หัก ณ ที่จ่าย (% และจำนวนเงิน)
export const LINE_COLUMNS = ["line_id", "doc_id", "line_no", "product", "category", "description", "qty", "unit_price", "amount", "start_date", "end_date", "product_id", "job_id", "applied_at"];
export const PAYMENT_COLUMNS = ["payment_id", "doc_id", "root_id", "amount", "paid_at", "method", "ref", "note", "confirmed_by", "confirmed_at"];
export const FILE_COLUMNS = ["file_id", "doc_id", "payment_id", "file_name", "mime", "size", "storage_key", "uploaded_by", "uploaded_at"];
export const JOB_COLUMNS = ["job_id", "job_code", "doc_id", "doc_no", "line_id", "developer_id", "customer_name", "job_title", "product", "category", "start_date", "end_date",
  "checklist", "done_idx", "status", "owner", "note", "created_by", "created_at", "updated_by", "updated_at"];

/** ข้อมูลผู้ขาย (ค่าเริ่มต้นตามใบเสนอราคาต้นแบบ — แก้ได้ที่ APP_CONFIG: account_seller เป็น JSON) */
export type Seller = { name: string; address: string; tax_id: string; phone: string };
export const DEFAULT_SELLER: Seller = { name: "บริษัท แฟค ดิจิตอล จำกัด (สำนักงานใหญ่)", address: "83 ถนนหลักเมือง ตำบลในเมือง อำเภอเมืองสุรินทร์ จังหวัดสุรินทร์ 32000", tax_id: "0325566000476", phone: "0909720100" };
export const parseSeller = (json: string | undefined): Seller => { try { const o = JSON.parse(json || "{}"); return { ...DEFAULT_SELLER, ...Object.fromEntries(Object.entries(o).filter(([k, v]) => k in DEFAULT_SELLER && typeof v === "string" && v)) }; } catch { return DEFAULT_SELLER; } };

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => { const n = Number(String(v ?? "").replace(/,/g, "").trim()); return Number.isFinite(n) ? n : NaN; };

/** เลขที่เอกสาร: คำนำหน้า + ปีเดือน + ลำดับ 4 หลักต่อเดือน เช่น QT2026100009 */
export function nextDocNo(type: DocType, existing: string[], date: string): string {
  const pre = DOC_PREFIX[type] + date.slice(0, 7).replace("-", "");
  const max = existing.reduce((m, c) => (c.startsWith(pre) && /^\d{4}$/.test(c.slice(pre.length)) ? Math.max(m, Number(c.slice(pre.length))) : m), 0);
  return pre + String(max + 1).padStart(4, "0");
}

export type LineInput = { product: string; category: string; description: string; qty: number; unit_price: number; amount: number; start_date: string; end_date: string };
/** wht = หัก ณ ที่จ่าย คิดจากยอดก่อน VAT (หลังหักส่วนลด) · total = ยอดรวมทั้งสิ้นรวม VAT · ยอดที่ลูกค้าต้องโอนจริง = total − wht (payableOf) */
export type Totals = { subtotal: number; discount: number; vat_rate: number; vat: number; total: number; wht_rate: number; wht: number };
export const payableOf = (d: { total?: string; wht?: string }) => round2(Number(d.total || 0) - Number(d.wht || 0));
export function calcTotals(lines: { qty: number; unit_price: number }[], discount: number, vatRate: number, whtRate = 0): Totals {
  const subtotal = round2(lines.reduce((s, l) => s + round2(l.qty * l.unit_price), 0));
  const d = Math.min(Math.max(discount, 0), subtotal);
  const vat = round2((subtotal - d) * (vatRate / 100));
  return { subtotal, discount: d, vat_rate: vatRate, vat, total: round2(subtotal - d + vat), wht_rate: whtRate, wht: round2((subtotal - d) * (whtRate / 100)) };
}

export type DocValid = { ok: true; doc: Rec; lines: LineInput[]; totals: Totals } | { ok: false; errors: Record<string, string> };
/** ตรวจข้อมูลจากฟอร์ม · ชื่อ Product ต้องอยู่ในรายการ Product (types) และประเภท Product / Service / Event */
export function validateDoc(input: Record<string, unknown>, types: string[], categories: string[]): DocValid {
  const errors: Record<string, string> = {};
  const s = (k: string) => String(input[k] ?? "").trim();
  const doc: Rec = { doc_type: parseDocType(input.doc_type), doc_date: s("doc_date"), due_date: s("due_date"), customer_id: s("customer_id"), job_title: s("job_title"), contact_name: s("contact_name"), contact_phone: s("contact_phone"),
    seller_name: s("seller_name"), note: s("note") };
  if (!isIso(doc.doc_date)) errors.doc_date = "ใส่วันที่เอกสาร";
  if (doc.due_date && !isIso(doc.due_date)) errors.due_date = "วันที่ไม่ถูกต้อง";
  if (!doc.customer_id) errors.customer_id = "เลือกลูกค้าจากรายชื่อ Developer / Home Builder";
  for (const [k, n] of [["job_title", 200], ["contact_name", 150], ["contact_phone", 40], ["seller_name", 150], ["note", 2000]] as const) if (doc[k].length > n) errors[k] = `ยาวเกิน ${n} ตัวอักษร`;
  const raw = Array.isArray(input.lines) ? (input.lines as Record<string, unknown>[]) : [];
  const lines: LineInput[] = [];
  if (!raw.length) errors.lines = "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ";
  raw.forEach((r, i) => {
    const l = { product: String(r.product ?? "").trim(), category: String(r.category ?? "").trim() || "Product", description: String(r.description ?? "").trim(), qty: num(r.qty), unit_price: num(r.unit_price), start_date: String(r.start_date ?? "").trim(), end_date: String(r.end_date ?? "").trim() };
    const e = (k: string, m: string) => { errors[`lines.${i}.${k}`] = m; };
    if (!types.includes(l.product)) e("product", "เลือก Product จากรายการ");
    if (!categories.includes(l.category)) e("category", "เลือก Product / Service / Event");
    if (!(l.qty > 0)) e("qty", "จำนวนต้องมากกว่า 0");
    if (!(l.unit_price >= 0)) e("unit_price", "ราคาต้องเป็นตัวเลข 0 ขึ้นไป");
    if (l.description.length > 3000) e("description", "รายละเอียดยาวเกิน 3,000 ตัวอักษร");
    if (l.start_date && !isIso(l.start_date)) e("start_date", "วันที่ไม่ถูกต้อง");
    if (l.end_date && !isIso(l.end_date)) e("end_date", "วันที่ไม่ถูกต้อง");
    if (isIso(l.start_date) && isIso(l.end_date) && l.end_date < l.start_date) e("end_date", "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
    lines.push({ ...l, amount: round2(l.qty * l.unit_price) });
  });
  const discount = input.discount === undefined || input.discount === "" ? 0 : num(input.discount);
  const vatRate = input.vat_rate === undefined || input.vat_rate === "" ? 0 : num(input.vat_rate);
  if (!(discount >= 0)) errors.discount = "ส่วนลดต้องเป็นตัวเลข 0 ขึ้นไป";
  const whtRate = input.wht_rate === undefined || input.wht_rate === "" ? 0 : num(input.wht_rate);
  if (!(vatRate >= 0 && vatRate <= 100)) errors.vat_rate = "VAT ต้องอยู่ระหว่าง 0–100";
  if (!(whtRate >= 0 && whtRate <= 15)) errors.wht_rate = "หัก ณ ที่จ่ายต้องอยู่ระหว่าง 0–15%";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, doc, lines, totals: calcTotals(lines, discount, vatRate, whtRate) };
}

/** สถานะจากยอดชำระ (ยกเลิกไม่เปลี่ยน · ยังไม่ชำระ = คงสถานะเดิมที่ตั้งเอง) */
export function statusFromPaid(current: string, total: number, paid: number): DocStatus {
  if (current === "cancelled") return "cancelled";
  if (paid > 0 && paid >= round2(total) - 0.005) return "paid";
  if (paid > 0) return "paid_partial";
  return (MANUAL_STATUS as string[]).includes(current) ? (current as DocStatus) : "sent";
}

export type PayCheck = { ok: true; amount: number; full: boolean } | { ok: false; errors: Record<string, string> };
export function validatePayment(input: Record<string, unknown>, total: number, alreadyPaid: number, today: string): PayCheck {
  const errors: Record<string, string> = {};
  const amount = round2(num(input.amount));
  const remain = round2(total - alreadyPaid);
  if (!(amount > 0)) errors.amount = "ใส่จำนวนเงินที่ชำระ";
  else if (amount > remain + 0.005) errors.amount = `เกินยอดคงเหลือ (${remain.toLocaleString("en-US", { minimumFractionDigits: 2 })} บาท)`;
  const d = String(input.paid_at ?? "").trim();
  if (!isIso(d)) errors.paid_at = "ใส่วันที่ชำระ"; else if (d > today) errors.paid_at = "วันที่ชำระต้องไม่เป็นอนาคต";
  if (!PAY_METHODS.includes(String(input.method ?? ""))) errors.method = "เลือกวิธีชำระ";
  if (String(input.ref ?? "").length > 200) errors.ref = "ยาวเกิน 200 ตัวอักษร";
  if (String(input.note ?? "").length > 500) errors.note = "ยาวเกิน 500 ตัวอักษร";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, amount, full: amount >= remain - 0.005 };
}

/** เช็กลิสต์ Production จากรายละเอียดรายการ: บรรทัดที่ขึ้นต้นด้วย "-" (ตัดเครื่องหมาย ** ออก) · ไม่มีเลย → ใช้ชื่อ Product */
export function checklistOf(description: string, product: string): string[] {
  const items = String(description ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[-•]\s*/.test(l)).map((l) => l.replace(/^[-•]\s*/, "").replace(/\*\*/g, "").trim()).filter(Boolean);
  return items.length ? items : [product];
}
export const nextJobCode = (codes: string[]) => `PJ-${String(codes.reduce((m, c) => { const x = /^PJ-(\d+)$/.exec(c); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1).padStart(4, "0")}`;

/** ข้อมูลที่ต้องครบก่อนเริ่มงาน: ทุกรายการต้องมีวันเริ่มและวันสิ้นสุด (ใช้สร้าง Product ของลูกค้า) */
export function missingDates(lines: Rec[]): Record<string, string> {
  const e: Record<string, string> = {};
  lines.forEach((l, i) => { if (!isIso(l.start_date ?? "")) e[`lines.${i}.start_date`] = "ใส่วันเริ่ม"; if (!isIso(l.end_date ?? "")) e[`lines.${i}.end_date`] = "ใส่วันสิ้นสุด"; });
  return e;
}

const D = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"], P = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
function readInt(n: number): string {
  if (n === 0) return "";
  if (n >= 1_000_000) return readInt(Math.floor(n / 1_000_000)) + "ล้าน" + readInt(n % 1_000_000);
  const s = String(n); let out = "";
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]), pos = s.length - 1 - i;
    if (d === 0) continue;
    if (pos === 1) out += d === 1 ? "สิบ" : d === 2 ? "ยี่สิบ" : D[d] + "สิบ";
    else if (pos === 0) out += d === 1 && s.length > 1 ? "เอ็ด" : D[d];
    else out += D[d] + P[pos];
  }
  return out;
}
/** จำนวนเงินเป็นตัวอักษรไทย เช่น 5000 → "ห้าพันบาทถ้วน" */
export function bahtText(v: number): string {
  const n = round2(Math.abs(v)); const baht = Math.floor(n), sat = Math.round((n - baht) * 100);
  const b = baht === 0 ? "ศูนย์" : readInt(baht);
  return (v < 0 ? "ลบ" : "") + b + "บาท" + (sat ? readInt(sat) + "สตางค์" : "ถ้วน");
}
export const money = (n: unknown) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** วันที่แบบไทย (พ.ศ.) 29/10/2026 → 29/10/2569 สำหรับแสดงบนเอกสาร */
export const thaiDate = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 543}` : "");
