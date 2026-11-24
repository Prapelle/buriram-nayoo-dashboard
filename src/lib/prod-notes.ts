import { appendRows, deleteWhere, readTab, readTabs, toRow, updateById } from "./sheets";
import { getD1 } from "./d1";
import { writeAudit } from "./audit";
import { NOTE_COLUMNS, NOTES_TAB } from "./prod-notes-schema";

/**
 * Production note (24/11/2026) — ตั้งค่า → Production note
 * ช่อง: ชื่อระบบ / ลิงก์ / ชื่อผู้ใช้ / รหัสผ่าน · เพิ่มแถวได้เรื่อย ๆ
 * - ดู 3 ช่องแรก: ทุก Role · เพิ่ม / แก้ / ลบ: Admin ขึ้นไป
 * - รหัสผ่าน: เข้ารหัส (AES-GCM, กุญแจมาจาก AUTH_SECRET) ก่อนเก็บ · ไม่ส่งออกจากเซิร์ฟเวอร์จนกว่าจะใส่ "รหัสเปิดดู" ถูก
 *   ใส่ถูกแล้วเปิดดูได้ 5 นาที (cookie ลงลายเซ็น ผูกกับอีเมล) · ทุกครั้งที่เปิดดูบันทึกใน AUDIT_LOG
 * - รหัสเปิดดู: Super Admin ตั้ง / เปลี่ยนในหน้าตั้งค่าระบบ · เก็บเป็นค่าแฮช (PBKDF2) ไม่เก็บตัวรหัส
 * - ใส่รหัสผิดเกิน 5 ครั้งใน 15 นาที → ล็อก 15 นาที
 * หมายเหตุ: ถ้าเปลี่ยน AUTH_SECRET รหัสผ่านที่เก็บไว้จะอ่านไม่ได้ (ต้องกรอกใหม่)
 */
export const UNLOCK_MINUTES = 5;
export const UNLOCK_COOKIE = "pn_unlock";
const CODE_KEY = "prod_notes_code";
const MAX_FAILS = 5, FAIL_WINDOW_MS = 15 * 60_000;

export class NoteError extends Error {
  constructor(public status: number, message: string, public code = "ERROR", public fields?: Record<string, string>) { super(message); }
}
export type NoteRow = { note_id: string; system_name: string; link: string; username: string; has_password: boolean; updated_at: string; updated_by: string };

// ── กุญแจ ─────────────────────────────────────────────────────
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u: ArrayBuffer | Uint8Array) => { const a = u instanceof Uint8Array ? u : new Uint8Array(u); let s = ""; for (const x of a) s += String.fromCharCode(x); return btoa(s); };
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
function secret(): string {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length < 16) throw new NoteError(500, "ยังไม่ได้ตั้งค่า AUTH_SECRET — เก็บรหัสผ่านไม่ได้", "CONFIG");
  return s;
}
async function hkdf(info: string, usage: "aes" | "hmac"): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret()), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode("nayoo-prod-notes"), info: enc.encode(info) }, base,
    usage === "aes" ? { name: "AES-GCM", length: 256 } : { name: "HMAC", hash: "SHA-256", length: 256 }, false, usage === "aes" ? ["encrypt", "decrypt"] : ["sign", "verify"]);
}
export async function encryptPassword(plain: string): Promise<string> {
  if (!plain) return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await hkdf("password-v1", "aes"), enc.encode(plain));
  return `v1:${b64(iv)}:${b64(ct)}`;
}
export async function decryptPassword(stored: string): Promise<string> {
  if (!stored) return "";
  const [v, iv, ct] = stored.split(":");
  if (v !== "v1" || !iv || !ct) throw new NoteError(500, "รูปแบบรหัสผ่านที่เก็บไว้ไม่ถูกต้อง", "CORRUPT");
  try { return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await hkdf("password-v1", "aes"), unb64(ct))); }
  catch { throw new NoteError(500, "ถอดรหัสไม่ได้ (AUTH_SECRET อาจถูกเปลี่ยน) — ให้ Admin กรอกรหัสผ่านใหม่", "DECRYPT"); }
}

// ── รหัสเปิดดู (แฮช PBKDF2) ─────────────────────────────────────
const ITER = 100_000; // สูงสุดที่ Workers รองรับ
async function pbkdf2(code: string, salt: Uint8Array<ArrayBuffer>, iter = ITER) {
  const k = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, k, 256));
}
const sameBytes = (a: Uint8Array, b: Uint8Array) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
export async function hashCode(code: string): Promise<string> { const salt = crypto.getRandomValues(new Uint8Array(16)); return `pbkdf2$${ITER}$${b64(salt)}$${b64(await pbkdf2(code, salt))}`; }
export async function checkCode(code: string, stored: string): Promise<boolean> {
  const [alg, it, salt, h] = stored.split("$");
  if (alg !== "pbkdf2" || !salt || !h) return false;
  return sameBytes(await pbkdf2(code, unb64(salt), Number(it) || ITER), unb64(h));
}

