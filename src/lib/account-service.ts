/**
 * ระบบบัญชี — อ่าน/เขียน Google Sheets (แท็บ ACC_DOCS / ACC_LINES / ACC_PAYMENTS / ACC_FILES / PRODUCTION_JOBS)
 * - รายการสินค้า = Product เดียวกับ Developer / Home Builder (ชื่อ Product มาจาก APP_CONFIG: developer_products)
 * - ยืนยันชำระเต็ม → เพิ่ม Product ให้ลูกค้าตาม customer_id (แถวใน DEVELOPERS) + สร้าง Job (หนึ่งรายการสินค้า = หนึ่ง Job)
 * - ชำระมัดจำ → ยังไม่เริ่มงาน จนกดปุ่ม "เริ่มงาน" (startWork) · เริ่มงานได้ครั้งเดียวต่อสายเอกสาร (ใบเสนอราคา → วางบิล → แจ้งหนี้)
 */
import { writeAudit } from "./audit";
import {
  calcTotals, checklistOf, DOC_COLUMNS, DOC_LABEL, FILE_COLUMNS, FILE_TYPES, JOB_COLUMNS, JOB_STATUS, LINE_COLUMNS, MANUAL_STATUS, MAX_FILE_BYTES, missingDates, nextDocNo, nextJobCode, NEXT_TYPES, parseSeller,
  PAYMENT_COLUMNS, round2, statusFromPaid, validateDoc, validatePayment, type Customer, type DocType, type Rec,
} from "./account";
import { kindOf, PRODUCT_CATEGORIES, todayBkk, validateProduct } from "./developers";
import { productTypesOf, saveProduct, DevError, addProductType } from "./developers-service";
import { dedupeCode, guardRow } from "./row-guard";
import { appendRows, batchUpdateValues, colLetter, deleteRow, listTabs, readTabs, toRow } from "./sheets";

export class AccError extends Error {
  constructor(public status: number, message: string, public code: string, public extra: { fields?: Record<string, string> } = {}) { super(message); }
}
type Tab = { headers: string[]; rows: Rec[] };
const TABS = ["ACC_DOCS", "ACC_LINES", "ACC_PAYMENTS", "ACC_FILES", "PRODUCTION_JOBS", "DEVELOPERS", "DEVELOPER_PRODUCTS", "APP_CONFIG"];

async function load(): Promise<Record<string, Tab>> {
  let t: Record<string, Tab>;
  try { t = await readTabs(TABS); } catch { throw new AccError(409, "ยังไม่มีแท็บระบบบัญชี — ให้ Super Admin กด ตั้งค่า → ตั้งค่าระบบ → เตรียม Google Sheet", "SHEET_NOT_READY"); }
  if (!t.ACC_DOCS.headers.includes("doc_id") || !t.ACC_LINES.headers.includes("line_id") || !t.ACC_PAYMENTS.headers.includes("payment_id") || !t.PRODUCTION_JOBS.headers.includes("job_id"))
    throw new AccError(409, "แท็บระบบบัญชียังไม่พร้อม — ให้ Super Admin กด เตรียม Google Sheet", "SHEET_NOT_READY");
  return t;
}
const pick = (cols: string[], r: Rec): Rec => Object.fromEntries(cols.map((c) => [c, r[c] ?? ""]));
const rowRange = (tab: string, headers: string[], row: number) => `'${tab}'!A${row}:${colLetter(headers.length - 1)}${row}`;
const sheetErr = (e: unknown): never => { if (e instanceof AccError) throw e; if (e instanceof DevError) throw new AccError(e.status, e.message, e.code, { fields: e.extra.fields }); throw e; };

const customersOf = (t: Record<string, Tab>): Customer[] => t.DEVELOPERS.rows.filter((r) => r.developer_id).map((r) => ({
  developer_id: r.developer_id, code: r.dev_code, kind: kindOf(r), name: r.company_name || r.project_main, project: r.project_main, contact_name: r.contact_name, phone: r.phone,
})).sort((a, b) => a.name.localeCompare(b.name, "th"));
const configOf = (t: Record<string, Tab>) => ({ types: productTypesOf(t.APP_CONFIG.rows), seller: parseSeller(t.APP_CONFIG.rows.find((r) => r.config_key === "account_seller")?.config_value) });

const chainOf = (t: Record<string, Tab>, rootId: string) => t.ACC_DOCS.rows.filter((d) => d.doc_id && (d.root_id || d.doc_id) === rootId);

