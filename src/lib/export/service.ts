import { writeAudit } from "../audit";
import { toCsv } from "../csv";
import { metricDateOf, postKey, scopeOf } from "../fbmetrics";
import { csvSafe } from "../csvsafe";
import { DEFAULT_EXCLUDED_PAGES, num } from "../dashboard";
import { isIsoDate } from "../import/normalize";
import type { Role } from "../roles";
import { getExcludedPages, readColumns } from "../tabdata";
import { DATASET_BY_ID, DATASETS, SUMMARY_COLUMNS, SUMMARY_FINANCIAL, type Dataset, type ExportFilters, type Row } from "./datasets";
import { TYPE_DOC, columnType, normalizeExportValue } from "./dictionary";
import { isQualifiedCall, NEEDS, BUY_NEEDS, SELL_NEEDS } from "../lead-options";
import { fetchDashboardData } from "../dashboard-data";
import { computePerformance } from "../performance";
import { changePct } from "../compare";
import { SALES_EXPORT_COLUMNS } from "../sales/export";

export class ExportError extends Error { constructor(public status: number, message: string, public code: string) { super(message); } }

const r2 = (n: number) => Math.round(n * 100) / 100;
const isIso = (v?: string) => !!v && isIsoDate(v);

export function parseFilters(sp: URLSearchParams): ExportFilters {
  const from = sp.get("from") || undefined, to = sp.get("to") || undefined;
  if ((from && !isIso(from)) || (to && !isIso(to))) throw new ExportError(400, "รูปแบบวันที่ไม่ถูกต้อง", "BAD_DATE");
  if (from && to && from > to) throw new ExportError(400, "วันเริ่มต้องไม่หลังวันสิ้นสุด", "BAD_RANGE");
  const area = sp.get("area") || undefined;
  if (area && !["buriram", "surin", "multi_province", "unknown"].includes(area)) throw new ExportError(400, "Area ไม่ถูกต้อง", "BAD_AREA");
  const need = sp.get("need") || undefined;
  if (need && !NEEDS.includes(need)) throw new ExportError(400, "Need ไม่ถูกต้อง", "BAD_NEED");
  return { from, to, area, channel: sp.get("channel") || undefined, campaign: sp.get("campaign") || undefined, includeExcluded: sp.get("include_excluded") === "1", need };
}

function overlapProblem(rows: Row[], label: string): string | null {
  const pairs = [...new Set(rows.map((r) => `${r.report_start}|${r.report_end}`))].map((p) => p.split("|"));
  for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++)
    if (pairs[i][0] <= pairs[j][1] && pairs[j][0] <= pairs[i][1]) return `${label}: ช่วงรายงาน ${pairs[i].join("–")} ทับกับ ${pairs[j].join("–")} จึงสรุปรายเดือนโดยไม่นับซ้ำไม่ได้ กรุณาจัดการข้อมูลช่วงที่ทับกันก่อน`;
  return null;
}

