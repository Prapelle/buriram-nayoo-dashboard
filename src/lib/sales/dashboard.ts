import { CANCEL_PATTERN, PAID_STATUS } from "./model";
import { customerKey } from "./parse";

export type TxRow = Record<string, string>;
export type SalesFilters = { from?: string; to?: string; period?: string; project?: string; salesperson?: string; status?: string; q?: string };

const n = (v: unknown) => { const s = String(v ?? "").trim(); if (s === "") return null; const x = Number(s); return Number.isFinite(x) ? x : null; };
const r2 = (x: number) => Math.round(x * 100) / 100;
const sum = (rows: TxRow[], k: string) => r2(rows.reduce((s, r) => s + (n(r[k]) ?? 0), 0));
export const NO_PROJECT = "(ไม่ระบุโปรเจ็ค)";

export function filterSales(rows: TxRow[], f: SalesFilters): TxRow[] {
  const q = f.q?.trim().toLowerCase();
  return rows.filter((r) =>
    (!f.from || r.invoice_date >= f.from) && (!f.to || r.invoice_date <= f.to) && (!f.period || r.report_period === f.period)
    && (!f.project || (r.project_name || NO_PROJECT) === f.project) && (!f.salesperson || r.salesperson === f.salesperson)
    && (!f.status || r.payment_status === f.status)
    && (!q || [r.invoice_no, r.customer_name, r.project_name, r.salesperson, r.reference_no].some((x) => (x ?? "").toLowerCase().includes(q))));
}

const isPaid = (r: TxRow) => r.payment_status === PAID_STATUS;
const isCancelled = (r: TxRow) => CANCEL_PATTERN.test(r.payment_status ?? "");
const group = (rows: TxRow[], key: (r: TxRow) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), r2((m.get(key(r)) ?? 0) + (n(r.total_net) ?? 0)));
  return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
};

export type SalesKpi = { key: string; label: string; fmt: "thb" | "int"; value: number | null; note?: string };
export type SalesView = {
  kpis: SalesKpi[];
  charts: { time: { granularity: "day" | "month"; points: { x: string; y: number }[] } | null; projects: { label: string; value: number }[] | null; people: { label: string; value: number }[] | null; status: { label: string; value: number }[] | null };
  linked: { value: number | null; docs: number };
  warnings: string[];
  rows: TxRow[];
  options: { periods: string[]; projects: string[]; people: string[]; statuses: string[] };
};

export function computeSales(all: TxRow[], f: SalesFilters): SalesView {
  const rows = filterSales(all, f);
  const has = rows.length > 0;
  const docs = new Set(rows.map((r) => r.invoice_no)).size;
  const customers = new Set(rows.map((r) => customerKey({ customer_tax_id: r.customer_tax_id ?? "", customer_name: r.customer_name ?? "" }))).size;
  const withStatus = rows.filter((r) => (r.payment_status ?? "") !== "");
  const unpaid = withStatus.filter((r) => !isPaid(r) && !isCancelled(r));
  const cancelled = rows.filter(isCancelled);
  const warnings: string[] = [];
  if (cancelled.length) warnings.push(`มีเอกสารสถานะยกเลิก ${cancelled.length} ใบ รวมอยู่ในยอดตามรายงานบัญชี (ยอดสุทธิตามไฟล์) ตรวจสอบว่าต้องการนับหรือไม่`);
  const noStatus = rows.length - withStatus.length;
  if (noStatus) warnings.push(`${noStatus} เอกสารไม่มีสถานะการเก็บเงิน จึงไม่นับในยอดเก็บเงินแล้ว/ยังไม่เก็บเงิน`);

  const kpis: SalesKpi[] = [
    { key: "net", label: "ยอดขายสุทธิ", fmt: "thb", value: has ? sum(rows, "total_net") : null, note: "ผลรวม ยอดรวมสุทธิ" },
    { key: "gross", label: "ยอดขายก่อนส่วนลด", fmt: "thb", value: has ? sum(rows, "gross_sales") : null, note: "ผลรวม ขายแยกภาษี" },
    { key: "discount", label: "ส่วนลดรวม", fmt: "thb", value: has ? sum(rows, "discount_amount") : null, note: "ส่วนลดตามเอกสาร (ถ้าว่างใช้ส่วนลดก่อน VAT)" },
    { key: "docs", label: "จำนวนเอกสารขาย", fmt: "int", value: has ? docs : null },
    { key: "customers", label: "จำนวนลูกค้า", fmt: "int", value: has ? customers : null, note: "นับไม่ซ้ำตามเลขผู้เสียภาษี (ถ้าไม่มีใช้ชื่อ)" },
    { key: "paid", label: "ยอดสุทธิที่เก็บเงินแล้ว", fmt: "thb", value: has ? sum(rows.filter(isPaid), "total_net") : null },
    { key: "unpaid", label: "ยอดที่ยังไม่เก็บเงิน", fmt: "thb", value: withStatus.length ? sum(unpaid, "total_net") : null, note: unpaid.length ? `${unpaid.length} เอกสาร` : withStatus.length ? "ทุกเอกสารเก็บเงินแล้ว" : undefined },
    { key: "vat", label: "ภาษีมูลค่าเพิ่มตามรายงาน", fmt: "thb", value: has ? sum(rows, "vat_amount") : null },
  ];

  let time: SalesView["charts"]["time"] = null;
  if (has) {
    const dates = rows.map((r) => r.invoice_date).filter(Boolean).sort();
    const span = dates.length ? (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400000 : 0;
    const gran = span <= 62 ? "day" : "month";
    const g = new Map<string, number>();
    for (const r of rows) { if (!r.invoice_date) continue; const k = gran === "day" ? r.invoice_date : r.invoice_date.slice(0, 7); g.set(k, r2((g.get(k) ?? 0) + (n(r.total_net) ?? 0))); }
    time = { granularity: gran, points: [...g].sort(([a], [b]) => a.localeCompare(b)).map(([x, y]) => ({ x, y })) };
  }
  const projects = group(rows, (r) => r.project_name || NO_PROJECT);
  const top = projects.slice(0, 10);
  const other = r2(projects.slice(10).reduce((s, p) => s + p.value, 0));
  const total = sum(rows, "total_net");
  const statusG = group(rows, (r) => r.payment_status || "(ไม่ระบุสถานะ)").map((s) => ({ label: `${s.label}${total ? ` (${((s.value / total) * 100).toFixed(1)}%)` : ""}`, value: s.value }));

  const linkedRows = rows.filter((r) => (r.lead_id ?? "") !== "" || (r.campaign_name ?? "") !== "");
  const uniq = (k: string) => [...new Set(all.map((r) => r[k]).filter(Boolean))].sort();
  return {
    kpis, warnings, rows,
    charts: {
      time, projects: has ? [...top, ...(other ? [{ label: "อื่น ๆ", value: other }] : [])] : null,
      people: has ? group(rows, (r) => r.salesperson || "(ไม่ระบุพนักงานขาย)") : null, status: has ? statusG : null,
    },
    linked: { value: linkedRows.length ? sum(linkedRows, "total_net") : null, docs: new Set(linkedRows.map((r) => r.invoice_no)).size },
    options: { periods: uniq("report_period").reverse(), projects: [...new Set(all.map((r) => r.project_name || NO_PROJECT))].sort(), people: uniq("salesperson"), statuses: uniq("payment_status") },
  };
}
