/**
 * จับคู่การ์ด Content กับโพสต์ Facebook (Phase 2) — อ่านเฉพาะคอลัมน์ที่ต้องใช้ของ FB_PAGE_POSTS (แท็บใหญ่ ห้ามอ่านทั้งแท็บ)
 * กติกาจับคู่อัตโนมัติ (ระวังจับผิดมากกว่าจับไม่ได้): การ์ดที่ยังไม่มี Post ID · วันเผยแพร่ของโพสต์ห่างจากวันที่การ์ด (เผยแพร่จริง/กำหนด) ไม่เกิน 1 วัน
 * · ข้อความชื่อ Content คล้ายข้อความโพสต์ (bigram) ≥ 0.5 · เป็นโพสต์เดียวที่ผ่าน หรือคะแนนนำอันดับสองชัดเจน (≥ 0.15) · โพสต์ที่ถูกจับคู่แล้วไม่ถูกใช้ซ้ำ
 */
import { batchGet, batchUpdateValues, colLetter, toRow } from "./sheets";
import { addDays, type Rec } from "./content";
import { getD1 } from "./d1";
import { patchById, readTabs } from "./sheets";

const TAB = "FB_PAGE_POSTS";
const norm = (s: string) => s.toLowerCase().replace(/https?:\/\/\S+/g, " ").replace(/[\s\p{P}\p{S}]+/gu, "");
const bigrams = (s: string) => { const n = norm(s), out = new Set<string>(); for (let i = 0; i < n.length - 1; i++) out.add(n.slice(i, i + 2)); return out; };
/** ความคล้าย = สัดส่วน bigram ของชื่อ Content ที่พบในข้อความโพสต์ (ข้อความโพสต์ยาวกว่าชื่อเสมอ จึงไม่ใช้ Jaccard) */
export function similarity(title: string, text: string): number {
  const a = bigrams(title); if (a.size < 3) return 0;
  const b = bigrams(text); let hit = 0; for (const g of a) if (b.has(g)) hit++;
  return hit / a.size;
}
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a.slice(0, 10) + "T00:00:00Z") - Date.parse(b.slice(0, 10) + "T00:00:00Z")) / 86400000;

export type Post = { post_id: string; page_id: string; publish_time: string; text: string; permalink: string };
export type Pick = { card_id: string; post_id: string; score: number };

/** เลือกคู่ที่มั่นใจพอ (ฟังก์ชันล้วน ทดสอบได้) */
export function pickMatches(cards: Rec[], posts: Post[], taken = new Set<string>()): Pick[] {
  const out: Pick[] = [], used = new Set(taken);
  const free = cards.filter((c) => !c.post_id && c.title).sort((a, b) => a.card_code.localeCompare(b.card_code));
  for (const c of free) {
    const when = c.published_at || c.planned_date; if (!when) continue;
    const cand = posts.filter((p) => !used.has(p.post_id) && p.publish_time && dayDiff(p.publish_time, when) <= 1)
      .map((p) => ({ p, score: similarity(c.title, p.text) })).filter((x) => x.score >= 0.5).sort((a, b) => b.score - a.score);
    if (!cand.length) continue;
    if (cand.length > 1 && cand[0].score - cand[1].score < 0.15) continue;
    used.add(cand[0].p.post_id); out.push({ card_id: c.card_id, post_id: cand[0].p.post_id, score: Math.round(cand[0].score * 100) / 100 });
  }
  return out;
}

async function cols(headers: string[], want: string[]) {
  const have = want.filter((h) => headers.includes(h));
  const data = await batchGet(have.map((h) => { const c = colLetter(headers.indexOf(h)); return `'${TAB}'!${c}:${c}`; }));
  return Object.fromEntries(have.map((h, i) => [h, data[i].slice(1).map((r) => String(r?.[0] ?? ""))])) as Record<string, string[]>;
}
async function header() { const [h] = await batchGet([`'${TAB}'!1:1`]); return (h?.[0] ?? []).map(String); }

/** โพสต์ที่มีใน FB_PAGE_POSTS (ไม่ซ้ำ post_id) ในช่วงวันที่ที่สนใจ */
async function loadPosts(from: string, to: string): Promise<Post[]> {
  const h = await header(); if (!h.includes("post_id")) return [];
  const c = await cols(h, ["post_id", "page_id", "publish_time", "title", "description", "permalink"]);
  const seen = new Map<string, Post>();
  (c.post_id ?? []).forEach((id, i) => {
    const pt = c.publish_time?.[i] ?? ""; if (!id || seen.has(id) || !pt) return;
    const d = pt.slice(0, 10); if (d < from || d > to) return;
    seen.set(id, { post_id: id, page_id: c.page_id?.[i] ?? "", publish_time: pt, text: `${c.title?.[i] ?? ""} ${c.description?.[i] ?? ""}`, permalink: c.permalink?.[i] ?? "" });
  });
  return [...seen.values()];
}

