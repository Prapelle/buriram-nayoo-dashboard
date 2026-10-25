import { writeAudit } from "../audit";
import type { Cell } from "../xlsx";
import { appendRows, batchGet, batchUpdateValues, colLetter, firstRowOf, readTabs, toRow } from "../sheets";
import { isIsoDate } from "../import/normalize";
import { SALES_COMPARE_KEYS, SALES_LOG_COLUMNS } from "./model";
import { buildSalesPlan, parseSalesGrid, SalesParseError, type SalesPlan } from "./parse";

export class SalesError extends Error { constructor(public status: number, message: string, public code: string) { super(message); } }

export type SalesInput = {
  fileName: string; sheetName?: string; grid: Cell[][];
  taxId?: string; companyName?: string; periodStart?: string; periodEnd?: string;
  mode?: "skip" | "update"; confirmUpdate?: boolean;
};

const MAX_ROWS = 20000;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** อ่านเฉพาะบางคอลัมน์ พร้อมเลขแถวจริงในชีต (ใช้ API 2 calls รวมหลายแท็บ) */
async function readIndexed(specs: { tab: string; cols: string[] }[]) {
  const headerRows = await batchGet(specs.map((s) => `'${s.tab}'!1:1`));
  const ranges: { si: number; col: string; range: string }[] = [];
  specs.forEach((s, si) => {
    const h = headerRows[si][0] ?? [];
    for (const col of s.cols) { const i = h.indexOf(col); if (i >= 0) ranges.push({ si, col, range: `'${s.tab}'!${colLetter(i)}:${colLetter(i)}` }); }
  });
  const data = ranges.length ? await batchGet(ranges.map((r) => r.range)) : [];
  return specs.map((s, si) => {
    const mine = ranges.map((r, i) => ({ r, v: data[i] })).filter((x) => x.r.si === si);
    const n = Math.max(0, ...mine.map((x) => x.v.length)) - 1;
    const rows: { rowNumber: number; row: Record<string, string> }[] = [];
    for (let i = 1; i <= n; i++) {
      const row: Record<string, string> = {};
      for (const x of mine) row[x.r.col] = x.v[i]?.[0] ?? "";
      if (Object.values(row).some((v) => v !== "")) rows.push({ rowNumber: i + 1, row });
    }
    return { headers: headerRows[si][0] ?? [], rows };
  });
}

async function prepare(input: SalesInput) {
  if (!Array.isArray(input?.grid) || typeof input.fileName !== "string") throw new SalesError(400, "คำขอไม่ถูกต้อง", "BAD_REQUEST");
  if (input.grid.length > MAX_ROWS) throw new SalesError(413, `ไฟล์มีแถวมากเกิน ${MAX_ROWS} แถว`, "FILE_TOO_LARGE");
  let parsed;
  try { parsed = parseSalesGrid(input.grid); }
  catch (e) { if (e instanceof SalesParseError) throw new SalesError(422, e.message, e.code); throw e; }

  const taxId = (input.taxId ?? parsed.company.taxId).replace(/\D/g, "");
  const companyName = (input.companyName ?? parsed.company.name).trim();
  const periodStart = input.periodStart ?? parsed.period.start, periodEnd = input.periodEnd ?? parsed.period.end;
  const needs: string[] = [];
  if (!/^\d{13}$/.test(taxId)) needs.push("ไม่พบเลขประจำตัวผู้เสียภาษีของบริษัทผู้ขายในไฟล์ กรุณากรอก 13 หลัก (ใช้ป้องกันรายการซ้ำ)");
  if (!isIsoDate(periodStart) || !isIsoDate(periodEnd) || periodStart > periodEnd) needs.push("กรุณาระบุช่วงเวลารายงาน (วันเริ่ม/วันสิ้นสุด) ให้ถูกต้อง");

  let tabs: Awaited<ReturnType<typeof readIndexed>>;
  let log: { headers: string[]; rows: Record<string, string>[] };
  try {
    tabs = await readIndexed([
      { tab: "SALES_TRANSACTIONS", cols: ["row_key", "record_id", "imported_at", ...SALES_COMPARE_KEYS] },
      { tab: "SALES", cols: ["invoice_no"] },
    ]);
    log = (await readTabs(["SALES_IMPORT_LOG"])).SALES_IMPORT_LOG;
  } catch { throw new SalesError(409, "อ่านฐานข้อมูลไม่ได้ กรุณาไปที่ ตั้งค่า → เตรียม Google Sheet", "SHEET_NOT_READY"); }
  if (!tabs[0].headers.includes("row_key")) throw new SalesError(409, "แท็บ SALES_TRANSACTIONS ยังไม่พร้อม กรุณากด ตั้งค่า → เตรียม Google Sheet", "SHEET_NOT_READY");

  const existing = new Map(tabs[0].rows.filter((r) => r.row.row_key).map((r) => [r.row.row_key, r]));
  const manualInvoices = new Set(tabs[1].rows.map((r) => r.row.invoice_no).filter(Boolean));
  const mode = input.mode === "update" ? "update" : "skip";
  const plan = buildSalesPlan({ parsed, taxId, companyName, periodStart, periodEnd, file: input.fileName.slice(0, 200), existing, manualInvoices, mode });

  const fingerprint = await sha256Hex(JSON.stringify(input.grid));
  const prev = log.rows.find((r) => r.fingerprint === fingerprint && r.status === "success");
  if (prev) plan.warnings.unshift(`ไฟล์นี้ (เนื้อหาเหมือนกัน) เคยนำเข้าสำเร็จเมื่อ ${prev.imported_at} โดย ${prev.imported_by} — รายการเดิมจะถูกข้าม ไม่นับซ้ำ`);
  return { parsed, plan, needs, taxId, companyName, fingerprint, mode, headers: tabs[0].headers, logHeaders: log.headers.length ? log.headers : SALES_LOG_COLUMNS, existing, input };
}

