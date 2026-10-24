import type { Role } from "./roles";

export type Row = Record<string, string>;
export type DashData = {
  meta: Row[]; google: Row[]; gtime: Row[]; posts: Row[]; line: Row[]; leads: Row[]; sales: Row[];
  excludedPages: string[]; lastImport: string;
};
export type Filters = { from?: string; to?: string; channel?: string; campaign?: string; area?: string; service?: string };

export const CHANNELS = ["Facebook Organic", "Facebook Ads", "Google Ads", "Website/SEO", "LINE OA", "TikTok/YouTube", "Event/Home Expo", "Referral", "Other", "Unknown"];
export const SERVICES = ["Product", "Project", "Event"];
export const PIPELINE = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];
export const DEFAULT_EXCLUDED_PAGES = ["BAAN Prompt Community - Buriram&Surin"];
const PAID_CHANNELS = ["Facebook Ads", "Google Ads"];
const CH = { meta: "Facebook Ads", google: "Google Ads", posts: "Facebook Organic", line: "LINE OA" };

export type KpiState = "value" | "pending" | "excluded" | "restricted";
export type Kpi = { key: string; label: string; fmt: "thb" | "int" | "pct"; value: number | null; state: KpiState; note?: string };
export type Dashboard = {
  groups: { title: string; items: Kpi[] }[];
  charts: {
    spendByChannel: { label: string; value: number }[] | null;
    leadsByChannel: { label: string; value: number }[] | null;
    pipeline: { label: string; value: number }[] | null;
    lineGrowth: { month: string; newFriends: number | null; friendsEnd: number | null }[] | null;
    monthly: { month: string; meta: number; google: number }[] | null;
    daily: { date: string; cost: number }[] | null;
  };
  notes: string[]; warnings: string[];
  dataRange: { start: string; end: string } | null;
  lastImport: string;
  unknownAreaRows: number;
  hasAnyData: boolean;
};

export const num = (v: unknown): number | null => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const day = (v: string) => String(v ?? "").slice(0, 10);
const sumOf = (rows: Row[], k: string): { sum: number; n: number } => {
  let sum = 0, n = 0;
  for (const r of rows) { const x = num(r[k]); if (x !== null) { sum += x; n++; } }
  return { sum: Math.round(sum * 100) / 100, n };
};
const inRange = (d: string, f: Filters) => d !== "" && (!f.from || d >= f.from) && (!f.to || d <= f.to);
const overlaps = (r: Row, f: Filters) => (!f.to || r.report_start <= f.to) && (!f.from || r.report_end >= f.from);
const areaOf = (r: Row) => (r.area || "unknown");

function overlapWarning(rows: Row[], label: string): string | null {
  const pairs = [...new Set(rows.map((r) => `${r.report_start}|${r.report_end}`))].map((p) => p.split("|"));
  for (let i = 0; i < pairs.length; i++) for (let j = i + 1; j < pairs.length; j++)
    if (pairs[i][0] <= pairs[j][1] && pairs[j][0] <= pairs[i][1])
      return `${label}: พบรายงานที่ช่วงวันที่ทับซ้อนกันแต่ไม่เหมือนกัน (${pairs[i].join("–")} กับ ${pairs[j].join("–")}) ยอดอาจถูกนับซ้ำ ควรนำเข้ารายงานที่ไม่ทับช่วงกัน`;
  return null;
}

function kpi(key: string, label: string, fmt: Kpi["fmt"], value: number | null, state?: KpiState, note?: string): Kpi {
  return { key, label, fmt, value, state: state ?? (value === null ? "pending" : "value"), note };
}

