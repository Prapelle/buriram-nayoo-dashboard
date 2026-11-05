/**
 * ระบบบัญชี — อ่าน/เขียน Google Sheets (แท็บ ACC_DOCS / ACC_LINES / ACC_PAYMENTS / ACC_FILES / PRODUCTION_JOBS)
 * - รายการสินค้า = Product เดียวกับ Developer / Home Builder (ชื่อ Product มาจาก APP_CONFIG: developer_products)
 * - ยืนยันชำระเต็ม → เพิ่ม Product ให้ลูกค้าตาม customer_id (แถวใน DEVELOPERS) + สร้าง Job (หนึ่งรายการสินค้า = หนึ่ง Job)
 * - ชำระมัดจำ → ยังไม่เริ่มงาน จนกดปุ่ม "เริ่มงาน" (startWork) · เริ่มงานได้ครั้งเดียวต่อสายเอกสาร (ใบเสนอราคา → วางบิล → แจ้งหนี้)
 */
import { writeAudit } from "./audit";
import {
  calcTotals, checklistOf, payableOf, CUSTOMER_COLUMNS, DOC_COLUMNS, DOC_LABEL, FILE_COLUMNS, FILE_TYPES, JOB_COLUMNS, JOB_STATUS, LINE_COLUMNS, MANUAL_STATUS, MAX_FILE_BYTES, missingDates, nextDocNo, nextJobCode, NEXT_TYPES, parseSeller,
  PAYMENT_COLUMNS, DOC_TYPES, addDays, DEFAULT_DUE_DAYS, validateCustomer, round2, statusFromPaid, validateDoc, validatePayment, type Customer, type DocType, type Rec,
} from "./account";
import { kindOf, PRODUCT_CATEGORIES, todayBkk, validateProduct, DEV_COLUMNS } from "./developers";
import { normRole } from "./roles";
import { productTypesOf, saveProduct, saveDeveloper, deleteDeveloper, DevError, addProductType } from "./developers-service";
import { dedupeCode, guardRow } from "./row-guard";
import { createCardsForJobs, renameProductInContent } from "./content-service";
import { appendRows, batchUpdateValues, colLetter, deleteRow, listTabs, readTabs, toRow } from "./sheets";

export class AccError extends Error {
  constructor(public status: number, message: string, public code: string, public extra: { fields?: Record<string, string> } = {}) { super(message); }
}
type Tab = { headers: string[]; rows: Rec[] };
const TABS = ["ACC_DOCS", "ACC_LINES", "ACC_PAYMENTS", "ACC_FILES", "PRODUCTION_JOBS", "DEVELOPERS", "DEVELOPER_PRODUCTS", "APP_CONFIG", "APP_USERS"];
const PROFILE_TAB = "ACC_CUSTOMERS"; // แท็บใหม่ — ถ้ายังไม่มี (ยังไม่กด เตรียม Google Sheet) ระบบบัญชียังใช้งานได้ แค่ยังไม่จำข้อมูลลูกค้า

async function load(): Promise<Record<string, Tab>> {
  let t: Record<string, Tab>;
  try { t = await readTabs([...TABS, PROFILE_TAB]); } catch { try { t = await readTabs(TABS); t[PROFILE_TAB] = { headers: [], rows: [] }; } catch { t = null as never; } }
  if (!t) { throw new AccError(409, "ยังไม่มีแท็บระบบบัญชี — ให้ Super Admin กด ตั้งค่า → ตั้งค่าระบบ → เตรียม Google Sheet", "SHEET_NOT_READY"); }
  if (!t.ACC_DOCS.headers.includes("doc_id") || !t.ACC_LINES.headers.includes("line_id") || !t.ACC_PAYMENTS.headers.includes("payment_id") || !t.PRODUCTION_JOBS.headers.includes("job_id"))
    throw new AccError(409, "แท็บระบบบัญชียังไม่พร้อม — ให้ Super Admin กด เตรียม Google Sheet", "SHEET_NOT_READY");
  return t;
}
const pick = (cols: string[], r: Rec): Rec => Object.fromEntries(cols.map((c) => [c, r[c] ?? ""]));
const rowRange = (tab: string, headers: string[], row: number) => `'${tab}'!A${row}:${colLetter(headers.length - 1)}${row}`;
const sheetErr = (e: unknown): never => { if (e instanceof AccError) throw e; if (e instanceof DevError) throw new AccError(e.status, e.message, e.code, { fields: e.extra.fields }); throw e; };

const profileOf = (t: Record<string, Tab>, id: string): Rec => t[PROFILE_TAB].rows.find((r) => r.developer_id === id) ?? {};
/** ลูกค้า = แถวใน DEVELOPERS + ข้อมูลที่ระบบจำไว้จากเอกสารครั้งก่อน (ผู้ติดต่อ/เบอร์ ถ้าเคยแก้ในเอกสารจะใช้ค่าล่าสุด) */
const customersOf = (t: Record<string, Tab>): Customer[] => t.DEVELOPERS.rows.filter((r) => r.developer_id).map((r) => { const p = profileOf(t, r.developer_id); return {
  developer_id: r.developer_id, code: r.dev_code, kind: kindOf(r), name: r.company_name || r.project_main, project: r.project_main, contact_name: p.contact_name || r.contact_name, phone: p.phone || r.phone, address: p.address || "", tax_id: p.tax_id || "",
}; }).sort((a, b) => a.name.localeCompare(b.name, "th"));
const configOf = (t: Record<string, Tab>) => ({ types: productTypesOf(t.APP_CONFIG.rows), seller: parseSeller(t.APP_CONFIG.rows.find((r) => r.config_key === "account_seller")?.config_value) });

const chainOf = (t: Record<string, Tab>, rootId: string) => t.ACC_DOCS.rows.filter((d) => d.doc_id && (d.root_id || d.doc_id) === rootId);

/** ชื่อสมาชิกที่เป็นผู้ขายได้ (Super Admin / Admin / AE ที่เปิดใช้งาน) — ใช้ทำรายการเลือก "ผู้ขาย" */
const membersOf = (t: Record<string, Tab>) => [...new Set(t.APP_USERS.rows.filter((u) => u.email && String(u.active).toUpperCase() === "TRUE" && ["super_admin", "admin", "ae"].includes(normRole(u.role) ?? ""))
  .map((u) => (u.display_name || u.email.split("@")[0]).trim()))].sort((a, b) => a.localeCompare(b, "th"));
const nameOfEmail = (t: Record<string, Tab>, email?: string) => { const u = t.APP_USERS.rows.find((x) => x.email.toLowerCase() === (email ?? "").toLowerCase()); return u ? (u.display_name || u.email.split("@")[0]).trim() : ""; };

export async function listDocs(email?: string) {
  const t = await load();
  const started = new Set(t.ACC_DOCS.rows.filter((d) => d.work_started_at).map((d) => d.root_id || d.doc_id));
  const docs = t.ACC_DOCS.rows.filter((d) => d.doc_id).map((d): Rec => ({ ...pick(DOC_COLUMNS, d), work_started: started.has(d.root_id || d.doc_id) ? "1" : "" }))
    .sort((a, b) => (b.doc_date + b.doc_no).localeCompare(a.doc_date + a.doc_no));
  return { docs, customers: customersOf(t), members: membersOf(t), me: nameOfEmail(t, email), ...configOf(t), categories: PRODUCT_CATEGORIES, today: todayBkk() };
}

