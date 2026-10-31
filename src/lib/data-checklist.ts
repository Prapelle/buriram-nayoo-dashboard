import { thMonth } from "./thdate";
// Checklist ข้อมูลประจำเดือน (30/10/2026): แต่ละแหล่งข้อมูลนำเข้าครบเดือนนั้นแล้วหรือยัง
// ใช้ข้อมูลที่หน้า ภาพรวม อ่านอยู่แล้ว (ไม่เรียก Google Sheets เพิ่ม) · ยอดขาย FlowAccount ส่งวันที่เอกสารมาแยก (เฉพาะ Admin)
import { addDays, dmyS, gapsIn, mergeSpans, type DashData, type Row, type Span } from "./dashboard";
import { metricDateOf, scopeOf } from "./fbmetrics";

export type CheckStatus = "ครบ" | "บางส่วน" | "ยังไม่มี";
export type CheckItem = { key: string; name: string; status: CheckStatus; detail: string; href: string };
export type Checklist = { month: string; label: string; from: string; to: string; items: CheckItem[]; done: number };

export const monthLabel = (m: string) => thMonth(m);
const lastDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10); // วันสุดท้ายของเดือน
const fmt = (g: Span[]) => g.slice(0, 3).map(([a, b]) => (a === b ? dmyS(a) : `${dmyS(a)}–${dmyS(b)}`)).join(", ") + (g.length > 3 ? " ..." : "");

/** ช่วงที่ "ควรมีข้อมูล" ของเดือน: เดือนที่ผ่านไปแล้ว = ทั้งเดือน · เดือนปัจจุบัน = ถึงเมื่อวาน */
export function monthWindow(month: string, today: string): { from: string; to: string } | null {
  const from = `${month}-01`, end = lastDay(month), yday = addDays(today, -1);
  const to = end < yday ? end : yday;
  return to < from ? null : { from, to };
}

/** สถานะจากชุดวันที่ที่มีข้อมูล (รายวัน) */
function daily(days: Set<string>, from: string, to: string): { status: CheckStatus; detail: string } {
  const spans: Span[] = [...days].filter((d) => d >= from && d <= to).sort().map((d) => [d, d] as Span);
  const merged: Span[] = []; for (const [a] of spans) { const l = merged[merged.length - 1]; if (l && addDays(l[1], 1) === a) l[1] = a; else merged.push([a, a]); }
  const gaps = gapsIn(merged, from, to);
  if (!spans.length) return { status: "ยังไม่มี", detail: "ยังไม่ได้นำเข้า" };
  return gaps.length ? { status: "บางส่วน", detail: `มี ${spans.length} วัน · ขาด ${fmt(gaps)}` } : { status: "ครบ", detail: `ครบ ${spans.length} วัน` };
}
/** สถานะจากรายงานแบบช่วงวันที่ (report_start–report_end) */
function ranged(rows: Row[], from: string, to: string): { status: CheckStatus; detail: string } {
  const inMonth = rows.filter((r) => r.report_start && r.report_end && r.report_start <= to && r.report_end >= from);
  if (!inMonth.length) return { status: "ยังไม่มี", detail: "ยังไม่ได้นำเข้า" };
  const gaps = gapsIn(mergeSpans(inMonth), from, to);
  return gaps.length ? { status: "บางส่วน", detail: `ขาด ${fmt(gaps)}` } : { status: "ครบ", detail: `ครอบคลุม ${dmyS(from)}–${dmyS(to)}` };
}

export function buildChecklist(d: DashData, month: string, today: string, opts: { salesDates?: string[] } = {}): Checklist | null {
  const w = monthWindow(month, today); if (!w) return null;
  const { from, to } = w;
  const G = "/settings/import-guide/";
  const fbDays = new Set(d.posts.filter((r) => scopeOf(r) === "daily").map(metricDateOf));
  const pg = (metric: string) => new Set((d.fbPage ?? []).filter((r) => r.metric === metric).map((r) => String(r.metric_date).slice(0, 10)));
  const web = d.web ?? [];
  const ga4 = web.filter((r) => ["ga4_snapshot", "ga4", "manual"].includes(r.source) && r.granularity === "period");
  const ga4Exact = ga4.some((r) => r.source === "ga4_snapshot" && r.report_start === from && r.report_end >= to);
  const ga4R = ranged(ga4, from, to);
  const gsc = new Set(web.filter((r) => r.source === "search_console" && r.granularity === "day").map((r) => String(r.report_start)));
  const line = d.line.find((r) => String(r.report_month).slice(0, 7) === month);
  const items: CheckItem[] = [
    { key: "fb_posts", name: "Facebook Page — สถิติโพสต์รายวัน", href: G + "fb-posts", ...daily(fbDays, from, to) },
    { key: "fb_viewers", name: "Facebook Page — Viewers", href: G + "fb-results", ...daily(pg("viewers"), from, to) },
    { key: "fb_link", name: "Facebook Page — Link clicks", href: G + "fb-results", ...daily(pg("link_clicks"), from, to) },
    { key: "meta", name: "Facebook Ads", href: G + "fb-ads", ...ranged(d.meta, from, to) },
    { key: "gads", name: "Google Ads — Campaign Report", href: G + "google-ads", ...ranged(d.google, from, to) },
    { key: "gtime", name: "Google Ads — Time series รายวัน", href: G + "google-ads", ...daily(new Set(d.gtime.map((r) => String(r.date).slice(0, 10))), from, to) },
    { key: "ga4", name: "GA4 — Reports snapshot", href: G + "website", ...(ga4Exact ? { status: "ครบ" as const, detail: "มี Reports snapshot ของเดือนนี้" }
      : ga4R.status === "ยังไม่มี" ? ga4R : { status: "บางส่วน" as const, detail: ga4R.status === "ครบ" ? "มีรายงาน GA4 แต่ไม่มี Reports snapshot ของเดือนนี้ (ยอดผู้ใช้อาจไม่มี)" : ga4R.detail }) },
    { key: "gsc", name: "Search Console", href: G + "website", ...daily(gsc, from, to) },
    { key: "line", name: "LINE OA (กรอกเอง)", href: "/line-oa", ...(line ? { status: "ครบ" as const, detail: "กรอกยอดเดือนนี้แล้ว" } : { status: "ยังไม่มี" as const, detail: "ยังไม่ได้กรอกยอดเดือนนี้" }) },
  ];
  if (opts.salesDates) {
    const n = opts.salesDates.filter((x) => x.slice(0, 7) === month).length;
    items.push({ key: "sales", name: "Sales — FlowAccount", href: G + "sales", status: n ? "ครบ" : "ยังไม่มี", detail: n ? `มี ${n.toLocaleString("en-US")} เอกสารในเดือนนี้` : "ยังไม่มีเอกสารขายของเดือนนี้" });
  }
  return { month, label: monthLabel(month), from, to, items, done: items.filter((x) => x.status === "ครบ").length };
}