export async function listDocs() {
  const t = await load();
  const started = new Set(t.ACC_DOCS.rows.filter((d) => d.work_started_at).map((d) => d.root_id || d.doc_id));
  const docs = t.ACC_DOCS.rows.filter((d) => d.doc_id).map((d): Rec => ({ ...pick(DOC_COLUMNS, d), work_started: started.has(d.root_id || d.doc_id) ? "1" : "" }))
    .sort((a, b) => (b.doc_date + b.doc_no).localeCompare(a.doc_date + a.doc_no));
  return { docs, customers: customersOf(t), ...configOf(t), categories: PRODUCT_CATEGORIES, today: todayBkk() };
}

export async function getDoc(id: string) {
  const t = await load();
  const doc = t.ACC_DOCS.rows.find((d) => d.doc_id === id);
  if (!doc) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  const rootId = doc.root_id || doc.doc_id;
  const chain = chainOf(t, rootId).map((d) => ({ doc_id: d.doc_id, doc_type: d.doc_type, doc_no: d.doc_no, status: d.status, total: d.total })).sort((a, b) => a.doc_no.localeCompare(b.doc_no));
  const ids = new Set(chainOf(t, rootId).map((d) => d.doc_id));
  const root = t.ACC_DOCS.rows.find((d) => d.doc_id === rootId) ?? doc;
  const customer = customersOf(t).find((c) => c.developer_id === doc.customer_id) ?? null;
  const dev = t.DEVELOPERS.rows.find((r) => r.developer_id === doc.customer_id);
  return {
    doc: pick(DOC_COLUMNS, doc), work_started_at: root.work_started_at || "",
    editable: doc.status !== "cancelled" && !(Number(doc.paid_amount) > 0) && !t.ACC_DOCS.rows.some((d) => d.parent_doc_id === id),
    lines: t.ACC_LINES.rows.filter((l) => l.doc_id === id).map((l) => pick(LINE_COLUMNS, l)).sort((a, b) => Number(a.line_no) - Number(b.line_no)),
    payments: t.ACC_PAYMENTS.rows.filter((p) => p.doc_id === id).map((p) => pick(PAYMENT_COLUMNS, p)),
    files: t.ACC_FILES.rows.filter((f) => f.file_id && ids.has(f.doc_id)).map((f) => pick(FILE_COLUMNS, f)),
    jobs: t.PRODUCTION_JOBS.rows.filter((j) => j.job_id && j.doc_id && ids.has(j.doc_id)).map((j) => pick(JOB_COLUMNS, j)),
    chain, customer: customer ? { ...customer, address: "", tax_id: "" } : null, customer_status: dev?.status ?? "",
    ...configOf(t), categories: PRODUCT_CATEGORIES, today: todayBkk(),
  };
}

/** หมายเหตุ: ที่อยู่/เลขผู้เสียภาษีของลูกค้าเก็บในเอกสาร (customer_address / customer_tax_id) เพราะระบบ Developer ไม่มีช่องนี้ */
function docRecord(v: { doc: Rec; totals: ReturnType<typeof calcTotals> }, cust: Customer, extra: Rec, now: string, actor: string, input: Record<string, unknown>): Rec {
  const s = (k: string) => String(input[k] ?? "").trim().slice(0, 300);
  return {
    ...Object.fromEntries(DOC_COLUMNS.map((c) => [c, ""])), ...v.doc,
    customer_id: cust.developer_id, customer_kind: cust.kind, customer_name: cust.name, customer_contact: v.doc.contact_name || cust.contact_name, customer_address: s("customer_address"), customer_tax_id: s("customer_tax_id"),
    contact_phone: v.doc.contact_phone || cust.phone, subtotal: String(v.totals.subtotal), discount: String(v.totals.discount), vat_rate: String(v.totals.vat_rate), vat: String(v.totals.vat), total: String(v.totals.total),
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
    await writeAudit(actor, "account_doc_update", "account_doc", id, `${rec.doc_no} รวม ${rec.total}`);
    return { doc: pick(DOC_COLUMNS, rec), created: false };
  }
  const docId = crypto.randomUUID(), type = v.doc.doc_type as DocType;
  const no = nextDocNo(type, t.ACC_DOCS.rows.map((d) => d.doc_no), v.doc.doc_date);
  const rec = docRecord(v, cust, { doc_id: docId, doc_no: no, status: "draft", root_id: docId, paid_amount: "0", created_by: actor, created_at: now }, now, actor, input);
  await appendRows("ACC_DOCS", [toRow(t.ACC_DOCS.headers, rec)]);
  rec.doc_no = await dedupeCode("ACC_DOCS", t.ACC_DOCS.headers, "doc_no", "doc_id", docId, no, (codes) => nextDocNo(type, codes, v.doc.doc_date));
  await appendRows("ACC_LINES", lineRows(docId, v.lines).map((l) => toRow(t.ACC_LINES.headers, l)));
  await writeAudit(actor, "account_doc_create", "account_doc", docId, `${rec.doc_no} ${cust.name} รวม ${rec.total}`);
  return { doc: pick(DOC_COLUMNS, rec), created: true };
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
  const rec: Rec = { ...pick(DOC_COLUMNS, src), doc_id: docId, doc_type: to, doc_no: no, doc_date: date, due_date: "", status: "draft", root_id: src.root_id || src.doc_id, parent_doc_id: id, paid_amount: "0", work_started_at: "", created_by: actor, created_at: now, updated_by: actor, updated_at: now };
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
  return { products: lines.length, jobs: made.map((j) => ({ job_id: j.job_id, job_code: j.job_code, product: j.product })) };
}

