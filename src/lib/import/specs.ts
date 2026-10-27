import type { Kind } from "./normalize";

export type Field = { src: string; key: string; kind: Kind; required?: boolean };
export type Rec = Record<string, string | number>;

export type Spec = {
  id: string;
  source: "facebook_page" | "facebook_ads" | "google_ads";
  label: string;
  tab: string;
  /** header ที่ต้องมีครบ (ไม่สนตัวพิมพ์) ใช้ตรวจประเภทไฟล์ ตัวที่ signature ยาวกว่าชนะ */
  signature: string[];
  fields: Field[];
  /** ช่วงวันที่: file = อ่านจากคอลัมน์ในไฟล์, user = ผู้ใช้ยืนยัน (เดาจากชื่อไฟล์), snapshot = ข้อมูลสะสม ใช้วันที่นำเข้า */
  period: "file" | "user" | "snapshot";
  comparison?: boolean;
  /** field ที่ประกอบเป็น business key (ร่วมกับ source/ช่วงเวลา) */
  keyFields: string[];
  /** ซ้ำกันในไฟล์ได้ (ใช้ลำดับที่ปรากฏแยกแยะ) แทนการตีเป็นข้อผิดพลาด */
  ambiguousDuplicates?: boolean;
  /** ใช้ map Area จาก AREA_MAPPINGS */
  areaMap?: { platform: string; key: string };
  /** ตารางปลายทางไม่มีคอลัมน์ area (Facebook Page ตาม schema) */
  noArea?: boolean;
  /** ข้อมูลระดับ โพสต์ × วันที่ของสถิติ: metric_date มาจากคอลัมน์ Date (Lifetime = วันที่ส่งออกที่ผู้ใช้ยืนยัน) */
  metricDate?: { labelKey: string };
  derive?: (r: Rec) => void;
  previewKeys: string[];
};

const f = (src: string, key: string, kind: Kind, required = false): Field => ({ src, key, kind, required });

import { hour24 } from "./normalize";
const withHour = (r: Rec) => { r.hour_24 = hour24(String(r.start_hour ?? "")); };

