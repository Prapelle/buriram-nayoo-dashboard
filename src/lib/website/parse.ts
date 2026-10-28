/**
 * Phase 5 — Website Analytics: อ่านไฟล์ GA4 และ Google Search Console
 * ทำงานได้ทั้งในเบราว์เซอร์และฝั่ง Server (ไม่มี dependency) — เบราว์เซอร์เป็นผู้อ่านไฟล์ใหญ่และสรุปผล
 * เพราะไฟล์ GA4 แบบรายหน้ามีหลายพันแถว เกินเวลา CPU ที่ Cloudflare Workers แผนฟรีให้ต่อคำขอ
 *
 * กฎสำคัญ
 * - GA4 "หน้าและหน้าจอ" เป็นยอดรวมทั้งช่วงรายงาน ระดับข้อมูล = เส้นทางหน้า × หน้า Landing
 *   · จำนวนการดู / เวลามีส่วนร่วมรวม / จำนวนเหตุการณ์ / กิจกรรมสำคัญ รวมข้ามแถวได้
 *   · ผู้ใช้ที่ใช้งานอยู่ "รวมข้ามแถวไม่ได้" (คนเดียวดูหลายหน้า) → ไม่สร้างยอด Website Users จากไฟล์นี้
 * - Search Console: Chart = รายวัน · Pages/Queries/Countries/Devices/Search appearance = ยอดรวมทั้งช่วง
 *   Google รวมข้อมูลแต่ละตารางคนละแบบ (ตามหน้า / ตามเว็บไซต์ / ตัดคำค้นที่ระบุตัวตนไม่ได้) ห้ามรวมข้ามตาราง
 * - ตารางรายละเอียดเก็บ N อันดับแรก + แถว "(อื่น ๆ)" รวมส่วนที่เหลือ เพื่อให้ยอดรวมยังตรงกับไฟล์
 */
import { parseCsv } from "../csv";

export type WebKind = "ga4_snapshot" | "ga4_pages" | "gsc_chart" | "gsc_pages" | "gsc_queries" | "gsc_countries" | "gsc_devices" | "gsc_appearance" | "gsc_filters";
export const KIND_LABEL: Record<WebKind, string> = {
  ga4_snapshot: "GA4 — Reports snapshot (ยอดผู้ใช้รวม + ตารางสรุป)", ga4_pages: "GA4 — หน้าและหน้าจอ (Pages and screens)", gsc_chart: "Search Console — รายวัน (Chart)", gsc_pages: "Search Console — หน้า (Pages)",
  gsc_queries: "Search Console — คำค้นหา (Queries)", gsc_countries: "Search Console — ประเทศ (Countries)", gsc_devices: "Search Console — อุปกรณ์ (Devices)",
  gsc_appearance: "Search Console — ลักษณะการแสดงผล (Search appearance)", gsc_filters: "Search Console — ตัวกรอง/ช่วงวันที่ (Filters)",
};
export const DIM_TYPE: Partial<Record<WebKind, string>> = { ga4_pages: "ga4_page", gsc_pages: "search_page", gsc_queries: "search_query", gsc_countries: "search_country", gsc_devices: "search_device", gsc_appearance: "search_appearance" };
export const TOP_N = 300;
export const OTHERS = "(อื่น ๆ)";

export class WebParseError extends Error { constructor(public code: string, message: string) { super(message); } }