export async function planSales(input: SalesInput) {
  const p = await prepare(input);
  const { plan, parsed } = p;
  return {
    fileName: input.fileName, sheetName: input.sheetName ?? "", fingerprint: p.fingerprint, headerRow: parsed.headerRowNumber,
    company: { name: p.companyName, taxId: p.taxId }, period: { ...plan.period, derived: parsed.period.derived },
    needs: p.needs, counts: plan.counts, totals: plan.totals, reportTotals: parsed.summaryTotals, warnings: plan.warnings,
    missingOptional: parsed.missingOptional, errors: parsed.errors.slice(0, 1000), mode: p.mode,
    preview: plan.items.slice(0, 50).map((x) => ({ row: x.rowNumber, invoice_no: x.invoice_no, status: x.status, dupSource: x.dupSource,
      invoice_date: x.rec.invoice_date, customer_name: x.rec.customer_name, project_name: x.rec.project_name, salesperson: x.rec.salesperson, total_net: x.rec.total_net, payment_status: x.rec.payment_status })),
  };
}

export async function commitSales(input: SalesInput, actor: string) {
  const p = await prepare(input);
  const { plan, parsed } = p;
  if (p.needs.length) throw new SalesError(422, p.needs[0], "NEEDS_INPUT");
  if (p.mode === "update" && input.confirmUpdate !== true) throw new SalesError(400, "การอัปเดตรายการเดิมต้องกดยืนยันก่อน", "UPDATE_NOT_CONFIRMED");
  if (!plan.items.length) throw new SalesError(422, "ไม่มีรายการที่ถูกต้องให้นำเข้า", "NOTHING_TO_IMPORT");

  const now = new Date().toISOString();
  const batchId = crypto.randomUUID();
  const logHeaders = p.logHeaders;
  const reported = parsed.summaryTotals?.total_net_col;
  const logRow = (status: string, err = "") => toRow(logHeaders, {
    batch_id: batchId, imported_at: now, imported_by: actor, source_file: input.fileName.slice(0, 200), sheet_name: input.sheetName ?? "",
    company_tax_id: p.taxId, company_name: p.companyName, report_start: plan.period.start, report_end: plan.period.end, status,
    rows_total: plan.counts.total, rows_inserted: plan.counts.insert, rows_updated: plan.counts.update, rows_skipped: plan.counts.duplicate, rows_invalid: plan.counts.invalid,
    total_net_in_file: reported ?? "", total_net_imported: plan.totals.insertNet, fingerprint: p.fingerprint,
    warnings: plan.warnings.join(" | ").slice(0, 2000), error_summary: err,
  });
  const range = await appendRows("SALES_IMPORT_LOG", [logRow("processing")]);
  const logRowNo = firstRowOf(range);
  const setStatus = async (status: string, err = "") => { if (logRowNo) await batchUpdateValues([{ range: `'SALES_IMPORT_LOG'!A${logRowNo}`, values: [logRow(status, err)] }]); };

  try {
    const full = (rec: Record<string, string | number>, extra: Record<string, string>) => toRow(p.headers, { ...rec, ...extra, source_batch_id: batchId });
    const inserts = plan.items.filter((x) => x.status === "insert").map((x) => full(x.rec, { record_id: crypto.randomUUID(), imported_at: now, updated_at: "" }));
    for (let i = 0; i < inserts.length; i += 500) await appendRows("SALES_TRANSACTIONS", inserts.slice(i, i + 500));
    const ups = plan.items.filter((x) => x.status === "update");
    const last = colLetter(p.headers.length - 1);
    const data = ups.map((x) => { const ex = [...p.existing.values()].find((e) => e.rowNumber === x.existingRow)!; return { range: `'SALES_TRANSACTIONS'!A${x.existingRow}:${last}${x.existingRow}`, values: [full(x.rec, { record_id: ex.row.record_id, imported_at: ex.row.imported_at, updated_at: now })] }; });
    for (let i = 0; i < data.length; i += 200) await batchUpdateValues(data.slice(i, i + 200));
    await setStatus("success", plan.counts.invalid ? `${plan.counts.invalid} แถวนำเข้าไม่ได้` : "");
    await writeAudit(actor, "sales_import", "sales_import_batch", batchId, `${input.fileName}: +${plan.counts.insert} ~${plan.counts.update} =${plan.counts.duplicate} !${plan.counts.invalid}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    try { await setStatus("failed", msg.slice(0, 500)); await writeAudit(actor, "sales_import_failed", "sales_import_batch", batchId, msg.slice(0, 200)); } catch { /* ignore */ }
    throw new SalesError(500, `นำเข้าไม่สำเร็จ: ${msg} (ข้อมูลที่เขียนไปแล้วบางส่วนจะไม่ซ้ำเมื่อนำเข้าไฟล์เดิมอีกครั้ง)`, "WRITE_FAILED");
  }
  return { batchId, counts: plan.counts, totals: plan.totals, errors: parsed.errors.slice(0, 1000), warnings: plan.warnings };
}

export async function listSalesImports(limit = 30) {
  let t;
  try { t = (await readTabs(["SALES_IMPORT_LOG"])).SALES_IMPORT_LOG; } catch { throw new SalesError(409, "อ่านประวัติไม่ได้ กรุณากด เตรียม Google Sheet", "SHEET_NOT_READY"); }
  return t.rows.slice(-limit).reverse().map((r) => Object.fromEntries(SALES_LOG_COLUMNS.filter((c) => c !== "warnings").map((c) => [c, r[c] ?? ""])));
}
