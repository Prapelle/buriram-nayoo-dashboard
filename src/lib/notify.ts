/**
 * การแจ้งเตือนในเว็บ (20/11/2026) — ไอคอนกระดิ่งบนแถบด้านบน
 * 1) งานที่ต้องทำ: คำนวณจากข้อมูลจริงทุกครั้ง (ไม่เก็บ) · เฉพาะรายการที่ผู้ใช้เป็น Staff / ผู้ร่วมงานในการ์ด
 * 2) การเปลี่ยนแปลง: เก็บในตาราง NOTIFICATIONS บน D1 แยกรายคน · อ่านแล้ว / ยังไม่อ่าน · เก็บ 90 วัน
 *    - ไม่แจ้งการกระทำของตัวเอง · แจ้งเฉพาะคนที่เป็น Staff ของรายการนั้น
 *    - การ์ด Content เข้าช่อง ART WORK / VIDEO → แจ้งผู้ใช้ตำแหน่ง Production ที่ยังไม่มีชื่อในการ์ด ให้เข้ามารับงาน
 */
export const NOTIF_TAB = "NOTIFICATIONS";
export const NOTIF_COLUMNS = ["notif_id", "user_email", "kind", "title", "body", "href", "ref_type", "ref_id", "actor", "created_at", "read_at"];
export const NOTIF_DEFS = [{ name: NOTIF_TAB, headers: NOTIF_COLUMNS }];
export const NOTIF_RETENTION_DAYS = 90;
export const NOTIF_LIST_LIMIT = 50;

export type NotifKind = "assign" | "change" | "member" | "claim" | "comment";
export const NOTIF_KIND_LABEL: Record<NotifKind, string> = { assign: "มอบหมายให้คุณ", change: "มีการเปลี่ยนแปลง", member: "เพิ่มคุณในการ์ด", claim: "รอคนรับงาน", comment: "ความคิดเห็นใหม่" };

/** ช่องของบอร์ด Content ที่ต้องมีคนทำงานกราฟิก / วิดีโอ */
export const ART_STAGE = "ART WORK / VIDEO";
/** หน้าที่ในการ์ดที่นับว่า "รับงาน ART / VIDEO" แล้ว */
export const ART_DUTIES = ["Graphic Designer", "Video Creator"];

export const leadHref = (id: string) => `/work/leads?view=${encodeURIComponent(id)}`;
export const devHref = (id: string, kind?: string) => `${kind === "home_builder" ? "/work/home-builders" : "/work/developers"}?view=${encodeURIComponent(id)}`;
export const cardHref = (id: string) => `/production/content?card=${encodeURIComponent(id)}`;

export type NotifInput = { to: string; kind: NotifKind; title: string; body?: string; href: string; ref_type: string; ref_id: string };
export type NotifItem = { notif_id: string; kind: string; title: string; body: string; href: string; actor: string; created_at: string; read_at: string };
export type Todo = { key: string; group: string; text: string; href: string; tone: "red" | "amber" | "sky" };

/** ผู้รับที่ไม่ใช่ผู้ทำ · ไม่ซ้ำ (ผู้รับ + รายการ + ชนิด) */
export function recipients(items: NotifInput[], actor: string): NotifInput[] {
  const me = actor.trim().toLowerCase(), seen = new Set<string>();
  return items.filter((n) => {
    const to = n.to.trim().toLowerCase();
    if (!to || to === me) return false;
    const k = `${to}|${n.ref_type}|${n.ref_id}|${n.kind}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  }).map((n) => ({ ...n, to: n.to.trim().toLowerCase() }));
}