// ── cookie เปิดดู 5 นาที (ลงลายเซ็น HMAC · ผูกอีเมล) ──────────────────
export async function unlockToken(email: string, now = Date.now()): Promise<{ value: string; exp: number }> {
  const exp = now + UNLOCK_MINUTES * 60_000, body = `${email.toLowerCase()}|${exp}`;
  const sig = await crypto.subtle.sign("HMAC", await hkdf("unlock-v1", "hmac"), enc.encode(body));
  return { value: `${b64(enc.encode(body))}.${b64(sig)}`, exp };
}
/** คืนเวลาหมดอายุ (ms) ถ้า cookie ถูกต้องและยังไม่หมดอายุ · ไม่ถูกต้อง = 0 */
export async function unlockedUntil(cookie: string | undefined, email: string, now = Date.now()): Promise<number> {
  try {
    const [p, s] = String(cookie ?? "").split(".");
    if (!p || !s) return 0;
    const body = dec.decode(unb64(p)), [who, expS] = body.split("|"), exp = Number(expS);
    if (who !== email.toLowerCase() || !(exp > now)) return 0;
    return (await crypto.subtle.verify("HMAC", await hkdf("unlock-v1", "hmac"), unb64(s), enc.encode(body))) ? exp : 0;
  } catch { return 0; }
}
export const cookieOf = (req: Request, name: string) => { const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.get("cookie") ?? ""); return m ? decodeURIComponent(m[1]) : undefined; };

