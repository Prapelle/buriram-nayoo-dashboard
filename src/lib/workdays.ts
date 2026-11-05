/**
 * วันทำการ (5/11/2026) — จันทร์–เสาร์ ตัดวันอาทิตย์และวันหยุดบริษัท · ฟังก์ชันล้วน ๆ ไม่แตะฐานข้อมูล
 * ใช้นับเวลาที่รอลูกค้า และเลื่อนวันกำหนดส่งของการ์ด Content
 */
export const WAIT_ALERT_DAYS = 3; // รอลูกค้าเกินกี่วันทำการถึงเตือน
const CAP = 3660; // กันวนไม่รู้จบเมื่อข้อมูลวันที่ผิด
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const step = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isWorkday = (iso: string, holidays: ReadonlySet<string>) => new Date(iso + "T00:00:00Z").getUTCDay() !== 0 && !holidays.has(iso);

/** จำนวนวันทำการในช่วง [start, end) — เริ่มจันทร์ ตอบพุธ = 2 วัน · เริ่มและตอบวันเดียวกัน = 0 */
export function workdaysBetween(start: string, end: string, holidays: ReadonlySet<string>): number {
  if (!DAY.test(start) || !DAY.test(end) || end <= start) return 0;
  let n = 0, d = start;
  for (let i = 0; d < end && i < CAP; i++, d = step(d, 1)) if (isWorkday(d, holidays)) n++;
  return n;
}
/** เลื่อนวันที่ไปข้างหน้า n วันทำการ (ข้ามอาทิตย์/วันหยุด) · n ≤ 0 = วันเดิม */
export function addWorkdays(iso: string, n: number, holidays: ReadonlySet<string>): string {
  if (!DAY.test(iso)) return iso;
  let d = iso;
  for (let left = Math.min(Math.max(0, Math.floor(n)), CAP); left > 0;) { d = step(d, 1); if (isWorkday(d, holidays)) left--; }
  return d;
}

export type WaitRow = { card_id: string; kind: string; started_day: string; ended_day: string }; // วันที่ตามเวลาไทย · ended_day ว่าง = ยังรออยู่
/** รวมวันทำการที่รอลูกค้าของการ์ดหนึ่งใบ แยกช่วงผลิต (เริ่มรอก่อนเผยแพร่) กับช่วงรายงาน (เริ่มรอตั้งแต่วันเผยแพร่) */
export function waitSummary(card: { published_at?: string; planned_date?: string; report_due_date?: string }, waits: WaitRow[], today: string, holidays: ReadonlySet<string>) {
  let prod = 0, report = 0, open: { kind: string; since: string; days: number } | null = null;
  for (const w of waits) {
    const days = workdaysBetween(w.started_day, w.ended_day || today, holidays);
    if (card.published_at && w.started_day >= card.published_at) report += days; else prod += days;
    if (!w.ended_day) open = { kind: w.kind, since: w.started_day, days };
  }
  return {
    prod, report, open, alert: !!open && open.days > WAIT_ALERT_DAYS,
    plannedEff: card.planned_date ? addWorkdays(card.planned_date, prod, holidays) : "",
    reportDueEff: card.report_due_date ? addWorkdays(card.report_due_date, report, holidays) : "",
  };
}
