export type TabDef = { name: string; group: "system" | "marketing" | "manual"; headers: string[] };

import { SPECS, headersFromSpec } from "./import/specs";
import { SALES_LOG_COLUMNS, SALES_TX_COLUMNS } from "./sales/model";

// แท็บ Google Ads รายละเอียดสร้างจาก spec เดียวกับตัว Import เพื่อให้คอลัมน์ตรงกันเสมอ
const gads = (id: string): TabDef => {
  const spec = SPECS.find((x) => x.id === id)!;
  return { name: spec.tab, group: "marketing", headers: headersFromSpec(spec) };
};

export const TABS: TabDef[] = [
  { name: "APP_USERS", group: "system", headers: ["user_id","email","display_name","role","active","created_at","updated_at","created_by"] },
  { name: "APP_CONFIG", group: "system", headers: ["config_key","config_value","description","updated_at"] },
  { name: "SERVICE_CATALOG", group: "system", headers: ["service_id","category","service_name","package_name","active","notes","created_at","updated_at"] },
  { name: "AREA_MAPPINGS", group: "system", headers: ["mapping_id","source_platform","source_name","area","confirmed","notes","updated_by","updated_at"] },
  { name: "IMPORT_BATCHES", group: "system", headers: ["batch_id","source","report_type","filename","file_sha256","report_start","report_end","comparison_start","comparison_end","area","uploaded_by","uploaded_at","status","rows_total","rows_inserted","rows_updated","rows_skipped","rows_invalid","drive_file_id","error_summary"] },
  { name: "IMPORT_ERRORS", group: "system", headers: ["error_id","batch_id","source_row_number","column_name","raw_value","error_code","message","created_at"] },
  { name: "AUDIT_LOG", group: "system", headers: ["audit_id","actor_email","action","entity_type","entity_id","timestamp","summary"] },

  { name: "FB_PAGE_POSTS", group: "marketing", headers: ["record_id","page_id","post_id","page_name","title","description","publish_time","permalink","post_type","metric_period_label","snapshot_date","views","reach","reactions_comments_shares","reactions","comments","shares","seconds_viewed","average_seconds_viewed","estimated_earnings_usd","ad_cpm_usd","ad_impressions","total_clicks","other_clicks","link_clicks","raw_json","row_key","source_batch_id","source_filename","imported_at",
    // Phase 1: เพิ่มต่อท้ายเท่านั้น (ไม่เปลี่ยนลำดับ/ชื่อคอลัมน์เดิม)
    "metric_date","metric_scope","duration_sec","caption_type","is_crosspost","is_share","languages","custom_labels","funded_content_status","data_comment"] },
  { name: "META_ADS", group: "marketing", headers: ["record_id","report_start","report_end","ad_name","ad_delivery","attribution_setting","results","result_indicator","cost_per_results","ad_set_budget","ad_set_budget_type","amount_spent_thb","impressions","reach","facebook_likes","ends","bid","bid_type","last_significant_edit","quality_ranking","engagement_rate_ranking","conversion_rate_ranking","ad_set_name","results_initial","results_initial_indicator","area","row_key","raw_json","source_batch_id","imported_at"] },
  { name: "GOOGLE_ADS_CAMPAIGNS", group: "marketing", headers: ["record_id","report_start","report_end","campaign_name","campaign_group_name","campaign_status","cost_thb","clicks","ctr_pct","area","row_key","raw_json","source_batch_id","imported_at"] },
  gads("gads_search_terms"),
  gads("gads_search_words"),
  gads("gads_keywords"),
  gads("gads_network"),
  gads("gads_age"),
  gads("gads_gender"),
  gads("gads_gender_age"),
  gads("gads_schedule_day"),
  gads("gads_schedule_hour"),
  gads("gads_schedule_day_hour"),
  gads("gads_opt_score"),
  gads("gads_changes"),
  gads("gads_devices"),
  gads("gads_time_series"),
  gads("gads_auction"),

  { name: "LINE_OA_MONTHLY", group: "manual", headers: ["record_id","report_month","friends_start","friends_end","new_friends","blocked_users","broadcast_count","messages_sent","messages_delivered","opens","clicks","new_chats","inquiries","leads","qualified_leads","campaign_activity","notes","created_by","created_at","updated_at"] },
  { name: "LEADS", group: "manual", headers: ["lead_id","lead_code","received_at","customer_name","company_name","phone","email","source_channel","campaign_name","utm_source","utm_medium","utm_campaign","area","service_category","service_interest","need_description","owner_email","status","contactable","last_contacted_at","next_follow_up_at","qualified_at","won_at","lost_reason","notes","created_by","created_at","updated_by","updated_at"] },
  { name: "SALES", group: "manual", headers: ["sale_id","sale_code","lead_id","closing_date","revenue_date","customer_name","company_name","service_category","package_name","deal_value_thb","company_revenue_thb","direct_cost_thb","payment_status","source_channel","campaign_name","owner_email","notes","created_by","created_at","updated_by","updated_at","invoice_no"] },
  { name: "SALES_TRANSACTIONS", group: "manual", headers: SALES_TX_COLUMNS },
  { name: "SALES_IMPORT_LOG", group: "system", headers: SALES_LOG_COLUMNS },
];

export const AREAS = ["buriram", "surin", "multi_province", "unknown"] as const;