/** จับคู่อัตโนมัติ: คืนจำนวนที่จับได้ (ไม่มี D1 / ไม่มีการ์ดค้าง / ไม่มีแท็บ Facebook = 0) */
export async function matchFacebookPosts(actor: string): Promise<{ matched: number; checked: number }> {
  if (!(await getD1())) return { matched: 0, checked: 0 };
  const t = (await readTabs(["CONTENT_CARDS"])).CONTENT_CARDS;
  const cards = t.rows.filter((c) => c.card_id && !c.post_id && c.title && (c.published_at || c.planned_date));
  if (!cards.length) return { matched: 0, checked: 0 };
  const dates = cards.map((c) => c.published_at || c.planned_date).sort();
  const posts = await loadPosts(addDays(dates[0].slice(0, 10), -1), addDays(dates[dates.length - 1].slice(0, 10), 1));
  const taken = new Set(t.rows.map((c) => c.post_id).filter(Boolean));
  const picks = pickMatches(cards, posts, taken);
  if (!picks.length) return { matched: 0, checked: cards.length };
  // ใส่ Post ID ตาม card_id เฉพาะช่องที่เกี่ยว (ไม่เขียนทั้งแถวจากข้อมูลที่อ่านไว้ — ไม่ทับการย้าย/แก้การ์ดของคนอื่น)
  const now = new Date().toISOString(); let n = 0;
  for (const p of picks) if (await patchById("CONTENT_CARDS", "card_id", p.card_id, { post_id: p.post_id, updated_by: actor, updated_at: now })) n++;
  return { matched: n, checked: cards.length };
}

export type PostMetrics = { post_id: string; permalink: string; publish_time: string; scope: "lifetime" | "daily" | "none"; as_of: string; views: number; reach: number; reactions: number; comments: number; shares: number; link_clicks: number; total_clicks: number };
const N = (v: string | undefined) => Number(v) || 0;

/** ตัวเลขโพสต์: ใช้แถว lifetime ล่าสุด ถ้าไม่มีรวมแถวรายวัน (reach รายวันรวมข้ามวันอาจนับคนซ้ำ — เป็นค่าประมาณ) */
export async function metricsForPost(postId: string): Promise<PostMetrics | null> {
  if (!postId) return null;
  return (await metricsForPosts([postId])).get(postId) ?? null;
}

/** หลาย Post ID ในครั้งเดียว (อ่านคอลัมน์ post_id ครั้งเดียว แล้วอ่านเฉพาะแถวที่เกี่ยว) */
export async function metricsForPosts(postIds: string[]): Promise<Map<string, PostMetrics>> {
  const out = new Map<string, PostMetrics>(); const want0 = new Set(postIds.filter(Boolean));
  const h = await header(); if (!want0.size || !h.includes("post_id")) return out;
  const c = colLetter(h.indexOf("post_id"));
  const ids = (await batchGet([`'${TAB}'!${c}:${c}`]))[0];
  const byPost = new Map<string, number[]>();
  ids.forEach((r, i) => { const id = String(r?.[0] ?? ""); if (i > 0 && want0.has(id)) (byPost.get(id) ?? byPost.set(id, []).get(id)!).push(i + 1); });
  for (const [id, rowNos] of byPost) { const m = await oneMetrics(h, id, rowNos); if (m) out.set(id, m); }
  return out;
}

async function oneMetrics(h: string[], postId: string, rowNos: number[]): Promise<PostMetrics | null> {
  const want = ["metric_date", "metric_scope", "publish_time", "permalink", "views", "reach", "reactions", "comments", "shares", "link_clicks", "total_clicks"].filter((k) => h.includes(k));
  const data = await batchGet(rowNos.map((n) => `'${TAB}'!A${n}:${colLetter(h.length - 1)}${n}`));
  const rows = data.map((d) => Object.fromEntries(want.map((k) => [k, String(d[0]?.[h.indexOf(k)] ?? "")])));
  const life = rows.filter((r) => r.metric_scope === "lifetime").sort((a, b) => b.metric_date.localeCompare(a.metric_date))[0];
  const base = { post_id: postId, permalink: rows[0].permalink, publish_time: rows[0].publish_time };
  const pick = (r: Record<string, string>[]) => ({ views: r.reduce((s, x) => s + N(x.views), 0), reach: r.reduce((s, x) => s + N(x.reach), 0), reactions: r.reduce((s, x) => s + N(x.reactions), 0), comments: r.reduce((s, x) => s + N(x.comments), 0), shares: r.reduce((s, x) => s + N(x.shares), 0), link_clicks: r.reduce((s, x) => s + N(x.link_clicks), 0), total_clicks: r.reduce((s, x) => s + N(x.total_clicks), 0) });
  if (life) return { ...base, scope: "lifetime", as_of: life.metric_date, ...pick([life]) };
  const daily = rows.filter((r) => r.metric_scope === "daily");
  return daily.length ? { ...base, scope: "daily", as_of: daily.map((r) => r.metric_date).sort().pop()!, ...pick(daily) } : { ...base, scope: "none", as_of: "", ...pick([]) };
}
