import { SPECS } from "../import/specs";
import type { Role } from "../roles";
import { TABS } from "../schema";

export type Row = Record<string, string>;
export type ExportFilters = { from?: string; to?: string; area?: string; channel?: string; campaign?: string; includeExcluded?: boolean };
export type Applies = { date: string; area: boolean; channel: boolean; campaign: boolean };
export type Dataset = {
  id: string; filename: string; label: string; group: "การตลาด" | "Leads / Sales" | "สรุป";
  tab: string | null; columns: string[]; roles: Role[]; sensitive?: "pii" | "financial";
  applies: Applies; note: string; route?: string; special?: "summary";
  keep: (r: Row, f: ExportFilters) => boolean;
};

const INTERNAL = new Set(["record_id", "row_key", "raw_json", "source_batch_id"]);
const MKT: Role[] = ["admin", "marketing"];
const SALES: Role[] = ["admin", "sales"];
const tabCols = (tab: string) => TABS.find((t) => t.name === tab)!.headers.filter((h) => !INTERNAL.has(h));
const day = (v: string | undefined) => String(v ?? "").slice(0, 10);
const inDay = (d: string, f: ExportFilters) => (!f.from && !f.to) || (d !== "" && (!f.from || d >= f.from) && (!f.to || d <= f.to));
const overlaps = (r: Row, f: ExportFilters) => (!f.to || (r.report_start ?? "") <= f.to) && (!f.from || (r.report_end ?? "") >= f.from);
const areaOk = (r: Row, f: ExportFilters) => !f.area || (r.area || "unknown") === f.area;

const periodDataset = (id: string, tab: string, label: string, campaignKey?: string, dateKey?: string): Dataset => ({
  id, filename: `${id}.csv`, label, group: "การตลาด", tab, columns: tabCols(tab), roles: MKT,
  applies: { date: dateKey ? "วันที่ในรายงาน (date)" : "ช่วงรายงานที่ทับกับช่วงที่เลือก", area: true, channel: false, campaign: !!campaignKey },
  note: dateKey ? "รายวัน กรองตามวันที่" : "เป็นยอดรวมทั้งช่วงของรายงาน ไม่แบ่งรายวัน จึงใช้ช่วงรายงานที่ทับกับช่วงที่เลือก",
  keep: (r, f) => (dateKey ? inDay(r[dateKey], f) : overlaps(r, f)) && areaOk(r, f) && (!f.campaign || !campaignKey || r[campaignKey] === f.campaign),
});

const GOOGLE_DETAIL = SPECS.filter((s) => s.source === "google_ads" && s.id !== "gads_campaigns").map((s) =>
  periodDataset(s.tab.toLowerCase(), s.tab, s.label.replace("Google Ads — ", "Google Ads: "),
    s.fields.some((f) => f.key === "campaign_name") ? "campaign_name" : undefined, s.id === "gads_time_series" ? "date" : undefined));

export const SUMMARY_COLUMNS = ["month", "meta_ads_spend_thb", "google_ads_campaign_spend_thb", "total_paid_media_spend_thb", "ads_reports_span_months",
  "fb_posts_published", "fb_posts_reach_sum_lifetime", "fb_link_clicks", "line_new_friends", "line_inquiries", "line_leads",
  "leads_total", "leads_qualified", "won_deals", "deal_value_thb", "company_revenue_thb", "direct_cost_thb", "gross_profit_thb"];
export const SUMMARY_FINANCIAL = ["deal_value_thb", "company_revenue_thb", "direct_cost_thb", "gross_profit_thb"];

