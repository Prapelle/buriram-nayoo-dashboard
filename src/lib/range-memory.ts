import { cookies } from "next/headers";

// จำช่วงวันที่ล่าสุดข้ามหน้า (31/10/2026): หน้าที่มีตัวกรองวันที่ (ภาพรวม, Performance, Facebook Page, Sales, รายงาน Lead)
// - URL มี from/to → ใช้ตาม URL · URL มี range=all (กด "ทั้งหมด" / ล้างตัวกรอง) → ไม่ใช้ค่าที่จำ
// - ไม่มีทั้งสองอย่าง → ใช้ช่วงล่าสุดที่เลือก (cookie nayoo_range ตั้งจากเบราว์เซอร์ตอนกดใช้ตัวกรอง)
export const RANGE_COOKIE = "nayoo_range";
const iso = (v: unknown) => { const s = Array.isArray(v) ? v[0] : v; return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined; };

export async function rangeOf(sp: Record<string, string | string[] | undefined>): Promise<{ from?: string; to?: string; remembered: boolean }> {
  if (sp.from !== undefined || sp.to !== undefined || sp.range !== undefined) return { from: iso(sp.from), to: iso(sp.to), remembered: false };
  try {
    const raw = (await cookies()).get(RANGE_COOKIE)?.value ?? "";
    const [a, b] = decodeURIComponent(raw).split("|");
    const from = iso(a), to = iso(b);
    if (from || to) return { from, to, remembered: true };
  } catch { /* ไม่มีค่า */ }
  return { remembered: false };
}
