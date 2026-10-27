/**
 * จัดการผู้ใช้ (แท็บ APP_USERS) จากหน้า ตั้งค่า — เฉพาะ Admin
 * - ไม่ลบแถว: ระงับด้วย active = FALSE (ประวัติยังอยู่ และเปิดใช้ใหม่ได้)
 * - กันล็อกตัวเองออก: แก้ Role/ระงับตัวเองไม่ได้ และต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คนเสมอ
 * - อีเมลซ้ำไม่ได้ (ไม่สนตัวพิมพ์) · ตรวจข้อมูลเก่าก่อนแก้ (updated_at) · บันทึก Audit Log
 * - มีผลกับผู้ใช้ที่ล็อกอินอยู่ภายใน 5 นาที (ระบบตรวจ Role ซ้ำทุก 5 นาที)
 */
import { writeAudit } from "./audit";
import { env } from "./env";
import { ROLES, type Role } from "./roles";
import { appendRows, batchUpdateValues, colLetter, readTab, toRow } from "./sheets";

export class UserError extends Error {
  constructor(public status: number, message: string, public code: string, public fields?: Record<string, string>) { super(message); }
}
export type AppUser = { user_id: string; email: string; display_name: string; role: string; active: boolean; created_at: string; updated_at: string; created_by: string; bootstrap: boolean };

const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();
const isActive = (v: unknown) => String(v ?? "").toUpperCase() === "TRUE";

async function load() {
  try { const t = await readTab("APP_USERS"); if (!t.headers.includes("email")) throw new Error(); return t; }
  catch { throw new UserError(409, "อ่านแท็บ APP_USERS ไม่ได้ กรุณากด เตรียม Google Sheet ก่อน", "SHEET_NOT_READY"); }
}

export async function listUsers(): Promise<AppUser[]> {
  const t = await load();
  return t.rows.filter((r) => r.email).map((r) => ({
    user_id: r.user_id, email: norm(r.email), display_name: r.display_name ?? "", role: r.role, active: isActive(r.active),
    created_at: r.created_at ?? "", updated_at: r.updated_at ?? "", created_by: r.created_by ?? "", bootstrap: !!env.initialAdmin && norm(r.email) === env.initialAdmin,
  })).sort((a, b) => Number(b.active) - Number(a.active) || a.email.localeCompare(b.email));
}

export type SaveUserInput = { user_id?: string; email?: string; display_name?: string; role?: string; active?: boolean; updated_at_seen?: string };

export async function saveUser(input: SaveUserInput, actor: string) {
  const email = norm(input.email), name = String(input.display_name ?? "").trim(), role = String(input.role ?? "") as Role, active = input.active !== false;
  const fields: Record<string, string> = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) fields.email = "อีเมลไม่ถูกต้อง";
  if (!ROLES.includes(role)) fields.role = "กรุณาเลือก Role (admin / marketing / sales)";
  if (name.length > 100) fields.display_name = "ชื่อยาวเกิน 100 ตัวอักษร";
  if (Object.keys(fields).length) throw new UserError(422, "ข้อมูลไม่ถูกต้อง", "VALIDATION", fields);

  const t = await load();
  const now = new Date().toISOString();
  const me = norm(actor);
  const idx = input.user_id ? t.rows.findIndex((r) => r.user_id === input.user_id) : -1;
  const dup = t.rows.findIndex((r, i) => r.email && norm(r.email) === email && i !== idx);
  if (dup >= 0) throw new UserError(409, `มีผู้ใช้อีเมล ${email} อยู่แล้ว (แก้ไขที่แถวเดิมแทน)`, "DUPLICATE_EMAIL");

  if (idx >= 0) {
    const prev0 = t.rows[idx];
    if ((prev0.updated_at ?? "") !== (input.updated_at_seen ?? "")) throw new UserError(409, "ผู้ใช้นี้ถูกแก้ไขไปแล้ว กรุณาโหลดใหม่ก่อนแก้ไข", "STALE");
    if (norm(prev0.email) === me && (role !== prev0.role || !active || email !== me)) throw new UserError(409, "แก้ Role / อีเมล / ระงับบัญชีของตัวเองไม่ได้ (ให้ Admin คนอื่นทำ)", "SELF_CHANGE");
  }
  // ต้องเหลือ Admin ที่ใช้งานได้อย่างน้อย 1 คน
  const adminsAfter = t.rows.filter((r, i) => r.email && (i === idx ? role === "admin" && active : r.role === "admin" && isActive(r.active))).length + (idx < 0 && role === "admin" && active ? 1 : 0);
  if (adminsAfter === 0) throw new UserError(409, "ต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คน", "LAST_ADMIN");

  if (idx < 0) {
    if (input.user_id) throw new UserError(404, "ไม่พบผู้ใช้นี้ (อาจถูกแก้ไขใน Sheet) กรุณาโหลดใหม่", "NOT_FOUND");
    const rec = { user_id: crypto.randomUUID(), email, display_name: name, role, active: active ? "TRUE" : "FALSE", created_at: now, updated_at: now, created_by: me };
    await appendRows("APP_USERS", [toRow(t.headers, rec)]);
    await writeAudit(actor, "user_create", "app_user", rec.user_id, `เพิ่มผู้ใช้ ${email} (${role}${active ? "" : ", ระงับ"})`);
    return { created: true };
  }

  const prev = t.rows[idx];
  const rec = { ...prev, email, display_name: name, role, active: active ? "TRUE" : "FALSE", updated_at: now };
  await batchUpdateValues([{ range: `'APP_USERS'!A${idx + 2}:${colLetter(t.headers.length - 1)}${idx + 2}`, values: [toRow(t.headers, rec)] }]);
  const changes = [prev.role !== role ? `role ${prev.role} → ${role}` : "", isActive(prev.active) !== active ? (active ? "เปิดใช้งาน" : "ระงับ") : "", norm(prev.email) !== email ? `อีเมล ${norm(prev.email)} → ${email}` : "", (prev.display_name ?? "") !== name ? "แก้ชื่อ" : ""].filter(Boolean);
  await writeAudit(actor, "user_update", "app_user", prev.user_id, `${email}: ${changes.join(" · ") || "ไม่มีการเปลี่ยนแปลง"}`);
  return { created: false };
}
