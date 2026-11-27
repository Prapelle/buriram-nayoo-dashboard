/**
 * ฐานข้อมูล Cloudflare D1 (binding ชื่อ DB) — ทำตัวเหมือน Google Sheets ที่โมดูลอื่นใช้อยู่เดิม
 * - 1 แท็บ = 1 ตาราง · คอลัมน์ทั้งหมดเป็นข้อความ (เหมือนที่อ่านจาก Sheets) · มี _id เรียงตามลำดับที่เพิ่ม
 * - "เลขแถว" แบบชีต (แถว 1 = header, แถว 2 = ข้อมูลแถวแรก) คำนวณจากลำดับ _id จึงเลื่อนขึ้นเองเมื่อมีการลบแถว
 *   → โค้ดเดิมที่อ้างเลขแถว (row-guard, deleteRow ฯลฯ) ใช้ต่อได้โดยไม่ต้องแก้
 * - ชื่อตาราง/คอลัมน์ใส่เครื่องหมายคำพูดเสมอ และชื่อตารางต้องเป็น A-Z 0-9 _ เท่านั้น (กัน SQL injection)
 */

type Meta = { last_row_id: number; changes: number };
export type D1Stmt = {
  bind(...v: unknown[]): D1Stmt;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: Meta }>;
};
export type D1Like = { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<{ meta: Meta; results?: unknown[] }[]> };

let testDb: D1Like | null | undefined;
/** ใช้ในเทสต์เท่านั้น: ใส่ฐานข้อมูลจำลอง (null = บังคับว่าไม่มี D1, undefined = กลับไปใช้ของจริง) */
export function setD1ForTest(db: D1Like | null | undefined) { testDb = db; colCache.clear(); }

export async function getD1(): Promise<D1Like | null> {
  if (testDb !== undefined) return trace && testDb ? traced(testDb) : testDb;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const b = (getCloudflareContext().env as unknown as Record<string, unknown>).DB;
    return b ? (trace ? traced(b as D1Like) : (b as D1Like)) : null;
  } catch { return null; }
}

