/**
 * ชั้นเข้าถึงข้อมูลกลาง — โมดูลอื่นทั้งหมดเรียกไฟล์นี้ไฟล์เดียว (หน้าตาเหมือน Google Sheets เดิมทุกอย่าง)
 * แท็บที่อยู่ในกลุ่มที่ "สลับมาใช้ D1 แล้ว" (ดู d1-groups.ts / หน้า ตั้งค่า → ฐานข้อมูล D1) จะอ่าน/เขียนที่ D1
 * แท็บอื่นยังใช้ Google Sheets ตามเดิม (sheets-google.ts) — คำขอเดียวอ่านผสมสองฐานได้ ผลลัพธ์เรียงตามที่ขอ
 */
import * as G from "./sheets-google";
import * as D from "./d1";
import { assertWritable, d1Routing } from "./d1-state";
import { NATIVE_DEFS } from "./content";
import { d1SheetId, d1TabOfSheetId } from "./d1-groups";

export type { TabMeta } from "./sheets-google";
export { colLetter, toRow, firstRowOf } from "./sheets-google";
import { colLetter } from "./sheets-google";

const tabOf = (range: string) => (/^'((?:[^']|'')+)'/.exec(range)?.[1] ?? "").replace(/''/g, "'");

const ensured = new WeakSet<object>();
async function route() {
  const r = await d1Routing();
  // ตารางที่เกิดบน D1 (Content) — สร้างให้อัตโนมัติครั้งแรกต่อเครื่อง (CREATE IF NOT EXISTS ไม่แตะข้อมูลเดิม)
  if (r.db && !ensured.has(r.db)) { await D.ensureSchema(r.db, NATIVE_DEFS); ensured.add(r.db); }
  if (r.tabs.size && !r.db) throw new Error("ฐานข้อมูล D1 (binding DB) ไม่พร้อมใช้งาน");
  return r;
}

export async function listTabs(): Promise<G.TabMeta[]> {
  const { tabs } = await route();
  const g = await G.listTabs();
  if (!tabs.size) return g;
  const out = g.filter((m) => !tabs.has(m.title));
  for (const t of tabs) out.push({ title: t, sheetId: d1SheetId(t), columnCount: 1000 });
  return out;
}

export const addTabs = G.addTabs;
export const expandColumns = G.expandColumns;

export async function deleteRow(sheetId: number, rowNumber: number) {
  const tab = d1TabOfSheetId(sheetId);
  if (!tab) return G.deleteRow(sheetId, rowNumber);
  const { db, state } = await route();
  assertWritable(state, tab);
  await D.deleteRowAt(db!, tab, rowNumber);
}

export async function batchGet(ranges: string[]): Promise<string[][][]> {
  const { db, tabs } = await route();
  if (!tabs.size) return G.batchGet(ranges);
  const out: string[][][] = new Array(ranges.length);
  const rest: number[] = [], mine: number[] = [];
  for (let i = 0; i < ranges.length; i++) (tabs.has(tabOf(ranges[i])) ? mine : rest).push(i);
  if (mine.length) (await D.getRanges(db!, mine.map((i) => ranges[i]))).forEach((v, k) => { out[mine[k]] = v; });
  if (rest.length) (await G.batchGet(rest.map((i) => ranges[i]))).forEach((v, k) => { out[rest[k]] = v; });
  return out;
}

export async function batchUpdateValues(data: { range: string; values: (string | number)[][] }[]) {
  if (!data.length) return;
  const { db, tabs, state } = await route();
  const d1Part: typeof data = [], gPart: typeof data = [];
  for (const d of data) { const t = tabOf(d.range); assertWritable(state, t); (tabs.has(t) ? d1Part : gPart).push(d); }
  if (d1Part.length) await D.updateRanges(db!, d1Part);
  if (gPart.length) await G.batchUpdateValues(gPart);
}

/** เพิ่มแถวต่อท้ายตาราง คืนค่า range ที่เขียน เช่น 'TAB'!A5:T7 (ใช้หาเลขแถว) */
export async function appendRows(tab: string, rows: (string | number)[][]): Promise<string> {
  if (!rows.length) return "";
  const { db, tabs, state } = await route();
  assertWritable(state, tab);
  return tabs.has(tab) ? D.appendRows(db!, tab, rows) : G.appendRows(tab, rows);
}

type Tab = { headers: string[]; rows: Record<string, string>[] };
const toTab = (values: string[][]): Tab => {
  const headers = values[0] ?? [];
  return { headers, rows: values.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))) };
};

/** อ่านทั้งแท็บ คืนค่าเป็น object ตามชื่อ header (ไม่พึ่งลำดับคอลัมน์) */
export async function readTab(tab: string): Promise<Tab> {
  const [values] = await batchGet([`'${tab}'`]);
  return toTab(values ?? []);
}

/** อ่านหลายแท็บในคำขอเดียว (ลดจำนวน API calls) */
export async function readTabs(tabs: string[]): Promise<Record<string, Tab>> {
  const all = await batchGet(tabs.map((t) => `'${t}'`));
  return Object.fromEntries(tabs.map((t, i) => [t, toTab(all[i] ?? [])]));
}

export type { AtomicOp } from "./d1";
import type { AtomicOp } from "./d1";
const opTab = (op: AtomicOp) => ("insert" in op ? op.insert : "deleteWhere" in op ? op.deleteWhere : op.update);

/**
 * แก้แถวตาม id เฉพาะเมื่อ updated_at ยังเท่าที่เห็น — คืน false ถ้ามีคนแก้ก่อน (ใช้กันกดพร้อมกัน เช่น ยืนยันชำระเงิน)
 * D1: คำสั่งเดียว (ปลอดภัยจริง) · Google Sheets: ตรวจแถวแล้วเขียน (ลดโอกาสชน แต่ไม่ล็อกจริง)
 */
