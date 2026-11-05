/**
 * งาน Admin สำหรับย้าย Google Sheets → D1 (Super Admin เท่านั้น เรียกผ่าน /api/admin/d1)
 *  init      สร้างตารางทั้งหมดใน D1 (รันซ้ำได้ ไม่แตะข้อมูลเดิม)
 *  check     ลองคัดลอกกลุ่มจาก Sheets แล้วตรวจเทียบ แต่ "ยังไม่สลับ" ระบบยังใช้ Sheets ต่อ
 *  cutover   ล็อกการเขียนชั่วคราว → คัดลอก → ตรวจเทียบทุกแท็บ → ถ้าตรงทุกแท็บจึงสลับมาใช้ D1 (ไม่ตรง = ไม่สลับ)
 *  rollback  กลับไปใช้ Sheets — ถ้าข้อมูลบน D1 ต่างจาก Sheets (มีการบันทึกหลังสลับ) ต้องส่ง copyBack: true
 *            ระบบจะล็อกการเขียน แล้วคัดลอกข้อมูล D1 กลับไปเขียนทับแท็บเดิมใน Sheets ตรวจเทียบให้ตรงก่อนจึงสลับกลับ (5/11/2026)
 * Sheets ต้นทางไม่ถูกแก้ ยกเว้นตอน rollback แบบ copyBack ที่ผู้ใช้ยืนยันเอง
 * กลุ่มที่เคยใช้ D1 จริงแล้ว (มีธง live:<กลุ่ม>) คัดลอกจาก Sheets มาทับ D1 ไม่ได้ จนกว่าจะ rollback แบบคัดลอกกลับสำเร็จ — กันข้อมูลใหม่บน D1 หาย
 */
import { writeAudit } from "./audit";
import * as D from "./d1";
import { GROUP_TABS } from "./d1-groups";
import { getD1State, invalidateD1State, parseState } from "./d1-state";
import { TABS } from "./schema";
import { NATIVE_DEFS } from "./content";
import * as G from "./sheets-google";

export class D1AdminError extends Error { constructor(public status: number, message: string) { super(message); } }

export type TabReport = {
  tab: string; sheetRows: number; d1Rows: number; ok: boolean; hashMatch: boolean; missingColumns: string[];
  sums: { column: string; sheet: number; d1: number }[]; note?: string;
};
export type VerifyReport = { group: string; at: string; ok: boolean; tabs: TabReport[] };

const SUMS: Record<string, string[]> = { ACC_DOCS: ["total", "paid_amount"], ACC_PAYMENTS: ["amount"], ACC_LINES: ["amount"], SALES: ["deal_value_thb", "company_revenue_thb", "direct_cost_thb"], META_ADS: ["amount_spent_thb", "impressions", "reach"], GOOGLE_ADS_CAMPAIGNS: ["cost_thb", "clicks"], FB_PAGE_POSTS: ["views", "reach", "reactions"] };
const clean = (h: string[]) => [...new Set(h.filter(Boolean))];
const r2 = (n: number) => Math.round(n * 100) / 100;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function need() {
  const { db, state } = await getD1State();
  if (!db) throw new D1AdminError(409, "ยังไม่พบฐานข้อมูล D1 (binding DB) — ตรวจ wrangler.jsonc แล้ว Deploy ใหม่");
  return { db, state };
}
function groupTabs(group: string) {
  const t = GROUP_TABS[group];
  if (!t) throw new D1AdminError(422, `ไม่รู้จักกลุ่ม ${group}`);
  return t;
}

async function readSource(tab: string, have: Set<string>) {
  if (!have.has(tab)) return { headers: [] as string[], rows: [] as string[][], missing: true };
  const t = await G.readTab(tab);
  const headers = clean(t.headers);
  return { headers, rows: t.rows.map((r) => headers.map((h) => r[h] ?? "")), missing: false };
}
const sheetTitles = async () => new Set((await G.listTabs()).map((m) => m.title));

