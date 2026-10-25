import { toCsv } from "../csv";

/** คอลัมน์ส่งออกที่คงที่ (ไม่รวม raw_json และโน้ตภายในบริษัท) เงิน/ตัวเลขเป็น Numeric วันที่ ISO ช่องว่างเป็นว่าง */
export const SALES_EXPORT_COLUMNS = [
  "company_tax_id", "company_name", "report_period", "report_start", "report_end", "invoice_date", "invoice_no", "customer_name", "customer_tax_id", "branch",
  "project_name", "salesperson", "gross_sales", "discount_amount", "net_value", "vat_amount", "total_net", "payment_status", "reference_no", "note",
  "lead_id", "source_channel", "campaign_name", "source_file", "imported_at",
];
const NUMERIC = new Set(["gross_sales", "discount_amount", "net_value", "vat_amount", "total_net"]);

export function salesCsv(rows: Record<string, string>[]): string {
  return toCsv([SALES_EXPORT_COLUMNS, ...rows.map((r) => SALES_EXPORT_COLUMNS.map((c) => {
    const v = r[c] ?? "";
    if (NUMERIC.has(c) && v !== "" && !isNaN(Number(v))) return Number(v);
    return v;
  }))]);
}
