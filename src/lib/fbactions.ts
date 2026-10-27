/**
 * Phase 3 — ชื่อ Action ของ Facebook Ads (Result indicator)
 * - ตัดเฉพาะ prefix "actions:" หรือ "Action:" ที่อยู่ "หน้าสุด" ของค่า (ไม่สนตัวพิมพ์เล็ก/ใหญ่)
 *   คำว่า action ที่อยู่ตำแหน่งอื่นไม่แตะ เช่น "offsite_conversion.custom_action" คงเดิม
 * - ค่าต้นฉบับใน Google Sheet (result_indicator, raw_json) ไม่ถูกแก้ ทำเฉพาะตอนแสดงผล/กรอง/ส่งออก
 * - ไม่รวม Action ต่างชนิดกัน: ถ้าค่าดิบ 2 ค่าตัด prefix แล้วได้ชื่อเดียวกัน (เช่น "actions:like" กับ "like")
 *   จะแสดงค่าดิบของทั้งสองแทน เพื่อไม่ให้ดูเหมือนเป็น Action เดียวกัน
 */
const PREFIX = /^\s*actions?:\s*/i;

export function stripActionPrefix(raw: string): string {
  const v = String(raw ?? "").trim();
  const out = v.replace(PREFIX, "");
  return out === "" ? v : out; // "actions:" เปล่า ๆ → คงค่าเดิม ไม่ทำให้กลายเป็นค่าว่าง
}

/** แผนที่ ค่าดิบ → ชื่อที่แสดง สำหรับชุดค่าที่พบ (กันชื่อชนกัน) */
export function actionLabels(raws: Iterable<string>): Map<string, string> {
  const uniq = [...new Set([...raws].map((x) => String(x ?? "").trim()).filter(Boolean))];
  const byName = new Map<string, string[]>();
  for (const r of uniq) { const n = stripActionPrefix(r); byName.set(n, [...(byName.get(n) ?? []), r]); }
  const out = new Map<string, string>();
  for (const [n, rs] of byName) for (const r of rs) out.set(r, rs.length > 1 ? r : n);
  return out;
}

/** ชื่อ Action ที่ชนกันหลังตัด prefix (ไว้เตือนผู้ใช้) */
export function actionCollisions(raws: Iterable<string>): string[] {
  const m = actionLabels(raws);
  return [...new Set([...m].filter(([r, l]) => r === l && stripActionPrefix(r) !== r).map(([r]) => stripActionPrefix(r)))];
}

export const ACTION_FIELDS = ["result_indicator", "results_initial_indicator"] as const;

/** ส่งออก: ค่าในคอลัมน์เดิมเป็นชื่อที่ตัด prefix แล้ว + เก็บค่าดิบในคอลัมน์ *_raw ต่อท้าย */
export function normalizeActionRows<T extends Record<string, string>>(rows: T[]): (T & Record<string, string>)[] {
  const maps = Object.fromEntries(ACTION_FIELDS.map((f) => [f, actionLabels(rows.map((r) => r[f] ?? ""))]));
  return rows.map((r) => {
    const o: Record<string, string> = { ...r };
    for (const f of ACTION_FIELDS) { const raw = String(r[f] ?? "").trim(); o[`${f}_raw`] = r[f] ?? ""; o[f] = raw ? maps[f].get(raw) ?? raw : ""; }
    return o as T & Record<string, string>;
  });
}
