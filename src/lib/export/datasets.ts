import { SPECS } from "../import/specs";
import type { Role } from "../roles";
import { TABS } from "../schema";
import { normalizeActionRows } from "../fbactions";

export type Row = Record<string, string>;
export type ExportFilters = { from?: string; to?: string; area?: string; channel?: string; campaign?: string; includeExcluded?: boolean; need?: string };
export type Applies = { date: string; area: boolean; channel: boolean; campaign: boolean; need?: boolean };
export type Dataset = {
  id: string; filename: string; label: string; group: "การตลาด" | "Leads / Sales" | "สรุป";
  /** Phase 8: ระดับความละเอียดของข้อมูล (หนึ่งแถวคืออะไร) */
  grain: string;
  tab: string | null; columns: string[]; roles: Role[]; sensitive?: "pii" | "financial";
  applies: Applies; note: string; route?: string; special?: "summary" | "performance" | "dictionary";
  keep: (r: Row, f: ExportFilters) => boolean;
  /** คอลัมน์ที่คำนวณเพิ่มตอนส่งออก (ต่อท้ายคอลัมน์เดิม ไม่เปลี่ยนลำดับเดิม) */
  derive?: { columns: string[]; apply: (rows: Row[]) => Row[] };
};

const INTERNAL = new Set(["record_id", "row_key", "raw_json", "source_batch_id"]);
const MKT: Role[] = ["admin", "marketing"];
const SALES: Role[] = ["admin", "sales"];
const tabCols = (tab: string) => TABS.find((t) => t.name === tab)!.headers.filter((h) => !INTERNAL.has(h));
const day = (v: string | undefined) => String(v ?? "").slice(0, 10);
const inDay = (d: string, f: ExportFilters) => (!f.from && !f.to) || (d !== "" && (!f.from || d >= f.from) && (!f.to || d <= f.to));
const overlaps = (r: Row, f: ExportFilters) => (!f.to || (r.report_start ?? "") <= f.to) && (!f.from || (r.report_end ?? "") >= f.from);
const areaOk = (r: Row, f: ExportFilters) => !f.area || (r.area || "unknown") === f.area;

const grainOf = (tab: string, dateKey?: string) => {
  const sp = SPECS.find((x) => x.tab === tab);
  if (dateKey) return `หนึ่งแถวต่อ ${dateKey} (รายวัน)`;
  return `หนึ่งแถวต่อ ${(sp?.keyFields ?? []).join(" × ") || "แถวในรายงาน"} ต่อช่วงรายงาน (report_start–report_end)${sp?.comparison ? " พร้อมช่วงเปรียบเทียบ" : ""}`;
};
const periodDataset = (id: string, tab: string, label: string, campaignKey?: string, dateKey?: string): Dataset => ({
  id, filename: `${id}.csv`, label, group: "การตลาด", tab, columns: tabCols(tab), roles: MKT, grain: grainOf(tab, dateKey),
  applies: { date: dateKey ? "วันที่ในรายงาน (date)" : "ช่วงรายงานที่ทับกับช่วงที่เลือก", area: true, channel: false, campaign: !!campaignKey },
  note: dateKey ? "รายวัน กรองตามวันที่" : "เป็นยอดรวมทั้งช่วงของรายงาน ไม่แบ่งรายวัน จึงใช้ช่วงรายงานที่ทับกับช่วงที่เลือก",
  keep: (r, f) => (dateKey ? inDay(r[dateKey], f) : overlaps(r, f)) && areaOk(r, f) && (!f.campaign || !campaignKey || r[campaignKey] === f.campaign),
});

const GOOGLE_DETAIL = SPECS.filter((s) => s.source === "google_ads" && s.id !== "gads_campaigns").map((s) =>
  periodDataset(s.tab.toLowerCase(), s.tab, s.label.replace("Google Ads — ", "Google Ads: "),
    s.fields.some((f) => f.key === "campaign_name") ? "campaign_name" : undefined, s.id === "gads_time_series" ? "date" : undefined));

export const SUMMARY_COLUMNS = ["month", "meta_ads_spend_thb", "google_ads_campaign_spend_thb", "total_paid_media_spend_thb", "ads_reports_span_months",
  "fb_posts_published", "fb_posts_reach_sum_lifetime", "fb_link_clicks", "line_new_friends", "line_inquiries", "line_leads",
  "leads_total", "leads_qualified", "won_deals", "deal_value_thb", "company_revenue_thb", "direct_cost_thb", "gross_profit_thb",
  // Phase 1: เพิ่มต่อท้าย (ยอดรายวันของ Facebook ตามเดือนของวันที่ของสถิติ)
  "fb_daily_engagement", "fb_daily_seconds_viewed", "fb_daily_reach_sum", "fb_daily_link_clicks",
  // Phase 8: เพิ่มต่อท้าย (คอลัมน์เดิมไม่เปลี่ยนชื่อ/ลำดับ)
  "google_ads_campaign_clicks", "leads_from_ads", "leads_need_buy_rent_build", "leads_need_sell"];