export const DATASETS: Dataset[] = [
  { id: "facebook_page_posts", filename: "facebook_page_posts.csv", label: "Facebook Page — โพสต์", group: "การตลาด", tab: "FB_PAGE_POSTS", columns: tabCols("FB_PAGE_POSTS"), roles: MKT,
    applies: { date: "วันที่เผยแพร่โพสต์", area: false, channel: false, campaign: false },
    note: "ยอดเป็นแบบสะสม (Lifetime) ณ วันส่งออก (snapshot_date) ตัดเพจที่ตั้งไว้ใน APP_CONFIG (excluded_fb_pages) ออกโดยค่าเริ่มต้น",
    keep: (r, f) => inDay(day(r.publish_time), f) },
  { ...periodDataset("facebook_ads", "META_ADS", "Facebook Ads (Meta)", "ad_set_name"), filename: "facebook_ads.csv", note: "ยอดรวมทั้งช่วงรายงาน Results แยกตาม result_indicator ห้ามรวมต่างประเภทกัน" },
  { ...periodDataset("google_ads_campaigns", "GOOGLE_ADS_CAMPAIGNS", "Google Ads — Campaign Report", "campaign_name"), note: "แหล่งยอดใช้จ่ายหลักของ Google Ads ห้ามรวมกับรายงานรายละเอียดอื่น" },
  ...GOOGLE_DETAIL,
  { id: "line_oa_monthly", filename: "line_oa_monthly.csv", label: "LINE OA รายเดือน", group: "การตลาด", tab: "LINE_OA_MONTHLY", columns: tabCols("LINE_OA_MONTHLY"), roles: MKT,
    applies: { date: "เดือนที่รายงาน", area: false, channel: false, campaign: false }, note: "หนึ่งแถวต่อเดือน",
    keep: (r, f) => { const m = (r.report_month ?? "").slice(0, 7); return (!f.from && !f.to) || (m !== "" && (!f.from || m >= f.from.slice(0, 7)) && (!f.to || m <= f.to.slice(0, 7))); } },
  { id: "leads", filename: "leads.csv", label: "Leads", group: "Leads / Sales", tab: "LEADS", columns: tabCols("LEADS"), roles: SALES, sensitive: "pii",
    applies: { date: "วันที่รับ Lead", area: true, channel: true, campaign: true }, note: "มีข้อมูลส่วนบุคคลของลูกค้า (ชื่อ เบอร์โทร อีเมล) เฉพาะ Admin และ Sales",
    keep: (r, f) => inDay(r.received_at, f) && areaOk(r, f) && (!f.channel || r.source_channel === f.channel) && (!f.campaign || r.campaign_name === f.campaign) },
  { id: "sales", filename: "sales.csv", label: "Sales — ดีล (กรอกด้วยมือ)", group: "Leads / Sales", tab: "SALES", columns: tabCols("SALES"), roles: SALES, sensitive: "financial",
    applies: { date: "วันที่ปิดการขาย", area: false, channel: true, campaign: true }, note: "ข้อมูลการเงินและลูกค้า เฉพาะ Admin และ Sales (Deal Value ไม่ใช่รายได้บริษัท)",
    keep: (r, f) => inDay(r.closing_date, f) && (!f.channel || r.source_channel === f.channel) && (!f.campaign || r.campaign_name === f.campaign) },
  { id: "sales_transactions", filename: "sales_transactions.csv", label: "Sales — รายการขายจากรายงานบัญชี (Excel)", group: "Leads / Sales", tab: null, columns: [], roles: SALES, sensitive: "financial", route: "/api/export/sales-transactions",
    applies: { date: "วันที่เอกสาร", area: false, channel: false, campaign: false }, note: "ข้อมูลการเงินและลูกค้า เฉพาะ Admin และ Sales (ตัวกรองเพิ่มเติมอยู่ที่หน้า Sales)", keep: () => true },
  { id: "marketing_monthly_summary", filename: "marketing_monthly_summary.csv", label: "สรุปการตลาดรายเดือน", group: "สรุป", tab: null, columns: SUMMARY_COLUMNS, roles: ["admin", "marketing", "sales"], special: "summary",
    applies: { date: "เดือน", area: true, channel: false, campaign: false },
    note: "หนึ่งแถวต่อเดือน ใช้ Meta Ads + Google Ads Campaign Report เท่านั้น (ไม่รวมรายงานรายละเอียด) · ช่องว่าง = ไม่มีข้อมูล ไม่ใช่ 0 · ไม่รวมยอดขายจากรายงานบัญชี · Marketing จะไม่มีคอลัมน์การเงิน · Area ใช้กับโฆษณาและ Leads",
    keep: () => true },
];
export const DATASET_BY_ID = Object.fromEntries(DATASETS.map((d) => [d.id, d])) as Record<string, Dataset>;