export async function getDoc(id: string) {
  const t = await load();
  const doc = t.ACC_DOCS.rows.find((d) => d.doc_id === id);
  if (!doc) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  const rootId = doc.root_id || doc.doc_id;
  const order = (x: string) => DOC_TYPES.indexOf(x as DocType);
  const chain = chainOf(t, rootId).map((d) => ({ doc_id: d.doc_id, doc_type: d.doc_type, doc_no: d.doc_no, status: d.status, total: d.total })).sort((a, b) => order(a.doc_type) - order(b.doc_type) || a.doc_no.localeCompare(b.doc_no));
  const ids = new Set(chainOf(t, rootId).map((d) => d.doc_id));
  const root = t.ACC_DOCS.rows.find((d) => d.doc_id === rootId) ?? doc;
  const customer = customersOf(t).find((c) => c.developer_id === doc.customer_id) ?? null;
  const dev = t.DEVELOPERS.rows.find((r) => r.developer_id === doc.customer_id);
  return {
    doc: pick(DOC_COLUMNS, doc), work_started_at: root.work_started_at || "",
    editable: doc.status !== "cancelled" && !(Number(doc.paid_amount) > 0) && !t.ACC_DOCS.rows.some((d) => d.parent_doc_id === id),
    lines: t.ACC_LINES.rows.filter((l) => l.doc_id === id).map((l) => pick(LINE_COLUMNS, l)).sort((a, b) => Number(a.line_no) - Number(b.line_no)),
    payments: t.ACC_PAYMENTS.rows.filter((p) => p.doc_id === id).map((p) => pick(PAYMENT_COLUMNS, p)),
    receipt_payment: doc.doc_type === "receipt" ? pick(PAYMENT_COLUMNS, t.ACC_PAYMENTS.rows.find((p) => p.receipt_doc_id === id) ?? {}) : null,
    parent_no: t.ACC_DOCS.rows.find((d) => d.doc_id === doc.parent_doc_id)?.doc_no ?? "",
    files: t.ACC_FILES.rows.filter((f) => f.file_id && ids.has(f.doc_id)).map((f) => pick(FILE_COLUMNS, f)),
    jobs: t.PRODUCTION_JOBS.rows.filter((j) => j.job_id && j.doc_id && ids.has(j.doc_id)).map((j) => pick(JOB_COLUMNS, j)),
    chain, customer, customer_status: dev?.status ?? "",
    ...configOf(t), categories: PRODUCT_CATEGORIES, today: todayBkk(),
  };
}

/** หมายเหตุ: ที่อยู่/เลขผู้เสียภาษีของลูกค้าเก็บในเอกสาร (customer_address / customer_tax_id) เพราะระบบ Developer ไม่มีช่องนี้ */
function docRecord(v: { doc: Rec; totals: ReturnType<typeof calcTotals> }, cust: Customer, extra: Rec, now: string, actor: string, input: Record<string, unknown>): Rec {
  const s = (k: string) => String(input[k] ?? "").trim().slice(0, 300);
  return {
    ...Object.fromEntries(DOC_COLUMNS.map((c) => [c, ""])), ...v.doc,
    customer_id: cust.developer_id, customer_kind: cust.kind, customer_name: cust.name, customer_contact: v.doc.contact_name || cust.contact_name, customer_address: v.doc.customer_address, customer_tax_id: v.doc.customer_tax_id,
    contact_phone: v.doc.contact_phone || cust.phone, subtotal: String(v.totals.subtotal), discount: String(v.totals.discount), vat_rate: String(v.totals.vat_rate), vat: String(v.totals.vat), total: String(v.totals.total), wht_rate: String(v.totals.wht_rate), wht: String(v.totals.wht),
    ...extra, updated_by: actor, updated_at: now,
  };
}
const lineRows = (docId: string, lines: { product: string; category: string; description: string; qty: number; unit_price: number; amount: number; start_date: string; end_date: string }[]): Rec[] =>
  lines.map((l, i) => ({ ...Object.fromEntries(LINE_COLUMNS.map((c) => [c, ""])), line_id: crypto.randomUUID(), doc_id: docId, line_no: String(i + 1), product: l.product, category: l.category, description: l.description, qty: String(l.qty), unit_price: String(l.unit_price), amount: String(l.amount), start_date: l.start_date, end_date: l.end_date }));