export const PERFORMANCE_COLUMNS = ["period_from", "period_to", "group", "kind", "kpi_key", "kpi_label", "unit", "value", "state", "incomplete_reason", "source_note",
  "yoy_period_from", "yoy_period_to", "yoy_value", "yoy_change_pct", "yoy_status"];
export const DICTIONARY_COLUMNS = ["dataset_id", "filename", "grain", "column_position", "column_name", "column_type", "type_format"];
export const SUMMARY_FINANCIAL = ["deal_value_thb", "company_revenue_thb", "direct_cost_thb", "gross_profit_thb"];

export const DATASETS: Dataset[] = [
  { id: "facebook_page_posts", filename: "facebook_page_posts.csv", label: "Facebook Page — สถิติโพสต์", group: "การตลาด", tab: "FB_PAGE_POSTS", columns: tabCols("FB_PAGE_POSTS"), roles: MKT,
    grain: "หนึ่งแถวต่อ โพสต์ (page_id × post_id) × วันที่ของสถิติ (metric_date)",
    applies: { date: "วันที่ของสถิติ (metric_date)", area: false, channel: false, campaign: false },
    note: "หนึ่งแถวต่อ โพสต์ × วันที่ของสถิติ (metric_date) · metric_scope = daily คือยอดของวันนั้น (รวมข้ามวันได้), lifetime คือยอดสะสม ณ วันส่งออก (ห้ามรวมข้ามวัน) · average_seconds_viewed และ ad_cpm_usd เป็นค่าเฉลี่ย ห้ามรวม · ตัดเพจที่ตั้งไว้ใน APP_CONFIG (excluded_fb_pages) ออกโดยค่าเริ่มต้น",
    keep: (r, f) => inDay((r.metric_date || r.snapshot_date || "").slice(0, 10), f) },
  { ...periodDataset("facebook_ads", "META_ADS", "Facebook Ads (Meta)", "ad_set_name"), filename: "facebook_ads.csv",
    note: "ยอดรวมทั้งช่วงรายงาน Results แยกตาม result_indicator ห้ามรวมต่างประเภทกัน · result_indicator แสดงชื่อ Action ที่ตัด prefix actions:/Action: แล้ว ค่าต้นฉบับอยู่ในคอลัมน์ result_indicator_raw (ท้ายไฟล์)",
    derive: { columns: ["result_indicator_raw", "results_initial_indicator_raw"], apply: normalizeActionRows } },
  { ...periodDataset("google_ads_campaigns", "GOOGLE_ADS_CAMPAIGNS", "Google Ads — Campaign Report", "campaign_name"), note: "แหล่งยอดใช้จ่ายหลักของ Google Ads ห้ามรวมกับรายงานรายละเอียดอื่น" },
  ...GOOGLE_DETAIL,
  { id: "line_oa_monthly", filename: "line_oa_monthly.csv", label: "LINE OA รายเดือน", group: "การตลาด", tab: "LINE_OA_MONTHLY", columns: tabCols("LINE_OA_MONTHLY"), roles: MKT, grain: "หนึ่งแถวต่อเดือน (report_month)",
    applies: { date: "เดือนที่รายงาน", area: false, channel: false, campaign: false }, note: "หนึ่งแถวต่อเดือน",
    keep: (r, f) => { const m = (r.report_month ?? "").slice(0, 7); return (!f.from && !f.to) || (m !== "" && (!f.from || m >= f.from.slice(0, 7)) && (!f.to || m <= f.to.slice(0, 7))); } },
  { id: "leads", filename: "leads.csv", label: "Leads", group: "Leads / Sales", tab: "LEADS", columns: tabCols("LEADS"), roles: SALES, sensitive: "pii", grain: "หนึ่งแถวต่อ Lead (lead_id)",
    applies: { date: "วันที่รับ Lead", area: true, channel: true, campaign: true, need: true }, note: "มีข้อมูลส่วนบุคคลของลูกค้า (ชื่อ เบอร์โทร อีเมล) เฉพาะ Admin และ Sales · status คำนวณจาก buy_status / sell_status (ตาม need)",
    keep: (r, f) => inDay(r.received_at, f) && areaOk(r, f) && (!f.channel || r.source_channel === f.channel) && (!f.campaign || r.campaign_name === f.campaign) && (!f.need || r.need === f.need) },
  { id: "sales", filename: "sales.csv", label: "Sales — ดีล (กรอกด้วยมือ)", group: "Leads / Sales", tab: "SALES", columns: tabCols("SALES"), roles: SALES, sensitive: "financial", grain: "หนึ่งแถวต่อดีล (sale_id)",
    applies: { date: "วันที่ปิดการขาย", area: false, channel: true, campaign: true }, note: "ข้อมูลการเงินและลูกค้า เฉพาะ Admin และ Sales (Deal Value ไม่ใช่รายได้บริษัท)",
    keep: (r, f) => inDay(r.closing_date, f) && (!f.channel || r.source_channel === f.channel) && (!f.campaign || r.campaign_name === f.campaign) },
  { id: "sales_transactions", filename: "sales_transactions.csv", label: "Sales — รายการขายจากรายงานบัญชี (Excel)", group: "Leads / Sales", tab: null, columns: [], roles: SALES, sensitive: "financial", route: "/api/export/sales-transactions", grain: "หนึ่งแถวต่อเอกสารขาย (invoice_no)",
    applies: { date: "วันที่เอกสาร", area: false, channel: false, campaign: false }, note: "ข้อมูลการเงินและลูกค้า เฉพาะ Admin และ Sales (ตัวกรองเพิ่มเติมอยู่ที่หน้า Sales)", keep: () => true },
  { id: "marketing_monthly_summary", filename: "marketing_monthly_summary.csv", label: "สรุปการตลาดรายเดือน", group: "สรุป", tab: null, columns: SUMMARY_COLUMNS, roles: ["admin", "marketing", "sales"], special: "summary",
    grain: "หนึ่งแถวต่อเดือน (ตัวเลขสรุปจากไฟล์ต้นฉบับ — ห้ามนำไปรวมกับไฟล์ต้นฉบับ จะนับซ้ำ)",
    applies: { date: "เดือน", area: true, channel: false, campaign: false },
    note: "หนึ่งแถวต่อเดือน · fb_posts_published = โพสต์ที่เผยแพร่ในเดือน (ไม่ซ้ำ) · fb_posts_reach_sum_lifetime/fb_link_clicks = ยอดสะสม (Lifetime) ล่าสุดของแต่ละโพสต์ ตามเดือนที่เผยแพร่ · fb_daily_* = ผลรวมรายวันตามเดือนของวันที่ของสถิติ (fb_daily_reach_sum ไม่ใช่ Unique Reach) · ใช้ Meta Ads + Google Ads Campaign Report เท่านั้น (ไม่รวมรายงานรายละเอียด) · ช่องว่าง = ไม่มีข้อมูล ไม่ใช่ 0 · ไม่รวมยอดขายจากรายงานบัญชี · Marketing จะไม่มีคอลัมน์การเงิน · Area ใช้กับโฆษณาและ Leads · leads_total นับ lead_id ไม่ซ้ำ · leads_qualified = Lead ที่ Call Status = ติดต่อได้แล้ว · google_ads_campaign_clicks มาจาก Campaign Report (ชุดเดียวกับ Spend) · leads_from_ads = ช่องทาง Facebook Ads / Google Ads",
    keep: () => true },
  { id: "marketing_performance_kpis", filename: "marketing_performance_kpis.csv", label: "Marketing Performance — KPI ของช่วงที่เลือก", group: "สรุป", tab: null, columns: PERFORMANCE_COLUMNS, roles: MKT, special: "performance",
    grain: "หนึ่งแถวต่อ KPI ของช่วงวันที่ที่เลือก พร้อมค่าปีก่อน (YoY) — ตัวเลขสรุป ห้ามนำไปรวมกับไฟล์ต้นฉบับ",
    applies: { date: "ช่วงที่คำนวณ (ไม่เลือก = ช่วงข้อมูลทั้งหมดที่มี)", area: false, channel: false, campaign: false },
    note: "ตัวเลขเดียวกับหน้า Marketing Performance · value ว่าง + state = pending คือรอข้อมูล, na คือหารด้วย 0 · yoy_change_pct ว่างเมื่อปีก่อนไม่มีข้อมูลหรือเป็น 0 (ดู yoy_status) · Paid / Organic / Website แยกด้วยคอลัมน์ kind",
    keep: () => true },
  { id: "data_dictionary", filename: "data_dictionary.csv", label: "พจนานุกรมข้อมูล — ชื่อคอลัมน์ ชนิด และระดับข้อมูลของทุกไฟล์", group: "สรุป", tab: null, columns: DICTIONARY_COLUMNS, roles: ["admin", "marketing", "sales"], special: "dictionary",
    grain: "หนึ่งแถวต่อ คอลัมน์ × ไฟล์ส่งออก", applies: { date: "ไม่ใช้", area: false, channel: false, campaign: false },
    note: "อธิบายทุกไฟล์ที่ส่งออกได้: ระดับข้อมูล (grain), ลำดับคอลัมน์, ชนิดข้อมูล และรูปแบบวันที่ · ใช้ตรวจโครงสร้างก่อนนำไปใช้ต่อ", keep: () => true },
];
export const DATASET_BY_ID = Object.fromEntries(DATASETS.map((d) => [d.id, d])) as Record<string, Dataset>;