export async function initD1() {
  const { db } = await need();
  const report = await D.ensureSchema(db, [...TABS.map((t) => ({ name: t.name, headers: t.headers })), ...NATIVE_DEFS]);
  invalidateD1State();
  return report;
}

/** ต่ออายุธง "กำลังย้าย" ระหว่างงานยาว (ธงหมดอายุเองใน 2 นาทีเผื่อระบบหยุดกลางทาง) — เขียนไม่เกินทุก 20 วินาที */
function heartbeat(db: D.D1Like, group: string) {
  let last = Date.now();
  return async () => { if (Date.now() - last < 20_000) return; last = Date.now(); await D.metaSet(db, "migrating", JSON.stringify({ group, since: new Date().toISOString() })); invalidateD1State(); };
}

/** คัดลอกทั้งกลุ่มจาก Sheets (ล้างตารางใน D1 แล้วใส่ใหม่ตามลำดับเดิม) — ปฏิเสธถ้ากลุ่มนี้ใช้ D1 อยู่ หรือเคยใช้ D1 จริงแล้ว (กันข้อมูลจริงถูกทับ) */
async function copyGroup(group: string, beat?: () => Promise<void>) {
  const tabs = groupTabs(group);
  const { db } = await need();
  const meta = await D.metaGetAll(db);
  if (parseState(meta).active.includes(group)) throw new D1AdminError(409, "กลุ่มนี้ใช้ D1 อยู่แล้ว คัดลอกทับไม่ได้ (ต้อง rollback ก่อน)");
  if (meta[`live:${group}`]) throw new D1AdminError(409, `กลุ่มนี้เคยใช้ D1 จริงแล้ว (ตั้งแต่ ${meta[`live:${group}`]}) ข้อมูลบน D1 อาจใหม่กว่า Google Sheets — คัดลอกจาก Sheets มาทับไม่ได้ ถ้าย้อนกลับไปใช้ Sheets ให้ rollback แบบคัดลอกกลับ (copyBack) ก่อน`);
  await D.ensureSchema(db, [...TABS.map((t) => ({ name: t.name, headers: t.headers })), ...NATIVE_DEFS]);
  const have = await sheetTitles();
  for (const tab of tabs) {
    const src = await readSource(tab, have);
    await D.ensureColumns(db, tab, src.headers);
    await D.replaceAll(db, tab, src.headers, src.rows, beat);
    await beat?.();
  }
}

export async function verifyGroup(group: string): Promise<VerifyReport> {
  const tabs = groupTabs(group);
  const { db } = await need();
  const have = await sheetTitles();
  const out: TabReport[] = [];
  for (const tab of tabs) {
    const src = await readSource(tab, have);
    const d = await D.readAll(db, tab);
    const idx = src.headers.map((h) => d.headers.indexOf(h));
    const dRows = d.rows.map((r) => idx.map((i) => (i >= 0 ? r[i] : "")));
    const hashMatch = (await sha256(JSON.stringify(src.rows))) === (await sha256(JSON.stringify(dRows)));
    const sums = (SUMS[tab] ?? []).filter((c) => src.headers.includes(c)).map((column) => {
      const si = src.headers.indexOf(column);
      return { column, sheet: r2(src.rows.reduce((s, r) => s + (Number(r[si]) || 0), 0)), d1: r2(dRows.reduce((s, r) => s + (Number(r[si]) || 0), 0)) };
    });
    const missingColumns = src.headers.filter((h) => !d.headers.includes(h));
    out.push({
      tab, sheetRows: src.rows.length, d1Rows: d.rows.length, hashMatch, missingColumns, sums,
      ok: src.rows.length === d.rows.length && hashMatch && !missingColumns.length && sums.every((s) => s.sheet === s.d1),
      note: src.missing ? "ไม่มีแท็บนี้ใน Sheet (ถือว่าว่าง)" : undefined,
    });
  }
  return { group, at: new Date().toISOString(), ok: out.every((t) => t.ok), tabs: out };
}

