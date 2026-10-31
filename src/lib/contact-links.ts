// ลิงก์ติดต่อจากเบอร์ / Line (31/10/2026): บนมือถือกดแล้วโทรออก หรือเปิด LINE ได้ทันที
/** "081-234-5678" → "tel:0812345678" */
export const telHref = (phone: string) => `tel:${String(phone).replace(/[^\d+]/g, "")}`;
/** "@shop" (LINE OA) → line.me/R/ti/p/%40shop · "myid" (LINE ID ส่วนตัว) → line.me/ti/p/~myid · ลิงก์ line.me ที่กรอกมา → ใช้ตามนั้น */
export function lineHref(id: string): string {
  const v = String(id).trim();
  if (/^https?:\/\/(line\.me|lin\.ee)\//i.test(v)) return v;
  if (v.startsWith("@")) return `https://line.me/R/ti/p/${encodeURIComponent(v)}`;
  return `https://line.me/ti/p/~${encodeURIComponent(v)}`;
}