export async function casRow(tab: string, headers: string[], idCol: string, id: string, expectUpdatedAt: string, values: (string | number)[]): Promise<boolean> {
  const { db, tabs, state } = await route();
  assertWritable(state, tab);
  if (tabs.has(tab)) return D.casUpdate(db!, tab, idCol, id, expectUpdatedAt, values);
  const col = colLetter(headers.indexOf(idCol)), last = colLetter(headers.length - 1);
  const [ids] = await G.batchGet([`'${tab}'!${col}:${col}`]);
  const k = ids.findIndex((r, i) => i > 0 && String(r?.[0] ?? "") === id);
  if (k < 0) return false;
  const [row] = await G.batchGet([`'${tab}'!A${k + 1}:${last}${k + 1}`]);
  if (String(row?.[0]?.[headers.indexOf("updated_at")] ?? "") !== expectUpdatedAt) return false;
  await G.batchUpdateValues([{ range: `'${tab}'!A${k + 1}:${last}${k + 1}`, values: [values] }]);
  return true;
}

/**
 * หลายคำสั่งพร้อมกัน: ทุกตารางอยู่บน D1 → ทรานแซกชันเดียว (สำเร็จทั้งหมดหรือไม่เขียนเลย)
 * มีตารางบน Google Sheets → ทำทีละคำสั่งตามลำดับ (เหมือนเดิม)
 */
export async function atomicWrite(ops: AtomicOp[]) {
  const live = ops.filter((op) => !("insert" in op) || op.rows.length);
  if (!live.length) return;
  const { db, tabs, state } = await route();
  for (const op of live) assertWritable(state, opTab(op));
  if (live.every((op) => tabs.has(opTab(op)))) return D.atomic(db!, live);
  for (const op of live) {
    const tab = opTab(op);
    if ("insert" in op) { await appendRows(tab, op.rows); continue; }
    const t = await readTab(tab), col = "deleteWhere" in op ? op.col : op.idCol, val = "deleteWhere" in op ? op.value : op.id;
    const hits = t.rows.map((r, i) => (r[col] === val ? i + 2 : 0)).filter(Boolean);
    if ("update" in op) { if (hits[0]) await batchUpdateValues([{ range: `'${tab}'!A${hits[0]}:${colLetter(t.headers.length - 1)}${hits[0]}`, values: [op.values] }]); continue; }
    const sid = (await listTabs()).find((m) => m.title === tab)?.sheetId;
    if (sid === undefined) continue;
    for (const r of hits.sort((a, b) => b - a)) await deleteRow(sid, r);
  }
}

/**
 * เขียน/ลบ "ตาม id" (10/11/2026) — ไม่พึ่งเลขแถวที่อ่านไว้ก่อนหน้า จึงไม่แก้/ลบผิดแถวเมื่อหลายคนใช้พร้อมกัน
 * D1: คำสั่งเดียวต่อแถว · Google Sheets (สำรอง/เทสต์): หาแถวจาก id ณ ตอนเขียน
 */
async function sheetRowsOf(tab: string, col: string, value: string) {
  const t = await readTab(tab);
  return { t, hits: t.rows.map((r, i) => (r[col] === value ? i + 2 : 0)).filter(Boolean) };
}
/** แก้ทั้งแถวตาม id · คืน false ถ้าไม่พบแถว (ถูกลบไปแล้ว) */
export async function updateById(tab: string, headers: string[], idCol: string, id: string, values: (string | number)[]): Promise<boolean> {
  const { db, tabs, state } = await route();
  assertWritable(state, tab);
  if (tabs.has(tab)) return (await D.updateById(db!, tab, idCol, id, values)) > 0;
  const { hits } = await sheetRowsOf(tab, idCol, id);
  if (!hits[0]) return false;
  await G.batchUpdateValues([{ range: `'${tab}'!A${hits[0]}:${colLetter(headers.length - 1)}${hits[0]}`, values: [values] }]);
  return true;
}
/** แก้บางช่องของทุกแถวที่ idCol = id · คืน false ถ้าไม่พบแถว */
export async function patchById(tab: string, idCol: string, id: string, patch: Record<string, string | number>): Promise<boolean> {
  const { db, tabs, state } = await route();
  assertWritable(state, tab);
  if (tabs.has(tab)) return (await D.patchById(db!, tab, idCol, id, patch)) > 0;
  const { t, hits } = await sheetRowsOf(tab, idCol, id);
  if (!hits[0]) return false;
  const data = hits.flatMap((row) => Object.entries(patch).map(([c, v]) => { const k = t.headers.indexOf(c); if (k < 0) throw new Error(`แท็บ ${tab} ไม่มีคอลัมน์ ${c}`); return { range: `'${tab}'!${colLetter(k)}${row}`, values: [[v]] }; }));
  await G.batchUpdateValues(data);
  return true;
}
/** ลบทุกแถวที่คอลัมน์ col = value · คืนจำนวนแถวที่ลบ */
export async function deleteWhere(tab: string, col: string, value: string): Promise<number> {
  const { db, tabs, state } = await route();
  assertWritable(state, tab);
  if (tabs.has(tab)) return D.deleteWhere(db!, tab, col, value);
  const { hits } = await sheetRowsOf(tab, col, value);
  if (!hits.length) return 0;
  const sid = (await G.listTabs()).find((m) => m.title === tab)?.sheetId;
  if (sid === undefined) return 0;
  for (const r of hits.sort((a, b) => b - a)) await G.deleteRow(sid, r);
  return hits.length;
}
