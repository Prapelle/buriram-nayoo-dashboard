/**
 * Phase 6 — Marketing Performance Dashboard
 * แยก Paid (Google Ads, Meta Ads) / Organic (Facebook Page) / Website ชัดเจน
 * กฎหลัก
 * - ทุกสูตรใช้ตัวตั้งและตัวหารจาก "แหล่งเดียวกัน ช่วงวันที่เดียวกัน" (เช่น CPC = Spend ÷ Clicks ของรายงานเดียวกัน)
 * - ไม่มีข้อมูล = รอข้อมูล (ไม่ใช่ 0) · หารด้วย 0 = N/A
 * - รายงานแบบยอดรวมทั้งช่วง (Campaign Report / Meta) ตัดเป็นรายวันไม่ได้ → ถ้าไม่ตรงช่วงที่เลือก ติดสถานะ ข้อมูลไม่ครบ
 * - ผลรวม Reach (รายวัน/ระดับโฆษณา) ไม่ใช่ Unique Reach
 */
import { addDays, dmyS, fmtGaps, gapsIn, mergeSpans, num, type DashData, type Kpi, type Row, type Span } from "./dashboard";
import { excludePages, metricDateOf, scopeOf, summarizeFb } from "./fbmetrics";
import { actionLabels } from "./fbactions";
import { COMPARE_LABEL, compareRange, previousRange, type CompareMode } from "./compare";
export { previousRange };

