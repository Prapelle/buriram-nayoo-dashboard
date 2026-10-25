import type { Cell } from "../xlsx";
import { validIsoDate } from "../import/normalize";
import type { ImportErr } from "../import/plan";
import { REPORT_COLUMNS, REQUIRED_HEADERS, SALES_COMPARE_KEYS, type ColDef } from "./model";

export class SalesParseError extends Error { constructor(public code: string, message: string) { super(message); } }

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (v: unknown) => String(v ?? "").replace(/[\u200b\s]+/g, " ").trim().toLowerCase();
const text = (v: Cell | undefined): string => (v === null || v === undefined ? "" : typeof v === "number" ? String(v) : v.trim());

const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const fixYear = (y: number) => (y > 2400 ? y - 543 : y); // พ.ศ. → ค.ศ.

/** วันที่จาก Excel Serial Number หรือข้อความ (วว/ดด/ปปปป, ISO, รองรับ พ.ศ.) */
export function parseDateCell(v: Cell | undefined): { ok: true; v: string } | { ok: false } {
  if (v === null || v === undefined || v === "") return { ok: true, v: "" };
  const fromSerial = (n: number) => {
    if (n < 20000 || n > 80000) return null;
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000).toISOString().slice(0, 10);
  };
  if (typeof v === "number") { const s = fromSerial(v); return s ? { ok: true, v: s } : { ok: false }; }
  const s = v.trim();
  if (s === "" || s === "-") return { ok: true, v: "" };
  if (/^\d{5}(\.\d+)?$/.test(s)) { const x = fromSerial(Number(s)); return x ? { ok: true, v: x } : { ok: false }; }
  let m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(s);
  if (m) { const y = fixYear(+m[3]); return validIsoDate(y, +m[2], +m[1]) ? { ok: true, v: iso(y, +m[2], +m[1]) } : { ok: false }; }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) { const y = fixYear(+m[1]); return validIsoDate(y, +m[2], +m[3]) ? { ok: true, v: iso(y, +m[2], +m[3]) } : { ok: false }; }
  return { ok: false };
}

/** จำนวนเงินที่เป็นตัวเลขหรือข้อความมีเครื่องหมายคั่นหลักพัน; ว่าง/"-" = null (ไม่ใช่ 0) */
export function parseMoney(v: Cell | undefined): { ok: true; v: number | null } | { ok: false } {
  if (v === null || v === undefined) return { ok: true, v: null };
  if (typeof v === "number") return Number.isFinite(v) ? { ok: true, v: r2(v) } : { ok: false };
  let s = v.trim();
  if (s === "" || s === "-" || s === "–") return { ok: true, v: null };
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[,฿\s]|THB|บาท/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false };
  const n = Number(s);
  return { ok: true, v: r2(neg ? -n : n) };
}

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const THAI_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function periodFromLines(lines: string[]): { start: string; end: string } | null {
  for (const l of lines) {
    const ds = [...l.matchAll(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/g)].map((m) => ({ y: fixYear(+m[3]), m: +m[2], d: +m[1] })).filter((x) => validIsoDate(x.y, x.m, x.d)).map((x) => iso(x.y, x.m, x.d));
    if (ds.length >= 2) { const s = [...ds].sort(); return { start: s[0], end: s[s.length - 1] }; }
  }
  for (const l of lines) {
    const low = l.toLowerCase();
    const y = /(\d{4})/.exec(l);
    if (!y) continue;
    let mi = THAI_MONTHS.findIndex((x) => l.includes(x));
    if (mi < 0) mi = EN_MONTHS.findIndex((x) => new RegExp(`\\b${x}\\b`).test(low));
    if (mi < 0) mi = THAI_SHORT.findIndex((x) => l.includes(x));
    if (mi >= 0) { const yy = fixYear(+y[1]); return { start: iso(yy, mi + 1, 1), end: iso(yy, mi + 1, lastDay(yy, mi + 1)) }; }
  }
  return null;
}

export type SalesItem = {
  rowNumber: number;
  invoice_date: string; invoice_no: string; customer_name: string; customer_tax_id: string; branch: string; project_name: string; salesperson: string;
  gross_sales: number | null; discount_amount: number | null; net_value: number | null; vat_amount: number | null; total_net: number;
  payment_status: string; sales_inc_vat: number | null; discount_before_vat: number | null; discount_doc: number | null;
  ref_doc_system: string; reference_no: string; deposit_ref_doc: string; note: string; internal_note: string;
  raw: Record<string, string>;
};
export type ParsedReport = {
  headerRowNumber: number;
  foundHeaders: Record<string, string>;
  missingOptional: string[];
  company: { name: string; taxId: string };
  period: { start: string; end: string; derived: boolean };
  items: SalesItem[];
  errors: ImportErr[];
  warnings: string[];
  summaryTotals: Partial<Record<string, number>> | null;
  rowsSeen: number;
};

