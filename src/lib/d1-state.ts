/**
 * สถานะการย้ายไป D1: กลุ่มแท็บที่ "สลับมาใช้ D1 แล้ว" + ธง "กำลังย้าย" (เก็บใน D1 ตาราง _meta)
 * - อ่านจาก D1 ทุก ~3 วินาที (cache ต่อเครื่อง) — ธงกำลังย้ายจึงมีผลกับทุกเครื่องภายใน 3 วินาที
 * - ไม่มี binding DB (เช่น ยังไม่ผูก D1 / เทสต์เดิม) = ใช้ Google Sheets ทั้งหมด ไม่แตะ D1 เลย
 * - มี binding แต่อ่านสถานะไม่ได้ → ผิดพลาดทันที (ไม่ถอยกลับไปอ่าน Sheets เงียบ ๆ เพราะข้อมูลอาจเก่า)
 */
import { getD1, metaGetAll, type D1Like } from "./d1";
import { GROUP_TABS, tabsOfGroups } from "./d1-groups";

export class MigratingError extends Error {
  status = 503;
  constructor() { super("กำลังย้ายฐานข้อมูล กรุณารอสักครู่ (ไม่กี่วินาที) แล้วลองใหม่"); }
}

export type D1State = { active: string[]; migrating: { group: string; since: string } | null };
const TTL = 3000, MIGRATE_EXPIRE_MS = 120_000;
let cache: { at: number; state: D1State } | null = null;
export const invalidateD1State = () => { cache = null; };

export function parseState(all: Record<string, string>): D1State {
  let active: string[] = [];
  try { const v = JSON.parse(all.active_groups ?? "[]"); if (Array.isArray(v)) active = v.filter((g) => typeof g === "string" && g in GROUP_TABS); } catch { /* ว่าง */ }
  let migrating: D1State["migrating"] = null;
  try {
    const m = JSON.parse(all.migrating ?? "null");
    if (m && typeof m.group === "string" && Date.now() - Date.parse(m.since) < MIGRATE_EXPIRE_MS) migrating = { group: m.group, since: String(m.since) };
  } catch { /* ว่าง */ }
  return { active, migrating };
}

export async function getD1State(): Promise<{ db: D1Like | null; state: D1State }> {
  const db = await getD1();
  if (!db) return { db: null, state: { active: [], migrating: null } };
  if (cache && Date.now() - cache.at < TTL) return { db, state: cache.state };
  const state = parseState(await metaGetAll(db));
  cache = { at: Date.now(), state };
  return { db, state };
}

/** แท็บที่ตอนนี้อยู่บน D1 (พร้อม db) — ว่างถ้ายังไม่ได้สลับกลุ่มไหนเลย */
export async function d1Routing(): Promise<{ db: D1Like | null; tabs: Set<string>; state: D1State }> {
  const { db, state } = await getD1State();
  return { db, state, tabs: new Set(tabsOfGroups(state.active)) };
}

/** ห้ามเขียนแท็บของกลุ่มที่กำลังย้าย */
export function assertWritable(state: D1State, tab: string) {
  if (state.migrating && (GROUP_TABS[state.migrating.group] ?? []).includes(tab)) throw new MigratingError();
}