export async function confirmPayment(id: string, input: Record<string, unknown>, actor: string) {
  const t = await load();
  const i = t.ACC_DOCS.rows.findIndex((d) => d.doc_id === id);
  if (i < 0) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  const doc = t.ACC_DOCS.rows[i];
  if (doc.status === "cancelled") throw new AccError(409, "เอกสารที่ยกเลิกแล้วยืนยันชำระเงินไม่ได้", "LOCKED");
  if (String(input.updated_at_seen ?? "") !== doc.updated_at) throw new AccError(409, "เอกสารนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  const paid = round2(t.ACC_PAYMENTS.rows.filter((p) => p.doc_id === id).reduce((s, p) => s + Number(p.amount || 0), 0));
  const p = validatePayment(input, Number(doc.total), paid, todayBkk());
  if (!p.ok) throw new AccError(422, "ข้อมูลการชำระเงินไม่ถูกต้อง", "VALIDATION", { fields: p.errors });
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
  const total = round2(paid + p.amount);
  const rec: Rec = { ...doc, paid_amount: String(total), status: statusFromPaid(doc.status, Number(doc.total), total), updated_by: actor, updated_at: now };
  const g = await guardRow("ACC_DOCS", t.ACC_DOCS.headers, "doc_id", id, i + 2);
  if (!("row" in g)) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  await batchUpdateValues([{ range: rowRange("ACC_DOCS", t.ACC_DOCS.headers, g.row), values: [toRow(t.ACC_DOCS.headers, rec)] }]);
  t.ACC_DOCS.rows[i] = rec;
  await writeAudit(actor, "account_payment", "account_doc", id, `${doc.doc_no}: ชำระ ${p.amount} (${pay.method}) รวม ${total}/${doc.total}`);
  // บันทึกชำระแล้ว แต่เริ่มงานล้มเหลว (เช่น Sheets ขัดข้อง) → ไม่ให้ทั้งคำขอล้ม: แจ้งเหตุผล และให้กดปุ่ม "เริ่มงาน" ซ้ำได้ (applyWork ตรวจก่อนเขียน)
  let started: Awaited<ReturnType<typeof applyWork>> | null = null, startError = "";
  if (willStart) { try { started = await applyWork(t, rec, actor); } catch (e) { startError = e instanceof Error ? e.message : "เริ่มงานไม่สำเร็จ"; } }
  return { payment: pay, doc: pick(DOC_COLUMNS, rec), full: p.full, started, startError, canStart: !started && !root.work_started_at };
}

/** ปุ่ม "เริ่มงาน" สำหรับกรณีชำระมัดจำ (ต้องมียอดชำระแล้วอย่างน้อยบางส่วน) */
export async function startWork(id: string, actor: string) {
  const t = await load();
  const doc = t.ACC_DOCS.rows.find((d) => d.doc_id === id);
  if (!doc) throw new AccError(404, "ไม่พบเอกสาร", "NOT_FOUND");
  if (doc.status === "cancelled") throw new AccError(409, "เอกสารที่ยกเลิกแล้วเริ่มงานไม่ได้", "LOCKED");
  if (!(Number(doc.paid_amount) > 0)) throw new AccError(409, "ต้องยืนยันการชำระเงิน (อย่างน้อยมัดจำ) ก่อนเริ่มงาน", "NOT_PAID");
  return { started: await applyWork(t, doc, actor) };
}

// ── ไฟล์แนบ (เก็บใน Cloudflare KV ผ่าน binding ACC_FILES — แผนฟรี ไม่ต้องผูกบัตร: 1 GB, ไฟล์ละไม่เกิน 25 MiB — ดู SETUP.md) ──
export type FileStore = { put(key: string, value: ArrayBuffer): Promise<unknown>; get(key: string, type: "stream"): Promise<ReadableStream | null> };
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

export { addProductType };