export type SummaryRow = {
  source: "ga4" | "ga4_snapshot" | "search_console" | "manual"; property: string; granularity: "period" | "day"; report_start: string; report_end: string;
  new_users?: number | ""; sessions?: number | "";
  website_users?: number | ""; page_views?: number | ""; user_engagement_sec?: number | ""; avg_engagement_sec_per_user?: number | "";
  event_count?: number | ""; key_events?: number | ""; total_revenue?: number | ""; pages_count?: number | "";
  search_clicks?: number | ""; search_impressions?: number | ""; search_ctr_pct?: number | ""; search_position?: number | ""; notes?: string;
};
export type DimRow = {
  source: "ga4" | "ga4_snapshot" | "search_console"; property: string; report_start: string; report_end: string; dimension_type: string; dimension_value: string;
  users?: number | ""; sessions?: number | "";
  views?: number | ""; user_engagement_sec?: number | ""; event_count?: number | ""; key_events?: number | "";
  clicks?: number | ""; impressions?: number | ""; ctr_pct?: number | ""; position?: number | "";
};
export type ParsedFile = { kind: WebKind; filename: string; period?: { start: string; end: string }; property?: string; summary: SummaryRow[]; dims: DimRow[]; info: Record<string, number | string>; warnings: string[]; filterText?: string };

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const isIso = (s: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const t = Date.parse(s + "T00:00:00Z"); return Number.isFinite(t) && new Date(t).toISOString().startsWith(s); };

function num(raw: string, what: string, row: number): number {
  const s = String(raw ?? "").trim().replace(/,/g, "").replace(/%$/, "");
  if (s === "") return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new WebParseError("BAD_NUMBER", `แถว ${row}: ${what} ไม่ใช่ตัวเลข ("${raw}")`);
  return n;
}

/** ตัดบรรทัดคำอธิบาย (#) ของ GA4 ออก และอ่านช่วงวันที่/พร็อพเพอร์ตี้จากบรรทัดเหล่านั้น */
function splitComments(text: string) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const meta: Record<string, string> = {};
  const body: string[] = [];
  for (const l of lines) {
    if (l.startsWith("#")) { const m = /^#\s*([^:]+):\s*(.*)$/.exec(l); if (m) meta[m[1].trim().toLowerCase()] = m[2].trim(); }
    else body.push(l);
  }
  return { meta, body: body.join("\n") };
}
const ymd = (s: string | undefined) => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : "");

const H = (headers: string[]) => new Map(headers.map((h, i) => [h.trim().toLowerCase(), i]));
const pick = (m: Map<string, number>, ...names: string[]) => { for (const n of names) { const i = m.get(n.toLowerCase()); if (i !== undefined) return i; } return -1; };

// หัวคอลัมน์ GA4 (ไทย / อังกฤษ)
const GA = {
  path: ["เส้นทางหน้าเว็บและคลาสหน้าจอ", "page path and screen class"],
  landing: ["หน้า landing page + สตริงการค้นหา", "landing page + query string"],
  views: ["จำนวนการดู", "views"], users: ["ผู้ใช้ที่ใช้งานอยู่", "active users"],
  engagement: ["การมีส่วนร่วมของผู้ใช้", "user engagement"], events: ["จำนวนเหตุการณ์", "event count"],
  key: ["กิจกรรมสำคัญ", "key events"], revenue: ["รายได้ทั้งหมด", "total revenue"],
};

export function detectKind(headers: string[]): WebKind | null {
  const m = H(headers);
  if (pick(m, ...GA.path) >= 0 && pick(m, ...GA.views) >= 0) return "ga4_pages";
  const gsc = pick(m, "clicks") >= 0 && pick(m, "impressions") >= 0 && pick(m, "position") >= 0; // ทุกตารางของ Search Console มี Position (ไฟล์ Google Ads ไม่มี — กันจับผิดประเภท เช่น Devices)
  if (gsc && pick(m, "date") >= 0) return "gsc_chart";
  if (gsc && pick(m, "top pages") >= 0) return "gsc_pages";
  if (gsc && pick(m, "top queries") >= 0) return "gsc_queries";
  if (gsc && pick(m, "country") >= 0) return "gsc_countries";
  if (gsc && pick(m, "device") >= 0) return "gsc_devices";
  if (gsc && pick(m, "search appearance") >= 0) return "gsc_appearance";
  if (pick(m, "filter") >= 0 && pick(m, "value") >= 0) return "gsc_filters";
  return null;
}

