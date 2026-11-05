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

const tabOf = (range: string) => (/^'((?:[^']|'')+)'/.exec(range)?.[1] ?? "").replace(/''/g, "'");

async function route() {
  const r = await d1Routing();
  // ตารางที่เกิดบน D1 (Content) — สร้างให้อัตโนมัติครั้งแรกต่อเครื่อง (CREATE IF NOT EXISTS ไม่แตะข้อมูลเดิม)
  if (r.db && !D.nativeState.ensured) { await D.ensureSchema(r.db, NATIVE_DEFS); D.nativeState.ensured = true; }
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
  const rest: number[] = [];
  for (let i = 0; i < ranges.length; i++) {
    if (tabs.has(tabOf(ranges[i]))) out[i] = await D.getRange(db!, ranges[i]);
    else rest.push(i);
  }
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