function findHeader(rows: Cell[][]): { idx: number; map: Record<string, number>; headers: string[] } {
  let best = { idx: -1, hits: 0, missing: REQUIRED_HEADERS as string[] };
  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    const map: Record<string, number> = {};
    rows[i].forEach((c, ci) => {
      const t = norm(c); if (!t) return;
      for (const d of REPORT_COLUMNS) {
        if (map[d.key] !== undefined) continue;
        if (d.names.some((n) => (d.prefix ? t.startsWith(n) : t === n))) map[d.key] = ci;
      }
    });
    const hits = Object.keys(map).length;
    const missing = REQUIRED_HEADERS.filter((k) => map[k] === undefined);
    if (!missing.length && hits >= 4) return { idx: i, map, headers: rows[i].map((c) => text(c)) };
    if (hits > best.hits) best = { idx: i, hits, missing };
  }
  const names = best.missing.map((k) => REPORT_COLUMNS.find((c) => c.key === k)!.names[0]).join(", ");
  throw new SalesParseError("HEADER_NOT_FOUND", best.hits >= 2
    ? `พบแถวที่น่าจะเป็นหัวตาราง (แถว ${best.idx + 1}) แต่ขาดคอลัมน์: ${names}`
    : "ไม่พบแถวหัวตาราง (ต้องมีคอลัมน์ เลขที่เอกสาร, วัน/เดือน/ปี, ชื่อลูกค้า, ยอดรวมสุทธิ) กรุณาตรวจว่าเป็นไฟล์รายงานยอดขายที่ถูกต้อง");
}

const SUMMARY = /^(ยอดรวม|รวมทั้งหมด|รวม|total|grand\s*total|sum)/i;