export function buildSummary(d: { meta: Row[]; google: Row[]; posts: Row[]; line: Row[]; leads: Row[]; sales: Row[]; excluded: string[]; fbPage?: Row[] }, f: ExportFilters, role: Role) {
  for (const p of [overlapProblem(d.meta, "Meta Ads"), overlapProblem(d.google, "Google Ads Campaign")]) if (p) throw new ExportError(409, p, "OVERLAPPING_REPORTS");
  const ex = new Set(d.excluded);
  const months = new Map<string, Record<string, number | string>>();
  const get = (m: string) => { if (!months.has(m)) months.set(m, {}); return months.get(m)!; };
  const add = (m: string, k: string, v: number | null) => { if (v === null || !m || !k) return; const o = get(m); o[k] = r2(((o[k] as number) ?? 0) + v); };
  const mark = (m: string, k: string) => { if (m) get(m)[k] = Number(((get(m)[k] as number) ?? 0)) + 1; };

  for (const r of d.meta) if (!f.area || (r.area || "unknown") === f.area) { add(r.report_start.slice(0, 7), "meta_ads_spend_thb", num(r.amount_spent_thb)); if (r.report_start.slice(0, 7) !== r.report_end.slice(0, 7)) get(r.report_start.slice(0, 7)).ads_reports_span_months = "TRUE"; }
  for (const r of d.google) if (!f.area || (r.area || "unknown") === f.area) { add(r.report_start.slice(0, 7), "google_ads_campaign_spend_thb", num(r.cost_thb)); add(r.report_start.slice(0, 7), "google_ads_campaign_clicks", num(r.clicks)); if (r.report_start.slice(0, 7) !== r.report_end.slice(0, 7)) get(r.report_start.slice(0, 7)).ads_reports_span_months = "TRUE"; }
  // Facebook Page (กฎเดียวกับ lib/fbmetrics.ts): โพสต์นับไม่ซ้ำตามเดือนที่เผยแพร่, Lifetime ใช้ snapshot ล่าสุดต่อโพสต์, รายวันรวมตามเดือนของ metric_date
  const fbRows = d.posts.filter((r) => f.includeExcluded || (!ex.has(r.page_name) && !ex.has(r.page_id)));
  const pubMonth = new Map<string, string>();
  for (const r of fbRows) if (r.publish_time) pubMonth.set(postKey(r), String(r.publish_time).slice(0, 7));
  pubMonth.forEach((m) => mark(m, "fb_posts_published"));
  const latestLife = new Map<string, Row>();
  for (const r of fbRows) {
    if (scopeOf(r) !== "lifetime") continue;
    const k = postKey(r), cur = latestLife.get(k);
    if (!cur || metricDateOf(r) > metricDateOf(cur)) latestLife.set(k, r);
  }
  latestLife.forEach((r, k) => { const m = pubMonth.get(k) ?? ""; add(m, "fb_posts_reach_sum_lifetime", num(r.reach)); add(m, "fb_link_clicks", num(r.link_clicks)); });
  for (const r of fbRows) if (scopeOf(r) === "daily") {
    const m = metricDateOf(r).slice(0, 7);
    add(m, "fb_daily_engagement", num(r.reactions_comments_shares)); add(m, "fb_daily_seconds_viewed", num(r.seconds_viewed));
    add(m, "fb_daily_reach_sum", num(r.reach)); add(m, "fb_daily_link_clicks", num(r.link_clicks));
  }
  // Facebook ระดับเพจรายวัน: วันเดียวกันนำเข้าซ้ำ → ใช้แถวที่นำเข้าล่าสุด
  const pgDay = new Map<string, Row>();
  for (const r of d.fbPage ?? []) { const k = `${r.metric}|${String(r.metric_date).slice(0, 10)}`, cur = pgDay.get(k); if (!cur || String(r.imported_at ?? "") >= String(cur.imported_at ?? "")) pgDay.set(k, r); }
  pgDay.forEach((r) => add(String(r.metric_date).slice(0, 7), r.metric === "viewers" ? "fb_page_viewers_sum" : r.metric === "link_clicks" ? "fb_page_link_clicks" : "", num(r.value)));
  for (const r of d.line) { const m = String(r.report_month).slice(0, 7); add(m, "line_new_friends", num(r.new_friends)); add(m, "line_inquiries", num(r.inquiries)); add(m, "line_leads", num(r.leads)); }
  // Leads: นับ lead_id ไม่ซ้ำ (กฎเดียวกับ Dashboard) · แถวที่ไม่มี lead_id ไม่นับ
  const seenLead = new Set<string>();
  for (const r of d.leads) if (!f.area || (r.area || "unknown") === f.area) {
    if (r.lead_id !== undefined) { if (!r.lead_id || seenLead.has(r.lead_id)) continue; seenLead.add(r.lead_id); }
    const m = String(r.received_at).slice(0, 7); mark(m, "leads_total");
    if (isQualifiedCall(r.call_status)) mark(m, "leads_qualified"); // นิยามเดียวกับ Dashboard: Call Status = ติดต่อได้แล้ว / เข้าชมโครงการแล้ว / ซื้อสำเร็จ
    if (["Facebook Ads", "Google Ads"].includes(r.source_channel)) mark(m, "leads_from_ads");
    if (BUY_NEEDS.includes(r.need ?? "")) mark(m, "leads_need_buy_rent_build");
    if (SELL_NEEDS.includes(r.need ?? "")) mark(m, "leads_need_sell");
  }
  const gp = new Map<string, number>(); 
  for (const r of d.sales) if (!["Cancelled", "Refunded"].includes(r.payment_status)) {
    const m = String(r.closing_date).slice(0, 7); mark(m, "won_deals"); add(m, "deal_value_thb", num(r.deal_value_thb));
    const rm = String(r.revenue_date || r.closing_date).slice(0, 7);
    add(rm, "company_revenue_thb", num(r.company_revenue_thb)); add(rm, "direct_cost_thb", num(r.direct_cost_thb));
    if (num(r.company_revenue_thb) !== null && num(r.direct_cost_thb) !== null) gp.set(rm, r2((gp.get(rm) ?? 0) + num(r.company_revenue_thb)! - num(r.direct_cost_thb)!));
  }
  gp.forEach((v, m) => { get(m).gross_profit_thb = v; });

  const fm = f.from?.slice(0, 7), tm = f.to?.slice(0, 7);
  const restricted = role === "marketing";
  const columns = SUMMARY_COLUMNS.filter((c) => !(restricted && SUMMARY_FINANCIAL.includes(c)));
  const rows = [...months.keys()].filter((m) => /^\d{4}-\d{2}$/.test(m) && (!fm || m >= fm) && (!tm || m <= tm)).sort().map((m) => {
    const o = months.get(m)!;
    const meta = o.meta_ads_spend_thb as number | undefined, g = o.google_ads_campaign_spend_thb as number | undefined;
    const total = meta === undefined && g === undefined ? undefined : r2((meta ?? 0) + (g ?? 0));
    const rec: Record<string, string | number> = { month: m, ...o, ...(total === undefined ? {} : { total_paid_media_spend_thb: total }) };
    return columns.map((c) => rec[c] ?? "");
  });
  return { columns, rows };
}