// ── ข้อมูล ───────────────────────────────────────────────────
async function needD1() { if (!(await getD1())) throw new NoteError(409, "Production note ต้องใช้ฐานข้อมูล D1", "NO_D1"); }
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
function validate(input: Record<string, unknown>) {
  const f = { system_name: clean(input.system_name, 200), link: clean(input.link, 1000), username: clean(input.username, 300) };
  const errors: Record<string, string> = {};
  if (!f.system_name) errors.system_name = "กรุณาระบุชื่อระบบ";
  if (f.link) { try { const u = new URL(/^[a-z]+:\/\//i.test(f.link) ? f.link : `https://${f.link}`); if (u.protocol !== "https:" && u.protocol !== "http:") throw 0; f.link = u.toString(); } catch { errors.link = "ลิงก์ต้องขึ้นต้นด้วย https://"; } }
  if (String(input.password ?? "").length > 500) errors.password = "รหัสผ่านยาวเกินไป";
  if (Object.keys(errors).length) throw new NoteError(422, "ข้อมูลไม่ถูกต้อง", "VALIDATION", errors);
  return f;
}
const pub = (r: Record<string, string>): NoteRow => ({ note_id: r.note_id, system_name: r.system_name, link: r.link, username: r.username, has_password: !!r.password_enc, updated_at: r.updated_at, updated_by: r.updated_by });
const ordered = (rows: Record<string, string>[]) => rows.filter((r) => r.note_id).sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || a.created_at.localeCompare(b.created_at));

export async function codeIsSet(): Promise<boolean> { return !!(await readTab("APP_CONFIG")).rows.find((r) => r.config_key === CODE_KEY)?.config_value; }
export async function listNotes(): Promise<{ notes: NoteRow[]; codeSet: boolean }> {
  await needD1();
  const t = await readTabs([NOTES_TAB, "APP_CONFIG"]);
  return { notes: ordered(t[NOTES_TAB].rows).map(pub), codeSet: !!t.APP_CONFIG.rows.find((r) => r.config_key === CODE_KEY)?.config_value };
}

export async function saveNote(input: Record<string, unknown>, actor: string) {
  await needD1();
  const f = validate(input), now = new Date().toISOString(), id = clean(input.note_id, 64);
  const t = await readTab(NOTES_TAB), headers = t.headers.length ? t.headers : NOTE_COLUMNS;
  if (!id) {
    const sort = Math.max(0, ...t.rows.map((r) => Number(r.sort_order) || 0)) + 1;
    const rec = { note_id: crypto.randomUUID(), ...f, password_enc: await encryptPassword(String(input.password ?? "")), sort_order: String(sort), created_by: actor, created_at: now, updated_by: actor, updated_at: now };
    await appendRows(NOTES_TAB, [toRow(headers, rec)]);
    await writeAudit(actor, "prod_note_create", "prod_note", rec.note_id, `เพิ่ม ${f.system_name}`);
    return pub(rec);
  }
  const cur = t.rows.find((r) => r.note_id === id);
  if (!cur) throw new NoteError(404, "ไม่พบรายการ (อาจถูกลบ)", "NOT_FOUND");
  // รหัสผ่าน: ช่องว่าง = คงเดิม · clear_password = ลบรหัสผ่าน
  const password_enc = input.clear_password === true ? "" : String(input.password ?? "") ? await encryptPassword(String(input.password)) : cur.password_enc;
  const rec = { ...cur, ...f, password_enc, updated_by: actor, updated_at: now };
  if (!(await updateById(NOTES_TAB, headers, "note_id", id, toRow(headers, rec)))) throw new NoteError(409, "บันทึกไม่สำเร็จ ลองใหม่", "CONFLICT");
  await writeAudit(actor, "prod_note_update", "prod_note", id, `แก้ ${f.system_name}${password_enc !== cur.password_enc ? " (เปลี่ยนรหัสผ่าน)" : ""}`);
  return pub(rec);
}
export async function deleteNote(id: string, actor: string) {
  await needD1();
  const cur = (await readTab(NOTES_TAB)).rows.find((r) => r.note_id === id);
  if (!cur) throw new NoteError(404, "ไม่พบรายการ (อาจถูกลบ)", "NOT_FOUND");
  await deleteWhere(NOTES_TAB, "note_id", id);
  await writeAudit(actor, "prod_note_delete", "prod_note", id, `ลบ ${cur.system_name}`);
  return { ok: true };
}

/** Super Admin ตั้ง / เปลี่ยนรหัสเปิดดู */
export async function setViewCode(code: unknown, actor: string) {
  const c = String(code ?? "");
  if (c.length < 6 || c.length > 100) throw new NoteError(422, "รหัสเปิดดูต้องยาว 6–100 ตัวอักษร", "VALIDATION", { code: "6–100 ตัวอักษร" });
  const t = await readTab("APP_CONFIG"), now = new Date().toISOString();
  const row = { config_key: CODE_KEY, config_value: await hashCode(c), description: "รหัสเปิดดูรหัสผ่านใน Production note (เก็บเป็นแฮช PBKDF2)", updated_at: now };
  const had = t.rows.some((r) => r.config_key === CODE_KEY);
  if (!(had && (await updateById("APP_CONFIG", t.headers, "config_key", CODE_KEY, toRow(t.headers, { ...t.rows.find((r) => r.config_key === CODE_KEY), ...row }))))) await appendRows("APP_CONFIG", [toRow(t.headers, row)]);
  await writeAudit(actor, "prod_note_code", "config", CODE_KEY, had ? "เปลี่ยนรหัสเปิดดู Production note" : "ตั้งรหัสเปิดดู Production note");
  return { ok: true };
}

/** ใส่รหัสเปิดดู → ถูก = cookie 5 นาที · ผิดเกิน 5 ครั้งใน 15 นาที = ล็อก */
export async function unlock(code: unknown, actor: string) {
  const t = await readTabs(["APP_CONFIG", "AUDIT_LOG"]);
  const stored = t.APP_CONFIG.rows.find((r) => r.config_key === CODE_KEY)?.config_value;
  if (!stored) throw new NoteError(409, "Super Admin ยังไม่ได้ตั้งรหัสเปิดดู (ตั้งค่า → ตั้งค่าระบบ)", "NO_CODE");
  const since = new Date(Date.now() - FAIL_WINDOW_MS).toISOString(), me = actor.toLowerCase();
  const fails = t.AUDIT_LOG.rows.filter((r) => r.action === "prod_note_unlock_fail" && r.actor_email.toLowerCase() === me && r.timestamp >= since).length;
  if (fails >= MAX_FAILS) throw new NoteError(429, "ใส่รหัสผิดหลายครั้ง — ลองใหม่ใน 15 นาที", "LOCKED");
  if (!(await checkCode(String(code ?? ""), stored))) {
    await writeAudit(actor, "prod_note_unlock_fail", "prod_note", "-", "ใส่รหัสเปิดดูผิด");
    throw new NoteError(403, `รหัสไม่ถูกต้อง (เหลือ ${Math.max(0, MAX_FAILS - fails - 1)} ครั้ง)`, "BAD_CODE", { code: "รหัสไม่ถูกต้อง" });
  }
  await writeAudit(actor, "prod_note_unlock", "prod_note", "-", `เปิดดูรหัสผ่าน ${UNLOCK_MINUTES} นาที`);
  return unlockToken(actor);
}

/** ขอดูรหัสผ่านของแถวหนึ่ง (ต้องเปิดดูอยู่) · บันทึกทุกครั้ง */
export async function revealPassword(id: string, actor: string) {
  await needD1();
  const cur = (await readTab(NOTES_TAB)).rows.find((r) => r.note_id === id);
  if (!cur) throw new NoteError(404, "ไม่พบรายการ (อาจถูกลบ)", "NOT_FOUND");
  const password = await decryptPassword(cur.password_enc);
  await writeAudit(actor, "prod_note_reveal", "prod_note", id, `ดูรหัสผ่าน ${cur.system_name}`);
  return { password };
}