export function parseSalesGrid(rows: Cell[][]): ParsedReport {
  const { idx, map, headers } = findHeader(rows);
  const def = new Map<string, ColDef>(REPORT_COLUMNS.map((d) => [d.key, d]));
  const colName = (k: string) => headers[map[k]] || def.get(k)!.names[0];
  const cell = (row: Cell[], k: string): Cell | undefined => (map[k] === undefined ? undefined : row[map[k]]);

  // ข้อมูลบริษัท/ช่วงรายงานจากแถวเหนือหัวตาราง
  const lines = rows.slice(0, idx).map((r) => r.map((c) => text(c)).filter(Boolean).join(" ")).filter(Boolean);
  let taxId = "";
  for (const l of lines) {
    const lab = /ผู้เสียภาษี[^\d]*([\d\- ]{13,25})/.exec(l)?.[1]?.replace(/\D/g, "");
    if (lab && lab.length === 13) { taxId = lab; break; }
  }
  if (!taxId) for (const l of lines) { const m = /(?<!\d)(\d{13})(?!\d)/.exec(l.replace(/(\d)[- ](?=\d)/g, "$1")); if (m) { taxId = m[1]; break; } }
  const name = lines.find((l) => /(บริษัท|หจก|ห้างหุ้นส่วน|company|co\.\s*,?\s*ltd)/i.test(l) && !/ผู้เสียภาษี/.test(l)) ?? "";
  const companyName = name.replace(/\s+/g, " ").trim();
  let per = periodFromLines(lines);

  const items: SalesItem[] = [];
  const errors: ImportErr[] = [];
  const warnings: string[] = [];
  let summaryTotals: ParsedReport["summaryTotals"] = null;
  let seen = 0, discountDiffer = 0, fallbackTotals = 0;
  const rowWarn: string[] = [];

  for (let i = idx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => text(c) === "")) continue;
    const rn = i + 1;
    const invoice = text(cell(row, "invoice_no"));
    const label = row.map((c) => text(c)).find((t) => t !== "" && SUMMARY.test(t));
    if (label && (invoice === "" || SUMMARY.test(invoice))) {
      const t: Record<string, number> = {};
      for (const d of REPORT_COLUMNS) if (d.kind === "money") { const m = parseMoney(cell(row, d.key)); if (m.ok && m.v !== null) t[d.key] = m.v; }
      if (Object.keys(t).length) summaryTotals = { ...(summaryTotals ?? {}), ...t };
      continue; // แถวสรุป ไม่นับเป็นรายการขาย
    }
    const err = (k: string, raw: string, code: string, message: string) => errors.push({ row: rn, column: colName(k), raw: raw.slice(0, 200), code, message });
    const anyMoney = REPORT_COLUMNS.some((d) => d.kind === "money" && text(cell(row, d.key)) !== "");
    if (invoice === "") { if (anyMoney) { seen++; err("invoice_no", "", "REQUIRED_BLANK", "มีจำนวนเงินแต่ไม่มีเลขที่เอกสาร"); } continue; }
    seen++;

    const before = errors.length;
    const o: Record<string, string> = {}; const m: Record<string, number | null> = {};
    for (const d of REPORT_COLUMNS) {
      const c = cell(row, d.key);
      if (d.kind === "text") o[d.key] = text(c);
      else if (d.kind === "date") {
        const r = parseDateCell(c);
        if (!r.ok) { err(d.key, text(c), "INVALID_DATE", `วันที่ไม่ถูกต้อง: "${text(c)}"`); o[d.key] = ""; } else o[d.key] = r.v;
      } else {
        const r = parseMoney(c);
        if (!r.ok) { err(d.key, text(c), "INVALID_NUMBER", `ไม่ใช่ตัวเลข: "${text(c)}"`); m[d.key] = null; } else m[d.key] = r.v;
      }
    }
    if (!o.invoice_date && !errors.slice(before).some((e) => e.code === "INVALID_DATE")) err("invoice_date", "", "REQUIRED_BLANK", "ไม่มีวันที่เอกสาร");
    if (!o.customer_name) err("customer_name", "", "REQUIRED_BLANK", "ไม่มีชื่อลูกค้า");
    let total = m.total_net_col;
    if (total === null || total === undefined) {
      if (m.net_value !== null && m.net_value !== undefined && m.vat_amount !== null && m.vat_amount !== undefined) { total = r2(m.net_value + m.vat_amount); fallbackTotals++; }
      else if (!errors.slice(before).some((e) => e.column === colName("total_net_col"))) err("total_net_col", "", "REQUIRED_BLANK", "ไม่มียอดรวมสุทธิ และคำนวณจาก มูลค่า + ภาษีมูลค่าเพิ่ม ไม่ได้");
    }
    if (errors.length > before || total === null || total === undefined) continue;

    // ส่วนลด: ใช้ "ส่วนลดตามเอกสาร" เป็นหลัก ถ้าไม่มีค่าจึงใช้ "ส่วนลดก่อน VAT" (ไม่นำสองคอลัมน์มาบวกกัน)
    const discount = m.discount_doc ?? m.discount_before_vat ?? null;
    if (m.discount_doc != null && m.discount_before_vat != null && Math.abs(m.discount_doc - m.discount_before_vat) > 0.005) discountDiffer++;
    const gross = m.sales_ex_vat ?? null;
    if (gross !== null && m.net_value != null && Math.abs(gross - (discount ?? 0) - m.net_value) > 0.011)
      rowWarn.push(`แถว ${rn} (${invoice}): ขายแยกภาษี ${gross} − ส่วนลด ${discount ?? 0} = ${r2(gross - (discount ?? 0))} ไม่ตรงกับมูลค่า ${m.net_value}`);
    if (m.net_value != null && m.vat_amount != null && m.total_net_col != null && Math.abs(m.net_value + m.vat_amount - m.total_net_col) > 0.011)
      rowWarn.push(`แถว ${rn} (${invoice}): มูลค่า ${m.net_value} + ภาษี ${m.vat_amount} ไม่ตรงกับยอดรวมสุทธิ ${m.total_net_col}`);

    const raw: Record<string, string> = {};
    row.forEach((c, ci) => { const h = headers[ci]; if (h) raw[h] = text(c); });
    items.push({
      rowNumber: rn, invoice_date: o.invoice_date, invoice_no: invoice, customer_name: o.customer_name, customer_tax_id: o.customer_tax_id, branch: o.branch,
      project_name: o.project_name, salesperson: o.salesperson, gross_sales: gross, discount_amount: discount, net_value: m.net_value ?? null,
      vat_amount: m.vat_amount ?? null, total_net: total, payment_status: o.payment_status, sales_inc_vat: m.sales_inc_vat ?? null,
      discount_before_vat: m.discount_before_vat ?? null, discount_doc: m.discount_doc ?? null, ref_doc_system: o.ref_doc_system, reference_no: o.reference_no,
      deposit_ref_doc: o.deposit_ref_doc, note: o.note, internal_note: o.internal_note, raw,
    });
  }

  if (rowWarn.length) warnings.push(...rowWarn.slice(0, 10), ...(rowWarn.length > 10 ? [`และอีก ${rowWarn.length - 10} รายการที่ตัวเลขไม่สอดคล้องกัน`] : []));
  if (discountDiffer) warnings.push(`${discountDiffer} เอกสารมี "ส่วนลดตามเอกสาร" ไม่เท่ากับ "ส่วนลดก่อน VAT" ระบบใช้ส่วนลดตามเอกสาร (ไม่บวกรวมกัน)`);
  if (fallbackTotals) warnings.push(`${fallbackTotals} เอกสารไม่มียอดรวมสุทธิ ระบบคำนวณจาก มูลค่า + ภาษีมูลค่าเพิ่ม`);

  // เทียบยอดรวมที่คำนวณจากรายการกับแถวสรุปในไฟล์
  const sumItems = (k: (i: SalesItem) => number | null) => r2(items.reduce((s, i) => s + (k(i) ?? 0), 0));
  const st = summaryTotals as Partial<Record<string, number>> | null;
  const chk = (label: string, computed: number, reported: number | undefined) => {
    if (reported !== undefined && Math.abs(computed - reported) > 0.011)
      warnings.unshift(`ยอด${label}จากรายการ (${computed.toLocaleString("en-US")}) ไม่ตรงกับยอดรวมในไฟล์ (${reported.toLocaleString("en-US")})${errors.length ? ` — มี ${errors.length} แถวที่นำเข้าไม่ได้` : ""} ตรวจสอบก่อนยืนยัน`);
  };
  if (st) { chk("รวมสุทธิ", sumItems((i) => i.total_net), st.total_net_col); chk("ขายแยกภาษี", sumItems((i) => i.gross_sales), st.sales_ex_vat); chk("ส่วนลดตามเอกสาร", sumItems((i) => i.discount_doc), st.discount_doc); }
  else warnings.push("ไม่พบแถวสรุปยอดรวมในไฟล์ จึงไม่ได้เทียบยอดรวมกับต้นฉบับ");

  let derived = false;
  if (!per && items.length) { const ds = items.map((i) => i.invoice_date).filter(Boolean).sort(); per = { start: ds[0], end: ds[ds.length - 1] }; derived = true; }
  const missingOptional = REPORT_COLUMNS.filter((d) => map[d.key] === undefined).map((d) => d.names[0]);
  return {
    headerRowNumber: idx + 1, foundHeaders: Object.fromEntries(Object.entries(map).map(([k, c]) => [k, headers[c]])), missingOptional,
    company: { name: companyName, taxId }, period: { start: per?.start ?? "", end: per?.end ?? "", derived },
    items, errors, warnings, summaryTotals, rowsSeen: seen,
  };
}