async function read(tab: string, only?: string[]) { return (await readColumns(tab, only ? { only } : {})).rows; }

/** สร้างไฟล์ CSV ของชุดข้อมูล (ตรวจสิทธิ์ตาม Role ก่อน) */
export async function exportDataset(id: string, f: ExportFilters, role: Role, actor: string, opts: { countOnly?: boolean } = {}) {
  const ds: Dataset | undefined = DATASET_BY_ID[id];
  if (!ds) throw new ExportError(404, "ไม่พบชุดข้อมูลนี้", "NOT_FOUND");
  if (!ds.roles.includes(role)) throw new ExportError(403, "ไม่มีสิทธิ์ส่งออกชุดข้อมูลนี้", "FORBIDDEN");
  if (ds.route) throw new ExportError(400, `ชุดข้อมูลนี้ใช้ลิงก์ ${ds.route}`, "USE_ROUTE");
  let columns: string[], body: (string | number)[][];
  try {
    if (ds.special === "summary") {
      const [meta, google, posts, line, leads, sales, excluded, fbPage] = await Promise.all([
        read("META_ADS", ["report_start", "report_end", "amount_spent_thb", "area"]), read("GOOGLE_ADS_CAMPAIGNS", ["report_start", "report_end", "cost_thb", "clicks", "area"]),
        read("FB_PAGE_POSTS", ["page_id", "post_id", "page_name", "publish_time", "metric_date", "metric_scope", "snapshot_date", "reach", "link_clicks", "reactions_comments_shares", "seconds_viewed"]), read("LINE_OA_MONTHLY", ["report_month", "new_friends", "inquiries", "leads"]),
        read("LEADS", ["lead_id", "received_at", "status", "qualified_at", "area", "source_channel", "need", "call_status"]),
        role === "marketing" ? read("SALES", ["closing_date", "payment_status"]) : read("SALES", ["closing_date", "revenue_date", "payment_status", "deal_value_thb", "company_revenue_thb", "direct_cost_thb"]),
        getExcludedPages(DEFAULT_EXCLUDED_PAGES),
        read("FB_PAGE_INSIGHTS", ["metric", "metric_date", "value", "imported_at"]).catch(() => [] as Row[]), // แท็บใหม่ ยังไม่เตรียม Sheet → ข้าม
      ]);
      ({ columns, rows: body } = buildSummary({ meta, google, posts, line, leads, sales, excluded, fbPage }, f, role));
    } else if (ds.special === "performance") {
      ({ columns, rows: body } = buildPerformanceRows(computePerformance(await fetchDashboardData(role), { from: f.from, to: f.to, compare: "yoy" })));
    } else if (ds.special === "dictionary") {
      ({ columns, rows: body } = buildDictionary(role));
    } else {
      columns = ds.derive ? [...ds.columns, ...ds.derive.columns] : ds.columns;
      let rows = await read(ds.tab!, ds.columns);
      if (id === "facebook_page_posts" && !f.includeExcluded) { const ex = new Set(await getExcludedPages(DEFAULT_EXCLUDED_PAGES)); rows = rows.filter((r) => !ex.has(r.page_name) && !ex.has(r.page_id)); }
      rows = rows.filter((r) => ds.keep(r, f));
      if (ds.derive) rows = ds.derive.apply(rows);
      const types = columns.map((c) => columnType(ds.tab, c));
      body = rows.map((r) => columns.map((c, i) => normalizeExportValue(types[i], r[c] ?? "")));
    }
  } catch (e) {
    if (e instanceof ExportError) throw e;
    throw new ExportError(409, "อ่านข้อมูลไม่ได้ กรุณาไปที่ ตั้งค่า → เตรียม Google Sheet แล้วลองใหม่", "SHEET_NOT_READY");
  }
  if (opts.countOnly) return { rows: body.length, filename: ds.filename };
  await writeAudit(actor, "export", "dataset", id, `${ds.filename}: ${body.length} แถว${ds.sensitive ? ` (${ds.sensitive})` : ""}`);
  return { csv: toCsv([columns, ...body.map((r) => r.map(csvSafe))]), rows: body.length, filename: ds.filename };
}