export type PerfFilters = { from?: string; to?: string; compare?: CompareMode; gran?: "day" | "month" };
export type Range = { from: string; to: string };
export type PKpi = Kpi & { prev?: number | null; prevIncomplete?: string; prevLabel?: string; source?: string };
export type Source = { name: string; kind: "Paid" | "Organic" | "Website"; status: "ครบ" | "ไม่ครบ" | "รอข้อมูล"; detail: string; available: string };
export type PlatformRow = { platform: string; kind: "Paid" | "Organic" | "Website"; spend: number | null; clicks: number | null; engagement: number | null; impressions: number | null; pageViews?: number | null; period: string; source: string; status: string };
export type Performance = {
  range: Range | null; prevRange: Range | null; defaulted: boolean; compare: CompareMode | null; compareNote?: string;
  groups: { title: string; kind: "Paid" | "Organic" | "Website" | "Compare"; note?: string; items: PKpi[] }[];
  trend: { gran: "day" | "month"; google: { x: string; cost: number; clicks: number }[] | null; fb: { x: string; engagement: number }[] | null; search?: { x: string; clicks: number }[] | null; googleNote?: string };
  platforms: PlatformRow[];
  sources: Source[];
  meta: { actions: { label: string; results: number; spend: number; rows: number }[] };
  warnings: string[];
  lastImport: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const daysOf = (r: Range): string[] => { const out: string[] = []; for (let d = r.from; d <= r.to && out.length < 1200; d = addDays(d, 1)) out.push(d); return out; };
const span = (r: Range) => (r.from === r.to ? dmyS(r.from) : `${dmyS(r.from)}–${dmyS(r.to)}`);
const sum = (rows: Row[], k: string): number | null => { let s = 0, n = 0; for (const r of rows) { const v = num(r[k]); if (v !== null) { s += v; n++; } } return n ? r2(s) : null; };
const overlaps = (r: Row, g: Range) => r.report_start <= g.to && r.report_end >= g.from;
const div = (a: number | null, b: number | null): { v: number | null; na: boolean } => (a === null || b === null ? { v: null, na: false } : b === 0 ? { v: null, na: true } : { v: r2(a / b), na: false });

/** สรุปจากรายงานแบบช่วง (Campaign / Meta): ครบเมื่อรายงานทั้งหมดอยู่ในช่วงที่เลือก และครอบคลุมทุกวัน */
function periodReports(rows: Row[], g: Range) {
  const used = rows.filter((r) => overlaps(r, g));
  if (!used.length) return null;
  const spans = mergeSpans(used);
  const gaps = gapsIn(spans, g.from, g.to);
  const outside = spans.some(([a, b]) => a < g.from || b > g.to);
  const cover = spans.map(([a, b]) => span({ from: a, to: b })).join(", ");
  const problems = [gaps.length ? `ไม่มีรายงานช่วง ${fmtGaps(gaps)}` : "", outside ? `รายงาน ${cover} ครอบคลุมเกินช่วงที่เลือก (ตัดรายวันไม่ได้)` : ""].filter(Boolean);
  return { used, cover, incomplete: problems.join(" · ") || undefined };
}

type GoogleAt = { spend: number | null; clicks: number | null; impressions: number | null; source: string; cover: string; incomplete?: string; exact: boolean } | null;
/** Google Ads: ใช้ Time series รายวัน ถ้าครบทุกวันในช่วง (ตัดช่วงได้ตรง) มิฉะนั้นใช้ Campaign Report ที่อยู่ในช่วงพอดี แล้วค่อยใช้แบบไม่ครบ */
export function googleAt(d: Pick<DashData, "google" | "gtime">, g: Range): GoogleAt {
  const days = daysOf(g);
  const daily = d.gtime.filter((r) => r.date >= g.from && r.date <= g.to);
  const have = new Set(daily.map((r) => r.date.slice(0, 10)));
  const missing = days.filter((x) => !have.has(x));
  const fromDaily = (incomplete?: string): GoogleAt => ({ spend: sum(daily, "cost_thb"), clicks: sum(daily, "clicks"), impressions: sum(daily, "impressions"), source: "Google Ads Time series (รายวัน)", cover: span(g), incomplete, exact: !incomplete });
  if (daily.length && !missing.length) return fromDaily();
  const camp = periodReports(d.google, g);
  if (camp && !camp.incomplete) return { spend: sum(camp.used, "cost_thb"), clicks: sum(camp.used, "clicks"), impressions: null, source: "Google Ads Campaign Report", cover: camp.cover, exact: true };
  if (daily.length) {
    const gaps = mergeSpans(missing.map((x) => ({ report_start: x, report_end: x })));
    return fromDaily(`ไม่มีข้อมูลรายวัน ${missing.length} วัน (${fmtGaps(gaps)})`);
  }
  if (camp) return { spend: sum(camp.used, "cost_thb"), clicks: sum(camp.used, "clicks"), impressions: null, source: "Google Ads Campaign Report", cover: camp.cover, incomplete: camp.incomplete, exact: false };
  return null;
}

export function metaAt(d: Pick<DashData, "meta">, g: Range) {
  const m = periodReports(d.meta, g);
  if (!m) return null;
  return { spend: sum(m.used, "amount_spent_thb"), impressions: sum(m.used, "impressions"), reachSum: sum(m.used, "reach"), rows: m.used, cover: m.cover, incomplete: m.incomplete };
}

export function fbAt(rows: Row[], g: Range) {
  const s = summarizeFb(rows, g);
  if (s.basis === "none") return null;
  const t = s.basis === "daily" ? s.daily : s.lifetime;
  let incomplete: string | undefined;
  if (s.basis === "daily") {
    const allDaily = rows.filter((r) => scopeOf(r) === "daily").map(metricDateOf).sort();
    const avail: Span = [allDaily[0], allDaily[allDaily.length - 1]];
    const gaps = gapsIn([avail], g.from, g.to);
    if (gaps.length) incomplete = `ไม่มีข้อมูลรายวันช่วง ${fmtGaps(gaps)}`;
  } else incomplete = `เป็นยอดสะสม (Lifetime) ณ ${dmyS(s.lifetime.snapshot)} ไม่ใช่ยอดของช่วงที่เลือก`;
  return { basis: s.basis, t, cover: s.basis === "daily" ? span({ from: s.daily.from, to: s.daily.to }) : `Lifetime ณ ${dmyS(s.lifetime.snapshot)}`, incomplete, lifetimeOnlyPosts: s.lifetimeOnlyPosts };
}

/**
 * Phase 5 — Website (GA4 / กรอกเอง): รายงานเป็นยอดรวมทั้งช่วง
 * - เลือกแถวที่ช่วงตรงกับที่เลือกพอดีก่อน · ไม่เช่นนั้นรวมหลายช่วงที่ไม่ทับกัน (การดู/เวลารวมบวกกันได้)
 * - ผู้ใช้ (Users) รวมข้ามช่วงไม่ได้: ต้องมีแถวผู้ใช้ของช่วงเดียวกับที่ใช้คำนวณพอดี
 */
function pickPeriods(rows: Row[], g: Range) {
  const cand = rows.filter((r) => overlaps(r, g)).sort((a, b) => a.report_start.localeCompare(b.report_start) || b.report_end.localeCompare(a.report_end));
  if (!cand.length) return null;
  const exact = cand.find((r) => r.report_start === g.from && r.report_end === g.to);
  if (exact) return { used: [exact], incomplete: undefined as string | undefined, overlapped: 0 };
  const used: Row[] = []; let overlapped = 0;
  for (const r of cand) { if (used.length && r.report_start <= used[used.length - 1].report_end) { overlapped++; continue; } used.push(r); }
  const spans = mergeSpans(used), gaps = gapsIn(spans, g.from, g.to), outside = spans.some(([a, b]) => a < g.from || b > g.to);
  const problems = [gaps.length ? `ไม่มีรายงานช่วง ${fmtGaps(gaps)}` : "", outside ? `รายงาน ${spans.map(([a, b]) => span({ from: a, to: b })).join(", ")} ครอบคลุมเกินช่วงที่เลือก (ตัดรายวันไม่ได้)` : "", overlapped ? `มีรายงานช่วงทับกัน ${overlapped} ชุด (ไม่นำมารวมซ้ำ)` : ""].filter(Boolean);
  return { used, incomplete: problems.join(" · ") || undefined, overlapped };
}

/**
 * รวมแหล่งข้อมูลเว็บไซต์ต่อ "ช่วงรายงาน" ก่อนคำนวณ — ไม่บวกแหล่งต่างกันของช่วงเดียวกัน
 * ลำดับความน่าเชื่อถือ: GA4 Reports snapshot (มี Active users จริง) > GA4 หน้าและหน้าจอ > กรอกเอง
 */
export function mergeWebPeriods(web: Row[]): Row[] {
  const by = new Map<string, Row[]>();
  for (const r of web) if (r.granularity === "period" && ["ga4_snapshot", "ga4", "manual"].includes(r.source)) { const k = `${r.report_start}|${r.report_end}`; by.set(k, [...(by.get(k) ?? []), r]); }
  return [...by.values()].map((rows) => {
    const snap = rows.find((r) => r.source === "ga4_snapshot"), pages = rows.find((r) => r.source === "ga4"), man = rows.find((r) => r.source === "manual");
    const first = (k: string, ...src: (Row | undefined)[]) => { for (const r of src) { const v = r ? num(r[k]) : null; if (v !== null) return v; } return null; };
    const users = first("website_users", snap, man);
    const views = first("page_views", snap, pages, man);
    const engagement = pages ? num(pages.user_engagement_sec) : null;
    // Duration: ค่าต้นฉบับของ GA4 ก่อน (snapshot) · ไม่มี → เวลารวมจากไฟล์รายหน้า ÷ Users · ไม่มี → ที่กรอกเอง
    const duration = first("avg_engagement_sec_per_user", snap) ?? (engagement !== null && users !== null && users > 0 ? r2(engagement / users) : null) ?? first("avg_engagement_sec_per_user", man);
    const usersFrom = snap && num(snap.website_users) !== null ? "GA4 Reports snapshot" : man && num(man.website_users) !== null ? "กรอกเอง" : "";
    const viewsFrom = snap && num(snap.page_views) !== null ? "GA4 Reports snapshot" : pages && num(pages.page_views) !== null ? "GA4 หน้าและหน้าจอ" : man && num(man.page_views) !== null ? "กรอกเอง" : "";
    const fmtN = (v: number | null) => (v === null ? "" : String(v));
    return { report_start: rows[0].report_start, report_end: rows[0].report_end, users: fmtN(users), views: fmtN(views), engagement: fmtN(engagement), duration: fmtN(duration), sessions: fmtN(first("sessions", snap)), new_users: fmtN(first("new_users", snap)), usersFrom, viewsFrom } as Row;
  });
}

export function websiteAt(web: Row[], g: Range) {
  const periods = mergeWebPeriods(web);
  const P = pickPeriods(periods.filter((r) => r.views !== "" || r.users !== ""), g);
  const used = P?.used ?? [];
  const withViews = used.filter((r) => r.views !== "");
  const views = withViews.length ? sum(withViews, "views") : null;
  const single = used.length === 1 ? used[0] : null;
  const users = single && single.users !== "" ? num(single.users) : null;
  const duration = single && single.duration !== "" ? num(single.duration) : null;
  const engagementRows = used.filter((r) => r.engagement !== "");
  const engagement = engagementRows.length === used.length && used.length ? sum(used, "engagement") : null;
  const sessions = used.length && used.every((r) => r.sessions !== "") ? sum(used, "sessions") : null;
  const cover = used.map((r) => span({ from: r.report_start, to: r.report_end })).join(", ");
  const usersWhy = used.length > 1 ? "รวมยอดผู้ใช้ข้ามหลายช่วงรายงานไม่ได้ (คนเดียวกันถูกนับซ้ำ) — เลือกช่วงให้ตรงกับรายงาน GA4 ช่วงเดียว"
    : single ? `ช่วง ${span({ from: single.report_start, to: single.report_end })} ยังไม่มียอดผู้ใช้ — นำเข้า GA4 Reports snapshot ของช่วงนี้ หรือกรอกยอดผู้ใช้ที่หน้า Website` : undefined;
  const sources = [...new Set(used.flatMap((r) => [r.viewsFrom, r.usersFrom]).filter(Boolean))].join(" + ");
  return { views, engagement, users, usersWhy, duration, durationNa: users === 0, sessions, cover, incomplete: P?.incomplete, source: sources, hasAny: periods.length > 0 };
}

/** Search Console รายวัน: รวมตามวันได้ · CTR คำนวณใหม่ = Clicks ÷ Impressions · ตำแหน่งเฉลี่ยถ่วงน้ำหนักด้วย Impressions */
export function searchAt(web: Row[], g: Range) {
  const daily = web.filter((r) => r.source === "search_console" && r.granularity === "day" && r.report_start >= g.from && r.report_start <= g.to);
  if (!daily.length) return null;
  const have = new Set(daily.map((r) => r.report_start)), missing = daysOf(g).filter((x) => !have.has(x));
  const clicks = sum(daily, "search_clicks") ?? 0, impressions = sum(daily, "search_impressions") ?? 0;
  const wsum = daily.reduce((t, r) => t + (num(r.search_position) ?? 0) * (num(r.search_impressions) ?? 0), 0);
  return {
    clicks, impressions, ctr: impressions > 0 ? r2((clicks / impressions) * 100) : null, position: impressions > 0 ? Math.round((wsum / impressions) * 100) / 100 : null,
    incomplete: missing.length ? `ไม่มีข้อมูลรายวัน ${missing.length} วัน (${fmtGaps(mergeSpans(missing.map((x) => ({ report_start: x, report_end: x }))))})` : undefined,
    cover: span({ from: [...have].sort()[0], to: [...have].sort().pop()! }), property: daily[0].property,
  };
}

/** ช่วงเริ่มต้นเมื่อไม่ได้เลือก: ครอบคลุมข้อมูลโฆษณา/Facebook รายวันทั้งหมดที่มี */
export function defaultRange(d: DashData, rows: Row[]): Range | null {
  const ds = [
    ...d.google.flatMap((r) => [r.report_start, r.report_end]), ...d.meta.flatMap((r) => [r.report_start, r.report_end]),
    ...d.gtime.map((r) => r.date), ...rows.filter((r) => scopeOf(r) === "daily").map(metricDateOf),
  ].map((x) => String(x ?? "").slice(0, 10)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : null;
}

function kp(key: string, label: string, fmt: Kpi["fmt"], value: number | null, o: { na?: boolean; note?: string; incomplete?: string; prev?: number | null; prevIncomplete?: string; prevBlocked?: string; source?: string; pending?: string } = {}): PKpi {
  const state: Kpi["state"] = value !== null ? "value" : o.na ? "na" : "pending";
  return { key, label, fmt, value, state, note: state === "pending" ? o.pending ?? o.note : o.note, incomplete: state === "value" ? o.incomplete : undefined, prev: o.prev, prevIncomplete: o.prev !== undefined && o.prev !== null ? o.prevIncomplete : undefined, prevBlocked: o.prev !== undefined ? o.prevBlocked : undefined, source: o.source };
}

export function computePerformance(d: DashData, f: PerfFilters): Performance {
  const fbRows = excludePages(d.posts, d.excludedPages).kept;
  const auto = defaultRange(d, fbRows);
  const range: Range | null = f.from || f.to ? { from: f.from ?? auto?.from ?? f.to!, to: f.to ?? auto?.to ?? f.from! } : auto;
  const warnings: string[] = [];
  const gran = f.gran ?? "day";
  const empty: Performance = { range: null, prevRange: null, defaulted: !f.from && !f.to, compare: null, groups: [], trend: { gran, google: null, fb: null }, platforms: [], sources: [], meta: { actions: [] }, warnings, lastImport: d.lastImport };
  if (!range) return empty;
  if (range.from > range.to) { warnings.push("วันที่เริ่มต้นอยู่หลังวันที่สิ้นสุด"); return { ...empty, range }; }
  const cmp = f.compare ? compareRange(range, f.compare) : null;
  const prevRange = cmp?.range ?? null;

  const G = googleAt(d, range), Gp = prevRange ? googleAt(d, prevRange) : null;
  const M = metaAt(d, range), Mp = prevRange ? metaAt(d, prevRange) : null;
  const F = fbAt(fbRows, range), Fp = prevRange ? fbAt(fbRows, prevRange) : null;
  const pv = (x: number | null | undefined) => (prevRange ? x ?? null : undefined);

  // ตรวจไขว้: Time series กับ Campaign Report ช่วงเดียวกัน ต้องตรงกัน
  const camp = periodReports(d.google, range);
  if (G?.source.includes("Time series") && camp && !camp.incomplete) {
    const cs = sum(camp.used, "cost_thb");
    if (cs !== null && G.spend !== null && Math.abs(cs - G.spend) > 1) warnings.push(`Google Ads: ยอดจาก Time series (฿${G.spend.toLocaleString("en-US")}) ไม่ตรงกับ Campaign Report (฿${cs.toLocaleString("en-US")}) ในช่วงเดียวกัน — ตรวจว่านำเข้าไฟล์ครบทุกแคมเปญหรือไม่`);
  }

  // ---- Google Ads (Paid) ----
  const cpc = div(G?.spend ?? null, G?.clicks ?? null), cpcP = div(Gp?.spend ?? null, Gp?.clicks ?? null);
  const gNote = G ? `${G.source} · ${G.cover}` : undefined;
  const googleItems: PKpi[] = [
    kp("g_spend", "Google Ads Spend", "thb", G?.spend ?? null, { note: gNote, incomplete: G?.incomplete, prev: pv(Gp?.spend), prevIncomplete: Gp?.incomplete, source: G?.source }),
    kp("g_clicks", "Google Ads Clicks", "int", G?.clicks ?? null, { note: gNote, incomplete: G?.incomplete, prev: pv(Gp?.clicks), prevIncomplete: Gp?.incomplete, source: G?.source }),
    kp("g_cpc", "CPC (Spend ÷ Clicks)", "thb", cpc.v, { na: cpc.na, note: cpc.na ? "Clicks = 0 หารไม่ได้" : G ? `Spend ÷ Clicks จาก ${G.source} ช่วงเดียวกัน` : undefined, incomplete: G?.incomplete, prev: pv(cpcP.v), prevIncomplete: Gp?.incomplete, prevBlocked: cpcP.na ? "Clicks ของช่วงเปรียบเทียบ = 0 คำนวณ CPC ไม่ได้ (N/A)" : undefined, source: G?.source }),
  ];
  if (G?.impressions !== null && G?.impressions !== undefined) googleItems.push(kp("g_impr", "Google Ads Impressions", "int", G.impressions, { note: gNote, incomplete: G.incomplete, prev: pv(Gp?.impressions), prevIncomplete: Gp?.incomplete }));

  // ---- Meta Ads (Paid) ----
  const mNote = M ? `Meta Ads Report · ${M.cover}` : undefined;
  const metaItems: PKpi[] = [
    kp("m_spend", "Meta Ads Spend", "thb", M?.spend ?? null, { note: mNote, incomplete: M?.incomplete, prev: pv(Mp?.spend), prevIncomplete: Mp?.incomplete }),
    kp("m_impr", "Meta Ads Impressions", "int", M?.impressions ?? null, { note: mNote, incomplete: M?.incomplete, prev: pv(Mp?.impressions), prevIncomplete: Mp?.incomplete }),
    kp("m_reach", "ผลรวม Reach ระดับโฆษณา", "int", M?.reachSum ?? null, { note: M ? "รวม Reach ของแต่ละโฆษณา (คนเดียวกันอาจถูกนับซ้ำ) ไม่ใช่ Unique Reach" : undefined, incomplete: M?.incomplete, prev: pv(Mp?.reachSum), prevIncomplete: Mp?.incomplete }),
  ];
  const labels = actionLabels((M?.rows ?? []).map((r) => r.result_indicator));
  const byAct = new Map<string, { results: number; spend: number; rows: number }>();
  for (const r of M?.rows ?? []) {
    const k = r.result_indicator ? labels.get(r.result_indicator.trim()) ?? r.result_indicator : "(ไม่มีผลลัพธ์)";
    const c = byAct.get(k) ?? { results: 0, spend: 0, rows: 0 }; c.results += num(r.results) ?? 0; c.spend += num(r.amount_spent_thb) ?? 0; c.rows++; byAct.set(k, c);
  }

  // ---- Facebook Page (Organic) ----
  const ft = F?.t, fpt = Fp?.t;
  const fNote = F ? (F.basis === "daily" ? `Facebook Page รายวัน · ${F.cover}` : F.cover) : undefined;
  const reachLabel = F?.basis === "lifetime" ? "Reach (Lifetime รวมรายโพสต์)" : "ผลรวม Reach รายวัน";
  const fbItems: PKpi[] = [
    kp("f_reach", reachLabel, "int", ft?.reach ?? null, { note: "ผลรวมของแต่ละโพสต์/วัน ไม่ใช่ Unique Reach", incomplete: F?.incomplete, prev: pv(fpt?.reach), prevIncomplete: Fp?.incomplete, pending: F ? "ไฟล์ Facebook Page ที่นำเข้าไม่มีคอลัมน์ Reach" : undefined }),
    kp("f_eng", "Reactions + Comments + Shares", "int", ft?.reactions_comments_shares ?? null, { note: fNote, incomplete: F?.incomplete, prev: pv(fpt?.reactions_comments_shares), prevIncomplete: Fp?.incomplete }),
    kp("f_react", "Reactions", "int", ft?.reactions ?? null, { incomplete: F?.incomplete, prev: pv(fpt?.reactions), prevIncomplete: Fp?.incomplete }),
    kp("f_comm", "Comments", "int", ft?.comments ?? null, { incomplete: F?.incomplete, prev: pv(fpt?.comments), prevIncomplete: Fp?.incomplete }),
    kp("f_share", "Shares", "int", ft?.shares ?? null, { incomplete: F?.incomplete, prev: pv(fpt?.shares), prevIncomplete: Fp?.incomplete }),
    kp("f_sec", "Seconds viewed", "int", ft?.seconds_viewed ?? null, { note: "วินาทีที่ดูวิดีโอรวม", incomplete: F?.incomplete, prev: pv(fpt?.seconds_viewed), prevIncomplete: Fp?.incomplete }),
  ];
  if (ft?.views !== null && ft?.views !== undefined) fbItems.push(kp("f_views", "Views", "int", ft.views, { incomplete: F?.incomplete, prev: pv(fpt?.views), prevIncomplete: Fp?.incomplete }));
  if (ft?.link_clicks !== null && ft?.link_clicks !== undefined) fbItems.push(kp("f_link", "Link Clicks", "int", ft.link_clicks, { incomplete: F?.incomplete, prev: pv(fpt?.link_clicks), prevIncomplete: Fp?.incomplete }));

  // ---- Website (GA4 / กรอกเอง) และ Google Search (Search Console) ----
  const web = d.web ?? [];
  const Wb = websiteAt(web, range), Wp = prevRange ? websiteAt(web, prevRange) : null;
  const S = searchAt(web, range), Sp = prevRange ? searchAt(web, prevRange) : null;
  const noWeb = d.webTabMissing ? "ยังไม่ได้สร้างแท็บ Website — ไปที่ ตั้งค่า → เตรียม Google Sheet" : Wb.hasAny ? `ไม่มีรายงาน Website ในช่วง ${span(range)}` : "ยังไม่ได้นำเข้าข้อมูล Website (หน้า Website)";
  const wNote = Wb.views !== null ? `${Wb.source} · ${Wb.cover}` : undefined;
  const pvu = Wb.views !== null && Wb.users !== null ? (Wb.users > 0 ? { v: r2(Wb.views / Wb.users), na: false } : { v: null, na: true }) : { v: null, na: false };
  const pvuP = Wp && Wp.views !== null && Wp.users !== null && Wp.users > 0 ? r2(Wp.views / Wp.users) : null;
  const webItems: PKpi[] = [
    kp("w_users", "Website Users", "int", Wb.users, { note: Wb.users !== null ? `Active users · ${Wb.source} · ${Wb.cover}` : undefined, pending: Wb.views !== null ? Wb.usersWhy : noWeb, prev: pv(Wp?.users) }),
    kp("w_pv", "Website Page Views", "int", Wb.views, { note: wNote, incomplete: Wb.incomplete, pending: noWeb, prev: pv(Wp?.views), prevIncomplete: Wp?.incomplete }),
    kp("w_pvu", "Page Views per User", "int", pvu.v, { na: pvu.na, note: pvu.na ? "Users = 0 หารไม่ได้" : "Page Views ÷ Users ช่วงเดียวกัน", incomplete: Wb.incomplete, pending: Wb.views === null ? noWeb : Wb.usersWhy, prev: pv(pvuP) }),
    kp("w_dur", "Duration (เวลามีส่วนร่วมเฉลี่ยต่อผู้ใช้)", "sec", Wb.duration, { na: Wb.durationNa, note: "เวลามีส่วนร่วมรวม (GA4 User engagement) ÷ Users — หน่วย วินาที", incomplete: Wb.incomplete, pending: Wb.views === null ? noWeb : Wb.usersWhy, prev: pv(Wp?.duration) }),
  ];
  if (Wb.sessions !== null) webItems.push(kp("w_sess", "Sessions", "int", Wb.sessions, { note: "ผลรวม Sessions ตามแหล่งที่มาของเซสชัน (GA4 Reports snapshot)", incomplete: Wb.incomplete, prev: pv(Wp?.sessions) }));
  if (Wb.engagement !== null) webItems.push(kp("w_eng", "เวลามีส่วนร่วมรวม (ชั่วโมง)", "int", r2(Wb.engagement / 3600), { note: "ผลรวม User engagement ทุกหน้าในช่วงรายงาน", incomplete: Wb.incomplete, prev: pv(Wp?.engagement !== null && Wp?.engagement !== undefined ? r2(Wp.engagement / 3600) : null) }));
  const sNote = S ? `Search Console รายวัน · ${S.cover}${S.property ? ` · ${S.property}` : ""}` : undefined;
  const sPending = d.webTabMissing ? noWeb : "ยังไม่มีข้อมูล Search Console รายวัน (Chart) ในช่วงนี้";
  const searchItems: PKpi[] = [
    kp("s_clicks", "Search Clicks", "int", S?.clicks ?? null, { note: sNote, incomplete: S?.incomplete, pending: sPending, prev: pv(Sp?.clicks), prevIncomplete: Sp?.incomplete }),
    kp("s_impr", "Search Impressions", "int", S?.impressions ?? null, { incomplete: S?.incomplete, pending: sPending, prev: pv(Sp?.impressions), prevIncomplete: Sp?.incomplete }),
    kp("s_ctr", "Search CTR", "pct", S?.ctr ?? null, { na: !!S && S.ctr === null, note: "Clicks ÷ Impressions ของช่วงเดียวกัน", incomplete: S?.incomplete, pending: sPending, prev: pv(Sp?.ctr), prevIncomplete: Sp?.incomplete }),
    kp("s_pos", "ตำแหน่งเฉลี่ย (ยิ่งน้อยยิ่งดี)", "int", S?.position ?? null, { na: !!S && S.position === null, note: "เฉลี่ยถ่วงน้ำหนักด้วย Impressions ของแต่ละวัน", incomplete: S?.incomplete, pending: sPending, prev: pv(Sp?.position), prevIncomplete: Sp?.incomplete }),
  ];
  const both = (a?: string, b?: string) => [a, b].filter(Boolean).join(" · ") || undefined;
  const cppv = G?.spend != null && Wb.views !== null ? (Wb.views > 0 ? { v: r2(G.spend / Wb.views), na: false } : { v: null, na: true }) : { v: null, na: false };
  const spu = G?.spend != null && Wb.users !== null ? (Wb.users > 0 ? { v: r2(G.spend / Wb.users), na: false } : { v: null, na: true }) : { v: null, na: false };
  const why = (need: string, have: boolean) => (!G ? "ไม่มี Google Ads Spend ในช่วงนี้" : !have ? need : undefined);
  const cmpItems: PKpi[] = [
    kp("x_cppv", "Ads Cost per Website Page View", "thb", cppv.v, { na: cppv.na, note: cppv.na ? "Page Views = 0" : "Google Ads Spend ÷ Website Page Views ช่วงเดียวกัน", incomplete: both(G?.incomplete, Wb.incomplete), pending: why(Wb.views === null ? noWeb : "", Wb.views !== null) }),
    kp("x_spu", "Ads Spend per Website User", "thb", spu.v, { na: spu.na, note: spu.na ? "Users = 0" : "Google Ads Spend ÷ Website Users ช่วงเดียวกัน", incomplete: both(G?.incomplete, Wb.incomplete), pending: why(Wb.usersWhy ?? noWeb, Wb.users !== null) }),
  ];

  // ---- แนวโน้ม (เฉพาะข้อมูลรายวันจริง) ----
  const bucket = (x: string) => (gran === "month" ? x.slice(0, 7) : x);
  const gMap = new Map<string, { cost: number; clicks: number }>();
  for (const r of d.gtime) { const x = r.date?.slice(0, 10); if (!x || x < range.from || x > range.to) continue; const k = bucket(x); const c = gMap.get(k) ?? { cost: 0, clicks: 0 }; c.cost += num(r.cost_thb) ?? 0; c.clicks += num(r.clicks) ?? 0; gMap.set(k, c); }
  const fMap = new Map<string, number>();
  for (const r of fbRows) { if (scopeOf(r) !== "daily") continue; const x = metricDateOf(r); if (x < range.from || x > range.to) continue; const v = num(r.reactions_comments_shares); if (v === null) continue; const k = bucket(x); fMap.set(k, (fMap.get(k) ?? 0) + v); }
  const google = gMap.size ? [...gMap].sort().map(([x, v]) => ({ x, cost: r2(v.cost), clicks: v.clicks })) : null;
  const fb = fMap.size ? [...fMap].sort().map(([x, v]) => ({ x, engagement: v })) : null;
  const sMap = new Map<string, number>();
  for (const r of web) { if (r.source !== "search_console" || r.granularity !== "day" || r.report_start < range.from || r.report_start > range.to) continue; const k = bucket(r.report_start); sMap.set(k, (sMap.get(k) ?? 0) + (num(r.search_clicks) ?? 0)); }
  const search = sMap.size ? [...sMap].sort().map(([x, v]) => ({ x, clicks: v })) : null;

  // ---- ตารางตามแพลตฟอร์ม + สถานะความครบถ้วน ----
  const st = (x: { incomplete?: string } | null) => (!x ? "รอข้อมูล" : x.incomplete ? "ไม่ครบ" : "ครบ") as Source["status"];
  const platforms: PlatformRow[] = [
    { platform: "Google Ads", kind: "Paid", spend: G?.spend ?? null, clicks: G?.clicks ?? null, engagement: null, impressions: G?.impressions ?? null, period: G?.cover ?? "—", source: G?.source ?? "—", status: st(G) },
    { platform: "Meta Ads", kind: "Paid", spend: M?.spend ?? null, clicks: null, engagement: null, impressions: M?.impressions ?? null, period: M?.cover ?? "—", source: M ? "Meta Ads Report" : "—", status: st(M) },
    { platform: "Facebook Page", kind: "Organic", spend: null, clicks: ft?.link_clicks ?? null, engagement: ft?.reactions_comments_shares ?? null, impressions: null, period: F?.cover ?? "—", source: F ? (F.basis === "daily" ? "Facebook Page รายวัน" : "Facebook Page Lifetime") : "—", status: st(F) },
    { platform: "Website (GA4)", kind: "Website", spend: null, clicks: null, engagement: null, impressions: null, pageViews: Wb.views, period: Wb.cover || "—", source: Wb.source || "—", status: Wb.views === null ? "รอข้อมูล" : Wb.incomplete ? "ไม่ครบ" : "ครบ" },
    { platform: "Google Search", kind: "Organic", spend: null, clicks: S?.clicks ?? null, engagement: null, impressions: S?.impressions ?? null, period: S?.cover ?? "—", source: S ? "Search Console รายวัน" : "—", status: st(S) },
  ];
  const avail = (ds: string[]) => { const s = ds.filter(Boolean).sort(); return s.length ? span({ from: s[0].slice(0, 10), to: s[s.length - 1].slice(0, 10) }) : "ไม่มี"; };
  const sources: Source[] = [
    { name: "Google Ads Time series (รายวัน)", kind: "Paid", status: G?.source.includes("Time series") ? st(G) : d.gtime.length ? "ไม่ครบ" : "รอข้อมูล", detail: G?.source.includes("Time series") ? (G.incomplete ?? "ใช้คำนวณ Google Ads ช่วงนี้") : d.gtime.length ? "ไม่ครอบคลุมช่วงที่เลือก (ใช้ Campaign Report แทน)" : "ยังไม่ได้นำเข้า", available: avail(d.gtime.map((r) => r.date)) },
    { name: "Google Ads Campaign Report", kind: "Paid", status: G?.source.includes("Campaign") ? st(G) : camp ? (camp.incomplete ? "ไม่ครบ" : "ครบ") : "รอข้อมูล", detail: G?.source.includes("Campaign") ? (G.incomplete ?? "ใช้คำนวณ Google Ads ช่วงนี้") : camp ? "ใช้ตรวจไขว้กับ Time series" : "ไม่มีรายงานในช่วงนี้", available: avail(d.google.flatMap((r) => [r.report_start, r.report_end])) },
    { name: "Meta Ads Report", kind: "Paid", status: st(M), detail: M?.incomplete ?? (M ? "ครอบคลุมช่วงที่เลือกพอดี" : "ไม่มีรายงานในช่วงนี้"), available: avail(d.meta.flatMap((r) => [r.report_start, r.report_end])) },
    { name: "Facebook Page", kind: "Organic", status: st(F), detail: F?.incomplete ?? (F ? "ครอบคลุมช่วงที่เลือก" : "ไม่มีข้อมูลในช่วงนี้") + (F?.lifetimeOnlyPosts ? ` · ${F.lifetimeOnlyPosts} โพสต์มีแต่ยอดสะสม (ไม่รวม)` : ""), available: avail(fbRows.filter((r) => scopeOf(r) === "daily").map(metricDateOf)) },
    { name: "GA4 (Reports snapshot / หน้าและหน้าจอ / กรอกเอง)", kind: "Website", status: Wb.views === null && Wb.users === null ? "รอข้อมูล" : Wb.incomplete || Wb.users === null ? "ไม่ครบ" : "ครบ", detail: d.webTabMissing ? noWeb : Wb.views === null && Wb.users === null ? "ไม่มีรายงานในช่วงนี้" : [Wb.source && `ใช้ ${Wb.source}`, Wb.incomplete, Wb.users === null ? Wb.usersWhy : ""].filter(Boolean).join(" · "),
      available: ["ga4_snapshot", "ga4", "manual"].map((src) => { const l = web.filter((r) => r.source === src && r.granularity === "period").map((r) => span({ from: r.report_start, to: r.report_end })); return l.length ? `${src === "ga4_snapshot" ? "Snapshot" : src === "ga4" ? "รายหน้า" : "กรอกเอง"} ${l.join(", ")}` : ""; }).filter(Boolean).join(" · ") || "ไม่มี" },
    { name: "Search Console รายวัน", kind: "Organic", status: st(S), detail: S?.incomplete ?? (S ? "ครอบคลุมช่วงที่เลือก" : "ไม่มีข้อมูลในช่วงนี้"), available: avail(web.filter((r) => r.source === "search_console" && r.granularity === "day").map((r) => r.report_start)) },
  ];

  return {
    range, prevRange, defaulted: !f.from && !f.to, warnings, lastImport: d.lastImport, compare: f.compare ?? null, compareNote: cmp?.note,
    groups: labelPrev(f.compare, [
      { title: "Google Ads (Paid)", kind: "Paid", items: googleItems },
      { title: "Meta Ads (Paid)", kind: "Paid", items: metaItems },
      { title: "Facebook Page (Organic)", kind: "Organic", note: "ไม่รวมกับตัวเลขโฆษณา · ไม่รวมเพจที่ตั้งค่าให้ตัดออก", items: fbItems },
      { title: "Website (GA4)", kind: "Website", note: "ข้อมูลเว็บไซต์รวมทุกช่องทาง (Organic, Ads, Social, Direct) แยกจากตัวเลข Social และโฆษณา", items: webItems },
      { title: "Google Search (Search Console)", kind: "Organic", note: "การค้นหาแบบ Organic บน Google เท่านั้น — Clicks ไม่เท่ากับ Users/Page Views ของ GA4", items: searchItems },
      { title: "Google Ads Spend เทียบ Website", kind: "Compare", note: "เป็นการเทียบค่าโฆษณา Google Ads กับยอด Website รวมทุกช่องทางในช่วงเดียวกัน ไม่ใช่ต้นทุนที่พิสูจน์ Attribution แล้ว", items: cmpItems },
    ]),
    trend: { gran, google, fb, search, googleNote: google ? undefined : d.google.length ? "แนวโน้มต้องใช้ Google Ads Time series (รายวัน) — Campaign Report เป็นยอดรวมทั้งช่วง แบ่งรายวันไม่ได้" : undefined },
    platforms, sources, meta: { actions: [...byAct].map(([label, v]) => ({ label, ...v, spend: r2(v.spend) })).sort((a, b) => b.spend - a.spend) },
  };
}

function labelPrev(mode: CompareMode | undefined, groups: Performance["groups"]): Performance["groups"] {
  if (!mode) return groups;
  return groups.map((g) => ({ ...g, items: g.items.map((k) => {
    const base = { ...k, prevLabel: COMPARE_LABEL[mode], prev: k.prev === undefined ? null : k.prev };
    // ยอดสะสม Lifetime เทียบข้ามช่วงไม่ได้ (ไม่ใช่ยอดของช่วงนั้น)
    return /Lifetime/.test(`${k.incomplete ?? ""} ${k.prevIncomplete ?? ""}`) ? { ...base, prev: null, prevIncomplete: undefined, prevBlocked: "เป็นยอดสะสม (Lifetime) เทียบข้ามช่วงเวลาไม่ได้" } : base;
  }) }));
}
