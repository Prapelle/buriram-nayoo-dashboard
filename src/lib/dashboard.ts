import { excludePages, summarizeFb } from "./fbmetrics";
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

export type KpiState = "value" | "pending" | "excluded" | "restricted" | "na";
export type Kpi = { key: string; label: string; fmt: "thb" | "int" | "pct"; value: number | null; state: KpiState; note?: string; /** มีค่าแต่ข้อมูลไม่ครบ: เหตุผล */ incomplete?: string };
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

function kpi(key: string, label: string, fmt: Kpi["fmt"], value: number | null, state?: KpiState, note?: string, incomplete?: string): Kpi {
  return { key, label, fmt, value, state: state ?? (value === null ? "pending" : "value"), note, incomplete };
}

// ---------- ความครบถ้วนของข้อมูลโฆษณา (Phase 2) ----------
type Span = [string, string];
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const dmyS = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
/** รวมช่วงวันที่ของรายงาน (ช่วงที่ติดกัน/ทับกันรวมเป็นช่วงเดียว) */
export function mergeSpans(rows: Row[]): Span[] {
  const sp = rows.map((r) => [r.report_start, r.report_end] as Span).filter(([a, b]) => a && b).sort((x, y) => x[0].localeCompare(y[0]));
  const out: Span[] = [];
  for (const [a, b] of sp) {
    const last = out[out.length - 1];
    if (last && a <= addDays(last[1], 1)) { if (b > last[1]) last[1] = b; } else out.push([a, b]);
  }
  return out;
}
/** ช่วงใน [from,to] ที่ไม่มีรายงานครอบคลุม */
export function gapsIn(spans: Span[], from: string, to: string): Span[] {
  const gaps: Span[] = []; let cur = from;
  for (const [a, b] of spans) {
    if (b < cur) continue; if (a > to) break;
    if (a > cur) gaps.push([cur, addDays(a, -1) < to ? addDays(a, -1) : to]);
    cur = addDays(b, 1) > cur ? addDays(b, 1) : cur; if (cur > to) break;
  }
  if (cur <= to) gaps.push([cur, to]);
  return gaps;
}
const fmtGaps = (g: Span[]) => g.map(([a, b]) => (a === b ? dmyS(a) : `${dmyS(a)}–${dmyS(b)}`)).join(", ");

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

  // Facebook Page: สถิติกรองตามวันที่ของสถิติ (metric_date) ส่วนจำนวนโพสต์นับตามวันเผยแพร่ (publish_time) — ดู lib/fbmetrics.ts
  const { kept: postsAll, excludedPosts } = excludePages(data.posts, data.excludedPages);
  const fb = summarizeFb(chOk("posts") ? postsAll : [], { from: f.from, to: f.to });
  const fbT = fb.basis === "lifetime" ? fb.lifetime : fb.daily;

  const monthOf = (d: string) => d.slice(0, 7);
  const line = chOk("line") ? data.line.filter((r) => {
    const m = String(r.report_month).slice(0, 7);
    return m && (!f.from || m >= f.from.slice(0, 7)) && (!f.to || m <= f.to.slice(0, 7));
  }) : [];

  // Total Leads นับ lead_id ไม่ซ้ำ (แถวซ้ำจากการแก้ใน Sheet/ส่งออกหลายครั้งไม่ถูกนับซ้ำ) ตามวันที่รับ Lead
  const seenLead = new Set<string>(); let leadNoId = 0;
  const leadsAll = data.leads.filter((r) => { if (!r.lead_id) { leadNoId++; return false; } if (seenLead.has(r.lead_id)) return false; seenLead.add(r.lead_id); return true; });
  if (leadNoId) warnings.push(`Leads: ${leadNoId} แถวในแท็บ LEADS ไม่มี lead_id จึงไม่ถูกนับ`);
  const leadFilter = (r: Row) => (!f.channel || r.source_channel === f.channel) && (!f.campaign || r.campaign_name === f.campaign)
    && (!f.area || areaOf(r) === f.area) && (!f.service || r.service_category === f.service);
  const leads = leadsAll.filter((r) =>
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
  // ความครบถ้วน: ทั้งสองแพลตฟอร์ม (ที่อยู่ในตัวกรอง) ต้องมีรายงานครอบคลุมช่วงเดียวกัน ถ้าไม่ครบแสดง "ข้อมูลไม่ครบ" ไม่ใช่ 0
  const included = [["Meta Ads", chOk("meta"), meta] as const, ["Google Ads", chOk("google"), google] as const].filter(([, ok]) => ok);
  const missingReasons: string[] = [];
  if (paidTotal !== null) {
    const allRows = included.flatMap(([, , rows]) => rows);
    const span = mergeSpans(allRows);
    const from = f.from ?? span[0]?.[0] ?? "", to = f.to ?? span[span.length - 1]?.[1] ?? "";
    for (const [name, , rows] of included) {
      if (!rows.length) { if (!f.campaign) missingReasons.push(`ไม่มีข้อมูล ${name} ในช่วงนี้`); continue; }
      if (f.campaign) continue; // ตัวกรองแคมเปญเลือกแคมเปญของแพลตฟอร์มเดียวโดยตั้งใจ
      const g = gapsIn(mergeSpans(rows), from, to);
      if (g.length) missingReasons.push(`${name} ไม่มีรายงานช่วง ${fmtGaps(g)}`);
    }
  }
  const paidIncomplete = missingReasons.length ? missingReasons.join(" · ") : undefined;
  const paidNote = included.length === 2 ? "Meta Ads Spend + Google Ads Campaign Spend (ไม่รวมรายงาน Google Ads รายละเอียด และไม่รวม Facebook Page)" : `เฉพาะ ${included.map(([n]) => n).join(", ")} ตามตัวกรองช่องทาง`;

  const lineNew = sumOf(line, "new_friends"), lineInq = sumOf(line, "inquiries"), lineLeads = sumOf(line, "leads");

  const qualified = (r: Row) => r.qualified_at !== "" && r.qualified_at !== undefined || ["Qualified", "Proposal", "Won"].includes(r.status);
  const leadsTotal = leads.length;
  // ช่วงเวลาของ CPL: ใช้ช่วงที่เลือก หรือถ้าไม่ได้เลือก ใช้ช่วงของรายงานโฆษณาที่นำมาคิด เพื่อให้ค่าโฆษณาและ Lead เป็นช่วงเดียวกัน
  const adSpan = mergeSpans([...meta, ...google]);
  const cplFrom = f.from ?? adSpan[0]?.[0], cplTo = f.to ?? adSpan[adSpan.length - 1]?.[1];
  const cplLeads = leadsAll.filter((r) => leadFilter(r) && cplFrom !== undefined && cplTo !== undefined && day(r.received_at) >= cplFrom && day(r.received_at) <= cplTo);
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

  // CPL: ค่าใช้จ่ายและ Lead ต้องเป็นช่วงเวลาเดียวกัน · Lead = 0 → N/A · ข้อมูลไม่ครบ → แสดงสถานะ ไม่แสดง 0
  const cplPeriod = cplFrom && cplTo ? `${dmyS(cplFrom)}–${dmyS(cplTo)}` : "";
  const cplBlock = f.service ? "ตัวกรอง Service ใช้กับ Lead เท่านั้น ค่าโฆษณาไม่ได้แยกตามบริการ จึงคำนวณ CPL ไม่ได้" : undefined;
  const cplIncomplete = [paidIncomplete, partial ? "รายงานโฆษณาบางรายการครอบคลุมเกินช่วงที่เลือก ค่าโฆษณาจึงมากกว่าช่วงของ Lead" : undefined].filter(Boolean).join(" · ") || undefined;
  const cplKpi = (key: string, label: string, base: Row[], what: string): Kpi => {
    const formula = `Total Paid Media Spend ÷ ${what}`;
    if (paidTotal === null) return kpi(key, label, "thb", null, included.length ? "pending" : "na", `${formula} · ไม่มีค่าโฆษณาในเงื่อนไขนี้`);
    if (cplBlock) return kpi(key, label, "thb", null, "na", cplBlock);
    if (!base.length) return kpi(key, label, "thb", null, "na", `${formula} · ไม่มี Lead ในช่วง ${cplPeriod} (หารด้วย 0 ไม่ได้)`);
    return kpi(key, label, "thb", Math.round((paidTotal / base.length) * 100) / 100, undefined, `${formula} · ฐาน ${base.length} Lead ที่รับ ${cplPeriod} (ช่วงเดียวกับค่าโฆษณา)`, cplIncomplete);
  };
  const cplAdsBase = cplLeads.filter((r) => PAID_CHANNELS.includes(r.source_channel));
  const rate = leadsTotal > 0 ? Math.round((wonLeads / leadsTotal) * 1000) / 10 : null;

  const groups: Dashboard["groups"] = [
    { title: "ค่าโฆษณา", items: [
      ex("meta", "Meta Ads Spend", "thb", "meta", metaV),
      ex("google", "Google Ads Campaign Spend", "thb", "google", googleV, "จาก Campaign Report เท่านั้น"),
      kpi("paid", "Total Paid Media Spend", "thb", paidTotal, undefined, paidNote, paidIncomplete),
    ] },
    { title: "Facebook Page", items: [
      ex("posts", "จำนวน Facebook Posts (ที่เผยแพร่ในช่วง)", "int", "posts", fb.publishedPosts || null, `นับตามวันเผยแพร่${excludedPosts ? ` · ไม่รวม ${excludedPosts} โพสต์จากเพจที่ตัดออก` : ""}`),
      ex("engagement", "Reactions + Comments + Shares", "int", "posts", fbT.reactions_comments_shares, fb.basis === "daily" ? `ผลรวมรายวันตามวันที่ของสถิติ ${fb.daily.from} ถึง ${fb.daily.to}` : "ยอดสะสม (Lifetime) ณ วันส่งออก ล่าสุดของแต่ละโพสต์"),
      ex("reach", fb.basis === "daily" ? "ผลรวม Reach รายวันของโพสต์" : "ผลรวม Reach ของโพสต์", "int", "posts", fbT.reach,
        fb.basis === "daily" ? "รวม Reach ของแต่ละวัน ไม่ใช่ Unique Reach ของช่วงเวลา" : "ยอดสะสม (Lifetime) ณ วันส่งออก ไม่ใช่ Unique Page Reach"),
      ex("clicks", "Facebook Link Clicks", "int", "posts", fbT.link_clicks, fbT.link_clicks !== null ? `มีข้อมูล ${fbT.filledPosts.link_clicks} จาก ${fbT.posts} โพสต์ (ที่เหลือไม่มีข้อมูล ไม่ใช่ 0)` : undefined),
    ] },
    { title: "LINE OA", items: [
      ex("line_new", "LINE OA New Friends", "int", "line", lineNew.n ? lineNew.sum : null),
      ex("line_inq", "LINE OA Inquiries", "int", "line", lineInq.n ? lineInq.sum : null),
      ex("line_leads", "LINE OA Leads", "int", "line", lineLeads.n ? lineLeads.sum : null),
    ] },
    { title: "Leads และ Sales", items: [
      kpi("leads", "Total Leads", "int", leadsAll.length ? leadsTotal : null, undefined, "นับ lead_id ไม่ซ้ำ ตามวันที่รับ Lead ในช่วงที่เลือก"),
      kpi("qualified", "Qualified Leads", "int", leadsTotal ? leadsQ : null, undefined, "นับ Lead ที่สถานะ Qualified / Proposal / Won หรือมีวันที่ Qualified"),
      kpi("won", "Won Deals", "int", won.length || null, undefined, "ไม่นับ Cancelled / Refunded"),
      fin("deal", "Deal Value", dv.n ? dv.sum : null, "มูลค่าดีล ไม่ใช่รายได้บริษัท"),
      fin("revenue", "Company Revenue", rev.n ? rev.sum : null),
      fin("cost", "Direct Cost", cost.n ? cost.sum : null),
      fin("gp", "Gross Profit", both.length ? Math.round(gp * 100) / 100 : null, both.length ? `คำนวณจาก ${both.length} ดีลที่มีทั้งรายได้และต้นทุน (จาก ${revRows.length})` : undefined),
    ] },
    { title: "ประสิทธิภาพ (ไม่ใช่ ROI เชิงสาเหตุ)", items: [
      cplKpi("cpl", "CPL (Lead จากโฆษณา)", cplAdsBase, "Lead จาก Facebook Ads + Google Ads"),
      cplKpi("cpl_all", "CPL (Lead ทั้งหมด)", cplLeads, "Total Leads ทุกช่องทาง"),
      cplKpi("cplq", "Cost per Qualified Lead", cplAdsBase.filter(qualified), "Qualified Lead จากโฆษณา"),
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
  if (fb.basis === "daily" && fb.lifetimeOnlyPosts) notes.push(`Facebook: ${fb.lifetimeOnlyPosts} โพสต์มีแต่ยอดสะสม (Lifetime) จึงไม่รวมในยอดรายวัน`);
  if (fb.basis !== "none") notes.push(fb.basis === "daily" ? "Facebook Page: ตัวเลขสถิติกรองตามวันที่ของสถิติ (metric_date) ส่วนจำนวนโพสต์กรองตามวันเผยแพร่" : "Facebook Page: ใช้ยอดสะสม (Lifetime) ล่าสุดของแต่ละโพสต์ ไม่รวมยอดของหลายวันส่งออก");
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