export async function saveDoc(input: Record<string, unknown>, actor: string) {
  const t = await load();
  const { types } = configOf(t);
  const v = validateDoc(input, types, PRODUCT_CATEGORIES);
  if (!v.ok) throw new AccError(422, "ข้อมูลเอกสารไม่ถูกต้อง กรุณาตรวจช่องที่ระบุ", "VALIDATION", { fields: v.errors });
  const cust = customersOf(t).find((c) => c.developer_id === v.doc.customer_id);
  if (!cust) throw new AccError(422, "ไม่พบลูกค้านี้ในรายชื่อ Developer / Home Builder", "VALIDATION", { fields: { customer_id: "เลือกลูกค้าจากรายชื่อ" } });
  const now = new Date().toISOString();
  const id = String(input.doc_id ?? "");
  if (id) {
    const i = t.ACC_DOCS.rows.findIndex((d) => d.doc_id === id);
    if (i < 0) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
    const prev = t.ACC_DOCS.rows[i];
    if (String(input.updated_at_seen ?? "") !== prev.updated_at) throw new AccError(409, "เอกสารนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
    if (prev.status === "cancelled") throw new AccError(409, "เอกสารที่ยกเลิกแล้วแก้ไขไม่ได้", "LOCKED");
    if (Number(prev.paid_amount) > 0 || t.ACC_DOCS.rows.some((d) => d.parent_doc_id === id)) throw new AccError(409, "เอกสารที่มีการชำระเงินหรือถูกสร้างใบต่อไปแล้วแก้ไขไม่ได้ — ยกเลิกแล้วออกใบใหม่แทน", "LOCKED");
    const rec = docRecord(v, cust, { doc_id: id, doc_type: prev.doc_type, doc_no: prev.doc_no, status: prev.status, root_id: prev.root_id, parent_doc_id: prev.parent_doc_id, paid_amount: prev.paid_amount, work_started_at: prev.work_started_at, created_by: prev.created_by, created_at: prev.created_at }, now, actor, input);
    const g = await guardRow("ACC_DOCS", t.ACC_DOCS.headers, "doc_id", id, i + 2, prev.updated_at);
    if (!("row" in g)) throw new AccError(409, "เอกสารนี้ถูกแก้ไขหรือลบโดยผู้อื่น กรุณาโหลดใหม่", "STALE");
    await batchUpdateValues([{ range: rowRange("ACC_DOCS", t.ACC_DOCS.headers, g.row), values: [toRow(t.ACC_DOCS.headers, rec)] }]);
    await replaceLines(t, id, lineRows(id, v.lines));
    await rememberCustomer(t, rec, actor);
    await writeAudit(actor, "account_doc_update", "account_doc", id, `${rec.doc_no} รวม ${rec.total}`);
    return { doc: pick(DOC_COLUMNS, rec), created: false };
  }
  const docId = crypto.randomUUID(), type = v.doc.doc_type as DocType;
  const no = nextDocNo(type, t.ACC_DOCS.rows.map((d) => d.doc_no), v.doc.doc_date);
  const rec = docRecord(v, cust, { doc_id: docId, doc_no: no, status: "draft", root_id: docId, paid_amount: "0", created_by: actor, created_at: now }, now, actor, input);
  await appendRows("ACC_DOCS", [toRow(t.ACC_DOCS.headers, rec)]);
  rec.doc_no = await dedupeCode("ACC_DOCS", t.ACC_DOCS.headers, "doc_no", "doc_id", docId, no, (codes) => nextDocNo(type, codes, v.doc.doc_date));
  await appendRows("ACC_LINES", lineRows(docId, v.lines).map((l) => toRow(t.ACC_LINES.headers, l)));
  await rememberCustomer(t, rec, actor);
  await writeAudit(actor, "account_doc_create", "account_doc", docId, `${rec.doc_no} ${cust.name} รวม ${rec.total}`);
  return { doc: pick(DOC_COLUMNS, rec), created: true };
}

/** จำผู้ติดต่อ / เบอร์ / ที่อยู่ / เลขผู้เสียภาษี ตามลูกค้า — ค่าที่กรอกในเอกสารล่าสุดชนะ (ช่องว่างไม่ลบค่าที่จำไว้) · พลาดไม่ทำให้การบันทึกเอกสารล้ม */
async function rememberCustomer(t: Record<string, Tab>, doc: Rec, actor: string) {
  if (!t[PROFILE_TAB].headers.includes("developer_id")) return;
  try {
    const i = t[PROFILE_TAB].rows.findIndex((r) => r.developer_id === doc.customer_id);
    const prev = i >= 0 ? t[PROFILE_TAB].rows[i] : {};
    const rec: Rec = { developer_id: doc.customer_id, contact_name: doc.contact_name || prev.contact_name || "", phone: doc.contact_phone || prev.phone || "", address: doc.customer_address || prev.address || "", tax_id: doc.customer_tax_id || prev.tax_id || "", updated_by: actor, updated_at: new Date().toISOString() };
    if (i >= 0 && ["contact_name", "phone", "address", "tax_id"].every((k) => rec[k] === (prev[k] ?? ""))) return;
    if (i >= 0) {
      const g = await guardRow(PROFILE_TAB, t[PROFILE_TAB].headers, "developer_id", doc.customer_id, i + 2);
      if ("row" in g) await batchUpdateValues([{ range: rowRange(PROFILE_TAB, t[PROFILE_TAB].headers, g.row), values: [toRow(t[PROFILE_TAB].headers, rec)] }]);
    } else await appendRows(PROFILE_TAB, [toRow(t[PROFILE_TAB].headers, rec)]);
    if (i >= 0) Object.assign(t[PROFILE_TAB].rows[i], rec); else t[PROFILE_TAB].rows.push(rec);
  } catch { /* จำไม่สำเร็จก็ไม่เป็นไร ครั้งหน้ากรอกใหม่ */ }
}

/** แทนที่รายการสินค้าของเอกสาร (ลบแถวเดิมจากล่างขึ้นบน แล้วเพิ่มใหม่) */
async function replaceLines(t: Record<string, Tab>, docId: string, fresh: Rec[]) {
  const sid = (await listTabs()).find((m) => m.title === "ACC_LINES")!.sheetId;
  const rows = t.ACC_LINES.rows.map((l, k) => (l.doc_id === docId ? k + 2 : 0)).filter(Boolean).sort((a, b) => b - a);
  for (const r of rows) { const g = await guardRow("ACC_LINES", t.ACC_LINES.headers, "line_id", t.ACC_LINES.rows[r - 2].line_id, r); if ("row" in g) await deleteRow(sid, g.row); }
  await appendRows("ACC_LINES", fresh.map((l) => toRow(t.ACC_LINES.headers, l)));
}

/** สร้างใบถัดไปจากใบที่มีอยู่ (คัดลอกรายการ) · มีใบชนิดเดียวกันที่สร้างจากใบนี้แล้ว → คืนใบเดิม ไม่สร้างซ้ำ */
export async function convertDoc(id: string, to: DocType, actor: string) {
  const t = await load();
  const src = t.ACC_DOCS.rows.find((d) => d.doc_id === id);
  if (!src) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  if (src.status === "cancelled") throw new AccError(409, "เอกสารที่ยกเลิกแล้วสร้างใบต่อไม่ได้", "LOCKED");
  if (!NEXT_TYPES[src.doc_type as DocType]?.includes(to)) throw new AccError(422, `${DOC_LABEL[src.doc_type as DocType]} สร้าง ${DOC_LABEL[to]} ต่อไม่ได้`, "BAD_FLOW");
  const existing = t.ACC_DOCS.rows.find((d) => d.parent_doc_id === id && d.doc_type === to && d.status !== "cancelled");
  if (existing) return { doc: pick(DOC_COLUMNS, existing), created: false };
  const now = new Date().toISOString(), docId = crypto.randomUUID(), date = todayBkk();
  const no = nextDocNo(to, t.ACC_DOCS.rows.map((d) => d.doc_no), date);
  const rec: Rec = { ...pick(DOC_COLUMNS, src), doc_id: docId, doc_type: to, doc_no: no, doc_date: date, due_date: addDays(date, DEFAULT_DUE_DAYS), status: "draft", root_id: src.root_id || src.doc_id, parent_doc_id: id, paid_amount: "0", work_started_at: "", created_by: actor, created_at: now, updated_by: actor, updated_at: now };
  await appendRows("ACC_DOCS", [toRow(t.ACC_DOCS.headers, rec)]);
  rec.doc_no = await dedupeCode("ACC_DOCS", t.ACC_DOCS.headers, "doc_no", "doc_id", docId, no, (codes) => nextDocNo(to, codes, date));
  const lines = t.ACC_LINES.rows.filter((l) => l.doc_id === id).map((l) => ({ ...pick(LINE_COLUMNS, l), line_id: crypto.randomUUID(), doc_id: docId, product_id: "", job_id: "", applied_at: "" }));
  await appendRows("ACC_LINES", lines.map((l) => toRow(t.ACC_LINES.headers, l)));
  await writeAudit(actor, "account_doc_convert", "account_doc", docId, `${src.doc_no} → ${rec.doc_no}`);
  return { doc: pick(DOC_COLUMNS, rec), created: true };
}

export async function setDocStatus(id: string, status: string, actor: string) {
  const t = await load();
  const i = t.ACC_DOCS.rows.findIndex((d) => d.doc_id === id);
  if (i < 0) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  const prev = t.ACC_DOCS.rows[i];
  if (!(MANUAL_STATUS as string[]).includes(status)) throw new AccError(422, "สถานะนี้ตั้งเองไม่ได้ (ชำระบางส่วน / ชำระแล้ว ระบบตั้งจากการยืนยันชำระเงิน)", "VALIDATION");
  if (Number(prev.paid_amount) > 0) throw new AccError(409, "เอกสารที่มีการชำระเงินแล้วเปลี่ยนสถานะเองไม่ได้", "LOCKED");
  const rec = { ...prev, status, updated_by: actor, updated_at: new Date().toISOString() };
  const g = await guardRow("ACC_DOCS", t.ACC_DOCS.headers, "doc_id", id, i + 2);
  if (!("row" in g)) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  await batchUpdateValues([{ range: rowRange("ACC_DOCS", t.ACC_DOCS.headers, g.row), values: [toRow(t.ACC_DOCS.headers, rec)] }]);
  await writeAudit(actor, "account_doc_status", "account_doc", id, `${prev.doc_no}: ${prev.status} → ${status}`);
  return { doc: pick(DOC_COLUMNS, rec) };
}

/**
 * เริ่มงาน: เพิ่ม Product ให้ลูกค้า (DEVELOPER_PRODUCTS ผ่าน saveProduct → Status ลูกค้าเปลี่ยนตามวัน Product) + สร้าง Job ต่อรายการ
 * ตรวจทุกรายการก่อนเขียนอะไร (วันเริ่ม/สิ้นสุด · ชื่อ Product ยังอยู่ในรายการ · ลูกค้ายังอยู่) เพื่อไม่ให้เหลือครึ่ง ๆ กลาง ๆ
 */
async function applyWork(t: Record<string, Tab>, doc: Rec, actor: string) {
  const rootId = doc.root_id || doc.doc_id;
  const root = t.ACC_DOCS.rows.find((d) => d.doc_id === rootId) ?? doc;
  if (root.work_started_at) throw new AccError(409, "สายเอกสารนี้เริ่มงานไปแล้ว", "ALREADY_STARTED");
  const dev = t.DEVELOPERS.rows.find((r) => r.developer_id === doc.customer_id);
  if (!dev) throw new AccError(404, "ไม่พบลูกค้าในรายชื่อ Developer / Home Builder (อาจถูกลบ) — เพิ่มลูกค้าก่อนเริ่มงาน", "CUSTOMER_GONE");
  const lines = t.ACC_LINES.rows.filter((l) => l.doc_id === doc.doc_id).sort((a, b) => Number(a.line_no) - Number(b.line_no));
  if (!lines.length) throw new AccError(422, "เอกสารไม่มีรายการสินค้า", "VALIDATION");
  const fields = missingDates(lines);
  const { types } = configOf(t);
  lines.forEach((l, i) => { const p = validateProduct({ product: l.product, category: l.category, start_date: l.start_date, end_date: l.end_date, price_thb: l.amount }, types); if (!p.ok && !fields[`lines.${i}.start_date`] && !fields[`lines.${i}.end_date`]) Object.entries(p.errors).forEach(([k, m]) => { if (k === "product") fields[`lines.${i}.product`] = m; }); });
  if (Object.keys(fields).length) throw new AccError(422, "ต้องมีวันเริ่ม–สิ้นสุดของทุกรายการก่อนเริ่มงาน (ใช้สร้าง Product ของลูกค้า) — แก้ที่เอกสารแล้วลองใหม่", "VALIDATION", { fields });
  const now = new Date().toISOString(), codes = t.PRODUCTION_JOBS.rows.map((j) => j.job_code), made: Rec[] = [];
  const updates: { range: string; values: (string | number)[][] }[] = [];
  for (const l of lines) {
    try {
      const r = await saveProduct({ developer_id: dev.developer_id, product: l.product, category: l.category, start_date: l.start_date, end_date: l.end_date, price_thb: l.amount, notes: `จากเอกสาร ${doc.doc_no}` }, actor);
      const code = nextJobCode(codes); codes.push(code);
      const items = checklistOf(l.description, l.product);
      const job: Rec = { ...Object.fromEntries(JOB_COLUMNS.map((c) => [c, ""])), job_id: crypto.randomUUID(), job_code: code, doc_id: doc.doc_id, doc_no: doc.doc_no, line_id: l.line_id, developer_id: dev.developer_id, customer_name: doc.customer_name,
        job_title: doc.job_title, product: l.product, category: l.category, start_date: l.start_date, end_date: l.end_date, checklist: items.join("|"), status: JOB_STATUS[0], created_by: actor, created_at: now, updated_by: actor, updated_at: now };
      made.push(job);
      const k = t.ACC_LINES.rows.findIndex((x) => x.line_id === l.line_id);
      Object.assign(t.ACC_LINES.rows[k], { product_id: r.product.product_id, job_id: job.job_id, applied_at: now });
      updates.push({ range: rowRange("ACC_LINES", t.ACC_LINES.headers, k + 2), values: [toRow(t.ACC_LINES.headers, t.ACC_LINES.rows[k])] });
    } catch (e) { sheetErr(e); }
  }
  await appendRows("PRODUCTION_JOBS", made.map((j) => toRow(t.PRODUCTION_JOBS.headers, j)));
  const ri = t.ACC_DOCS.rows.findIndex((d) => d.doc_id === rootId);
  if (ri >= 0) { t.ACC_DOCS.rows[ri].work_started_at = now; updates.push({ range: rowRange("ACC_DOCS", t.ACC_DOCS.headers, ri + 2), values: [toRow(t.ACC_DOCS.headers, t.ACC_DOCS.rows[ri])] }); }
  await batchUpdateValues(updates);
  await writeAudit(actor, "account_work_start", "account_doc", doc.doc_id, `${doc.doc_no} → ${dev.dev_code}: Product ${lines.length} รายการ · Job ${made.map((j) => j.job_code).join(", ")}`);
  // สร้างการ์ด Content ตามจำนวนโพสต์ของ Product (best-effort: พลาดก็ไม่ให้เปิดงานล้ม — สร้างการ์ดเองที่บอร์ดได้)
  let cards = 0;
  try { cards = (await createCardsForJobs(made.map((j) => ({ job_id: j.job_id, job_code: j.job_code, product: j.product, doc_id: doc.doc_id, developer_id: dev.developer_id, customer_name: doc.customer_name, job_title: doc.job_title })), actor)).created; } catch { /* ไม่กระทบการเปิดงาน */ }
  return { products: lines.length, cards, jobs: made.map((j) => ({ job_id: j.job_id, job_code: j.job_code, product: j.product })) };
}

export type Upload = { name: string; type: string; data: ArrayBuffer };
/** ต้องแนบเอกสารยืนยันการชำระเงิน (สลิป / PDF) ทุกครั้ง — ตรวจและเช็กที่เก็บไฟล์ก่อนบันทึกชำระ จะได้ไม่มีเงินเข้าแต่ไม่มีหลักฐาน */
export async function confirmPayment(id: string, input: Record<string, unknown>, actor: string, file?: Upload) {
  const t = await load();
  const i = t.ACC_DOCS.rows.findIndex((d) => d.doc_id === id);
  if (i < 0) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  const doc = t.ACC_DOCS.rows[i];
  if (doc.status === "cancelled") throw new AccError(409, "เอกสารที่ยกเลิกแล้วยืนยันชำระเงินไม่ได้", "LOCKED");
  if (doc.doc_type === "receipt") throw new AccError(422, "ใบเสร็จออกจากการยืนยันชำระเงินของใบเสนอราคา / ใบวางบิล / ใบแจ้งหนี้ — ยืนยันชำระที่ใบเหล่านั้น", "BAD_FLOW");
  if (String(input.updated_at_seen ?? "") !== doc.updated_at) throw new AccError(409, "เอกสารนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  const paid = round2(t.ACC_PAYMENTS.rows.filter((p) => p.doc_id === id).reduce((s, p) => s + Number(p.amount || 0), 0));
  const p = validatePayment(input, payableOf(doc), paid, todayBkk()); // ยอดที่ต้องชำระ = ยอดรวม − หัก ณ ที่จ่าย
  if (!p.ok) throw new AccError(422, "ข้อมูลการชำระเงินไม่ถูกต้อง", "VALIDATION", { fields: p.errors });
  if (!file || !file.data.byteLength) throw new AccError(422, "ต้องแนบเอกสารยืนยันการชำระเงิน (สลิป / PDF) ทุกครั้งก่อนยืนยัน", "VALIDATION", { fields: { slip: "แนบสลิปหรือเอกสารยืนยันการชำระเงิน (PDF / PNG / JPG ไม่เกิน 10 MB)" } });
  if (!FILE_TYPES.includes(file.type)) throw new AccError(422, "เอกสารยืนยันการชำระเงินแนบได้เฉพาะ PDF / PNG / JPG", "VALIDATION", { fields: { slip: "ชนิดไฟล์ต้องเป็น PDF / PNG / JPG" } });
  if (file.data.byteLength > MAX_FILE_BYTES) throw new AccError(422, "ไฟล์ใหญ่เกิน 10 MB", "VALIDATION", { fields: { slip: "ไฟล์ใหญ่เกิน 10 MB" } });
  if (!(await fileStore())) throw new AccError(409, "ยังไม่ได้เปิดที่เก็บไฟล์ (Cloudflare KV) จึงแนบเอกสารยืนยันไม่ได้ — ดูขั้นตอนใน SETUP.md", "STORAGE_NOT_READY");
  // เต็มจำนวน แต่ยังเริ่มงานไม่ได้ (ขาดวันที่/ลูกค้า) → ปฏิเสธก่อนบันทึกชำระ จะได้ไม่มีเงินเข้าแต่ไม่มีงาน
  const root = t.ACC_DOCS.rows.find((d) => d.doc_id === (doc.root_id || doc.doc_id)) ?? doc;
  const willStart = p.full && !root.work_started_at;
  if (willStart) {
    const f = missingDates(t.ACC_LINES.rows.filter((l) => l.doc_id === id));
    if (Object.keys(f).length) throw new AccError(422, "ยืนยันชำระเต็มจำนวนแล้วระบบจะเริ่มงานอัตโนมัติ — ต้องมีวันเริ่ม–สิ้นสุดของทุกรายการก่อน (แก้ที่เอกสาร)", "VALIDATION", { fields: f });
  }
  const now = new Date().toISOString(), pid = crypto.randomUUID();
  const pay: Rec = { payment_id: pid, doc_id: id, root_id: doc.root_id || id, amount: String(p.amount), paid_at: String(input.paid_at), method: String(input.method), ref: String(input.ref ?? "").trim(), note: String(input.note ?? "").trim(), confirmed_by: actor, confirmed_at: now };
  await appendRows("ACC_PAYMENTS", [toRow(t.ACC_PAYMENTS.headers, pay)]);
  t.ACC_PAYMENTS.rows.push(pay);
  const total = round2(paid + p.amount);
  const rec: Rec = { ...doc, paid_amount: String(total), status: statusFromPaid(doc.status, payableOf(doc), total), updated_by: actor, updated_at: now };
  const g = await guardRow("ACC_DOCS", t.ACC_DOCS.headers, "doc_id", id, i + 2);
  if (!("row" in g)) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  await batchUpdateValues([{ range: rowRange("ACC_DOCS", t.ACC_DOCS.headers, g.row), values: [toRow(t.ACC_DOCS.headers, rec)] }]);
  t.ACC_DOCS.rows[i] = rec;
  await writeAudit(actor, "account_payment", "account_doc", id, `${doc.doc_no}: ชำระ ${p.amount} (${pay.method}) รวม ${total}/${doc.total}`);
  // บันทึกชำระแล้ว แต่เริ่มงานล้มเหลว (เช่น Sheets ขัดข้อง) → ไม่ให้ทั้งคำขอล้ม: แจ้งเหตุผล และให้กดปุ่ม "เริ่มงาน" ซ้ำได้ (applyWork ตรวจก่อนเขียน)
  let receipt: Rec | null = null, receiptError = "";
  try { receipt = await createReceipt(t, rec, pay, paid === 0 && p.full, actor); } catch (e) { receiptError = e instanceof Error ? e.message : "ออกใบเสร็จไม่สำเร็จ"; }
  let fileError = "";
  try { await attachFile(id, pid, file, actor); } catch (e) { fileError = e instanceof Error ? e.message : "แนบไฟล์ไม่สำเร็จ"; }
  let started: Awaited<ReturnType<typeof applyWork>> | null = null, startError = "";
  if (willStart) { try { started = await applyWork(t, rec, actor); } catch (e) { startError = e instanceof Error ? e.message : "เริ่มงานไม่สำเร็จ"; } }
  return { payment: pay, doc: pick(DOC_COLUMNS, rec), receipt: receipt ? pick(DOC_COLUMNS, receipt) : null, receiptError, fileError, full: p.full, started, startError, canStart: !started && !root.work_started_at };
}

/**
 * ใบเสร็จรับเงิน — ออกหนึ่งใบต่อการชำระหนึ่งครั้ง (มัดจำ = ใบเสร็จมัดจำ) เลขที่ RC+ปีเดือน+ลำดับ
 * ชำระเต็มในครั้งเดียว → คัดลอกรายการ/ยอดจากเอกสารต้นทาง · ชำระเป็นงวด → หนึ่งบรรทัด "ชำระ… ตาม <เลขที่เอกสาร>" ยอดเท่าที่รับจริง
 * ผูกกับการชำระผ่าน ACC_PAYMENTS.receipt_doc_id (ออกซ้ำไม่ได้: มีแล้วคืนใบเดิม)
 */
async function createReceipt(t: Record<string, Tab>, src: Rec, pay: Rec, wholeInOne: boolean, actor: string): Promise<Rec> {
  const pi = t.ACC_PAYMENTS.rows.findIndex((x) => x.payment_id === pay.payment_id);
  const prevPay = pi >= 0 ? t.ACC_PAYMENTS.rows[pi] : pay;
  if (prevPay.receipt_doc_id) { const ex = t.ACC_DOCS.rows.find((d) => d.doc_id === prevPay.receipt_doc_id); if (ex) return ex; }
  if (!t.ACC_PAYMENTS.headers.includes("receipt_doc_id")) throw new AccError(409, "ยังออกใบเสร็จไม่ได้ — ให้ Super Admin กด เตรียม Google Sheet แล้วกด ออกใบเสร็จ ที่รายการชำระ", "SHEET_NOT_READY");
  const now = new Date().toISOString(), docId = crypto.randomUUID(), amount = Number(pay.amount), date = pay.paid_at;
  const no = nextDocNo("receipt", t.ACC_DOCS.rows.map((d) => d.doc_no), date);
  const base: Rec = { ...pick(DOC_COLUMNS, src), doc_id: docId, doc_type: "receipt", doc_no: no, doc_date: date, due_date: "", status: "paid", root_id: src.root_id || src.doc_id, parent_doc_id: src.doc_id, paid_amount: String(amount), work_started_at: "", note: "", created_by: actor, created_at: now, updated_by: actor, updated_at: now };
  let lines: Rec[];
  if (wholeInOne) lines = t.ACC_LINES.rows.filter((l) => l.doc_id === src.doc_id).map((l) => ({ ...pick(LINE_COLUMNS, l), line_id: crypto.randomUUID(), doc_id: docId, product_id: "", job_id: "", applied_at: "" }));
  else {
    Object.assign(base, { subtotal: String(amount), discount: "0", vat_rate: "0", vat: "0", total: String(amount), wht_rate: "0", wht: "0" });
    const before = round2(t.ACC_PAYMENTS.rows.slice(0, pi >= 0 ? pi : t.ACC_PAYMENTS.rows.length).filter((x) => x.doc_id === src.doc_id).reduce((s, x) => s + Number(x.amount || 0), 0));
    const full = round2(before + amount) >= payableOf(src);
    lines = lineRows(docId, [{ product: `ชำระ${full ? "ส่วนที่เหลือ" : "บางส่วน / มัดจำ"} ตาม${DOC_LABEL[src.doc_type as DocType]} ${src.doc_no}`, category: "", description: "", qty: 1, unit_price: amount, amount, start_date: "", end_date: "" }]);
  }
  await appendRows("ACC_DOCS", [toRow(t.ACC_DOCS.headers, base)]);
  base.doc_no = await dedupeCode("ACC_DOCS", t.ACC_DOCS.headers, "doc_no", "doc_id", docId, no, (codes) => nextDocNo("receipt", codes, date));
  await appendRows("ACC_LINES", lines.map((l) => toRow(t.ACC_LINES.headers, l)));
  t.ACC_DOCS.rows.push(base);
  if (pi >= 0) {
    const g = await guardRow("ACC_PAYMENTS", t.ACC_PAYMENTS.headers, "payment_id", pay.payment_id, pi + 2);
    if ("row" in g) { prevPay.receipt_doc_id = docId; await batchUpdateValues([{ range: rowRange("ACC_PAYMENTS", t.ACC_PAYMENTS.headers, g.row), values: [toRow(t.ACC_PAYMENTS.headers, prevPay)] }]); }
  }
  await writeAudit(actor, "account_receipt", "account_doc", docId, `${base.doc_no} ← ${src.doc_no} รับ ${amount} (${pay.method})`);
  return base;
}

/** ออกใบเสร็จให้การชำระที่ยังไม่มีใบเสร็จ (เช่น ชำระไว้ก่อนมีระบบใบเสร็จ หรือครั้งก่อนออกไม่สำเร็จ) */
export async function issueReceipt(paymentId: string, actor: string) {
  const t = await load();
  const pay = t.ACC_PAYMENTS.rows.find((x) => x.payment_id === paymentId);
  if (!pay) throw new AccError(404, "ไม่พบรายการชำระเงิน", "NOT_FOUND");
  const src = t.ACC_DOCS.rows.find((d) => d.doc_id === pay.doc_id);
  if (!src) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  if (pay.receipt_doc_id) { const ex = t.ACC_DOCS.rows.find((d) => d.doc_id === pay.receipt_doc_id); if (ex) return { receipt: pick(DOC_COLUMNS, ex), created: false }; }
  const others = round2(t.ACC_PAYMENTS.rows.filter((x) => x.doc_id === pay.doc_id && x.payment_id !== paymentId).reduce((s, x) => s + Number(x.amount || 0), 0));
  const r = await createReceipt(t, src, pay, others === 0 && round2(Number(pay.amount)) >= payableOf(src), actor);
  return { receipt: pick(DOC_COLUMNS, r), created: true };
}

/** ปุ่ม "เริ่มงาน" สำหรับกรณีชำระมัดจำ (ต้องมียอดชำระแล้วอย่างน้อยบางส่วน) */
export async function startWork(id: string, actor: string) {
  const t = await load();
  const doc = t.ACC_DOCS.rows.find((d) => d.doc_id === id);
  if (!doc) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  if (doc.status === "cancelled") throw new AccError(409, "เอกสารที่ยกเลิกแล้วเริ่มงานไม่ได้", "LOCKED");
  if (doc.doc_type === "receipt") throw new AccError(422, "เริ่มงานจากใบเสร็จไม่ได้ — กดที่ใบเสนอราคา / ใบวางบิล / ใบแจ้งหนี้", "BAD_FLOW");
  if (!(Number(doc.paid_amount) > 0)) throw new AccError(409, "ต้องยืนยันการชำระเงิน (อย่างน้อยมัดจำ) ก่อนเริ่มงาน", "NOT_PAID");
  return { started: await applyWork(t, doc, actor) };
}

// ── ไฟล์แนบ (เก็บใน Cloudflare KV ผ่าน binding ACC_FILES — แผนฟรี ไม่ต้องผูกบัตร: 1 GB, ไฟล์ละไม่เกิน 25 MiB — ดู SETUP.md) ──
export type FileStore = { put(key: string, value: ArrayBuffer): Promise<unknown>; delete?(key: string): Promise<unknown>; get(key: string, type: "stream"): Promise<ReadableStream | null> };
let storeOverride: FileStore | null = null;
/** ใช้ในเทสต์เท่านั้น: แทนที่ที่เก็บไฟล์ด้วยตัวจำลอง */
export const setFileStoreForTest = (s: FileStore | null) => { storeOverride = s; };
export async function fileStore(): Promise<FileStore | null> {
  if (storeOverride) return storeOverride;
  try { const { getCloudflareContext } = await import("@opennextjs/cloudflare"); const b = (getCloudflareContext().env as unknown as Record<string, unknown>).ACC_FILES; return (b as FileStore) ?? null; } catch { return null; }
}
export async function attachFile(docId: string, paymentId: string, file: { name: string; type: string; data: ArrayBuffer }, actor: string) {
  if (!FILE_TYPES.includes(file.type)) throw new AccError(422, "แนบได้เฉพาะ PDF / PNG / JPG", "VALIDATION");
  if (file.data.byteLength > MAX_FILE_BYTES) throw new AccError(422, "ไฟล์ใหญ่เกิน 10 MB", "VALIDATION");
  const store = await fileStore();
  if (!store) throw new AccError(409, "ยังไม่ได้เปิดที่เก็บไฟล์ (Cloudflare KV) — ดูขั้นตอนใน SETUP.md", "STORAGE_NOT_READY");
  const t = await load();
  if (!t.ACC_DOCS.rows.some((d) => d.doc_id === docId)) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  if (!t.ACC_FILES.headers.includes("file_id")) throw new AccError(409, "แท็บไฟล์แนบยังไม่พร้อม — กด เตรียม Google Sheet", "SHEET_NOT_READY");
  const fileId = crypto.randomUUID(), name = file.name.replace(/[^\p{L}\p{N}._\- ()]/gu, "_").slice(0, 120) || "file";
  const key = `acc/${docId}/${fileId}`;
  await store.put(key, file.data);
  const rec: Rec = { file_id: fileId, doc_id: docId, payment_id: paymentId, file_name: name, mime: file.type, size: String(file.data.byteLength), storage_key: key, uploaded_by: actor, uploaded_at: new Date().toISOString() };
  await appendRows("ACC_FILES", [toRow(t.ACC_FILES.headers, rec)]);
  await writeAudit(actor, "account_file_attach", "account_doc", docId, `${name} (${file.data.byteLength} bytes)`);
  return { file: pick(FILE_COLUMNS, rec) };
}
export async function openFile(fileId: string) {
  const t = await load();
  const f = t.ACC_FILES.rows.find((x) => x.file_id === fileId);
  if (!f) throw new AccError(404, "ไม่พบไฟล์", "NOT_FOUND");
  const store = await fileStore(); const body = store ? await store.get(f.storage_key, "stream") : null;
  if (!body) throw new AccError(404, "ไม่พบไฟล์ในที่เก็บ", "NOT_FOUND");
  return { body, name: f.file_name, mime: f.mime };
}

/** ลบไฟล์แนบ (Super Admin เท่านั้น — ตรวจที่ API) · ลบแถวใน ACC_FILES แล้วลบตัวไฟล์ใน KV */
export async function deleteFile(fileId: string, actor: string) {
  const t = await load();
  const i = t.ACC_FILES.rows.findIndex((x) => x.file_id === fileId);
  if (i < 0) throw new AccError(404, "ไม่พบไฟล์", "NOT_FOUND");
  const f = t.ACC_FILES.rows[i];
  await deleteRowsBy(t, "ACC_FILES", "file_id", [fileId]);
  try { const store = await fileStore(); await store?.delete?.(f.storage_key); } catch { /* แถวถูกลบแล้ว ตัวไฟล์ที่ค้างไม่มีใครเข้าถึงได้ */ }
  await writeAudit(actor, "account_file_delete", "account_doc", f.doc_id, `${f.file_name}`);
  return { deleted: fileId };
}

/** ลบแถวตามค่าคีย์ (ตรวจแถวก่อนลบทุกแถว · ลบจากล่างขึ้นบน) */
async function deleteRowsBy(t: Record<string, Tab>, tab: string, idCol: string, ids: string[]) {
  const set = new Set(ids);
  const idx = t[tab].rows.map((r, k) => (set.has(r[idCol]) ? k + 2 : 0)).filter(Boolean).sort((a, b) => b - a);
  if (!idx.length) return;
  const sid = (await listTabs()).find((m) => m.title === tab)!.sheetId;
  for (const r of idx) { const g = await guardRow(tab, t[tab].headers, idCol, t[tab].rows[r - 2][idCol], r); if ("row" in g) await deleteRow(sid, g.row); }
}

/**
 * ลบเอกสาร (Super Admin เท่านั้น — ตรวจที่ API) พร้อมรายการสินค้า รายการชำระ ไฟล์แนบ และใบเสร็จของใบนั้น
 * ลบไม่ได้ถ้ามีใบถัดไปที่สร้างต่อแล้ว (ลบใบถัดไปก่อน) หรือมีงาน Production ที่สร้างจากใบนี้แล้ว (ไปยกเลิกงานที่หน้า Production)
 * ลบ "ใบเสร็จ" ใบเดียว = ล้างลิงก์ที่รายการชำระ แล้วกด ออกใบเสร็จ ใหม่ได้
 */
/**
 * ⚠ โหมดทดสอบ (5/11/2026): false = ลบได้ทุกเอกสาร (รวมใบที่มีใบถัดไป / สร้างงานแล้ว — ลบ Job ของใบนั้นด้วย)
 * เทสเสร็จแล้วให้เปลี่ยนเป็น true เพื่อกลับไปใช้กติกาเดิม (ลบไม่ได้ถ้ามีใบถัดไปหรือมีงาน Production)
 */
export const DELETE_RESTRICTED = false;
export async function deleteDoc(id: string, actor: string) {
  const t = await load();
  const doc = t.ACC_DOCS.rows.find((d) => d.doc_id === id);
  if (!doc) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  if (DELETE_RESTRICTED && t.ACC_DOCS.rows.some((d) => d.parent_doc_id === id && d.doc_type !== "receipt")) throw new AccError(409, "มีใบถัดไปที่สร้างต่อจากใบนี้แล้ว — ลบใบถัดไปก่อน", "LOCKED");
  if (DELETE_RESTRICTED && t.PRODUCTION_JOBS.rows.some((j) => j.job_id && j.doc_id === id)) throw new AccError(409, "ใบนี้เริ่มงานและสร้างงาน Production ไปแล้ว — ลบไม่ได้ (ถ้าไม่ใช้แล้วให้ยกเลิกเอกสาร / ยกเลิก Job)", "LOCKED");
  const receipts = t.ACC_DOCS.rows.filter((d) => d.parent_doc_id === id && d.doc_type === "receipt").map((d) => d.doc_id);
  const gone = [id, ...receipts], goneSet = new Set(gone);
  const files = t.ACC_FILES.rows.filter((f) => f.file_id && goneSet.has(f.doc_id));
  await deleteRowsBy(t, "ACC_LINES", "doc_id", gone);
  await deleteRowsBy(t, "ACC_PAYMENTS", "doc_id", gone);
  await deleteRowsBy(t, "ACC_FILES", "doc_id", gone);
  if (doc.doc_type === "receipt") {
    const pi = t.ACC_PAYMENTS.rows.findIndex((p) => p.receipt_doc_id === id);
    if (pi >= 0) { const g = await guardRow("ACC_PAYMENTS", t.ACC_PAYMENTS.headers, "payment_id", t.ACC_PAYMENTS.rows[pi].payment_id, pi + 2); if ("row" in g) await batchUpdateValues([{ range: rowRange("ACC_PAYMENTS", t.ACC_PAYMENTS.headers, g.row), values: [toRow(t.ACC_PAYMENTS.headers, { ...t.ACC_PAYMENTS.rows[pi], receipt_doc_id: "" })] }]); }
  }
  if (!DELETE_RESTRICTED) {
    // โหมดทดสอบ: ลบ Job ของใบนี้ และถ้าสายเอกสารไม่เหลือ Job แล้ว ล้างธง "เริ่มงานแล้ว" ที่ใบแรก เพื่อทดสอบเริ่มงานซ้ำได้ (Product ที่เพิ่มให้ลูกค้าแล้วไม่ถูกลบ)
    await deleteRowsBy(t, "PRODUCTION_JOBS", "doc_id", gone);
    const rootId = doc.root_id || doc.doc_id, ri = t.ACC_DOCS.rows.findIndex((d) => d.doc_id === rootId);
    const left = t.PRODUCTION_JOBS.rows.some((j) => j.job_id && !goneSet.has(j.doc_id) && t.ACC_DOCS.rows.some((d) => d.doc_id === j.doc_id && (d.root_id || d.doc_id) === rootId));
    if (ri >= 0 && !goneSet.has(rootId) && !left && t.ACC_DOCS.rows[ri].work_started_at) {
      const g = await guardRow("ACC_DOCS", t.ACC_DOCS.headers, "doc_id", rootId, ri + 2);
      if ("row" in g) await batchUpdateValues([{ range: rowRange("ACC_DOCS", t.ACC_DOCS.headers, g.row), values: [toRow(t.ACC_DOCS.headers, { ...t.ACC_DOCS.rows[ri], work_started_at: "" })] }]);
    }
  }
  await deleteRowsBy(t, "ACC_DOCS", "doc_id", gone);
  const store = await fileStore();
  for (const f of files) { try { await store?.delete?.(f.storage_key); } catch { /* ignore */ } }
  await writeAudit(actor, "account_doc_delete", "account_doc", id, `${doc.doc_no} (${DOC_LABEL[doc.doc_type as DocType]}) ${doc.customer_name} รวม ${doc.total} · ลบพร้อมใบเสร็จ ${receipts.length} · ไฟล์ ${files.length}`);
  return { deleted: id, receipts: receipts.length };
}

// ── Production Job ──
export async function listJobs() {
  const t = await load();
  return { jobs: t.PRODUCTION_JOBS.rows.filter((j) => j.job_id).map((j) => pick(JOB_COLUMNS, j)).sort((a, b) => b.created_at.localeCompare(a.created_at)), statuses: [...JOB_STATUS] };
}
export async function updateJob(id: string, patch: { status?: string; done_idx?: string; owner?: string; note?: string }, updatedAtSeen: string, actor: string) {
  const t = await load();
  const i = t.PRODUCTION_JOBS.rows.findIndex((j) => j.job_id === id);
  if (i < 0) throw new AccError(404, "ไม่พบ Job", "NOT_FOUND");
  const prev = t.PRODUCTION_JOBS.rows[i];
  if (updatedAtSeen !== prev.updated_at) throw new AccError(409, "Job นี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  const n = prev.checklist ? prev.checklist.split("|").length : 0;
  const rec: Rec = { ...prev, updated_by: actor, updated_at: new Date().toISOString() };
  if (patch.status !== undefined) { if (!(JOB_STATUS as readonly string[]).includes(patch.status)) throw new AccError(422, "สถานะไม่ถูกต้อง", "VALIDATION"); rec.status = patch.status; }
  if (patch.done_idx !== undefined) { const idx = [...new Set(patch.done_idx.split(",").map((x) => x.trim()).filter((x) => /^\d+$/.test(x) && Number(x) < n))].sort((a, b) => Number(a) - Number(b)); rec.done_idx = idx.join(","); }
  if (patch.owner !== undefined) rec.owner = patch.owner.trim().slice(0, 100);
  if (patch.note !== undefined) rec.note = patch.note.trim().slice(0, 1000);
  const g = await guardRow("PRODUCTION_JOBS", t.PRODUCTION_JOBS.headers, "job_id", id, i + 2, prev.updated_at);
  if (!("row" in g)) throw new AccError(409, "Job นี้ถูกแก้ไขหรือลบโดยผู้อื่น กรุณาโหลดใหม่", "STALE");
  await batchUpdateValues([{ range: rowRange("PRODUCTION_JOBS", t.PRODUCTION_JOBS.headers, g.row), values: [toRow(t.PRODUCTION_JOBS.headers, rec)] }]);
  await writeAudit(actor, "production_job_update", "production_job", id, `${prev.job_code}: ${prev.status} → ${rec.status}`);
  return { job: pick(JOB_COLUMNS, rec) };
}

// ── ลูกค้า (หน้ารายชื่อลูกค้า) ──
// ลูกค้า = แถวใน DEVELOPERS (Developer / Home Builder) เดียวกับหน้าอื่น + ที่อยู่/เลขผู้เสียภาษีที่เก็บใน ACC_CUSTOMERS
export async function listCustomers() {
  const t = await load();
  const docsOf = new Map<string, number>();
  for (const d of t.ACC_DOCS.rows) if (d.doc_id && d.customer_id) docsOf.set(d.customer_id, (docsOf.get(d.customer_id) ?? 0) + 1);
  const upd = new Map(t.DEVELOPERS.rows.map((r) => [r.developer_id, r.updated_at ?? ""]));
  return { customers: customersOf(t).map((c) => ({ ...c, updated_at: upd.get(c.developer_id) ?? "", docs: docsOf.get(c.developer_id) ?? 0 })) };
}
/** เพิ่ม / แก้ไขลูกค้า: ชื่อ ผู้ติดต่อ เบอร์ ไปที่ DEVELOPERS (เห็นในหน้า Developer / Home Builder ด้วย) · ที่อยู่ + เลขผู้เสียภาษี + ผู้ติดต่อ/เบอร์ ที่ใช้ในเอกสาร ไปที่ ACC_CUSTOMERS */
export async function saveCustomer(input: Record<string, unknown>, actor: string) {
  const v = validateCustomer(input);
  if (!v.ok) throw new AccError(422, "ข้อมูลลูกค้าไม่ถูกต้อง กรุณาตรวจช่องที่ระบุ", "VALIDATION", { fields: v.errors });
  const t = await load();
  const id = String(input.developer_id ?? "");
  let base: Rec = {};
  if (id) {
    const row = t.DEVELOPERS.rows.find((r) => r.developer_id === id);
    if (!row) throw new AccError(404, "ไม่พบลูกค้านี้ (อาจถูกลบไปแล้ว)", "NOT_FOUND");
    base = pick(DEV_COLUMNS, row);
  }
  const kind = id ? kindOf(base) : (v.rec.kind as "developer" | "home_builder");
  let dev;
  try {
    // แก้ไข: ส่งค่าเดิมของทุกช่องไปด้วย (หน้านี้แก้แค่ชื่อ/ผู้ติดต่อ/เบอร์) ไม่ให้ช่องอื่นของ Developer ถูกล้าง
    dev = (await saveDeveloper({ ...base, company_name: v.rec.company_name, contact_name: v.rec.contact_name, phone: v.rec.phone, ...(id ? { developer_id: id, updated_at_seen: String(input.updated_at_seen ?? "") } : { project_main: kind === "developer" ? v.rec.company_name : "" }), confirmDuplicate: input.confirmDuplicate === true }, actor, kind)).dev;
  } catch (e) { return sheetErr(e); }
  // ข้อมูลที่ใช้ในเอกสารเก็บตามที่กรอกตรง ๆ (ช่องว่าง = ล้างค่า ต่างจากการจำอัตโนมัติจากเอกสาร)
  if (!t[PROFILE_TAB].headers.includes("developer_id")) throw new AccError(409, "บันทึกชื่อ/ผู้ติดต่อ/เบอร์แล้ว แต่ยังเก็บที่อยู่และเลขผู้เสียภาษีไม่ได้ — ให้ Super Admin กด เตรียม Google Sheet แล้วบันทึกอีกครั้ง", "SHEET_NOT_READY");
  const i = t[PROFILE_TAB].rows.findIndex((r) => r.developer_id === dev.developer_id);
  const rec: Rec = { developer_id: dev.developer_id, contact_name: v.rec.contact_name, phone: v.rec.phone, address: v.rec.address, tax_id: v.rec.tax_id, updated_by: actor, updated_at: new Date().toISOString() };
  if (i >= 0) { const g = await guardRow(PROFILE_TAB, t[PROFILE_TAB].headers, "developer_id", dev.developer_id, i + 2); if ("row" in g) await batchUpdateValues([{ range: rowRange(PROFILE_TAB, t[PROFILE_TAB].headers, g.row), values: [toRow(t[PROFILE_TAB].headers, rec)] }]); else await appendRows(PROFILE_TAB, [toRow(t[PROFILE_TAB].headers, rec)]); }
  else await appendRows(PROFILE_TAB, [toRow(t[PROFILE_TAB].headers, rec)]);
  await writeAudit(actor, id ? "account_customer_update" : "account_customer_create", "account_customer", dev.developer_id, `${dev.dev_code} ${dev.company_name}`);
  return { customer: { developer_id: dev.developer_id, code: dev.dev_code, name: dev.company_name || dev.project_main }, created: !id };
}
/** ลบลูกค้า (Super Admin เท่านั้น — ตรวจที่ API) · ลบไม่ได้ถ้ามีเอกสารบัญชีของลูกค้านี้ · ลบแล้ว Product ของลูกค้าในหน้า Developer / Home Builder หายด้วย */
export async function deleteCustomer(id: string, updatedAtSeen: string, actor: string) {
  const t = await load();
  if (!t.DEVELOPERS.rows.some((r) => r.developer_id === id)) throw new AccError(404, "ไม่พบลูกค้านี้", "NOT_FOUND");
  const n = t.ACC_DOCS.rows.filter((d) => d.doc_id && d.customer_id === id).length;
  if (n) throw new AccError(409, `ลูกค้านี้มีเอกสารบัญชี ${n} ใบ — ลบเอกสารเหล่านั้นก่อน`, "LOCKED");
  try { await deleteDeveloper(id, updatedAtSeen, actor); } catch (e) { return sheetErr(e); }
  await deleteRowsBy(t, PROFILE_TAB, "developer_id", [id]);
  return { deleted: id };
}

// ── Product (ชนิด Product กลาง: ใช้ทั้งใบเอกสารและ Developer / Home Builder) ──
const TYPE_KEY = "developer_products";
async function writeTypes(t: Record<string, Tab>, next: string[]) {
  const i = t.APP_CONFIG.rows.findIndex((r) => r.config_key === TYPE_KEY);
  const row = { config_key: TYPE_KEY, config_value: next.join("|"), description: "ชนิด Product ที่ขายให้ Developer (คั่นด้วย |)", updated_at: new Date().toISOString() };
  if (i >= 0) await batchUpdateValues([{ range: rowRange("APP_CONFIG", t.APP_CONFIG.headers, i + 2), values: [toRow(t.APP_CONFIG.headers, row)] }]);
  else await appendRows("APP_CONFIG", [toRow(t.APP_CONFIG.headers, row)]);
}
const usage = (t: Record<string, Tab>, name: string) => ({ developers: t.DEVELOPER_PRODUCTS.rows.filter((r) => r.product_id && r.product === name).length, docs: t.ACC_LINES.rows.filter((r) => r.line_id && r.product === name).length });
export async function listProducts() {
  const t = await load();
  return { products: productTypesOf(t.APP_CONFIG.rows).map((name) => ({ name, ...usage(t, name) })) };
}
const cleanName = (v: unknown) => { const n = String(v ?? "").trim().replace(/\s+/g, " "); if (!n || n.length > 60 || n.includes("|")) throw new AccError(422, "ชื่อ Product ต้องมี 1–60 ตัวอักษร และไม่มีเครื่องหมาย |  เช่น Top ads", "VALIDATION", { fields: { name: "ชื่อ Product ต้องมี 1–60 ตัวอักษร และไม่มีเครื่องหมาย |" } }); return n; };
export async function addProduct(name: unknown, actor: string) {
  const n = cleanName(name), t = await load(), types = productTypesOf(t.APP_CONFIG.rows);
  if (types.some((x) => x.toLowerCase() === n.toLowerCase())) throw new AccError(409, `มี Product "${n}" อยู่แล้ว`, "DUPLICATE", { fields: { name: "ชื่อนี้มีอยู่แล้ว" } });
  await writeTypes(t, [...types, n]);
  await writeAudit(actor, "developer_product_type", "config", TYPE_KEY, `เพิ่ม ${n}`);
  return { products: [...types, n].map((x) => ({ name: x, ...usage(t, x) })) };
}
/** เปลี่ยนชื่อ Product: แก้ในรายการ + ทุกที่ที่ใช้ชื่อเดิม (Product ของ Developer / Home Builder · รายการในเอกสาร · งาน Production) */
export async function renameProduct(from: unknown, to: unknown, actor: string) {
  const old = String(from ?? ""), n = cleanName(to), t = await load(), types = productTypesOf(t.APP_CONFIG.rows);
  if (!types.includes(old)) throw new AccError(404, "ไม่พบ Product นี้ (อาจถูกเปลี่ยนชื่อหรือลบไปแล้ว) กรุณาโหลดใหม่", "NOT_FOUND");
  if (types.some((x) => x !== old && x.toLowerCase() === n.toLowerCase())) throw new AccError(409, `มี Product "${n}" อยู่แล้ว`, "DUPLICATE", { fields: { name: "ชื่อนี้มีอยู่แล้ว" } });
  if (n === old) return { products: types.map((x) => ({ name: x, ...usage(t, x) })), updated: 0 };
  const updates: { range: string; values: string[][] }[] = [];
  for (const [tab, col] of [["DEVELOPER_PRODUCTS", "product"], ["ACC_LINES", "product"], ["PRODUCTION_JOBS", "product"]] as const) {
    const h = t[tab].headers, c = h.indexOf(col); if (c < 0) continue;
    t[tab].rows.forEach((r, k) => { if (r[col] === old) updates.push({ range: `'${tab}'!${colLetter(c)}${k + 2}`, values: [[n]] }); });
  }
  await writeTypes(t, types.map((x) => (x === old ? n : x)));
  if (updates.length) await batchUpdateValues(updates);
  try { await renameProductInContent(old, n); } catch { /* ตั้งค่า/การ์ด Content ตามไม่ทัน — ไม่กระทบการเปลี่ยนชื่อ */ }
  await writeAudit(actor, "developer_product_type", "config", TYPE_KEY, `เปลี่ยนชื่อ ${old} → ${n} (แก้ ${updates.length} รายการที่ใช้อยู่)`);
  const t2 = await load();
  return { products: productTypesOf(t2.APP_CONFIG.rows).map((x) => ({ name: x, ...usage(t2, x) })), updated: updates.length };
}
/** ลบ Product: ลบไม่ได้ถ้ายังมี Developer / Home Builder หรือเอกสารใช้อยู่ (ให้เปลี่ยนชื่อแทน) และต้องเหลืออย่างน้อย 1 รายการ */
export async function deleteProduct(name: unknown, actor: string) {
  const old = String(name ?? ""), t = await load(), types = productTypesOf(t.APP_CONFIG.rows);
  if (!types.includes(old)) throw new AccError(404, "ไม่พบ Product นี้ (อาจถูกลบไปแล้ว) กรุณาโหลดใหม่", "NOT_FOUND");
  const u = usage(t, old);
  if (u.developers || u.docs) throw new AccError(409, `ลบ "${old}" ไม่ได้ — ยังถูกใช้อยู่ที่ Developer / Home Builder ${u.developers} รายการ และในเอกสาร ${u.docs} รายการ (ถ้าต้องการเปลี่ยนชื่อ ใช้ปุ่มแก้ไข)`, "IN_USE");
  if (types.length <= 1) throw new AccError(409, "ต้องเหลือ Product อย่างน้อย 1 รายการ", "LOCKED");
  await writeTypes(t, types.filter((x) => x !== old));
  await writeAudit(actor, "developer_product_type", "config", TYPE_KEY, `ลบ ${old}`);
  return { products: types.filter((x) => x !== old).map((x) => ({ name: x, ...usage(t, x) })) };
}

export { addProductType };
