// กฎสรุปสถิติ Facebook Page (ใช้ร่วมกันใน Dashboard, หน้า Facebook Page และ Export เพื่อไม่ให้นับซ้ำ)
// - แถวรายวัน (metric_scope = daily): ค่าของวันนั้น → รวมข้ามวันได้ เฉพาะค่าที่เป็นยอดนับ (ADDITIVE)
// - แถว Lifetime: ยอดสะสม ณ วันส่งออก → ใช้เฉพาะ snapshot ล่าสุดของแต่ละโพสต์ ห้ามรวมข้ามวัน และห้ามรวมกับยอดรายวัน
// - ค่าเฉลี่ย/อัตรา (average_seconds_viewed, ad_cpm_usd) ไม่นำมารวม
// - Reach รายวันที่นำมารวม = "ผลรวม Reach รายวัน" ไม่ใช่ Unique Reach
export type FbRow = Record<string, string>;
export const FB_ADDITIVE = ["reactions_comments_shares", "reactions", "comments", "shares", "seconds_viewed", "ad_impressions", "estimated_earnings_usd", "views", "reach", "total_clicks", "other_clicks", "link_clicks"] as const;
export type FbMetric = (typeof FB_ADDITIVE)[number];
export type Range = { from?: string; to?: string };

const num = (v: unknown): number | null => { const s = String(v ?? "").trim(); if (s === "") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const postKey = (r: FbRow) => `${r.page_id}|${r.post_id}`;
/** แถวเก่าที่ไม่มี metric_date (ก่อน Phase 1) ถือเป็น Lifetime ณ snapshot_date */
export const scopeOf = (r: FbRow): "daily" | "lifetime" => (r.metric_scope === "daily" ? "daily" : "lifetime");
export const metricDateOf = (r: FbRow) => (r.metric_date || r.snapshot_date || "").slice(0, 10);
export const publishDateOf = (r: FbRow) => (r.publish_time || "").slice(0, 10);
const inRange = (d: string, f: Range) => (!f.from && !f.to) || (d !== "" && (!f.from || d >= f.from) && (!f.to || d <= f.to));

export function excludePages(rows: FbRow[], excluded: string[]): { kept: FbRow[]; excludedPosts: number } {
  const ex = new Set(excluded);
  const kept = rows.filter((r) => !ex.has(r.page_name) && !ex.has(r.page_id));
  const allPosts = new Set(rows.map(postKey)), keptPosts = new Set(kept.map(postKey));
  return { kept, excludedPosts: allPosts.size - keptPosts.size };
}

export type Totals = Record<FbMetric, number | null> & { rows: number; posts: number; filledPosts: Record<FbMetric, number> };
function totalsOf(rows: FbRow[]): Totals {
  const t = { rows: rows.length, posts: new Set(rows.map(postKey)).size, filledPosts: {} } as Totals;
  for (const k of FB_ADDITIVE) {
    let s = 0, n = 0; const filled = new Set<string>();
    for (const r of rows) { const v = num(r[k]); if (v !== null) { s += v; n++; filled.add(postKey(r)); } }
    t[k] = n ? r3(s) : null; // ไม่มีค่าเลย = null (ไม่ใช่ 0)
    t.filledPosts[k] = filled.size;
  }
  return t;
}

export type FbSummary = {
  basis: "daily" | "lifetime" | "none";
  daily: Totals & { from: string; to: string };
  lifetime: Totals & { snapshot: string };
  lifetimeOnlyPosts: number; // โพสต์ที่มีแต่ Lifetime (ไม่ได้รวมในยอดรายวัน)
  publishedPosts: number;    // โพสต์ที่ "เผยแพร่" ในช่วง (ตาม publish_time)
};

/** สรุปตามช่วงวันที่ของสถิติ (metric_date) แยกจากวันเผยแพร่ (publish_time) */
export function summarizeFb(rows: FbRow[], f: Range): FbSummary {
  const daily = rows.filter((r) => scopeOf(r) === "daily" && inRange(metricDateOf(r), f));
  const dailyPosts = new Set(rows.filter((r) => scopeOf(r) === "daily").map(postKey));
  // Lifetime: snapshot ล่าสุดของแต่ละโพสต์ภายในช่วง (ถ้ากรองช่วง) — ไม่รวมโพสต์ที่มีข้อมูลรายวันแล้ว
  const latest = new Map<string, FbRow>();
  for (const r of rows) {
    if (scopeOf(r) !== "lifetime" || !inRange(metricDateOf(r), f)) continue;
    const k = postKey(r), cur = latest.get(k);
    if (!cur || metricDateOf(r) > metricDateOf(cur)) latest.set(k, r);
  }
  const life = [...latest.values()].filter((r) => !dailyPosts.has(postKey(r)));
  const ds = daily.map(metricDateOf).sort(), ls = life.map(metricDateOf).sort();
  const published = new Set(rows.filter((r) => inRange(publishDateOf(r), f)).map(postKey)).size;
  return {
    basis: daily.length ? "daily" : life.length ? "lifetime" : "none",
    daily: { ...totalsOf(daily), from: ds[0] ?? "", to: ds[ds.length - 1] ?? "" },
    lifetime: { ...totalsOf(life), snapshot: ls[ls.length - 1] ?? "" },
    lifetimeOnlyPosts: daily.length ? new Set(life.map(postKey)).size : 0,
    publishedPosts: published,
  };
}

/** ยอดต่อโพสต์ในช่วง (รายวันรวมข้ามวัน หรือ snapshot Lifetime ล่าสุด) สำหรับตารางสรุปรายโพสต์ */
export function perPost(rows: FbRow[], f: Range): (FbRow & { basis: string; days: string })[] {
  const by = new Map<string, FbRow[]>();
  for (const r of rows) { const k = postKey(r); if (!by.has(k)) by.set(k, []); by.get(k)!.push(r); }
  const out: (FbRow & { basis: string; days: string })[] = [];
  for (const list of by.values()) {
    const s = summarizeFb(list, f);
    if (s.basis === "none") continue;
    const t = s.basis === "daily" ? s.daily : s.lifetime;
    const head = [...list].sort((a, b) => metricDateOf(b).localeCompare(metricDateOf(a)))[0];
    const row: FbRow & { basis: string; days: string } = { ...head, basis: s.basis === "daily" ? "รายวัน (รวมในช่วง)" : "Lifetime (สะสม)", days: s.basis === "daily" ? String(t.rows) : "" };
    for (const k of FB_ADDITIVE) row[k] = t[k] === null ? "" : String(t[k]);
    out.push(row);
  }
  return out;
}