export const SPECS: Spec[] = [
  {
    id: "fb_page", source: "facebook_page", label: "Facebook Page — สถิติโพสต์ (รายวัน / Lifetime)", tab: "FB_PAGE_POSTS",
    // ไม่บังคับ Views/Reach เพราะไฟล์รายวันของ Facebook ไม่มีคอลัมน์เหล่านี้
    signature: ["post id", "page id", "publish time", "permalink", "post type", "date"],
    period: "snapshot", keyFields: ["page_id", "post_id", "metric_date"], noArea: true, metricDate: { labelKey: "metric_period_label" },
    previewKeys: ["page_name", "metric_date", "metric_scope", "publish_time", "reactions", "comments", "shares", "seconds_viewed"],
    fields: [
      f("Post ID", "post_id", "text", true), f("Page ID", "page_id", "text", true), f("Page name", "page_name", "text"),
      f("Title", "title", "text"), f("Description", "description", "text"),
      f("Publish time", "publish_time", "mdyDateTime", true), f("Permalink", "permalink", "text"), f("Post type", "post_type", "text"),
      f("Date", "metric_period_label", "text"),
      f("Views", "views", "int"), f("Reach", "reach", "int"),
      f("Reactions, Comments and Shares", "reactions_comments_shares", "int"),
      f("Reactions", "reactions", "int"), f("Comments", "comments", "int"), f("Shares", "shares", "int"),
      f("Seconds viewed", "seconds_viewed", "num"), f("Average Seconds viewed", "average_seconds_viewed", "num"),
      f("Estimated earnings (USD)", "estimated_earnings_usd", "num"), f("Ad CPM (USD)", "ad_cpm_usd", "num"),
      f("Ad impressions", "ad_impressions", "int"), f("Total clicks", "total_clicks", "int"),
      f("Other Clicks", "other_clicks", "int"), f("Link Clicks", "link_clicks", "int"),
      f("Duration (sec)", "duration_sec", "num"), f("Caption type", "caption_type", "text"), f("Is crosspost", "is_crosspost", "text"),
      f("Is share", "is_share", "text"), f("Languages", "languages", "text"), f("Custom labels", "custom_labels", "text"),
      f("Funded content status", "funded_content_status", "text"), f("Data comment", "data_comment", "text"),
    ],
  },
  {
    id: "fb_ads", source: "facebook_ads", label: "Facebook Ads (Meta)", tab: "META_ADS",
    signature: ["reporting starts", "reporting ends", "ad name", "amount spent (thb)", "result indicator", "ad set name"],
    period: "file", keyFields: ["ad_set_name", "ad_name"], ambiguousDuplicates: true,
    areaMap: { platform: "meta_ads", key: "ad_set_name" },
    previewKeys: ["ad_set_name", "ad_name", "ad_delivery", "results", "result_indicator", "amount_spent_thb"],
    fields: [
      f("Reporting starts", "report_start", "date", true), f("Reporting ends", "report_end", "date", true),
      f("Ad name", "ad_name", "text", true), f("Ad delivery", "ad_delivery", "text"),
      f("Attribution setting", "attribution_setting", "text"),
      f("Results", "results", "num"), f("Result indicator", "result_indicator", "text"), f("Cost per results", "cost_per_results", "num"),
      f("Ad set budget", "ad_set_budget", "numLoose"), f("Ad set budget type", "ad_set_budget_type", "text"),
      f("Amount spent (THB)", "amount_spent_thb", "money"),
      f("Impressions", "impressions", "int"), f("Reach", "reach", "int"), f("Facebook likes", "facebook_likes", "int"),
      f("Ends", "ends", "text"), f("Bid", "bid", "numLoose"), f("Bid type", "bid_type", "text"),
      f("Last significant edit", "last_significant_edit", "isoLoose"),
      f("Quality ranking", "quality_ranking", "text"), f("Engagement rate ranking", "engagement_rate_ranking", "text"),
      f("Conversion rate ranking", "conversion_rate_ranking", "text"),
      f("Ad set name", "ad_set_name", "text", true),
      f("Results (initial)", "results_initial", "num"), f("Results (initial) indicator", "results_initial_indicator", "text"),
    ],
  },
  {
    id: "gads_campaigns", source: "google_ads", label: "Google Ads — Campaign Report (ยอดใช้จ่ายหลัก)", tab: "GOOGLE_ADS_CAMPAIGNS",
    signature: ["campaign name", "campaign group name", "campaign status", "cost", "clicks", "ctr"],
    period: "user", keyFields: ["campaign_name", "campaign_group_name"],
    areaMap: { platform: "google_ads", key: "campaign_name" },
    previewKeys: ["campaign_name", "campaign_status", "cost_thb", "clicks", "ctr_pct"],
    fields: [
      f("Campaign Name", "campaign_name", "text", true), f("Campaign Group Name", "campaign_group_name", "text"),
      f("Campaign Status", "campaign_status", "text"), f("Cost", "cost_thb", "money"), f("Clicks", "clicks", "int"), f("CTR", "ctr_pct", "pct"),
    ],
  },
  {
    id: "gads_search_terms", source: "google_ads", label: "Google Ads — Search Terms", tab: "GOOGLE_ADS_SEARCH_TERMS",
    signature: ["search", "cost", "clicks", "impressions", "conversions"],
    period: "user", keyFields: ["search_term"], previewKeys: ["search_term", "cost_thb", "clicks", "impressions", "conversions"],
    fields: [f("Search", "search_term", "text", true), f("Cost", "cost_thb", "money"), f("Clicks", "clicks", "int"), f("Impressions", "impressions", "int"), f("Conversions", "conversions", "num")],
  },
  {
    id: "gads_search_words", source: "google_ads", label: "Google Ads — Search Word Summary", tab: "GOOGLE_ADS_SEARCH_WORDS",
    signature: ["word", "cost", "clicks", "impressions", "conversions", "top containing queries"],
    period: "user", keyFields: ["word"], previewKeys: ["word", "cost_thb", "clicks", "impressions", "conversions"],
    fields: [f("Word", "word", "text", true), f("Cost", "cost_thb", "money"), f("Clicks", "clicks", "int"), f("Impressions", "impressions", "int"), f("Conversions", "conversions", "num"), f("Top Containing Queries", "top_containing_queries", "text")],
  },
  {
    id: "gads_keywords", source: "google_ads", label: "Google Ads — Search Keywords", tab: "GOOGLE_ADS_KEYWORDS",
    signature: ["search keyword", "match type", "criterion status", "campaign status", "ad group status", "cost", "clicks", "ctr"],
    period: "user", keyFields: ["keyword", "match_type"], previewKeys: ["keyword", "match_type", "cost_thb", "clicks", "ctr_pct"],
    fields: [f("Search Keyword", "keyword", "text", true), f("Match type", "match_type", "text", true), f("Criterion Status", "criterion_status", "text"), f("Campaign Status", "campaign_status", "text"), f("Ad Group Status", "ad_group_status", "text"), f("Cost", "cost_thb", "money"), f("Clicks", "clicks", "int"), f("CTR", "ctr_pct", "pct")],
  },
  {
    id: "gads_network", source: "google_ads", label: "Google Ads — Network", tab: "GOOGLE_ADS_NETWORK",
    signature: ["network", "clicks", "cost", "avg. cpc"],
    period: "user", keyFields: ["network"], previewKeys: ["network", "clicks", "cost_thb", "avg_cpc_thb"],
    fields: [f("Network", "network", "text", true), f("Clicks", "clicks", "int"), f("Cost", "cost_thb", "money"), f("Avg. CPC", "avg_cpc_thb", "money")],
  },
  {
    id: "gads_age", source: "google_ads", label: "Google Ads — Demographic Age", tab: "GOOGLE_ADS_AGE",
    signature: ["age range", "impressions", "percent of known total"],
    period: "user", keyFields: ["age_range"], previewKeys: ["age_range", "impressions", "percent_of_known_total"],
    fields: [f("Age Range", "age_range", "text", true), f("Impressions", "impressions", "int"), f("Percent of known total", "percent_of_known_total", "pct")],
  },
  {
    id: "gads_gender", source: "google_ads", label: "Google Ads — Demographic Gender", tab: "GOOGLE_ADS_GENDER",
    signature: ["gender", "impressions", "percent of known total"],
    period: "user", keyFields: ["gender"], previewKeys: ["gender", "impressions", "percent_of_known_total"],
    fields: [f("Gender", "gender", "text", true), f("Impressions", "impressions", "int"), f("Percent of known total", "percent_of_known_total", "pct")],
  },
  {
    id: "gads_gender_age", source: "google_ads", label: "Google Ads — Demographic Gender & Age", tab: "GOOGLE_ADS_GENDER_AGE",
    signature: ["gender", "age range", "impressions", "percent of known total"],
    period: "user", keyFields: ["gender", "age_range"], previewKeys: ["gender", "age_range", "impressions", "percent_of_known_total"],
    fields: [f("Gender", "gender", "text", true), f("Age Range", "age_range", "text", true), f("Impressions", "impressions", "int"), f("Percent of known total", "percent_of_known_total", "pct")],
  },
  {
    id: "gads_schedule_day", source: "google_ads", label: "Google Ads — Schedule by Day", tab: "GOOGLE_ADS_SCHEDULE_DAY",
    signature: ["day", "impressions"],
    period: "user", keyFields: ["day"], previewKeys: ["day", "impressions"],
    fields: [f("Day", "day", "text", true), f("Impressions", "impressions", "int")],
  },
  {
    id: "gads_schedule_hour", source: "google_ads", label: "Google Ads — Schedule by Hour", tab: "GOOGLE_ADS_SCHEDULE_HOUR",
    signature: ["start hour", "impressions"],
    period: "user", keyFields: ["start_hour"], previewKeys: ["start_hour", "hour_24", "impressions"], derive: withHour,
    fields: [f("Start Hour", "start_hour", "hour12", true), f("Impressions", "impressions", "int")],
  },
  {
    id: "gads_schedule_day_hour", source: "google_ads", label: "Google Ads — Schedule by Day & Hour", tab: "GOOGLE_ADS_SCHEDULE_DAY_HOUR",
    signature: ["day", "start hour", "impressions"],
    period: "user", keyFields: ["day", "start_hour"], previewKeys: ["day", "start_hour", "hour_24", "impressions"], derive: withHour,
    fields: [f("Day", "day", "text", true), f("Start Hour", "start_hour", "hour12", true), f("Impressions", "impressions", "int")],
  },
  {
    id: "gads_opt_score", source: "google_ads", label: "Google Ads — Optimization Score", tab: "GOOGLE_ADS_OPT_SCORE",
    signature: ["optimization score", "campaign name"],
    period: "user", keyFields: ["campaign_name"], areaMap: { platform: "google_ads", key: "campaign_name" },
    previewKeys: ["campaign_name", "optimization_score_pct"],
    fields: [f("Optimization Score", "optimization_score_pct", "pct"), f("Campaign Name", "campaign_name", "text", true)],
  },
  {
    id: "gads_changes", source: "google_ads", label: "Google Ads — Campaign Changes (เทียบสองช่วง)", tab: "GOOGLE_ADS_CAMPAIGN_CHANGES",
    signature: ["campaign name", "ad group name", "cost", "cost (comparison)", "clicks", "clicks (comparison)", "interactions", "interactions (comparison)"],
    period: "user", comparison: true, keyFields: ["campaign_name", "ad_group_name"],
    areaMap: { platform: "google_ads", key: "campaign_name" },
    previewKeys: ["campaign_name", "ad_group_name", "cost_thb", "cost_comparison_thb", "clicks"],
    fields: [
      f("Campaign Name", "campaign_name", "text", true), f("Ad Group Name", "ad_group_name", "text"),
      f("Cost", "cost_thb", "money"), f("Cost (Comparison)", "cost_comparison_thb", "money"),
      f("Clicks", "clicks", "int"), f("Clicks (Comparison)", "clicks_comparison", "int"),
      f("Interactions", "interactions", "int"), f("Interactions (Comparison)", "interactions_comparison", "int"),
    ],
  },
  // ---- ประเภทเพิ่มเติม (ไม่อยู่ใน 13 ประเภทของ spec แต่มีในไฟล์ที่ส่งมา) ----
  {
    id: "gads_devices", source: "google_ads", label: "Google Ads — Devices (เพิ่มเติม)", tab: "GOOGLE_ADS_DEVICES",
    signature: ["device", "cost", "impressions", "clicks"],
    period: "user", keyFields: ["device"], previewKeys: ["device", "cost_thb", "impressions", "clicks"],
    fields: [f("Device", "device", "text", true), f("Cost", "cost_thb", "money"), f("Impressions", "impressions", "int"), f("Clicks", "clicks", "int")],
  },
  {
    id: "gads_time_series", source: "google_ads", label: "Google Ads — Time series รายวัน (เพิ่มเติม)", tab: "GOOGLE_ADS_TIME_SERIES",
    signature: ["date", "clicks", "impressions", "avg. cpc", "cost"],
    period: "user", keyFields: ["date"], previewKeys: ["date", "clicks", "impressions", "avg_cpc_thb", "cost_thb"],
    fields: [f("Date", "date", "longDate", true), f("Clicks", "clicks", "int"), f("Impressions", "impressions", "int"), f("Avg. CPC", "avg_cpc_thb", "money"), f("Cost", "cost_thb", "money")],
  },
  {
    id: "gads_auction", source: "google_ads", label: "Google Ads — Auction Insights (เพิ่มเติม)", tab: "GOOGLE_ADS_AUCTION_INSIGHTS",
    signature: ["advertiser name", "impression share", "outranking share", "overlap rate", "top of page rate", "position above rate"],
    period: "user", keyFields: ["advertiser_name"], previewKeys: ["advertiser_name", "impression_share_pct", "top_of_page_rate_pct"],
    fields: [
      f("Advertiser Name", "advertiser_name", "text", true),
      f("Impression share", "impression_share_pct", "pct"), f("Impression share (Comparison)", "impression_share_comparison_pct", "pct"),
      f("Outranking share", "outranking_share_pct", "pct"), f("Outranking share (Comparison)", "outranking_share_comparison_pct", "pct"),
      f("Overlap rate", "overlap_rate_pct", "pct"), f("Overlap rate (Comparison)", "overlap_rate_comparison_pct", "pct"),
      f("Top of page rate", "top_of_page_rate_pct", "pct"), f("Top of page rate (Comparison)", "top_of_page_rate_comparison_pct", "pct"),
      f("Position above rate", "position_above_rate_pct", "pct"), f("Position above rate (Comparison)", "position_above_rate_comparison_pct", "pct"),
    ],
  },
];

export const SPEC_BY_ID = Object.fromEntries(SPECS.map((s) => [s.id, s])) as Record<string, Spec>;

/** คอลัมน์ของแท็บที่สร้างจาก spec (ใช้กับแท็บรายละเอียด Google Ads) */
export function headersFromSpec(s: Spec): string[] {
  const period = s.period === "file" ? [] : ["report_start", "report_end"];
  const cmp = s.comparison ? ["comparison_start", "comparison_end"] : [];
  const derived = s.derive ? ["hour_24"] : [];
  return ["record_id", ...period, ...cmp, ...s.fields.map((x) => x.key), ...derived, ...(s.noArea ? [] : ["area"]), "row_key", "raw_json", "source_batch_id", "imported_at"];
}
