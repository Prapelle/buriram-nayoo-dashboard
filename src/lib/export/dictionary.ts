/**
 * Phase 8 — พจนานุกรมข้อมูล (Data Dictionary) ของไฟล์ Export
 * - ชนิดของแต่ละคอลัมน์มาจาก spec ของตัวนำเข้า (ตัวเดียวกับที่ใช้แปลงค่า) + กฎของคอลัมน์ระบบ/กรอกมือ
 * - ใช้ทั้ง (1) สร้างไฟล์ data_dictionary.csv (2) ปรับค่าตอนส่งออกให้รูปแบบสม่ำเสมอ (3) ตรวจในชุดทดสอบ
 */
import { SPECS } from "../import/specs";
import type { Kind } from "../import/normalize";

export type ColType = "text" | "integer" | "number" | "money_thb" | "money_usd" | "percent" | "date" | "datetime_local" | "timestamp_utc" | "month" | "boolean" | "hour_label";

export const TYPE_DOC: Record<ColType, string> = {
  text: "ข้อความ",
  integer: "จำนวนเต็ม (ตัวเลขล้วน ไม่มีคอมมา)",
  number: "ตัวเลขทศนิยม (จุดทศนิยม ไม่มีคอมมา)",
  money_thb: "จำนวนเงินบาท (ตัวเลขล้วน ไม่มี ฿ และคอมมา)",
  money_usd: "จำนวนเงิน USD (ตัวเลขล้วน)",
  percent: "เปอร์เซ็นต์เป็นตัวเลข (เช่น 5.61 = 5.61%)",
  date: "วันที่ YYYY-MM-DD",
  datetime_local: "วันเวลา YYYY-MM-DD HH:mm (ตามที่แพลตฟอร์มส่งออก)",
  timestamp_utc: "เวลาระบบ ISO 8601 UTC (YYYY-MM-DDTHH:mm:ss.sssZ)",
  month: "เดือน YYYY-MM",
  boolean: "TRUE / FALSE",
  hour_label: "ชั่วโมงแบบ 12 ชม. (เช่น 1 PM) — ใช้คู่กับ hour_24",
};

const KIND_TYPE: Record<Kind, ColType> = {
  text: "text", int: "integer", num: "number", numLoose: "number", money: "money_thb", pct: "percent",
  date: "date", isoLoose: "timestamp_utc", mdyDateTime: "datetime_local", longDate: "date", hour12: "hour_label",
};

const SPEC_TYPES = new Map<string, Map<string, ColType>>();
for (const s of SPECS) {
  const m = SPEC_TYPES.get(s.tab) ?? new Map<string, ColType>();
  for (const f of s.fields) m.set(f.key, f.key.endsWith("_usd") ? "money_usd" : KIND_TYPE[f.kind]);
  SPEC_TYPES.set(s.tab, m);
}

const MANUAL: Record<string, ColType> = {
  report_start: "date", report_end: "date", comparison_start: "date", comparison_end: "date", metric_date: "date", snapshot_date: "date",
  received_at: "date", last_contacted_at: "date", next_follow_up_at: "date", qualified_at: "date", won_at: "date",
  closing_date: "date", revenue_date: "date", invoice_date: "date",
  report_month: "month", month: "month",
  imported_at: "timestamp_utc", created_at: "timestamp_utc", updated_at: "timestamp_utc",
  hour_24: "integer", contactable: "boolean", is_crosspost: "boolean", is_share: "boolean", ads_reports_span_months: "boolean",
  friends_start: "integer", friends_end: "integer", new_friends: "integer", blocked_users: "integer", broadcast_count: "integer", messages_sent: "integer",
  messages_delivered: "integer", opens: "integer", clicks: "integer", new_chats: "integer", inquiries: "integer", leads: "integer", qualified_leads: "integer",
  duration_sec: "number",
  // รายการขายจากรายงานบัญชี (Excel)
  gross_sales: "money_thb", discount_amount: "money_thb", net_value: "money_thb", vat_amount: "money_thb", total_net: "money_thb",
  // Website Analytics (Phase 5)
  website_users: "integer", page_views: "integer", user_engagement_sec: "number", avg_engagement_sec_per_user: "number", event_count: "integer", key_events: "integer",
  total_revenue: "number", pages_count: "integer", search_clicks: "integer", search_impressions: "integer", search_position: "number",
  views: "integer", impressions: "integer", position: "number",
  sales_inc_vat: "money_thb", discount_before_vat: "money_thb", discount_doc: "money_thb",
};

/** ชนิดของคอลัมน์ (tab = ชื่อแท็บต้นทาง หรือ null สำหรับไฟล์สรุป) */
export function columnType(tab: string | null, col: string): ColType {
  const fromSpec = tab ? SPEC_TYPES.get(tab)?.get(col) : undefined;
  if (fromSpec) return fromSpec;
  if (MANUAL[col]) return MANUAL[col];
  if (/_raw$/.test(col)) return "text";
  if (/_thb$/.test(col)) return "money_thb";
  if (/_usd$/.test(col)) return "money_usd";
  if (/_pct$/.test(col)) return "percent";
  if (/^(fb_posts_published|leads_|won_deals|line_|fb_daily_|fb_posts_reach|fb_link_clicks|google_ads_campaign_clicks)/.test(col)) return /seconds/.test(col) ? "number" : "integer";
  return "text";
}

/** ค่าที่ตรงกับชนิดหรือไม่ (ค่าว่าง = ไม่มีข้อมูล ถือว่าผ่าน) */
export function valueMatches(t: ColType, v: string): boolean {
  if (v === "") return true;
  switch (t) {
    case "integer": return /^-?\d+$/.test(v);
    case "number": case "money_thb": case "money_usd": case "percent": return /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v);
    case "date": return /^\d{4}-\d{2}-\d{2}$/.test(v);
    case "datetime_local": return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(v);
    case "timestamp_utc": return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.test(v);
    case "month": return /^\d{4}-\d{2}$/.test(v);
    case "boolean": return /^(TRUE|FALSE)$/.test(v);
    case "hour_label": return /^(1[0-2]|[1-9]) (AM|PM)$/.test(v);
    default: return true;
  }
}

/**
 * ปรับค่าก่อนส่งออก (เฉพาะกรณีที่แน่ใจ ไม่เดา):
 * - วันที่ที่ถูกแก้มือใน Google Sheet จนกลายเป็นเลขลำดับวัน (เช่น 46266) → YYYY-MM-DD
 * - TRUE/FALSE ตัวพิมพ์เล็ก → ตัวพิมพ์ใหญ่
 */
export function normalizeExportValue(t: ColType, v: string): string {
  if (v === "") return v;
  if ((t === "date" || t === "month") && /^\d{5}(\.\d+)?$/.test(v)) {
    const n = Math.floor(Number(v));
    if (n > 20000 && n < 80000) { const iso = new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10); return t === "month" ? iso.slice(0, 7) : iso; }
  }
  if (t === "boolean" && /^(true|false)$/i.test(v)) return v.toUpperCase();
  return v;
}
