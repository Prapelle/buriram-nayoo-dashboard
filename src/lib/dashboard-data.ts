import { batchGet } from "./sheets";
import type { DashData, Row } from "./dashboard";
import { DEFAULT_EXCLUDED_PAGES } from "./dashboard";
import type { Role } from "./roles";

/** อ่านเฉพาะคอลัมน์ที่ใช้ (ไม่อ่าน raw_json/ข้อความยาว/ข้อมูลส่วนบุคคล) ใช้ API 2 calls รวม */
const FIN_COLS = ["deal_value_thb", "company_revenue_thb", "direct_cost_thb"];
const wanted = (role: Role): Record<string, string[]> => ({
  META_ADS: ["report_start", "report_end", "ad_set_name", "amount_spent_thb", "area", "imported_at"],
  GOOGLE_ADS_CAMPAIGNS: ["report_start", "report_end", "campaign_name", "cost_thb", "area", "imported_at"],
  GOOGLE_ADS_TIME_SERIES: ["date", "cost_thb", "imported_at"],
  FB_PAGE_POSTS: ["page_id", "page_name", "publish_time", "reach", "link_clicks", "imported_at"],
  LINE_OA_MONTHLY: ["report_month", "new_friends", "friends_end", "inquiries", "leads"],
  LEADS: ["received_at", "source_channel", "campaign_name", "area", "service_category", "status", "qualified_at"],
  SALES: ["closing_date", "revenue_date", "service_category", "source_channel", "campaign_name", "payment_status", ...(role === "marketing" ? [] : FIN_COLS)],
  APP_CONFIG: ["config_key", "config_value"],
});

export async function fetchDashboardData(role: Role): Promise<DashData> {
  const spec = wanted(role);
  const tabs = Object.keys(spec);
  const headerRows = await batchGet(tabs.map((t) => `'${t}'!1:1`));
  const ranges: { tab: string; col: string; range: string }[] = [];
  const colLetter = (i: number) => { let n = i + 1, s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  tabs.forEach((t, i) => {
    const headers = headerRows[i][0] ?? [];
    for (const col of spec[t]) { const ix = headers.indexOf(col); if (ix >= 0) { const L = colLetter(ix); ranges.push({ tab: t, col, range: `'${t}'!${L}:${L}` }); } }
  });
  const cols = await batchGet(ranges.map((r) => r.range));
  const byTab: Record<string, Row[]> = {};
  tabs.forEach((t) => { byTab[t] = []; });
  for (const t of tabs) {
    const mine = ranges.map((r, i) => ({ r, vals: cols[i] })).filter((x) => x.r.tab === t);
    const n = Math.max(0, ...mine.map((x) => x.vals.length)) - 1;
    for (let i = 1; i <= n; i++) {
      const row: Row = {};
      for (const x of mine) row[x.r.col] = x.vals[i]?.[0] ?? "";
      if (Object.values(row).some((v) => v !== "")) byTab[t].push(row);
    }
  }
  const cfg = byTab.APP_CONFIG.find((r) => r.config_key === "excluded_fb_pages")?.config_value;
  const excludedPages = cfg !== undefined ? cfg.split("|").map((s) => s.trim()).filter(Boolean) : DEFAULT_EXCLUDED_PAGES;
  const lastImport = [...byTab.META_ADS, ...byTab.GOOGLE_ADS_CAMPAIGNS, ...byTab.GOOGLE_ADS_TIME_SERIES, ...byTab.FB_PAGE_POSTS]
    .map((r) => r.imported_at).filter(Boolean).sort().pop() ?? "";
  return {
    meta: byTab.META_ADS, google: byTab.GOOGLE_ADS_CAMPAIGNS, gtime: byTab.GOOGLE_ADS_TIME_SERIES, posts: byTab.FB_PAGE_POSTS,
    line: byTab.LINE_OA_MONTHLY, leads: byTab.LEADS, sales: byTab.SALES, excludedPages, lastImport,
  };
}