// ── วัดเวลาคำสั่ง D1 (เฉพาะหน้าตรวจของ Super Admin: /api/admin/d1?trace=…) ──
export type TraceEntry = { sql: string; startMs: number; ms: number };
let trace: { t0: number; list: TraceEntry[] } | null = null;
/** เริ่มเก็บทุกคำสั่ง D1 ของเครื่องนี้ (ใช้ทีละคำขอ — สำหรับตรวจความเร็วเท่านั้น) */
export function startTrace() { trace = { t0: Date.now(), list: [] }; }
export function stopTrace(): TraceEntry[] { const l = trace?.list ?? []; trace = null; return l; }
function traced(db: D1Like): D1Like {
  const rec = (sql: string) => { const tr = trace; const st = Date.now(); return () => { if (tr) tr.list.push({ sql: sql.slice(0, 120), startMs: st - tr.t0, ms: Date.now() - st }); }; };
  const wrap = (st: D1Stmt, sql: string): D1Stmt => ({
    __raw: st, // batch ของ D1 ต้องได้คำสั่งจริง
    bind: (...v: unknown[]) => wrap(st.bind(...v), sql),
    all: async <T,>() => { const done = rec(sql); try { return await st.all<T>(); } finally { done(); } },
    run: async () => { const done = rec(sql); try { return await st.run(); } finally { done(); } },
  }) as D1Stmt;
  return {
    prepare: (sql: string) => wrap(db.prepare(sql), sql),
    batch: async (stmts: D1Stmt[]) => { const done = rec(`batch(${stmts.length})`); try { return await db.batch(stmts.map((x) => (x as unknown as { __raw?: D1Stmt }).__raw ?? x)); } finally { done(); } },
  };
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const CHUNK = 40;
const TAB_OK = /^[A-Z0-9_]{1,64}$/;
const tabName = (tab: string) => { if (!TAB_OK.test(tab)) throw new Error(`ชื่อตาราง D1 ไม่ถูกต้อง: ${tab}`); return q(tab); };

export function colLetter(index: number): string {
  let n = index + 1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const colIdx = (s: string) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// ── รายชื่อคอลัมน์ (cache ต่อเครื่อง) ──
// เปลี่ยนเฉพาะตอนสร้างตาราง / เพิ่มคอลัมน์ → ทุกครั้งที่เปลี่ยนจะเขียน _meta "schema_ver" ใหม่
// เครื่องอื่นอ่าน _meta ทุก ~3 วินาทีอยู่แล้ว (d1-state) เห็นค่าเปลี่ยน → ล้าง cache ทันที · จึงเก็บ cache ได้นาน (20/11/2026: 30 วินาที → 10 นาที)
const colCache = new Map<string, { at: number; cols: string[] }>();
const COL_TTL = 10 * 60_000;
export const SCHEMA_VER_KEY = "schema_ver";
export const clearColCache = () => colCache.clear();
async function bumpSchemaVer(db: D1Like) { try { await db.prepare("INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(SCHEMA_VER_KEY, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`).run(); } catch { /* ยังไม่มี _meta */ } colCache.clear(); }
export async function headersOf(db: D1Like, tab: string): Promise<string[]> {
  const hit = colCache.get(tab);
  if (hit && Date.now() - hit.at < COL_TTL) return hit.cols;
  const r = await db.prepare(`PRAGMA table_info(${tabName(tab)})`).all<{ name: string; cid: number }>();
  const cols = r.results.sort((a, b) => a.cid - b.cid).map((c) => c.name).filter((n) => n !== "_id");
  if (cols.length) colCache.set(tab, { at: Date.now(), cols });
  return cols;
}
async function mustHeaders(db: D1Like, tab: string) {
  const h = await headersOf(db, tab);
  if (!h.length) throw new Error(`ไม่พบตาราง ${tab} ใน D1 — กด เตรียมฐานข้อมูล ก่อน`);
  return h;
}

// ── ตีความ range แบบ A1 ที่โค้ดเดิมใช้: 'TAB' · 'TAB'!1:1 · 'TAB'!A5:T5 · 'TAB'!C:C · 'TAB'!C5 · 'TAB'!C5:C9 ──
export type Rng = { tab: string; c1: number; c2: number; r1: number; r2: number }; // c = ดัชนีคอลัมน์ 0 เริ่ม, r = เลขแถว 1 เริ่ม
export function parseRange(range: string): Rng {
  const m = /^'((?:[^']|'')+)'(?:!(.+))?$/.exec(range);
  if (!m) throw new Error(`range ไม่ถูกต้อง: ${range}`);
  const tab = m[1].replace(/''/g, "'");
  if (!m[2]) return { tab, c1: 0, c2: Infinity, r1: 1, r2: Infinity };
  const p = /^([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/.exec(m[2]);
  if (!p || (!p[1] && !p[2])) throw new Error(`range ไม่ถูกต้อง: ${range}`);
  const [, a, b, c, d] = p;
  const single = c === undefined;
  const c1 = a ? colIdx(a) : 0, r1 = b ? Number(b) : 1;
  return { tab, c1, r1, c2: single ? (a ? c1 : Infinity) : c ? colIdx(c) : Infinity, r2: single ? (b ? r1 : Infinity) : d ? Number(d) : Infinity };
}

/** อ่านตาม range (คืนค่าเป็นข้อความทั้งหมด เหมือน batchGet ของ Sheets) */
export async function getRange(db: D1Like, range: string): Promise<string[][]> {
  const g = parseRange(range);
  const hdr = await mustHeaders(db, g.tab);
  const hi = Math.min(g.c2, hdr.length - 1);
  const names = hi >= g.c1 ? hdr.slice(g.c1, hi + 1) : [];
  const out: string[][] = [];
  if (g.r1 <= 1 && g.r2 >= 1) out.push(names.slice());
  const lo = Math.max(g.r1, 2);
  if (g.r2 >= lo && names.length) {
    const limit = g.r2 === Infinity ? -1 : g.r2 - lo + 1;
    const res = await db.prepare(`SELECT ${names.map(q).join(",")} FROM ${tabName(g.tab)} ORDER BY _id LIMIT ? OFFSET ?`).bind(limit, lo - 2).all<Record<string, unknown>>();
    for (const r of res.results) out.push(names.map((n) => str(r[n])));
  }
  return out;
}

/**
 * อ่านหลาย range พร้อมกัน: range ที่เป็น "ทั้งคอลัมน์/ทั้งแท็บ" ของตารางเดียวกันรวมเป็น SELECT เดียว (สแกนตารางครั้งเดียว)
 * — Dashboard อ่านเป็นร้อย range ต่อคำขอ ถ้าแยกคำสั่งทีละคอลัมน์ ตารางใหญ่จะถูกสแกนซ้ำร้อยรอบ (ช้าและเสียโควตาอ่านแถว)
 * ผลลัพธ์ตรงตัวกับ getRange ทีละอัน · range แบบอื่น (แถวเดียว/ช่วงแถว) ยังอ่านแยกตามเดิม
 */
export async function getRanges(db: D1Like, ranges: string[], meta?: Record<string, string>): Promise<string[][][]> {
  // ความเร็ว (20/11/2026): D1 อยู่ไกลจากเครื่องที่รัน (~100 ms ต่อรอบ) และทำคำสั่งทีละคำสั่งต่อฐานข้อมูล
  // → รวมทุกคำสั่งอ่านของคำขอนี้เป็น batch เดียว (1 รอบ) แทนการยิงพร้อมกันหลายคำสั่ง (ซึ่ง D1 ต่อคิวทำทีละคำสั่งอยู่ดี)
  const out: string[][][] = new Array(ranges.length);
  const parsed = ranges.map(parseRange);
  await loadHeaders(db, [...new Set(parsed.map((g) => g.tab))]);
  type Job = { tab: string; sql: string; binds: unknown[]; take: (rows: Record<string, unknown>[]) => void };
  const jobs: Job[] = [];
  // ทั้งคอลัมน์ / ทั้งแท็บ ของตารางเดียวกัน → อ่านครั้งเดียว
  const groups = new Map<string, number[]>();
  parsed.forEach((g, i) => { if (g.r2 === Infinity && g.r1 <= 2) (groups.get(g.tab) ?? groups.set(g.tab, []).get(g.tab)!).push(i); });
  for (const [tab, idx] of groups) {
    const hdr = await mustHeaders(db, tab);
    const want = new Set<number>();
    for (const i of idx) { const g = parsed[i]; for (let c = g.c1; c <= Math.min(g.c2, hdr.length - 1); c++) want.add(c); }
    const cols = [...want].sort((a, b) => a - b);
    const fill = (rows: Record<string, unknown>[]) => {
      for (const i of idx) {
        const g = parsed[i], hi = Math.min(g.c2, hdr.length - 1);
        const names = hi >= g.c1 ? hdr.slice(g.c1, hi + 1) : [];
        const res: string[][] = [];
        if (g.r1 <= 1) res.push(names.slice());
        if (names.length) for (const r of rows) res.push(names.map((n) => str(r[n])));
        out[i] = res;
      }
    };
    if (cols.length) jobs.push({ tab, sql: `SELECT ${cols.map((c) => q(hdr[c])).join(",")} FROM ${tabName(tab)} ORDER BY _id`, binds: [], take: fill });
    else fill([]);
  }
  // range แบบอื่น (แถวเดียว / ช่วงแถว) — ผลเหมือน getRange ทีละอัน
  for (let i = 0; i < ranges.length; i++) {
    if (out[i] || parsed[i].r2 === Infinity && parsed[i].r1 <= 2) continue;
    const g = parsed[i], hdr = await mustHeaders(db, g.tab);
    const hi = Math.min(g.c2, hdr.length - 1);
    const names = hi >= g.c1 ? hdr.slice(g.c1, hi + 1) : [];
    const head: string[][] = g.r1 <= 1 && g.r2 >= 1 ? [names.slice()] : [];
    const lo = Math.max(g.r1, 2);
    if (g.r2 >= lo && names.length) {
      const limit = g.r2 === Infinity ? -1 : g.r2 - lo + 1;
      jobs.push({ tab: g.tab, sql: `SELECT ${names.map(q).join(",")} FROM ${tabName(g.tab)} ORDER BY _id LIMIT ? OFFSET ?`, binds: [limit, lo - 2], take: (rows) => { out[i] = [...head, ...rows.map((r) => names.map((n) => str(r[n])))]; } });
    } else out[i] = head;
  }
  // ตารางใหญ่ที่ไม่เปลี่ยน: ใช้ผลเดิมจาก cache · ที่เหลืออ่านใน batch เดียว
  const keyOf = (j0: Job) => `${j0.sql}|${JSON.stringify(j0.binds)}`;
  const live = jobs.filter((j0) => { const c = cacheGet(j0.tab, keyOf(j0), meta); if (c) { j0.take(c); return false; } return true; });
  for (const j0 of live) { const take = j0.take; j0.take = (rows) => { cachePut(j0.tab, keyOf(j0), meta, rows); take(rows); }; }
  jobs.length = 0; jobs.push(...live);
  if (jobs.length === 1) { const j0 = jobs[0]; j0.take((await db.prepare(j0.sql).bind(...j0.binds).all<Record<string, unknown>>()).results); }
  else if (jobs.length) {
    for (let k = 0; k < jobs.length; k += CHUNK) {
      const part = jobs.slice(k, k + CHUNK);
      let res: { results?: unknown[] }[] | null = null;
      try { res = await db.batch(part.map((j0) => db.prepare(j0.sql).bind(...j0.binds))); } catch { res = null; } // สำรอง: อ่านทีละคำสั่ง
      if (res && res.length === part.length && res.every((r) => Array.isArray(r?.results))) part.forEach((j0, n) => j0.take(res![n].results as Record<string, unknown>[]));
      else await Promise.all(part.map(async (j0) => j0.take((await db.prepare(j0.sql).bind(...j0.binds).all<Record<string, unknown>>()).results)));
    }
  }
  return out;
}

/** รายชื่อคอลัมน์ของหลายตาราง (ตารางที่ไม่มี = []) — ที่ยังไม่อยู่ใน cache อ่านในรอบเดียว */
export async function headersMany(db: D1Like, tabs: string[]): Promise<string[][]> {
  await loadHeaders(db, tabs);
  return Promise.all(tabs.map((t) => headersOf(db, t)));
}
/** อ่านรายชื่อคอลัมน์ของหลายตารางที่ยังไม่อยู่ใน cache ในรอบเดียว */
async function loadHeaders(db: D1Like, tabs: string[]) {
  const miss = tabs.filter((t) => { const h = colCache.get(t); return !(h && Date.now() - h.at < COL_TTL); });
  if (miss.length <= 1) { for (const t of miss) await headersOf(db, t); return; }
  for (let k = 0; k < miss.length; k += CHUNK) {
    const part = miss.slice(k, k + CHUNK);
    let res: { results?: unknown[] }[];
    try { res = await db.batch(part.map((t) => db.prepare(`PRAGMA table_info(${tabName(t)})`))); }
    catch { await Promise.all(part.map((t) => headersOf(db, t))); continue; } // สำรอง: อ่านทีละตาราง
    part.forEach((t, n) => {
      const cols = ((res[n]?.results ?? []) as { name: string; cid: number }[]).sort((a, b) => a.cid - b.cid).map((c) => c.name).filter((x) => x !== "_id");
      if (cols.length) colCache.set(t, { at: Date.now(), cols });
    });
  }
}

async function idsAt(db: D1Like, tab: string, firstRow: number, count: number): Promise<number[]> {
  if (firstRow < 2) throw new Error("แถวที่ 1 คือ header ของตาราง ไม่ใช่ข้อมูล");
  const r = await db.prepare(`SELECT _id FROM ${tabName(tab)} ORDER BY _id LIMIT ? OFFSET ?`).bind(count, firstRow - 2).all<{ _id: number }>();
  return r.results.map((x) => x._id);
}

async function runChunked(db: D1Like, stmts: D1Stmt[]) {
  const metas: { meta: Meta }[] = [];
  for (let i = 0; i < stmts.length; i += CHUNK) metas.push(...(await db.batch(stmts.slice(i, i + CHUNK))));
  return metas;
}

/** เพิ่มแถวต่อท้าย คืนค่า range ที่เขียนรูปแบบเดียวกับ Sheets เช่น 'TAB'!A5:T7 (ใช้หาเลขแถว) */
async function appendRows_(db: D1Like, tab: string, rows: (string | number)[][]): Promise<string> {
  if (!rows.length) return "";
  const hdr = await mustHeaders(db, tab);
  const sql = `INSERT INTO ${tabName(tab)} (${hdr.map(q).join(",")}) VALUES (${hdr.map(() => "?").join(",")})`;
  const metas = await runChunked(db, rows.map((r) => db.prepare(sql).bind(...hdr.map((_, i) => str(r[i])))));
  const firstId = metas[0].meta.last_row_id;
  const before = (await db.prepare(`SELECT COUNT(*) AS c FROM ${tabName(tab)} WHERE _id < ?`).bind(firstId).all<{ c: number }>()).results[0]?.c ?? 0;
  const n = Number(before) + 2;
  return `'${tab}'!A${n}:${colLetter(hdr.length - 1)}${n + rows.length - 1}`;
}

/** เขียนทับตาม range (แถวข้อมูลเท่านั้น) — ต้องมีแถวนั้นอยู่แล้ว */
async function updateRanges_(db: D1Like, data: { range: string; values: (string | number)[][] }[]) {
  const stmts: D1Stmt[] = [];
  for (const d of data) {
    const g = parseRange(d.range);
    if (g.r1 < 2) throw new Error("ไม่รองรับการเขียน header ผ่าน D1 (ใช้ เตรียมฐานข้อมูล)");
    const hdr = await mustHeaders(db, g.tab);
    const ids = await idsAt(db, g.tab, g.r1, d.values.length);
    if (ids.length < d.values.length) throw new Error(`เขียนแถวที่ ${g.r1 + ids.length} ของ ${g.tab} ไม่ได้ (ไม่มีแถวนี้)`);
    d.values.forEach((row, i) => {
      const names = row.map((_, j) => { const n = hdr[g.c1 + j]; if (!n) throw new Error(`คอลัมน์ที่ ${g.c1 + j + 1} ของ ${g.tab} ไม่มีในตาราง`); return n; });
      if (!names.length) return;
      stmts.push(db.prepare(`UPDATE ${tabName(g.tab)} SET ${names.map((n) => `${q(n)}=?`).join(",")} WHERE _id=?`).bind(...row.map(str), ids[i]));
    });
  }
  if (stmts.length) await runChunked(db, stmts);
}

/**
 * เขียนแบบปลอดภัยเมื่อใช้พร้อมกัน (5/11/2026)
 * - casUpdate: แก้แถวตาม id เฉพาะเมื่อ updated_at ยังเท่าค่าที่เห็น (คำสั่ง UPDATE เดียว — คนที่มาทีหลังได้ false)
 * - atomic: หลายคำสั่งในทรานแซกชันเดียว (สำเร็จทั้งหมดหรือไม่เขียนเลย)
 */
export type AtomicOp =
  | { insert: string; rows: (string | number)[][] }
  | { deleteWhere: string; col: string; value: string }
  | { update: string; idCol: string; id: string; values: (string | number)[] };

async function casUpdate_(db: D1Like, tab: string, idCol: string, id: string, expectUpdatedAt: string, values: (string | number)[]): Promise<boolean> {
  const hdr = await mustHeaders(db, tab);
  if (!hdr.includes(idCol) || !hdr.includes("updated_at")) throw new Error(`ตาราง ${tab} ไม่มีคอลัมน์ ${idCol} / updated_at`);
  const r = await db.prepare(`UPDATE ${tabName(tab)} SET ${hdr.map((h) => `${q(h)}=?`).join(",")} WHERE ${q(idCol)}=? AND "updated_at"=?`)
    .bind(...hdr.map((_, i) => str(values[i])), id, expectUpdatedAt).run();
  return Number(r.meta.changes) === 1;
}

/** แก้ทั้งแถวตาม id (ไม่ตรวจ updated_at) — คืนจำนวนแถวที่แก้ (0 = ไม่พบ) · ไม่พึ่งเลขแถว จึงไม่ชนกับการลบ/เพิ่มของคนอื่น (10/11/2026) */
async function updateById_(db: D1Like, tab: string, idCol: string, id: string, values: (string | number)[]): Promise<number> {
  const hdr = await mustHeaders(db, tab);
  if (!hdr.includes(idCol)) throw new Error(`ตาราง ${tab} ไม่มีคอลัมน์ ${idCol}`);
  const r = await db.prepare(`UPDATE ${tabName(tab)} SET ${hdr.map((h) => `${q(h)}=?`).join(",")} WHERE ${q(idCol)}=?`).bind(...hdr.map((_, i) => str(values[i])), id).run();
  return Number(r.meta.changes);
}
/** แก้บางช่องของแถวตาม id — คืนจำนวนแถวที่แก้ */
async function patchById_(db: D1Like, tab: string, idCol: string, id: string, patch: Record<string, string | number>): Promise<number> {
  const hdr = await mustHeaders(db, tab), cols = Object.keys(patch);
  if (!cols.length) return 0;
  for (const c of [idCol, ...cols]) if (!hdr.includes(c)) throw new Error(`ตาราง ${tab} ไม่มีคอลัมน์ ${c}`);
  const r = await db.prepare(`UPDATE ${tabName(tab)} SET ${cols.map((c) => `${q(c)}=?`).join(",")} WHERE ${q(idCol)}=?`).bind(...cols.map((c) => str(patch[c])), id).run();
  return Number(r.meta.changes);
}
/** อ่านแถวที่ตรงเงื่อนไข (คอลัมน์ = ค่า ทุกคู่) เรียงตามคอลัมน์ · ใช้กับตารางที่โตเรื่อย ๆ (เช่น การแจ้งเตือน) แทนการอ่านทั้งตาราง */
export async function selectWhere(db: D1Like, tab: string, where: Record<string, string>, opts: { orderBy?: string; desc?: boolean; limit?: number } = {}): Promise<Record<string, string>[]> {
  const hdr = await mustHeaders(db, tab), cols = Object.keys(where);
  for (const c of [...cols, ...(opts.orderBy ? [opts.orderBy] : [])]) if (!hdr.includes(c)) throw new Error(`ตาราง ${tab} ไม่มีคอลัมน์ ${c}`);
  const sql = `SELECT ${hdr.map(q).join(",")} FROM ${tabName(tab)}${cols.length ? ` WHERE ${cols.map((c) => `${q(c)}=?`).join(" AND ")}` : ""}`
    + ` ORDER BY ${opts.orderBy ? `${q(opts.orderBy)} ${opts.desc ? "DESC" : "ASC"}, ` : ""}_id ${opts.desc ? "DESC" : "ASC"}${opts.limit ? ` LIMIT ${Math.max(1, Math.floor(opts.limit))}` : ""}`;
  const r = await db.prepare(sql).bind(...cols.map((c) => where[c])).all<Record<string, unknown>>();
  return r.results.map((x) => Object.fromEntries(hdr.map((h) => [h, str(x[h])])));
}
/** นับจำนวนแถวแยกตามค่าในคอลัมน์ (เช่น จำนวนความคิดเห็นต่อการ์ด) — คืน Map ค่า → จำนวน */
export async function countBy(db: D1Like, tab: string, col: string): Promise<Map<string, number>> {
  const hdr = await mustHeaders(db, tab);
  if (!hdr.includes(col)) throw new Error(`ตาราง ${tab} ไม่มีคอลัมน์ ${col}`);
  const r = await db.prepare(`SELECT ${q(col)} AS k, COUNT(*) AS n FROM ${tabName(tab)} GROUP BY ${q(col)}`).all<{ k: unknown; n: unknown }>();
  return new Map(r.results.map((x) => [str(x.k), Number(x.n)]));
}
/** แก้บางช่องของทุกแถวที่ตรงเงื่อนไข (คอลัมน์ = ค่า ทุกคู่ · emptyCol = ช่องที่ต้องว่าง) — คืนจำนวนแถวที่แก้ */
async function patchWhere_(db: D1Like, tab: string, where: Record<string, string>, patch: Record<string, string>, emptyCol?: string): Promise<number> {
  const hdr = await mustHeaders(db, tab), wc = Object.keys(where), pc = Object.keys(patch);
  if (!pc.length || !wc.length) return 0;
  for (const c of [...wc, ...pc, ...(emptyCol ? [emptyCol] : [])]) if (!hdr.includes(c)) throw new Error(`ตาราง ${tab} ไม่มีคอลัมน์ ${c}`);
  const r = await db.prepare(`UPDATE ${tabName(tab)} SET ${pc.map((c) => `${q(c)}=?`).join(",")} WHERE ${wc.map((c) => `${q(c)}=?`).join(" AND ")}${emptyCol ? ` AND ${q(emptyCol)}=''` : ""}`)
    .bind(...pc.map((c) => patch[c]), ...wc.map((c) => where[c])).run();
  return Number(r.meta.changes);
}
/** ลบแถวที่ค่าในคอลัมน์ col น้อยกว่า value (เทียบข้อความ — ใช้กับวันที่ ISO) — คืนจำนวนแถวที่ลบ */
async function deleteBefore_(db: D1Like, tab: string, col: string, value: string): Promise<number> {
  const hdr = await mustHeaders(db, tab);
  if (!hdr.includes(col)) throw new Error(`ตาราง ${tab} ไม่มีคอลัมน์ ${col}`);
  const r = await db.prepare(`DELETE FROM ${tabName(tab)} WHERE ${q(col)}<? AND ${q(col)}<>''`).bind(value).run();
  return Number(r.meta.changes);
}
/** ลบทุกแถวที่คอลัมน์ col = value — คืนจำนวนแถวที่ลบ */
async function deleteWhere_(db: D1Like, tab: string, col: string, value: string): Promise<number> {
  const hdr = await mustHeaders(db, tab);
  if (!hdr.includes(col)) throw new Error(`ตาราง ${tab} ไม่มีคอลัมน์ ${col}`);
  const r = await db.prepare(`DELETE FROM ${tabName(tab)} WHERE ${q(col)}=?`).bind(value).run();
  return Number(r.meta.changes);
}

export async function atomicStmts(db: D1Like, ops: AtomicOp[]): Promise<D1Stmt[]> {
  const out: D1Stmt[] = [];
  for (const op of ops) {
    if ("insert" in op) {
      if (!op.rows.length) continue;
      const hdr = await mustHeaders(db, op.insert);
      const sql = `INSERT INTO ${tabName(op.insert)} (${hdr.map(q).join(",")}) VALUES (${hdr.map(() => "?").join(",")})`;
      for (const r of op.rows) out.push(db.prepare(sql).bind(...hdr.map((_, i) => str(r[i]))));
    } else if ("deleteWhere" in op) {
      const hdr = await mustHeaders(db, op.deleteWhere);
      if (!hdr.includes(op.col)) throw new Error(`ตาราง ${op.deleteWhere} ไม่มีคอลัมน์ ${op.col}`);
      out.push(db.prepare(`DELETE FROM ${tabName(op.deleteWhere)} WHERE ${q(op.col)}=?`).bind(op.value));
    } else {
      const hdr = await mustHeaders(db, op.update);
      if (!hdr.includes(op.idCol)) throw new Error(`ตาราง ${op.update} ไม่มีคอลัมน์ ${op.idCol}`);
      out.push(db.prepare(`UPDATE ${tabName(op.update)} SET ${hdr.map((h) => `${q(h)}=?`).join(",")} WHERE ${q(op.idCol)}=?`).bind(...hdr.map((_, i) => str(op.values[i])), op.id));
    }
  }
  return out;
}

/** ทรานแซกชันเดียว (D1 batch) — ถ้าเกินขนาดชุดเดียวจะแบ่งชุด (ไม่ใช่ทรานแซกชันเดียวแล้ว ใช้กับงานเล็กเท่านั้น) */
async function atomic_(db: D1Like, ops: AtomicOp[]) {
  const stmts = await atomicStmts(db, ops);
  if (!stmts.length) return;
  if (stmts.length > 500) await runChunked(db, stmts); else await db.batch(stmts);
}

/** ลบแถวตามเลขแถวแบบชีต (แถวถัดไปเลื่อนขึ้น) ห้ามลบแถว header */
async function deleteRowAt_(db: D1Like, tab: string, rowNumber: number) {
  if (rowNumber < 2) throw new Error("ไม่สามารถลบแถว header");
  const [id] = await idsAt(db, tab, rowNumber, 1);
  if (id === undefined) return;
  await db.prepare(`DELETE FROM ${tabName(tab)} WHERE _id=?`).bind(id).run();
}

export async function readAll(db: D1Like, tab: string): Promise<{ headers: string[]; rows: string[][] }> {
  const headers = await mustHeaders(db, tab);
  const r = await db.prepare(`SELECT ${headers.map(q).join(",")} FROM ${tabName(tab)} ORDER BY _id`).all<Record<string, unknown>>();
  return { headers, rows: r.results.map((x) => headers.map((h) => str(x[h]))) };
}

export async function countRows(db: D1Like, tab: string): Promise<number> {
  const r = await db.prepare(`SELECT COUNT(*) AS c FROM ${tabName(tab)}`).all<{ c: number }>();
  return Number(r.results[0]?.c ?? 0);
}

/** ล้างตารางแล้วใส่ข้อมูลใหม่ตามลำดับเดิม (ใช้ตอนย้ายจาก Sheets เท่านั้น — ตารางต้องมีคอลัมน์ครบก่อน) */
async function replaceAll_(db: D1Like, tab: string, headers: string[], rows: string[][], onProgress?: () => Promise<void>) {
  const sql = headers.length ? `INSERT INTO ${tabName(tab)} (${headers.map(q).join(",")}) VALUES (${headers.map(() => "?").join(",")})` : "";
  await db.prepare(`DELETE FROM ${tabName(tab)}`).run();
  if (!sql) return;
  const stmts = rows.map((r) => db.prepare(sql).bind(...headers.map((_, i) => str(r[i]))));
  for (let i = 0; i < stmts.length; i += CHUNK) {
    await db.batch(stmts.slice(i, i + CHUNK));
    if (onProgress && (i / CHUNK) % 25 === 24) await onProgress(); // ตารางใหญ่: ต่ออายุธง "กำลังย้าย" ระหว่างคัดลอก
  }
}

// ── โครงสร้างตาราง ──
export type TableDef = { name: string; headers: string[] };
export type SchemaReport = { createdTables: string[]; addedColumns: Record<string, string[]> };

async function addMissingColumns(db: D1Like, tab: string, wanted: string[], report?: SchemaReport) {
  colCache.delete(tab);
  const have = new Set(await headersOf(db, tab));
  const add = [...new Set(wanted.filter((h) => h && !have.has(h)))];
  if (!add.length) return;
  await runChunked(db, add.map((h) => db.prepare(`ALTER TABLE ${tabName(tab)} ADD COLUMN ${q(h)} TEXT NOT NULL DEFAULT ''`)));
  colCache.delete(tab);
  await bumpSchemaVer(db);
  if (report) report.addedColumns[tab] = add;
}

/** รันซ้ำได้: สร้างตาราง/คอลัมน์ที่ขาด ไม่ลบหรือแก้ข้อมูลเดิม */
export async function ensureSchema(db: D1Like, defs: TableDef[]): Promise<SchemaReport> {
  const report: SchemaReport = { createdTables: [], addedColumns: {} };
  await db.prepare("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')").run();
  const existing = new Set((await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>()).results.map((r) => r.name));
  const missing = defs.filter((d) => !existing.has(d.name));
  await runChunked(db, missing.map((d) => {
    const cols = [...new Set(d.headers.filter(Boolean))];
    return db.prepare(`CREATE TABLE ${tabName(d.name)} (_id INTEGER PRIMARY KEY AUTOINCREMENT${cols.map((c) => `, ${q(c)} TEXT NOT NULL DEFAULT ''`).join("")})`);
  }));
  if (missing.length) await bumpSchemaVer(db);
  report.createdTables = missing.map((d) => d.name);
  for (const d of defs) if (!missing.includes(d)) await addMissingColumns(db, d.name, d.headers, report);
  colCache.clear();
  return report;
}

/** เพิ่มคอลัมน์ที่ต้นทางมีแต่ตารางยังไม่มี (ใช้ตอนย้ายข้อมูล) */
export async function ensureColumns(db: D1Like, tab: string, headers: string[]) { await addMissingColumns(db, tab, headers); }

// ── ตัวแปรระบบ (_meta): กลุ่มที่สลับมาใช้ D1 แล้ว, ธงกำลังย้าย, รายงานตรวจ ──
export async function metaGetAll(db: D1Like): Promise<Record<string, string>> {
  try {
    const r = await db.prepare("SELECT key, value FROM _meta").all<{ key: string; value: string }>();
    return Object.fromEntries(r.results.map((x) => [x.key, x.value]));
  } catch (e) {
    if (/no such table/i.test(String(e instanceof Error ? e.message : e))) return {}; // ยังไม่ได้ เตรียมฐานข้อมูล
    throw e;
  }
}
export async function metaSet(db: D1Like, key: string, value: string) {
  await db.prepare("INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value).run();
}
export async function metaDelete(db: D1Like, key: string) { await db.prepare("DELETE FROM _meta WHERE key = ?").bind(key).run(); }

// ── cache ข้อมูลตารางใหญ่ที่เปลี่ยนเฉพาะตอนนำเข้า (20/11/2026) ──
// ตาราง Marketing / Facebook posts ฯลฯ มีหลายพัน–หมื่นแถว อ่านทุกครั้งที่เปิด Dashboard (~1–6 วินาที)
// → เก็บผลอ่านไว้ในเครื่อง ผูกกับเลขเวอร์ชันใน _meta "dv:<ตาราง>" · ทุกการเขียนตารางเหล่านี้ (ผ่านไฟล์นี้) เปลี่ยนเลขเวอร์ชัน
//   เครื่องอื่นเห็นเลขใหม่ภายในรอบอ่าน _meta ถัดไป (~3 วินาที) แล้วอ่านใหม่ · เครื่องที่เขียนล้าง cache ของตัวเองทันที
const cachedTabs = new Set<string>();
export function setCachedTabs(tabs: string[]) { cachedTabs.clear(); for (const t of tabs) cachedTabs.add(t); }
export const dvKey = (tab: string) => `dv:${tab}`;
const dataCache = new Map<string, { tab: string; ver: string; rows: Record<string, unknown>[] }>();
const MAX_CACHE = 300;
export const clearDataCache = () => { dataCache.clear(); cells = 0; };
async function touched(db: D1Like, tabs: string[]) {
  const hit = [...new Set(tabs)].filter((t) => cachedTabs.has(t));
  if (!hit.length) return;
  for (const [k, v] of dataCache) if (hit.includes(v.tab)) { cells -= cellsOf(v.rows); dataCache.delete(k); }
  const ver = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try { await db.batch(hit.map((t) => db.prepare("INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(dvKey(t), ver))); } catch { /* ไม่มี _meta */ }
}
const withTouch = <A extends unknown[], R>(fn: (db: D1Like, tab: string, ...a: A) => Promise<R>) =>
  async (db: D1Like, tab: string, ...a: A): Promise<R> => { try { return await fn(db, tab, ...a); } finally { await touched(db, [tab]); } };
export const appendRows = withTouch(appendRows_);
export const casUpdate = withTouch(casUpdate_);
export const updateById = withTouch(updateById_);
export const patchById = withTouch(patchById_);
export const patchWhere = withTouch(patchWhere_);
export const deleteBefore = withTouch(deleteBefore_);
export const deleteWhere = withTouch(deleteWhere_);
export const deleteRowAt = withTouch(deleteRowAt_);
export const replaceAll = withTouch(replaceAll_);
export async function updateRanges(db: D1Like, data: { range: string; values: (string | number)[][] }[]) {
  try { return await updateRanges_(db, data); } finally { await touched(db, data.map((d) => parseRange(d.range).tab)); }
}
export async function atomic(db: D1Like, ops: AtomicOp[]) {
  try { return await atomic_(db, ops); } finally { await touched(db, ops.map((op) => ("insert" in op ? op.insert : "deleteWhere" in op ? op.deleteWhere : op.update))); }
}
/** อ่านจาก cache ถ้าเวอร์ชันตรง (ใช้ใน getRanges) */
function cacheGet(tab: string, key: string, meta?: Record<string, string>) {
  if (!meta || !cachedTabs.has(tab)) return null;
  const e = dataCache.get(key);
  return e && e.ver === (meta[dvKey(tab)] ?? "0") ? e.rows : null;
}
// จำกัดขนาด cache (จำนวนช่องข้อมูลรวม) ไม่ให้หน่วยความจำของเครื่องเต็ม — ลบรายการเก่าสุดก่อน
const MAX_CELLS = 600_000;
let cells = 0;
const cellsOf = (rows: Record<string, unknown>[]) => rows.length * (rows[0] ? Object.keys(rows[0]).length : 0);
function cachePut(tab: string, key: string, meta: Record<string, string> | undefined, rows: Record<string, unknown>[]) {
  if (!meta || !cachedTabs.has(tab)) return;
  const n = cellsOf(rows);
  if (n > MAX_CELLS / 2) return; // ใหญ่เกินไป ไม่เก็บ
  const old = dataCache.get(key); if (old) { cells -= cellsOf(old.rows); dataCache.delete(key); }
  while (dataCache.size && (dataCache.size >= MAX_CACHE || cells + n > MAX_CELLS)) { const [k, v] = dataCache.entries().next().value!; cells -= cellsOf(v.rows); dataCache.delete(k); }
  dataCache.set(key, { tab, ver: meta[dvKey(tab)] ?? "0", rows }); cells += n;
}