/** "Oct 1, 2026-Oct 27, 2026" → ISO */
export function parseGscRange(v: string): { start: string; end: string } | null {
  const m = /^\s*([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})\s*-\s*([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})\s*$/.exec(v);
  if (!m) return null;
  const a = MONTHS[m[1].toLowerCase()], b = MONTHS[m[4].toLowerCase()];
  if (!a || !b) return null;
  const start = `${m[3]}-${a}-${m[2].padStart(2, "0")}`, end = `${m[6]}-${b}-${m[5].padStart(2, "0")}`;
  return isIso(start) && isIso(end) && start <= end ? { start, end } : null;
}

/** ตัดเหลือ N อันดับแรก + แถว (อื่น ๆ) ที่รวมส่วนที่เหลือ (ยอดรวมไม่หาย) */
function topWithOthers<T extends Record<string, unknown>>(rows: T[], by: keyof T, merge: (rest: T[]) => T): T[] {
  const sorted = [...rows].sort((a, b) => Number(b[by]) - Number(a[by]));
  if (sorted.length <= TOP_N) return sorted;
  return [...sorted.slice(0, TOP_N), merge(sorted.slice(TOP_N))];
}

/**
 * GA4 Reports snapshot: หลายตารางในไฟล์เดียว คั่นด้วยบรรทัด # (แต่ละตารางมีช่วงวันที่ของตัวเอง)
 * - ตารางแรก = ยอดรวมทั้งพร็อพเพอร์ตี้: Active users (ผู้ใช้ไม่ซ้ำของช่วง), New users, Average engagement time per active user, Event count
 * - Page title: Views รวมกันได้ = Page Views · Session source: Sessions รวมกันได้ = Sessions
 * - First user source / City: ผู้ใช้ต่อกลุ่ม (เก็บเป็นรายละเอียด ไม่ใช้แทนยอดรวม)
 */