export function computeDashboard(data: DashData, f: Filters, role: Role): Dashboard {
  const notes: string[] = [];
  const warnings: string[] = [];
  const chOk = (c: keyof typeof CH) => !f.channel || f.channel === CH[c];
  const excluded = (c: keyof typeof CH) => !chOk(c);

  // ---- ตัวกรองต่อชุดข้อมูล ----
  const metaAll = data.meta, googleAll = data.google;
  let partial = false;
  const pickAds = (rows: Row[], campaignKey: string) => rows.filter((r) => {
    if (!overlaps(r, f)) return false;
    if (f.area && areaOf(r) !== f.area) return false;
    if (f.campaign && r[campaignKey] !== f.campaign) return false;
    if ((f.from && r.report_start < f.from) || (f.to && r.report_end > f.to)) partial = true;
    return true;
  });
  const meta = chOk("meta") ? pickAds(metaAll, "ad_set_name") : [];
  const google = chOk("google") ? pickAds(googleAll, "campaign_name") : [];
  if (partial) warnings.push("รายงานโฆษณาเป็นยอดรวมทั้งช่วงของรายงาน (ไม่แบ่งรายวัน) ช่วงที่เลือกตัดผ่านช่วงของรายงาน ตัวเลขจึงเป็นยอดเต็มของรายงานที่ทับช่วงนั้น");

  const exSet = new Set(data.excludedPages);
  const postsAll = data.posts.filter((p) => !exSet.has(p.page_name) && !exSet.has(p.page_id));
  const excludedPosts = data.posts.length - postsAll.length;
  const posts = chOk("posts") ? postsAll.filter((p) => (!f.from && !f.to) || inRange(day(p.publish_time), f)) : [];

  const monthOf = (d: string) => d.slice(0, 7);
  const line = chOk("line") ? data.line.filter((r) => {
    const m = String(r.report_month).slice(0, 7);
    return m && (!f.from || m >= f.from.slice(0, 7)) && (!f.to || m <= f.to.slice(0, 7));
  }) : [];

  const leads = data.leads.filter((r) =>
    ((!f.from && !f.to) || inRange(day(r.received_at), f))
    && (!f.channel || r.source_channel === f.channel) && (!f.campaign || r.campaign_name === f.campaign)
    && (!f.area || areaOf(r) === f.area) && (!f.service || r.service_category === f.service));
  const salesOk = (r: Row) => (!f.channel || r.source_channel === f.channel) && (!f.campaign || r.campaign_name === f.campaign) && (!f.service || r.service_category === f.service);
  const won = data.sales.filter((r) => salesOk(r) && !["Cancelled", "Refunded"].includes(r.payment_status) && ((!f.from && !f.to) || inRange(day(r.closing_date), f)));
  const revRows = data.sales.filter((r) => salesOk(r) && !["Cancelled", "Refunded"].includes(r.payment_status) && ((!f.from && !f.to) || inRange(day(r.revenue_date || r.closing_date), f)));

  // ---- KPI ----
  const mSum = sumOf(meta, "amount_spent_thb"), gSum = sumOf(google, "cost_thb");
  const metaV = mSum.n ? mSum.sum : null, googleV = gSum.n ? gSum.sum : null;
  const paidTotal = metaV === null && googleV === null ? null : Math.round(((metaV ?? 0) + (googleV ?? 0)) * 100) / 100;
  const paidNote = paidTotal !== null && (metaV === null || googleV === null) && chOk("meta") && chOk("google") ? "รวมเฉพาะแหล่งที่มีข้อมูล" : undefined;

  const reach = sumOf(posts, "reach");
  const clicks = sumOf(posts, "link_clicks");
  const lineNew = sumOf(line, "new_friends"), lineInq = sumOf(line, "inquiries"), lineLeads = sumOf(line, "leads");

  const qualified = (r: Row) => r.qualified_at !== "" && r.qualified_at !== undefined || ["Qualified", "Proposal", "Won"].includes(r.status);
  const leadsTotal = leads.length;
  const leadsQ = leads.filter(qualified).length;
  const paidLeads = leads.filter((r) => PAID_CHANNELS.includes(r.source_channel));
  const paidLeadsQ = paidLeads.filter(qualified).length;
  const wonLeads = leads.filter((r) => r.status === "Won").length;

  const restricted = role === "marketing";
  const dv = sumOf(won, "deal_value_thb");
  const rev = sumOf(revRows, "company_revenue_thb"), cost = sumOf(revRows, "direct_cost_thb");
  const both = revRows.filter((r) => num(r.company_revenue_thb) !== null && num(r.direct_cost_thb) !== null);
  const gp = both.reduce((s, r) => s + (num(r.company_revenue_thb) ?? 0) - (num(r.direct_cost_thb) ?? 0), 0);
  const fin = (key: string, label: string, v: number | null, note?: string) =>
    restricted ? kpi(key, label, "thb", null, "restricted") : kpi(key, label, "thb", v, undefined, note);

  const ex = (key: string, label: string, fmt: Kpi["fmt"], c: keyof typeof CH, v: number | null, note?: string) =>
    excluded(c) ? kpi(key, label, fmt, null, "excluded") : kpi(key, label, fmt, v, undefined, note);

  const paidSpendForCpl = paidTotal;
  const cpl = paidSpendForCpl !== null && paidLeads.length > 0 ? Math.round((paidSpendForCpl / paidLeads.length) * 100) / 100 : null;
  const cplq = paidSpendForCpl !== null && paidLeadsQ > 0 ? Math.round((paidSpendForCpl / paidLeadsQ) * 100) / 100 : null;
  const rate = leadsTotal > 0 ? Math.round((wonLeads / leadsTotal) * 1000) / 10 : null;

  const groups: Dashboard["groups"] = [
    { title: "ค่าโฆษณา", items: [
      ex("meta", "Meta Ads Spend", "thb", "meta", metaV),
      ex("google", "Google Ads Campaign Spend", "thb", "google", googleV, "จาก Campaign Report เท่านั้น"),
      kpi("paid", "Total Paid Media Spend", "thb", paidTotal, undefined, paidNote),
    ] },
    { title: "Facebook Page", items: [
      ex("posts", "จำนวน Facebook Posts", "int", "posts", posts.length ? posts.length : null, excludedPosts ? `ไม่รวม ${excludedPosts} โพสต์จากเพจที่ตัดออก` : undefined),
      ex("reach", "ผลรวม Reach ของโพสต์", "int", "posts", reach.n ? reach.sum : null, "ยอดสะสม (Lifetime) ณ วันส่งออก ไม่ใช่ Unique Page Reach"),
      ex("clicks", "Facebook Link Clicks", "int", "posts", clicks.n ? clicks.sum : null, clicks.n ? `มีข้อมูล ${clicks.n} จาก ${posts.length} โพสต์ (ที่เหลือไม่มีข้อมูล ไม่ใช่ 0)` : undefined),
    ] },
    { title: "LINE OA", items: [
      ex("line_new", "LINE OA New Friends", "int", "line", lineNew.n ? lineNew.sum : null),
      ex("line_inq", "LINE OA Inquiries", "int", "line", lineInq.n ? lineInq.sum : null),
      ex("line_leads", "LINE OA Leads", "int", "line", lineLeads.n ? lineLeads.sum : null),
    ] },
    { title: "Leads และ Sales", items: [
      kpi("leads", "Total Leads", "int", leadsTotal || null),
      kpi("qualified", "Qualified Leads", "int", leadsTotal ? leadsQ : null, undefined, "นับ Lead ที่สถานะ Qualified / Proposal / Won หรือมีวันที่ Qualified"),
      kpi("won", "Won Deals", "int", won.length || null, undefined, "ไม่นับ Cancelled / Refunded"),
      fin("deal", "Deal Value", dv.n ? dv.sum : null, "มูลค่าดีล ไม่ใช่รายได้บริษัท"),
      fin("revenue", "Company Revenue", rev.n ? rev.sum : null),
      fin("cost", "Direct Cost", cost.n ? cost.sum : null),
      fin("gp", "Gross Profit", both.length ? Math.round(gp * 100) / 100 : null, both.length ? `คำนวณจาก ${both.length} ดีลที่มีทั้งรายได้และต้นทุน (จาก ${revRows.length})` : undefined),
    ] },
    { title: "ประสิทธิภาพ (ไม่ใช่ ROI เชิงสาเหตุ)", items: [
      kpi("cpl", "CPL", "thb", cpl, undefined, `ค่าโฆษณาทั้งหมด ÷ Lead จากช่องทางโฆษณา (Facebook Ads, Google Ads) ${paidLeads.length} รายการ`),
      kpi("cplq", "Cost per Qualified Lead", "thb", cplq, undefined, `ฐาน: Qualified Lead จากช่องทางโฆษณา ${paidLeadsQ} รายการ`),
      kpi("rate", "Lead-to-Sale Rate", "pct", rate, undefined, `Lead สถานะ Won ÷ Lead ทั้งหมดที่รับในช่วงที่เลือก (ฐาน ${leadsTotal} Lead)`),
    ] },
  ];

  // ---- กราฟ ----
  const spendByChannel = [
    ...(metaV !== null ? [{ label: "Meta Ads", value: metaV }] : []),
    ...(googleV !== null ? [{ label: "Google Ads", value: googleV }] : []),
  ];
  const countBy = (rows: Row[], k: string, order?: string[]) => {
    const m = new Map<string, number>(); rows.forEach((r) => m.set(r[k] || "Unknown", (m.get(r[k] || "Unknown") ?? 0) + 1));
    const keys = order ? order.filter((o) => m.has(o)) : [...m.keys()].sort((a, b) => (m.get(b)! - m.get(a)!));
    return keys.map((label) => ({ label, value: m.get(label)! }));
  };
  const months = new Map<string, { meta: number; google: number }>();
  const addM = (rows: Row[], k: string, f2: "meta" | "google") => rows.forEach((r) => {
    const v = num(r[k]); if (v === null) return;
    const m = monthOf(r.report_start); const cur = months.get(m) ?? { meta: 0, google: 0 }; cur[f2] += v; months.set(m, cur);
  });
  addM(meta, "amount_spent_thb", "meta"); addM(google, "cost_thb", "google");
  const monthly = [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, meta: Math.round(v.meta * 100) / 100, google: Math.round(v.google * 100) / 100 }));
  const spanning = [...meta, ...google].some((r) => monthOf(r.report_start) !== monthOf(r.report_end));
  if (spanning) notes.push("มีรายงานที่คร่อมหลายเดือน กราฟรายเดือนนับยอดเข้าเดือนที่รายงานเริ่ม");

  const dailyMap = new Map<string, number>();
  if (chOk("google") && !f.campaign && !f.area) for (const r of data.gtime) {
    const d = r.date; const c = num(r.cost_thb);
    if (d && c !== null && ((!f.from && !f.to) || inRange(d, f))) dailyMap.set(d, c);
  }
  const daily = [...dailyMap].sort(([a], [b]) => a.localeCompare(b)).map(([date, cost]) => ({ date, cost }));

  const lineGrowth = line.length ? [...line].sort((a, b) => String(a.report_month).localeCompare(String(b.report_month))).map((r) => ({
    month: String(r.report_month).slice(0, 7), newFriends: num(r.new_friends), friendsEnd: num(r.friends_end),
  })) : null;

  // ---- หมายเหตุตัวกรอง / คำเตือน ----
  if (f.area) notes.push("ตัวกรอง Area ใช้กับข้อมูลโฆษณาและ Leads เท่านั้น (Facebook Page, LINE OA, Sales ไม่มีค่า Area)");
  if (f.campaign) notes.push("ตัวกรอง Campaign ใช้กับโฆษณา (Google: ชื่อแคมเปญ, Meta: ชื่อ Ad set), Leads และ Sales เท่านั้น");
  if (f.service) notes.push("ตัวกรอง Service Category ใช้กับ Leads และ Sales เท่านั้น");
  if (f.channel) notes.push(`ตัวกรองช่องทาง "${f.channel}": ข้อมูลของช่องทางอื่นถูกซ่อนไว้`);
  if (excludedPosts) notes.push(`ไม่รวมเพจ Facebook ที่ตัดออก: ${data.excludedPages.join(", ")} (ตั้งค่าที่แท็บ APP_CONFIG คีย์ excluded_fb_pages)`);
  for (const w of [overlapWarning(metaAll, "Meta Ads"), overlapWarning(googleAll, "Google Ads Campaign")]) if (w) warnings.push(w);

  const unknownAreaRows = [...metaAll, ...googleAll].filter((r) => areaOf(r) === "unknown").length;
  const allDates = [...metaAll, ...googleAll].flatMap((r) => [r.report_start, r.report_end]).filter(Boolean).sort();
  const hasAnyData = metaAll.length + googleAll.length + data.posts.length + data.line.length + data.leads.length + data.sales.length > 0;

  return {
    groups, notes, warnings, lastImport: data.lastImport, unknownAreaRows, hasAnyData,
    dataRange: allDates.length ? { start: allDates[0], end: allDates[allDates.length - 1] } : null,
    charts: {
      spendByChannel: spendByChannel.length ? spendByChannel : null,
      leadsByChannel: leadsTotal ? countBy(leads, "source_channel") : null,
      pipeline: leadsTotal ? countBy(leads, "status", PIPELINE) : null,
      lineGrowth, monthly: monthly.length ? monthly : null, daily: daily.length ? daily : null,
    },
  };
}
