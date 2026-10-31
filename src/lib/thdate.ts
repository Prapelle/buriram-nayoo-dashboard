// รูปแบบวันที่ของทั้งระบบ (ผู้ใช้กำหนด 31/10/2026): "31 ต.ค. 69" (วัน เดือนย่อ ปี พ.ศ. 2 หลัก)
// รับค่า ISO "YYYY-MM-DD..." (ค.ศ.) — ข้อมูลใน Google Sheets ยังเก็บเป็น ค.ศ. เหมือนเดิม เปลี่ยนเฉพาะการแสดงผล
export const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const by = (y: string | number) => String((Number(y) + 543) % 100).padStart(2, "0");

/** "2026-10-31" → "31 ต.ค. 69" · ค่าที่ไม่ใช่วันที่ → คืนค่าเดิม (ว่าง → "") */
export function thDate(iso?: string | null): string {
  const s = String(iso ?? ""); const m = ISO.exec(s);
  if (!m) return s;
  const mi = Number(m[2]) - 1; if (mi < 0 || mi > 11) return s;
  return `${Number(m[3])} ${TH_MONTHS[mi]} ${by(m[1])}`;
}
/** "2026-10-31" → "31 ต.ค." (แกนกราฟ / ช่วงในปีเดียวกัน) */
export function thDayMonth(iso?: string | null): string {
  const s = String(iso ?? ""); const m = ISO.exec(s);
  return m ? `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] ?? ""}` : s;
}
/** "2026-10" หรือ "2026-10-xx" → "ต.ค. 69" */
export function thMonth(ym?: string | null): string {
  const s = String(ym ?? ""); const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${TH_MONTHS[Number(m[2]) - 1] ?? m[2]} ${by(m[1])}` : s;
}
/** ช่วงวันที่: "1 ก.ย. 69 – 30 ก.ย. 69" (วันเดียว → วันเดียว) */
export function thRange(a?: string, b?: string): string {
  if (!a && !b) return "";
  if (!b || a === b) return thDate(a);
  return `${thDate(a)} – ${thDate(b)}`;
}
/** เวลาแบบเต็ม (ISO timestamp, เวลาไทย) → "31 ต.ค. 69 10:44" · ค่า "YYYY-MM-DD HH:mm" ที่ไม่มีโซนเวลา → ใช้ตามที่เขียน */
export function thDateTime(v?: string | null): string {
  const s = String(v ?? ""); if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}$|^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(s)) return `${thDate(s)} ${s.slice(11, 16)}`;
  const t = new Date(s); if (isNaN(t.getTime())) return thDate(s);
  const bkk = new Date(t.getTime() + 7 * 3600_000).toISOString(); // Asia/Bangkok (UTC+7 ไม่มีเวลาออมแสง)
  return `${thDate(bkk)} ${bkk.slice(11, 16)}`;
}