type Block = { meta: Record<string, string>; title: string; headers: string[]; rows: string[][] };
function splitBlocks(text: string): Block[] {
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/);
  const blocks: Block[] = []; let meta: Record<string, string> = {}, title = "", body: string[] = [];
  const flush = () => { const rows = parseCsv(body.join("\n")); if (rows.length) blocks.push({ meta, title, headers: rows[0].map((h) => h.trim()), rows: rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")) }); body = []; };
  let inComment = false;
  for (const l of lines) {
    if (l.startsWith("#")) {
      if (!inComment) { if (body.some((x) => x.trim())) flush(); body = []; meta = { ...meta }; title = ""; inComment = true; }
      const m = /^#\s*([^:]+):\s*(.*)$/.exec(l); if (m) meta[m[1].trim().toLowerCase()] = m[2].trim();
      else { const t = l.replace(/^#\s*/, "").trim(); if (t && !/^-+$/.test(t)) title = t; }
    } else { inComment = false; body.push(l); }
  }
  if (body.some((x) => x.trim())) flush();
  return blocks;
}
const SNAP_TOTAL = { users: ["active users", "ผู้ใช้ที่ใช้งานอยู่"], newUsers: ["new users", "ผู้ใช้ใหม่"], avg: ["average engagement time per active user", "เวลาในการมีส่วนร่วมโดยเฉลี่ยต่อผู้ใช้ที่ใช้งานอยู่"], events: ["event count", "จำนวนเหตุการณ์"] };
export function isSnapshot(text: string): boolean {
  const b = splitBlocks(text);
  if (b.length < 2) return false;
  const m = H(b[0].headers);
  return pick(m, ...SNAP_TOTAL.users) === 0 && pick(m, ...SNAP_TOTAL.avg) >= 0 && b[0].rows.length === 1;
}
function parseSnapshot(filename: string, text: string): ParsedFile {
  const blocks = splitBlocks(text);
  const per = (b: Block) => ({ start: ymd(b.meta["start date"] ?? b.meta["วันที่เริ่มต้น"]), end: ymd(b.meta["end date"] ?? b.meta["วันที่สิ้นสุด"]) });
  const period = per(blocks[0]);
  if (!isIso(period.start) || !isIso(period.end) || period.start > period.end) throw new WebParseError("BAD_PERIOD", "ไม่พบช่วงวันที่ในไฟล์ Reports snapshot (บรรทัด # Start date / End date)");
  for (const b of blocks) { const p = per(b); if (p.start !== period.start || p.end !== period.end) throw new WebParseError("BAD_PERIOD", `ตาราง "${b.headers[0]}" มีช่วงวันที่ต่างจากตารางแรก — ไฟล์ต้องเป็นช่วงเดียวกันทั้งไฟล์`); }
  const property = blocks[0].meta["property"] ?? blocks[0].meta["พร็อพเพอร์ตี้"] ?? "";
  const tm = H(blocks[0].headers), tr = blocks[0].rows[0];
  const users = num(tr[pick(tm, ...SNAP_TOTAL.users)], "Active users", 2);
  const newIx = pick(tm, ...SNAP_TOTAL.newUsers), evIx = pick(tm, ...SNAP_TOTAL.events);
  const avg = num(tr[pick(tm, ...SNAP_TOTAL.avg)], "Average engagement time", 2);
  if (!Number.isInteger(users) || users < 0) throw new WebParseError("BAD_NUMBER", "Active users ต้องเป็นจำนวนเต็ม");
  const find = (first: string[]) => blocks.find((b) => first.includes(b.headers[0]?.trim().toLowerCase()));
  const warnings: string[] = [], dims: DimRow[] = [], info: Record<string, number | string> = { users, avg_engagement_sec: r2(avg) };
  const base = { source: "ga4_snapshot" as const, property, report_start: period.start, report_end: period.end };
  const addDims = (type: string, b: Block | undefined, cols: Record<string, string[]>, sortBy: string, othersLabel: string) => {
    if (!b) return null;
    const m = H(b.headers); const ix = Object.fromEntries(Object.entries(cols).map(([k, names]) => [k, pick(m, ...names)]));
    if (Object.values(ix).some((i) => i < 0)) { warnings.push(`ตาราง "${b.headers[0]}" ไม่มีคอลัมน์ที่ต้องใช้ — ข้าม`); return null; }
    const seen = new Set<string>();
    const rows = b.rows.map((r, i) => {
      const v = (r[0] ?? "").trim() || "(not set)";
      if (seen.has(v)) throw new WebParseError("DUPLICATE_ROW", `ตาราง "${b.headers[0]}" มี "${v}" ซ้ำ`); seen.add(v);
      return { dimension_value: v, ...Object.fromEntries(Object.entries(ix).map(([k, j]) => [k, num(r[j], k, i + 2)])) } as Record<string, string | number>;
    });
    const tot = (k: string, list = rows) => list.reduce((t, x) => t + Number(x[k]), 0);
    const top = topWithOthers(rows, sortBy, (rest) => ({ dimension_value: `${OTHERS} ${rest.length} ${othersLabel}`, ...Object.fromEntries(Object.keys(cols).map((k) => [k, tot(k, rest)])) }));
    for (const t of top) dims.push({ ...base, dimension_type: type, ...(t as object) } as DimRow);
    if (rows.length > TOP_N) warnings.push(`${b.headers[0]}: เก็บ ${TOP_N} อันดับแรก อีก ${rows.length - TOP_N} รายการรวมไว้ในแถว "${OTHERS}"`);
    return { count: rows.length, tot };
  };
  const pt = addDims("ga4_page_title", find(["page title and screen class", "ชื่อหน้าและคลาสหน้าจอ"]), { views: ["views", "จำนวนการดู"], users: ["active users", "ผู้ใช้ที่ใช้งานอยู่"], event_count: ["event count", "จำนวนเหตุการณ์"] }, "views", "หน้า");
  const fu = addDims("ga4_first_user_source", find(["first user source / medium"]), { users: ["active users"] }, "users", "แหล่ง");
  const ss = addDims("ga4_session_source", find(["session source / medium"]), { sessions: ["sessions"] }, "sessions", "แหล่ง");
  const ct = addDims("ga4_city", find(["city"]), { users: ["active users"] }, "users", "เมือง");
  const plat = find(["platform"]); const ke = plat ? plat.rows.reduce((t, r, i) => t + num(r[pick(H(plat.headers), "key events", "กิจกรรมสำคัญ")], "Key events", i + 2), 0) : "";
  const views = pt ? pt.tot("views") : "", sessions = ss ? ss.tot("sessions") : "";
  if (!pt) warnings.push("ไม่พบตาราง Page title — ไม่มียอด Page Views จากไฟล์นี้");
  if (pt) info.page_views = pt.tot("views"); if (ss) info.sessions = ss.tot("sessions"); if (ke !== "") info.key_events = ke;
  if (pt) warnings.push(`ผู้ใช้ในตาราง Page title / City / First user source เป็นรายกลุ่ม (รวมกันไม่ได้) — ใช้ Active users ${users.toLocaleString("en-US")} จากตารางยอดรวมเป็น Website Users`);
  if (fu && Math.abs(fu.tot("users") - users) > 0) warnings.push(`ผลรวมตาราง First user source (${fu.tot("users").toLocaleString("en-US")}) ไม่เท่ากับ Active users ทั้งหมด — GA4 ตัดบางแถวออกจากตาราง เก็บเป็นรายละเอียดเท่านั้น`);
  void ct;
  return {
    kind: "ga4_snapshot", filename, period, property, warnings, dims, info,
    summary: [{ ...base, granularity: "period", website_users: users, new_users: newIx >= 0 ? num(tr[newIx], "New users", 2) : "", avg_engagement_sec_per_user: r4(avg),
      event_count: evIx >= 0 ? num(tr[evIx], "Event count", 2) : "", key_events: ke, page_views: views, sessions, pages_count: pt ? pt.count : "", user_engagement_sec: "", total_revenue: "", notes: "GA4 Reports snapshot" }],
  };
}

export function parseWebsiteFile(filename: string, text: string): ParsedFile {
  if (isSnapshot(text)) return parseSnapshot(filename, text);
  const { meta, body } = splitComments(text);
  const rows = parseCsv(body);
  if (!rows.length) throw new WebParseError("EMPTY_FILE", "ไฟล์ว่างเปล่า");
  const headers = rows[0].map((h) => h.trim());
  const kind = detectKind(headers);
  if (!kind) throw new WebParseError("UNKNOWN_FILE", `ไม่รู้จักไฟล์ "${filename}" — รองรับ GA4 (หน้าและหน้าจอ) และ Search Console (Chart, Pages, Queries, Countries, Devices, Search appearance, Filters) แบบ CSV`);
  const m = H(headers);
  const data = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  const warnings: string[] = [];

  if (kind === "gsc_filters") {
    const kv = Object.fromEntries(data.map((r) => [r[0]?.trim(), r[1]?.trim() ?? ""]));
    const period = kv.Date ? parseGscRange(kv.Date) : null;
    if (!period) throw new WebParseError("BAD_PERIOD", `อ่านช่วงวันที่ในไฟล์ Filters ไม่ได้ ("${kv.Date ?? ""}")`);
    const filterText = Object.entries(kv).filter(([k]) => k !== "Date").map(([k, v]) => `${k}: ${v}`).join(" · ");
    return { kind, filename, period, summary: [], dims: [], info: { filters: filterText }, warnings, filterText };
  }

  if (kind === "ga4_pages") {
    const start = ymd(meta["วันที่เริ่มต้น"] ?? meta["start date"]), end = ymd(meta["วันที่สิ้นสุด"] ?? meta["end date"]);
    if (!isIso(start) || !isIso(end) || start > end) throw new WebParseError("BAD_PERIOD", "ไม่พบช่วงวันที่ในหัวไฟล์ GA4 (บรรทัด # วันที่เริ่มต้น / วันที่สิ้นสุด) — ให้ส่งออกจาก GA4 ใหม่โดยไม่แก้ไฟล์");
    const property = meta["พร็อพเพอร์ตี้"] ?? meta["property"] ?? "";
    const ix = { path: pick(m, ...GA.path), views: pick(m, ...GA.views), users: pick(m, ...GA.users), eng: pick(m, ...GA.engagement), ev: pick(m, ...GA.events), key: pick(m, ...GA.key), rev: pick(m, ...GA.revenue), landing: pick(m, ...GA.landing) };
    if (ix.eng < 0) throw new WebParseError("MISSING_HEADERS", "ไฟล์ GA4 ต้องมีคอลัมน์ การมีส่วนร่วมของผู้ใช้ (User engagement) เพื่อคำนวณเวลาใช้งาน");
    const byPath = new Map<string, { views: number; eng: number; ev: number; key: number }>();
    let views = 0, eng = 0, ev = 0, key = 0, rev = 0, userRowsSum = 0;
    const seen = new Set<string>();
    data.forEach((r, i) => {
      const n = i + 2, path = (r[ix.path] ?? "").trim() || "(not set)";
      const k = `${path}\u0000${ix.landing >= 0 ? r[ix.landing] ?? "" : ""}`;
      if (seen.has(k)) throw new WebParseError("DUPLICATE_ROW", `แถว ${n}: หน้า "${path}" ซ้ำในไฟล์ (คาดว่าไฟล์ถูกแก้ไขหรือส่งออกไม่ถูกต้อง)`);
      seen.add(k);
      const v = num(r[ix.views], "จำนวนการดู", n), e = num(r[ix.eng], "การมีส่วนร่วมของผู้ใช้", n), c = ix.ev >= 0 ? num(r[ix.ev], "จำนวนเหตุการณ์", n) : 0, kk = ix.key >= 0 ? num(r[ix.key], "กิจกรรมสำคัญ", n) : 0;
      if (v < 0 || e < 0) throw new WebParseError("BAD_NUMBER", `แถว ${n}: ค่าติดลบ`);
      views += v; eng += e; ev += c; key += kk; rev += ix.rev >= 0 ? num(r[ix.rev], "รายได้ทั้งหมด", n) : 0; userRowsSum += ix.users >= 0 ? num(r[ix.users], "ผู้ใช้", n) : 0;
      const p = byPath.get(path) ?? { views: 0, eng: 0, ev: 0, key: 0 }; p.views += v; p.eng += e; p.ev += c; p.key += kk; byPath.set(path, p);
    });
    const pages = [...byPath].map(([path, p]) => ({ dimension_value: path, views: p.views, user_engagement_sec: r2(p.eng), event_count: p.ev, key_events: p.key }));
    const dimsRaw = topWithOthers(pages, "views", (rest) => ({ dimension_value: `${OTHERS} ${rest.length} หน้า`, views: rest.reduce((s, x) => s + x.views, 0), user_engagement_sec: r2(rest.reduce((s, x) => s + x.user_engagement_sec, 0)), event_count: rest.reduce((s, x) => s + x.event_count, 0), key_events: rest.reduce((s, x) => s + x.key_events, 0) }));
    warnings.push(`ผู้ใช้ที่ใช้งานอยู่ในไฟล์นี้เป็นรายหน้า (รวมทุกแถวได้ ${userRowsSum.toLocaleString("en-US")} ซึ่งนับคนเดียวกันซ้ำ) จึงไม่ใช้เป็นยอด Website Users — กรอกยอดผู้ใช้จริงของช่วงนี้จาก GA4 ในช่อง "ยอดผู้ใช้เว็บไซต์ (กรอกเอง)"`);
    if (byPath.size > TOP_N) warnings.push(`เก็บรายละเอียด ${TOP_N} หน้าที่มีการดูมากที่สุด อีก ${byPath.size - TOP_N} หน้ารวมไว้ในแถว "${OTHERS}" (ยอดรวมยังครบ)`);
    return {
      kind, filename, period: { start, end }, property,
      summary: [{ source: "ga4", property, granularity: "period", report_start: start, report_end: end, website_users: "", page_views: views, user_engagement_sec: r2(eng), avg_engagement_sec_per_user: "", event_count: ev, key_events: key, total_revenue: r2(rev), pages_count: byPath.size, notes: "จากรายงานหน้าและหน้าจอ: ไม่มียอดผู้ใช้รวม" }],
      dims: dimsRaw.map((d) => ({ source: "ga4", property, report_start: start, report_end: end, dimension_type: "ga4_page", ...d })),
      info: { rows: data.length, pages: byPath.size, views, user_engagement_sec: r2(eng), user_rows_sum: userRowsSum }, warnings,
    };
  }

  // ---- Search Console ----
  const ic = pick(m, "clicks"), ii = pick(m, "impressions"), ip = pick(m, "position");
  const parsed = data.map((r, i) => {
    const n = i + 2, clicks = num(r[ic], "Clicks", n), impressions = num(r[ii], "Impressions", n), position = ip >= 0 ? num(r[ip], "Position", n) : 0;
    if (clicks < 0 || impressions < 0 || clicks > impressions) throw new WebParseError("BAD_NUMBER", `แถว ${n}: Clicks/Impressions ไม่สมเหตุสมผล (${clicks}/${impressions})`);
    return { r, clicks, impressions, position };
  });
  const ctr = (c: number, i: number) => (i > 0 ? r2((c / i) * 100) : "");
  const wpos = (rows: { impressions: number; position: number }[]) => { const im = rows.reduce((s, x) => s + x.impressions, 0); return im > 0 ? r4(rows.reduce((s, x) => s + x.position * x.impressions, 0) / im) : ""; };
  if (kind === "gsc_chart") {
    const id = pick(m, "date");
    const days = parsed.map((x, i) => { const d = (x.r[id] ?? "").trim(); if (!isIso(d)) throw new WebParseError("BAD_DATE", `แถว ${i + 2}: วันที่ไม่ถูกต้อง ("${d}")`); return { ...x, d }; });
    const ds = days.map((x) => x.d).sort();
    if (new Set(ds).size !== ds.length) throw new WebParseError("DUPLICATE_ROW", "มีวันที่ซ้ำในไฟล์ Chart");
    return {
      kind, filename, period: { start: ds[0], end: ds[ds.length - 1] }, property: "",
      summary: days.map((x) => ({ source: "search_console" as const, property: "", granularity: "day" as const, report_start: x.d, report_end: x.d, search_clicks: x.clicks, search_impressions: x.impressions, search_ctr_pct: ctr(x.clicks, x.impressions), search_position: x.position })),
      dims: [], info: { days: days.length, clicks: days.reduce((s, x) => s + x.clicks, 0), impressions: days.reduce((s, x) => s + x.impressions, 0), position: wpos(days) }, warnings,
    };
  }
  const iv = pick(m, ...({ gsc_pages: ["top pages"], gsc_queries: ["top queries"], gsc_countries: ["country"], gsc_devices: ["device"], gsc_appearance: ["search appearance"] } as Record<string, string[]>)[kind]);
  const vals = parsed.map((x) => ({ dimension_value: (x.r[iv] ?? "").trim() || "(not set)", clicks: x.clicks, impressions: x.impressions, position: x.position }));
  const top = topWithOthers(vals, "clicks", (rest) => ({ dimension_value: `${OTHERS} ${rest.length} รายการ`, clicks: rest.reduce((s, x) => s + x.clicks, 0), impressions: rest.reduce((s, x) => s + x.impressions, 0), position: Number(wpos(rest)) || 0 }));
  if (vals.length > TOP_N) warnings.push(`เก็บ ${TOP_N} อันดับแรกตาม Clicks อีก ${vals.length - TOP_N} รายการรวมไว้ในแถว "${OTHERS}"`);
  if (kind === "gsc_queries") warnings.push("ยอดรวมของคำค้นหาน้อยกว่ายอดรายวัน เพราะ Google ไม่แสดงคำค้นที่อาจระบุตัวบุคคลได้ — ห้ามนำไปรวมกับตารางอื่น");
  return {
    kind, filename, summary: [], warnings,
    dims: top.map((d) => ({ source: "search_console" as const, property: "", report_start: "", report_end: "", dimension_type: DIM_TYPE[kind]!, dimension_value: d.dimension_value, clicks: d.clicks, impressions: d.impressions, ctr_pct: ctr(d.clicks, d.impressions), position: d.position })),
    info: { rows: vals.length, clicks: vals.reduce((s, x) => s + x.clicks, 0), impressions: vals.reduce((s, x) => s + x.impressions, 0) },
  };
}

export type UploadBatch = { kind: WebKind; filename: string; sha256: string; period: { start: string; end: string }; property: string; summary: SummaryRow[]; dims: DimRow[] };

/**
 * รวมไฟล์ที่เลือกพร้อมกัน: ช่วงวันที่ของตาราง Search Console มาจากไฟล์ Filters (หรือไฟล์ Chart, หรือที่ผู้ใช้กรอก)
 * คืนรายการชุดข้อมูลที่ส่งให้ Server (หนึ่งชุดต่อไฟล์)
 */
export function assembleBatches(files: (ParsedFile & { sha256: string })[], fallback?: { start: string; end: string }): { batches: UploadBatch[]; errors: string[]; property: string } {
  const errors: string[] = [];
  const filters = files.find((f) => f.kind === "gsc_filters");
  const chart = files.find((f) => f.kind === "gsc_chart");
  const gscPeriod = filters?.period ?? chart?.period ?? (fallback && isIso(fallback.start) && isIso(fallback.end) && fallback.start <= fallback.end ? fallback : undefined);
  const gscProperty = filters?.filterText ? filters.filterText.replace(/Search type: [^·]*·?\s*/i, "").trim() : "";
  if (filters && chart && (filters.period!.start !== chart.period!.start || filters.period!.end !== chart.period!.end)) errors.push(`ช่วงวันที่ใน Filters (${filters.period!.start} ถึง ${filters.period!.end}) ไม่ตรงกับไฟล์ Chart (${chart.period!.start} ถึง ${chart.period!.end}) — ไฟล์น่าจะมาจากการส่งออกคนละครั้ง`);
  const batches: UploadBatch[] = [];
  for (const f of files) {
    if (f.kind === "gsc_filters") continue;
    const isGsc = f.kind.startsWith("gsc_");
    const period = f.kind === "ga4_pages" || f.kind === "ga4_snapshot" || f.kind === "gsc_chart" ? f.period! : gscPeriod;
    if (!period) { errors.push(`${f.filename}: ไม่ทราบช่วงวันที่ — เลือกไฟล์ Filters.csv มาพร้อมกัน หรือกรอกช่วงวันที่`); continue; }
    const property = isGsc ? gscProperty : f.property ?? "";
    batches.push({
      kind: f.kind, filename: f.filename, sha256: f.sha256, period, property,
      summary: f.summary.map((s) => ({ ...s, property: s.source === "search_console" ? gscProperty : s.property })),
      dims: f.dims.map((d) => ({ ...d, property, report_start: period.start, report_end: period.end })),
    });
  }
  return { batches, errors, property: gscProperty };
}
