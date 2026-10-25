export const PAID_STATUS = "เก็บเงินแล้ว";
export const CANCEL_PATTERN = /ยกเลิก|cancel|void/i;

/** คอลัมน์ของรายงานยอดขาย: key = ช่องในฐานข้อมูล, names = ชื่อหัวตารางที่ยอมรับ (เทียบแบบไม่สนช่องว่าง/ตัวพิมพ์) */
export type ColDef = { key: string; names: string[]; kind: "date" | "text" | "money"; prefix?: boolean };
export const REPORT_COLUMNS: ColDef[] = [
  { key: "invoice_date", names: ["วัน/เดือน/ปี", "วันที่"], kind: "date" },
  { key: "invoice_no", names: ["เลขที่เอกสาร"], kind: "text" },
  { key: "customer_name", names: ["ชื่อลูกค้า"], kind: "text" },
  { key: "project_name", names: ["ชื่อโปรเจ็ค", "ชื่อโปรเจค", "ชื่อโครงการ"], kind: "text" },
  { key: "customer_tax_id", names: ["เลขผู้เสียภาษี", "เลขประจำตัวผู้เสียภาษี"], kind: "text" },
  { key: "branch", names: ["สำนักงานใหญ่/สาขา"], kind: "text" },
  { key: "sales_ex_vat", names: ["ขายแยกภาษี"], kind: "money" },
  { key: "sales_inc_vat", names: ["ขายรวมภาษี"], kind: "money" },
  { key: "discount_before_vat", names: ["ส่วนลดก่อน vat"], kind: "money" },
  { key: "discount_doc", names: ["ส่วนลดตามเอกสาร"], kind: "money" },
  { key: "net_value", names: ["มูลค่า"], kind: "money" },
  { key: "vat_amount", names: ["ภาษีมูลค่าเพิ่ม"], kind: "money" },
  { key: "total_net_col", names: ["ยอดรวมสุทธิ"], kind: "money" },
  { key: "ref_doc_system", names: ["เอกสารอ้างอิงในระบบ"], kind: "text" },
  { key: "reference_no", names: ["เลขที่อ้างอิง"], kind: "text" },
  { key: "deposit_ref_doc", names: ["เอกสารอ้างอิงรับมัดจำ"], kind: "text" },
  { key: "payment_status", names: ["สถานะ"], kind: "text" },
  { key: "salesperson", names: ["พนักงานขาย"], kind: "text" },
  { key: "note", names: ["หมายเหตุ"], kind: "text" },
  { key: "internal_note", names: ["โน้ต"], kind: "text", prefix: true },
];
export const REQUIRED_HEADERS = ["invoice_no", "invoice_date", "customer_name", "total_net_col"];

/** คอลัมน์ของแท็บ SALES_TRANSACTIONS (ตามสเปกขั้น 7 + คอลัมน์ต้นฉบับสำหรับตรวจสอบย้อนกลับ) */
export const SALES_TX_COLUMNS = [
  "record_id", "row_key", "company_tax_id", "company_name", "report_period", "report_start", "report_end",
  "invoice_date", "invoice_no", "customer_name", "customer_tax_id", "branch", "project_name", "salesperson",
  "gross_sales", "discount_amount", "net_value", "vat_amount", "total_net", "payment_status",
  "sales_inc_vat", "discount_before_vat", "discount_doc",
  "ref_doc_system", "reference_no", "deposit_ref_doc", "note", "internal_note",
  "lead_id", "source_channel", "campaign_name",
  "source_file", "source_row_number", "source_batch_id", "raw_json", "imported_at", "updated_at",
];
/** ใช้เทียบว่ารายการเดิมเปลี่ยนค่าหรือไม่ */
export const SALES_COMPARE_KEYS = [
  "report_period", "report_start", "report_end", "invoice_date", "customer_name", "customer_tax_id", "branch", "project_name", "salesperson",
  "gross_sales", "discount_amount", "net_value", "vat_amount", "total_net", "payment_status", "sales_inc_vat", "discount_before_vat", "discount_doc",
  "ref_doc_system", "reference_no", "deposit_ref_doc", "note", "internal_note",
];
export const SALES_LOG_COLUMNS = [
  "batch_id", "imported_at", "imported_by", "source_file", "sheet_name", "company_tax_id", "company_name", "report_start", "report_end",
  "status", "rows_total", "rows_inserted", "rows_updated", "rows_skipped", "rows_invalid", "total_net_in_file", "total_net_imported",
  "fingerprint", "warnings", "error_summary",
];