export const periodLabel = (start: string, end: string): string => {
  if (!start || !end) return "";
  const [y, m] = start.split("-").map(Number);
  return start === iso(y, m, 1) && end === iso(y, m, lastDay(y, m)) ? start.slice(0, 7) : `${start}..${end}`;
};

// ---------- แผนนำเข้า (เทียบกับข้อมูลเดิม) ----------
export type SalesRec = Record<string, string | number>;
export type SalesPlanItem = { rowNumber: number; invoice_no: string; status: "insert" | "update" | "duplicate"; dupSource?: "import" | "manual"; rec: SalesRec; existingRow?: number };
export type SalesPlan = {
  items: SalesPlanItem[];
  counts: { total: number; insert: number; update: number; duplicate: number; invalid: number };
  warnings: string[];
  totals: { gross: number; discount: number; net: number; vat: number; totalNet: number; paidNet: number; docs: number; customers: number; insertNet: number };
  period: { start: string; end: string; label: string };
};

const same = (a: unknown, b: unknown) => {
  const x = a === undefined || a === null ? "" : String(a), y = b === undefined || b === null ? "" : String(b);
  if (x === y) return true;
  return x !== "" && y !== "" && !isNaN(Number(x)) && !isNaN(Number(y)) && Math.abs(Number(x) - Number(y)) < 1e-9;
};
export const customerKey = (i: { customer_tax_id: string; customer_name: string }) => {
  const d = i.customer_tax_id.replace(/\D/g, "");
  return d.length >= 10 ? `t:${d}` : `n:${i.customer_name.replace(/\s+/g, "").toLowerCase()}`;
};

