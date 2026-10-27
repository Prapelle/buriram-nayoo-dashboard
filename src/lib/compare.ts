/**
 * Phase 7 — เปรียบเทียบช่วงเวลา (YoY และช่วงก่อนหน้า)
 * YoY Change (%) = ((ปัจจุบัน − ปีก่อน) ÷ ปีก่อน) × 100
 * - ปีก่อน = 0 → N/A (หารด้วยศูนย์ไม่ได้) · ไม่มีข้อมูลปีก่อน → Missing Data
 * - ช่วงปีก่อน = วันเดียวกันของปีก่อน (29 ก.พ. → 28 ก.พ.) ถ้าจำนวนวันไม่เท่ากันต้องแจ้ง
 * - ไม่สร้างตัวเลขย้อนหลังเอง: ค่าปีก่อนคำนวณจากข้อมูลจริงด้วยกฎเดียวกับช่วงปัจจุบัน
 */
export type DRange = { from: string; to: string };
export type CompareMode = "prev" | "yoy";

const pad = (n: number) => String(n).padStart(2, "0");
export function shiftYear(iso: string, years: number): string {
  const y = Number(iso.slice(0, 4)) + years, m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // วันสุดท้ายของเดือนนั้นในปีเป้าหมาย
  return `${y}-${pad(m)}-${pad(Math.min(d, last))}`;
}
export const daysBetween = (r: DRange) => Math.round((Date.parse(r.to + "T00:00:00Z") - Date.parse(r.from + "T00:00:00Z")) / 86400000) + 1;
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

export function yoyRange(r: DRange): { range: DRange; note?: string } {
  const range = { from: shiftYear(r.from, -1), to: shiftYear(r.to, -1) };
  const a = daysBetween(r), b = daysBetween(range);
  return { range, note: a !== b ? `ช่วงปีก่อนมี ${b} วัน ช่วงปัจจุบันมี ${a} วัน (เพราะ 29 ก.พ.) ตัวเลขจึงเทียบกันไม่เท่ากันพอดี` : undefined };
}
export function previousRange(r: DRange): DRange {
  const n = daysBetween(r); const to = addDays(r.from, -1);
  return { from: addDays(to, -(n - 1)), to };
}
export function compareRange(r: DRange, mode: CompareMode) {
  return mode === "yoy" ? yoyRange(r) : { range: previousRange(r), note: undefined as string | undefined };
}

/** % เปลี่ยนแปลง: null + เหตุผล เมื่อคำนวณไม่ได้ */
export function changePct(cur: number | null, prev: number | null): { pct: number | null; reason?: "missing" | "zero" } {
  if (cur === null || prev === null) return { pct: null, reason: "missing" };
  if (prev === 0) return { pct: null, reason: "zero" };
  return { pct: Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 };
}
export const COMPARE_LABEL: Record<CompareMode, string> = { yoy: "ปีก่อน", prev: "ช่วงก่อน" };
