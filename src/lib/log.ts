/**
 * บันทึก error ของเว็บจริง (1/11/2026) — เห็นใน Cloudflare Dashboard → Workers → buriram-nayoo-dashboard → Logs
 * บันทึกเฉพาะ ตำแหน่ง + ชนิด + ข้อความ error (ตัดสั้น) — ไม่บันทึกข้อมูลลูกค้า / ข้อมูลที่ส่งเข้ามา / token
 */
export function logError(where: string, e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  console.error(JSON.stringify({ level: "error", where, name: err.name, message: err.message.slice(0, 300), stack: err.stack?.split("\n").slice(1, 4).map((s) => s.trim()) }));
}
