import { batchGet, batchUpdateValues, casRow, colLetter } from "./sheets";

/**
 * ใช้พร้อมกันหลายคน (1/11/2026)
 * - เลขแถวที่อ่านไว้ตอนเปิดคำขออาจเลื่อน ถ้าคนอื่นลบแถวด้านบนไประหว่างนั้น → ก่อนเขียน/ลบ ยืนยันว่าแถวนั้นยังเป็นรายการเดิม
 *   (ไม่ใช่ → หาแถวใหม่จาก id) และ updated_at ยังเท่าเดิม (มีคนแก้ก่อน → stale)
 * - รหัส (LD- / DV- / HB-) ที่สร้างพร้อมกันอาจซ้ำ → หลังเพิ่มแถวแล้วตรวจ ถ้าซ้ำกับแถวที่มาก่อน เปลี่ยนรหัสของแถวที่มาทีหลังเป็นเลขถัดไป
 */
export type Guard = { row: number } | { error: "gone" | "stale" };

export async function guardRow(tab: string, headers: string[], idCol: string, id: string, expectedRow: number, expectUpdatedAt?: string): Promise<Guard> {
  const last = colLetter(headers.length - 1), ui = headers.indexOf("updated_at");
  const check = (vals: unknown[] | undefined): Guard | null => {
    if (!vals || String(vals[headers.indexOf(idCol)] ?? "") !== id) return null;
    if (expectUpdatedAt !== undefined && ui >= 0 && String(vals[ui] ?? "") !== expectUpdatedAt) return { error: "stale" };
    return { row: -1 };
  };
  const [at] = await batchGet([`'${tab}'!A${expectedRow}:${last}${expectedRow}`]);
  const g = check(at?.[0]);
  if (g) return "error" in g ? g : { row: expectedRow };
  // แถวเลื่อน: หาแถวใหม่จาก id
  const c = colLetter(headers.indexOf(idCol));
  const [col] = await batchGet([`'${tab}'!${c}:${c}`]);
  const k = col.findIndex((r, i) => i > 0 && String(r?.[0] ?? "") === id);
  if (k < 0) return { error: "gone" };
  const [moved] = await batchGet([`'${tab}'!A${k + 1}:${last}${k + 1}`]);
  const g2 = check(moved?.[0]);
  return !g2 ? { error: "gone" } : "error" in g2 ? g2 : { row: k + 1 };
}

/**
 * หลังเพิ่มแถวใหม่: ถ้ารหัสซ้ำกับแถวที่เพิ่มก่อนหน้า (สร้างพร้อมกัน) เปลี่ยนรหัสของแถวนี้เป็นเลขถัดไป · คืนรหัสสุดท้าย
 * แถวที่ชนกันหลายแถว: แถวแรกเก็บรหัสเดิม แถวถัดไปได้ "เลขสูงสุด + ลำดับ" (ไม่ชนกันเอง) แล้วตรวจซ้ำอีกรอบ
 */
export async function dedupeCode(tab: string, headers: string[], codeCol: string, idCol: string, id: string, code: string, next: (codes: string[]) => string): Promise<string> {
  const ci = colLetter(headers.indexOf(codeCol)), ii = colLetter(headers.indexOf(idCol));
  for (let round = 0; round < 4; round++) {
    const [codes, ids] = await batchGet([`'${tab}'!${ci}:${ci}`, `'${tab}'!${ii}:${ii}`]);
    const rows = ids.map((r, i) => ({ id: String(r?.[0] ?? ""), code: String(codes[i]?.[0] ?? ""), row: i + 1 })).slice(1);
    const mine = rows.find((r) => r.id === id);
    if (!mine) return code;
    const same = rows.filter((r) => r.code === code).sort((a, b) => a.row - b.row);
    const rank = same.findIndex((r) => r.id === id);
    if (rank <= 0) return code;
    const pool = rows.map((r) => r.code); let fresh = "";
    for (let k = 0; k < rank; k++) { fresh = next(pool); pool.push(fresh); }
    await batchUpdateValues([{ range: `'${tab}'!${ci}${mine.row}`, values: [[fresh]] }]);
    code = fresh;
  }
  return code;
}

/**
 * เขียนทั้งแถว "ตาม id" เฉพาะเมื่อ updated_at ยังเท่าที่เห็น (10/11/2026 — แทนการยืนยันเลขแถวแล้วเขียน)
 * D1 = คำสั่งเดียว ไม่มีช่องว่างให้เขียนผิดแถว · ไม่ผ่าน → บอกว่าแถวถูกลบ (gone) หรือมีคนแก้ก่อน (stale)
 */
export async function casWrite(tab: string, headers: string[], idCol: string, id: string, expectUpdatedAt: string, values: (string | number)[]): Promise<"ok" | "gone" | "stale"> {
  if (await casRow(tab, headers, idCol, id, expectUpdatedAt, values)) return "ok";
  const c = colLetter(headers.indexOf(idCol));
  const [col] = await batchGet([`'${tab}'!${c}:${c}`]);
  return col.some((r, i) => i > 0 && String(r?.[0] ?? "") === id) ? "stale" : "gone";
}