/** Phase 8: KPI ของหน้า Marketing Performance + ปีก่อน (หนึ่งแถวต่อ KPI) */
export function buildPerformanceRows(p: ReturnType<typeof computePerformance>) {
  const columns = DATASET_BY_ID.marketing_performance_kpis.columns;
  const unit = { thb: "THB", int: "count", pct: "percent", sec: "seconds" } as const;
  const rows = p.groups.flatMap((g) => g.items.map((k) => {
    const c = changePct(k.value, k.prev ?? null);
    const status = k.state !== "value" ? "current_unavailable" : k.prevBlocked ? "not_comparable" : k.prev === null || k.prev === undefined ? "missing" : c.reason === "zero" ? "zero_base" : k.prevIncomplete ? "previous_incomplete" : "ok";
    const rec: Record<string, string | number> = {
      period_from: p.range?.from ?? "", period_to: p.range?.to ?? "", group: g.title, kind: g.kind, kpi_key: k.key, kpi_label: k.label, unit: unit[k.fmt],
      value: k.value ?? "", state: k.state, incomplete_reason: k.incomplete ?? "", source_note: k.note ?? "",
      yoy_period_from: p.prevRange?.from ?? "", yoy_period_to: p.prevRange?.to ?? "", yoy_value: k.prevBlocked ? "" : k.prev ?? "",
      yoy_change_pct: status === "ok" || status === "previous_incomplete" ? c.pct ?? "" : "", yoy_status: status,
    };
    return columns.map((col) => rec[col] ?? "");
  }));
  return { columns, rows };
}

/** Phase 8: พจนานุกรมข้อมูล (ตามสิทธิ์ของผู้ใช้ — Marketing ไม่เห็นคอลัมน์การเงินของไฟล์สรุป) */
export function buildDictionary(role: Role) {
  const columns = DATASET_BY_ID.data_dictionary.columns;
  const rows: (string | number)[][] = [];
  for (const ds of DATASETS.filter((d) => d.roles.includes(role))) {
    const cols = ds.special === "summary" ? SUMMARY_COLUMNS.filter((c) => !(role === "marketing" && SUMMARY_FINANCIAL.includes(c)))
      : ds.id === "sales_transactions" ? SALES_EXPORT_COLUMNS : ds.derive ? [...ds.columns, ...ds.derive.columns] : ds.columns;
    const tab = ds.id === "sales_transactions" ? "SALES_TRANSACTIONS" : ds.tab;
    cols.forEach((c, i) => {
      const t = ds.special === "performance" ? (c.endsWith("_from") || c.endsWith("_to") ? "date" : ["value", "yoy_value", "yoy_change_pct"].includes(c) ? "number" : "text") : ds.special === "dictionary" ? (c === "column_position" ? "integer" : "text") : columnType(tab, c);
      rows.push([ds.id, ds.filename, ds.grain, i + 1, c, t, TYPE_DOC[t]]);
    });
  }
  return { columns, rows };
}