export function buildSalesPlan(a: {
  parsed: ParsedReport; taxId: string; companyName: string; periodStart: string; periodEnd: string; file: string;
  existing: Map<string, { rowNumber: number; row: Record<string, string> }>; manualInvoices: Set<string>; mode: "skip" | "update";
}): SalesPlan {
  const { parsed, taxId } = a;
  const label = periodLabel(a.periodStart, a.periodEnd);
  const warnings = [...parsed.warnings];
  const seenKeys = new Set<string>();
  const items: SalesPlanItem[] = [];
  let invalid = parsed.errors.length ? new Set(parsed.errors.map((e) => e.row)).size : 0;
  let outOfPeriod = 0;
  for (const it of parsed.items) {
    const key = `${taxId}|${it.invoice_no}`;
    if (seenKeys.has(key)) { invalid++; parsed.errors.push({ row: it.rowNumber, column: "เลขที่เอกสาร", raw: it.invoice_no, code: "DUPLICATE_IN_FILE", message: "เลขที่เอกสารซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน (ไม่นับซ้ำ)" }); continue; }
    seenKeys.add(key);
    if (a.periodStart && a.periodEnd && (it.invoice_date < a.periodStart || it.invoice_date > a.periodEnd)) outOfPeriod++;
    const rec: SalesRec = {
      row_key: key, company_tax_id: taxId, company_name: a.companyName, report_period: label, report_start: a.periodStart, report_end: a.periodEnd,
      invoice_date: it.invoice_date, invoice_no: it.invoice_no, customer_name: it.customer_name, customer_tax_id: it.customer_tax_id, branch: it.branch,
      project_name: it.project_name, salesperson: it.salesperson, gross_sales: it.gross_sales ?? "", discount_amount: it.discount_amount ?? "",
      net_value: it.net_value ?? "", vat_amount: it.vat_amount ?? "", total_net: it.total_net, payment_status: it.payment_status,
      sales_inc_vat: it.sales_inc_vat ?? "", discount_before_vat: it.discount_before_vat ?? "", discount_doc: it.discount_doc ?? "",
      ref_doc_system: it.ref_doc_system, reference_no: it.reference_no, deposit_ref_doc: it.deposit_ref_doc, note: it.note, internal_note: it.internal_note,
      source_file: a.file, source_row_number: it.rowNumber, raw_json: JSON.stringify(it.raw),
    };
    const ex = a.existing.get(key);
    if (ex) {
      const changed = SALES_COMPARE_KEYS.some((k) => !same(rec[k], ex.row[k]));
      items.push(a.mode === "update" && changed
        ? { rowNumber: it.rowNumber, invoice_no: it.invoice_no, status: "update", rec, existingRow: ex.rowNumber }
        : { rowNumber: it.rowNumber, invoice_no: it.invoice_no, status: "duplicate", dupSource: "import", rec, existingRow: ex.rowNumber });
    } else if (a.manualInvoices.has(it.invoice_no)) items.push({ rowNumber: it.rowNumber, invoice_no: it.invoice_no, status: "duplicate", dupSource: "manual", rec });
    else items.push({ rowNumber: it.rowNumber, invoice_no: it.invoice_no, status: "insert", rec });
  }
  if (outOfPeriod) warnings.push(`${outOfPeriod} เอกสารมีวันที่อยู่นอกช่วงรายงาน ${a.periodStart} – ${a.periodEnd}`);
  const manual = items.filter((x) => x.dupSource === "manual").length;
  if (manual) warnings.push(`${manual} เอกสารมีเลขที่เดียวกับรายการขายที่กรอกด้วยมือ (แท็บ SALES) ระบบข้ามไว้เพื่อไม่ให้นับซ้ำ`);

  const kept = items.filter((x) => x.status !== "duplicate" || true).map((x) => x.rec);
  const num = (r: SalesRec, k: string) => (typeof r[k] === "number" ? (r[k] as number) : 0);
  const sum = (k: string, only?: (x: SalesPlanItem) => boolean) => r2(items.filter(only ?? (() => true)).reduce((s, x) => s + num(x.rec, k), 0));
  const paid = (x: SalesPlanItem) => x.rec.payment_status === "เก็บเงินแล้ว";
  const src = parsed.items.filter((i) => seenKeys.has(`${taxId}|${i.invoice_no}`));
  void kept;
  return {
    items,
    counts: { total: parsed.rowsSeen, insert: items.filter((x) => x.status === "insert").length, update: items.filter((x) => x.status === "update").length, duplicate: items.filter((x) => x.status === "duplicate").length, invalid },
    warnings,
    totals: {
      gross: sum("gross_sales"), discount: sum("discount_amount"), net: sum("net_value"), vat: sum("vat_amount"), totalNet: sum("total_net"), paidNet: sum("total_net", paid),
      docs: new Set(items.map((x) => x.invoice_no)).size, customers: new Set(src.map(customerKey)).size,
      insertNet: sum("total_net", (x) => x.status === "insert" || x.status === "update"),
    },
    period: { start: a.periodStart, end: a.periodEnd, label },
  };
}