/** ลองคัดลอก + ตรวจเทียบ โดยยังไม่สลับ (ถ้ามีคนแก้ Sheet ระหว่างนั้นอาจไม่ตรง ไม่ใช่ความผิดปกติ) */
export async function checkGroup(group: string): Promise<VerifyReport> {
  const { db, state } = await need();
  if (state.migrating) throw new D1AdminError(409, "มีการย้ายข้อมูลกำลังทำงานอยู่");
  await copyGroup(group);
  const report = await verifyGroup(group);
  await D.metaSet(db, `report:${group}`, JSON.stringify(report));
  return report;
}

export async function cutoverGroup(group: string, actor: string, opts: { waitMs?: number } = {}) {
  groupTabs(group);
  const { db, state } = await need();
  if (state.active.includes(group)) throw new D1AdminError(409, "กลุ่มนี้ใช้ D1 อยู่แล้ว");
  if (state.migrating) throw new D1AdminError(409, "มีการย้ายข้อมูลกำลังทำงานอยู่");
  // 1) ล็อกการเขียนกลุ่มนี้ แล้วรอให้ทุกเครื่องเห็นธง (cache สถานะอายุ 3 วินาที)
  await D.metaSet(db, "migrating", JSON.stringify({ group, since: new Date().toISOString() }));
  invalidateD1State();
  await sleep(opts.waitMs ?? 4000);
  let report: VerifyReport;
  try {
    // 2) คัดลอก 3) ตรวจเทียบ 4) ตรงทุกแท็บจึงสลับ
    await copyGroup(group, heartbeat(db, group));
    report = await verifyGroup(group);
    await D.metaSet(db, `report:${group}`, JSON.stringify(report));
    if (report.ok) {
      await D.metaSet(db, "active_groups", JSON.stringify([...new Set([...state.active, group])]));
      await D.metaSet(db, `live:${group}`, new Date().toISOString()); // ตั้งแต่นี้ข้อมูลจริงอยู่บน D1
    }
  } finally {
    await D.metaDelete(db, "migrating");
    invalidateD1State();
  }
  if (report.ok) await writeAudit(actor, "d1_cutover", "database", group, `สลับกลุ่ม ${group} มาใช้ D1 (${report.tabs.length} ตาราง ตรวจเทียบตรงทุกแท็บ)`);
  return { switched: report.ok, report };
}

/** เขียนข้อมูลตารางบน D1 กลับไปทับแท็บเดิมใน Google Sheets (header + ทุกแถว · แถวเกินถูกลบ) */
async function writeBack(db: D.D1Like, tab: string, beat: () => Promise<void>) {
  const d = await D.readAll(db, tab);
  let meta = (await G.listTabs()).find((m) => m.title === tab);
  if (!meta) { await G.addTabs([{ title: tab, columns: Math.max(26, d.headers.length) }]); meta = (await G.listTabs()).find((m) => m.title === tab)!; }
  if (meta.columnCount < d.headers.length) await G.expandColumns(meta.sheetId, d.headers.length - meta.columnCount);
  const cur = await G.readTab(tab);
  const width = Math.max(d.headers.length, cur.headers.length);
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill("")];
  const keep = Math.min(d.rows.length, cur.rows.length), last = G.colLetter(width - 1), CH = 2000;
  await G.batchUpdateValues([{ range: `'${tab}'!A1:${last}1`, values: [pad(d.headers)] }]);
  for (let i = 0; i < keep; i += CH) { await G.batchUpdateValues([{ range: `'${tab}'!A${i + 2}:${last}${Math.min(i + CH, keep) + 1}`, values: d.rows.slice(i, Math.min(i + CH, keep)).map(pad) }]); await beat(); }
  for (let i = keep; i < d.rows.length; i += CH) { await G.appendRows(tab, d.rows.slice(i, i + CH).map(pad)); await beat(); }
  if (cur.rows.length > d.rows.length) await G.deleteRows(meta.sheetId, d.rows.length + 2, cur.rows.length + 1);
}

/**
 * กลับไปใช้ Google Sheets: ล็อกการเขียนกลุ่มนี้ → ตรวจว่า D1 กับ Sheets ตรงกันไหม
 * ตรงกัน = สลับกลับได้เลย · ไม่ตรง (มีการบันทึกบน D1 หลังสลับ) → ต้อง copyBack: true จึงคัดลอก D1 กลับไปทับ Sheets ตรวจซ้ำให้ตรงก่อนสลับ
 */
export async function rollbackGroup(group: string, actor: string, opts: { copyBack?: boolean; waitMs?: number } = {}) {
  groupTabs(group);
  const { db } = await need();
  const state = parseState(await D.metaGetAll(db));
  if (!state.active.includes(group)) throw new D1AdminError(409, "กลุ่มนี้ยังไม่ได้ใช้ D1");
  if (state.migrating) throw new D1AdminError(409, "มีการย้ายข้อมูลกำลังทำงานอยู่");
  await D.metaSet(db, "migrating", JSON.stringify({ group, since: new Date().toISOString() }));
  invalidateD1State();
  let copied = false;
  try {
    await sleep(opts.waitMs ?? 4000);
    let report = await verifyGroup(group);
    if (!report.ok) {
      if (!opts.copyBack) throw new D1AdminError(409, "ข้อมูลบน D1 ต่างจาก Google Sheets (มีการบันทึกหลังสลับมา D1) — ถ้าย้อนกลับตอนนี้ข้อมูลส่วนนั้นจะหายจากหน้าเว็บ ให้ส่ง copyBack: true เพื่อคัดลอกข้อมูล D1 กลับไปเขียนทับแท็บใน Sheets ก่อน");
      const beat = heartbeat(db, group);
      for (const tab of groupTabs(group)) await writeBack(db, tab, beat);
      report = await verifyGroup(group);
      await D.metaSet(db, `report:${group}`, JSON.stringify(report));
      if (!report.ok) throw new D1AdminError(409, `คัดลอกกลับไป Sheets แล้วตรวจเทียบไม่ตรง (${report.tabs.filter((x) => !x.ok).map((x) => x.tab).join(", ")}) — ยังไม่สลับ ระบบยังใช้ D1 ตามเดิม`);
      copied = true;
    }
    await D.metaSet(db, "active_groups", JSON.stringify(state.active.filter((g) => g !== group)));
    await D.metaDelete(db, `live:${group}`);
  } finally {
    await D.metaDelete(db, "migrating");
    invalidateD1State();
  }
  await writeAudit(actor, "d1_rollback", "database", group, copied ? `กลับไปใช้ Google Sheets สำหรับกลุ่ม ${group} — คัดลอกข้อมูลจาก D1 กลับไปที่ Sheets แล้ว (ตรวจเทียบตรงทุกแท็บ)` : `กลับไปใช้ Google Sheets สำหรับกลุ่ม ${group} (ข้อมูล D1 กับ Sheets ตรงกัน)`);
  return { copied };
}

/** ปลดธงกำลังย้ายที่ค้าง (เช่น ระบบหยุดกลางทาง) */
export async function unlockMigration() {
  const { db } = await need();
  await D.metaDelete(db, "migrating");
  invalidateD1State();
}

export async function d1Status() {
  const { db } = await getD1State();
  if (!db) return { available: false as const };
  const all = await D.metaGetAll(db);
  const state = parseState(all);
  const groups = [];
  for (const [name, tabs] of Object.entries(GROUP_TABS)) {
    const counts: { tab: string; rows: number | null }[] = [];
    for (const tab of tabs) counts.push({ tab, rows: await D.countRows(db, tab).catch(() => null) });
    let report: VerifyReport | null = null;
    try { report = all[`report:${name}`] ? (JSON.parse(all[`report:${name}`]) as VerifyReport) : null; } catch { /* ว่าง */ }
    groups.push({ name, active: state.active.includes(name), counts, report });
  }
  return { available: true as const, initialized: groups.every((g) => g.counts.every((c) => c.rows !== null)), migrating: state.migrating, groups };
}
