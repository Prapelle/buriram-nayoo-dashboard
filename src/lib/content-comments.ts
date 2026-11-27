/**
 * ความคิดเห็นในการ์ด Content (27/11/2026)
 * - ข้อความ + รูป/ไฟล์แนบ (ไม่เกิน 5 ไฟล์ · ไฟล์ละ 10 MB · รวม 25 MB) · ตัวไฟล์เก็บใน Cloudflare KV (ที่เก็บเดียวกับไฟล์แนบระบบบัญชี)
 * - เขียนได้: ทุก Role ยกเว้น Observer (ตรวจที่ API) · แก้ได้เฉพาะของตัวเอง · ลบ: ของตัวเอง หรือ Super Admin / Admin ลบของคนอื่นได้ (บันทึก Audit)
 * - มีความคิดเห็นใหม่ → แจ้งเตือนผู้ร่วมงานในการ์ด (ไม่แจ้งคนเขียนเอง)
 */
import * as D from "./d1";
import { getD1 } from "./d1";
import { writeAudit } from "./audit";
import { logError } from "./log";
import { normRole } from "./roles";
import { atomicWrite, existingTabs, patchById, readTab, toRow } from "./sheets";
import { notifyCardComment } from "./notify-service";
import {
  COMMENT_COLUMNS, COMMENT_FILE_COLUMNS, COMMENT_FILES_TAB, COMMENT_MOD_ROLES, COMMENTS_TAB, isImageMime, MAX_COMMENT_CHARS, MAX_COMMENT_FILE_BYTES, MAX_COMMENT_FILES, MAX_COMMENT_TOTAL_BYTES, mimeOfName,
} from "./content-comments-schema";

export class CommentError extends Error {
  constructor(public status: number, message: string, public code: string) { super(message); }
}
type Row = Record<string, string>;
export type CommentFileIn = { name: string; data: ArrayBuffer };
export type CommentFile = { file_id: string; file_name: string; mime: string; size: number; is_image: boolean };
export type CommentItem = { comment_id: string; card_id: string; author: string; author_name: string; body: string; created_at: string; edited_at: string; files: CommentFile[] };

/** ที่เก็บไฟล์ตัวเดียวกับระบบบัญชี · import ตอนใช้ (กัน import วน content-service ↔ account-service) */
const fileStore = async () => (await import("./account-service")).fileStore();
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const nameOf = (u: Row) => (u.display_name || u.email.split("@")[0]).trim();

async function db() {
  const d = await getD1();
  if (!d) throw new CommentError(409, "ความคิดเห็นต้องใช้ฐานข้อมูล D1", "NO_D1");
  await existingTabs([COMMENTS_TAB, COMMENT_FILES_TAB]); // สร้างตารางให้อัตโนมัติถ้ายังไม่มี
  return d;
}
async function cardOf(d: D.D1Like, cardId: string) {
  const c = cardId ? (await D.selectWhere(d, "CONTENT_CARDS", { card_id: cardId }))[0] : undefined;
  if (!c) throw new CommentError(404, "ไม่พบการ์ด (อาจถูกลบแล้ว)", "NOT_FOUND");
  return c;
}
async function usersMap() {
  try { return new Map((await readTab("APP_USERS")).rows.filter((u) => u.email).map((u) => [norm(u.email), nameOf(u)])); } catch { return new Map<string, string>(); }
}
const fileOut = (f: Row): CommentFile => ({ file_id: f.file_id, file_name: f.file_name, mime: f.mime, size: Number(f.size) || 0, is_image: isImageMime(f.mime) });
const safeName = (n: string) => n.replace(/[^\p{L}\p{N}._\- ()]/gu, "_").slice(0, 120) || "file";

export async function listComments(cardId: string): Promise<{ comments: CommentItem[] }> {
  const d = await db();
  const [rows, files, names] = await Promise.all([
    D.selectWhere(d, COMMENTS_TAB, { card_id: cardId }, { orderBy: "created_at" }), D.selectWhere(d, COMMENT_FILES_TAB, { card_id: cardId }, { orderBy: "uploaded_at" }), usersMap()]);
  const byC = new Map<string, CommentFile[]>();
  for (const f of files) (byC.get(f.comment_id) ?? byC.set(f.comment_id, []).get(f.comment_id)!).push(fileOut(f));
  return { comments: rows.map((r) => ({ comment_id: r.comment_id, card_id: r.card_id, author: norm(r.author), author_name: names.get(norm(r.author)) ?? r.author.split("@")[0], body: r.body, created_at: r.created_at, edited_at: r.edited_at, files: byC.get(r.comment_id) ?? [] })) };
}

/** ตรวจไฟล์ก่อนเก็บ: จำนวน · ขนาด · นามสกุล (กำหนดชนิดไฟล์จากนามสกุล) */
export function checkFiles(files: CommentFileIn[]) {
  if (files.length > MAX_COMMENT_FILES) throw new CommentError(422, `แนบได้ไม่เกิน ${MAX_COMMENT_FILES} ไฟล์ต่อความคิดเห็น`, "VALIDATION");
  let total = 0;
  return files.map((f) => {
    const mime = mimeOfName(f.name);
    if (!mime) throw new CommentError(422, `ไฟล์ "${f.name}" ไม่รองรับ — แนบได้เฉพาะรูป (JPG / PNG / WEBP), PDF, Word, Excel`, "VALIDATION");
    if (!f.data.byteLength) throw new CommentError(422, `ไฟล์ "${f.name}" ว่างเปล่า`, "VALIDATION");
    if (f.data.byteLength > MAX_COMMENT_FILE_BYTES) throw new CommentError(422, `ไฟล์ "${f.name}" ใหญ่เกิน 10 MB — ไฟล์ใหญ่ให้แปะลิงก์ Google Drive แทน`, "VALIDATION");
    total += f.data.byteLength;
    if (total > MAX_COMMENT_TOTAL_BYTES) throw new CommentError(422, "ไฟล์รวมกันใหญ่เกิน 25 MB", "VALIDATION");
    return { ...f, mime, name: safeName(f.name) };
  });
}

export async function addComment(cardId: string, bodyRaw: unknown, filesIn: CommentFileIn[], actor: string) {
  const body = String(bodyRaw ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length > MAX_COMMENT_CHARS) throw new CommentError(422, `ข้อความยาวเกิน ${MAX_COMMENT_CHARS} ตัวอักษร`, "VALIDATION");
  const files = checkFiles(filesIn);
  if (!body && !files.length) throw new CommentError(422, "พิมพ์ข้อความ หรือแนบไฟล์อย่างน้อย 1 อย่าง", "VALIDATION");
  const d = await db(), card = await cardOf(d, cardId);
  const store = files.length ? await fileStore() : null;
  if (files.length && !store) throw new CommentError(409, "ยังไม่ได้เปิดที่เก็บไฟล์ (Cloudflare KV) — ดูขั้นตอนใน SETUP.md", "STORAGE_NOT_READY");
  const now = new Date().toISOString(), id = crypto.randomUUID(), me = norm(actor);
  const fileRows: Row[] = [];
  try {
    for (const f of files) {
      const fid = crypto.randomUUID(), key = `cmt/${cardId}/${fid}`;
      await store!.put(key, f.data);
      fileRows.push({ file_id: fid, comment_id: id, card_id: cardId, file_name: f.name, mime: f.mime, size: String(f.data.byteLength), storage_key: key, uploaded_by: me, uploaded_at: now });
    }
    const rec: Row = { comment_id: id, card_id: cardId, author: me, body, created_at: now, edited_at: "" };
    await atomicWrite([{ insert: COMMENTS_TAB, rows: [toRow(COMMENT_COLUMNS, rec)] }, { insert: COMMENT_FILES_TAB, rows: fileRows.map((f) => toRow(COMMENT_FILE_COLUMNS, f)) }]);
  } catch (e) {
    // บันทึกไม่สำเร็จ → ลบไฟล์ที่อัปโหลดไปแล้ว ไม่ให้ค้างในที่เก็บ
    for (const f of fileRows) try { await store?.delete?.(f.storage_key); } catch { /* */ }
    throw e;
  }
  const members = (await D.selectWhere(d, "CONTENT_MEMBERS", { card_id: cardId })).map((m) => norm(m.email));
  await notifyCardComment(card, members, actor, body || `แนบไฟล์ ${files.length} ไฟล์`);
  const names = await usersMap();
  const item: CommentItem = { comment_id: id, card_id: cardId, author: me, author_name: names.get(me) ?? me.split("@")[0], body, created_at: now, edited_at: "", files: fileRows.map(fileOut) };
  return { comment: item };
}

async function commentOf(d: D.D1Like, id: string) {
  const c = id ? (await D.selectWhere(d, COMMENTS_TAB, { comment_id: id }))[0] : undefined;
  if (!c) throw new CommentError(404, "ไม่พบความคิดเห็น (อาจถูกลบแล้ว)", "NOT_FOUND");
  return c;
}

/** แก้ข้อความ — เฉพาะคนเขียน (ไฟล์แนบแก้ไม่ได้ ลบแล้วเขียนใหม่) */
export async function editComment(id: string, bodyRaw: unknown, actor: string) {
  const d = await db(), c = await commentOf(d, id);
  if (norm(c.author) !== norm(actor)) throw new CommentError(403, "แก้ได้เฉพาะความคิดเห็นของตัวเอง", "FORBIDDEN");
  const body = String(bodyRaw ?? "").replace(/\r\n/g, "\n").trim();
  if (body.length > MAX_COMMENT_CHARS) throw new CommentError(422, `ข้อความยาวเกิน ${MAX_COMMENT_CHARS} ตัวอักษร`, "VALIDATION");
  const hasFiles = (await D.selectWhere(d, COMMENT_FILES_TAB, { comment_id: id })).length > 0;
  if (!body && !hasFiles) throw new CommentError(422, "ข้อความว่างไม่ได้ — ถ้าไม่ต้องการแล้วให้กดลบ", "VALIDATION");
  const edited_at = new Date().toISOString();
  await patchById(COMMENTS_TAB, "comment_id", id, { body, edited_at });
  return { comment_id: id, body, edited_at };
}

/** ลบ — คนเขียน หรือ Super Admin / Admin · ลบไฟล์แนบในที่เก็บด้วย · บันทึก Audit */
export async function deleteComment(id: string, actor: string, role: string) {
  const d = await db(), c = await commentOf(d, id), mine = norm(c.author) === norm(actor);
  if (!mine && !COMMENT_MOD_ROLES.includes(normRole(role) ?? "")) throw new CommentError(403, "ลบได้เฉพาะความคิดเห็นของตัวเอง (Admin ขึ้นไปลบของคนอื่นได้)", "FORBIDDEN");
  const files = await D.selectWhere(d, COMMENT_FILES_TAB, { comment_id: id });
  await atomicWrite([{ deleteWhere: COMMENT_FILES_TAB, col: "comment_id", value: id }, { deleteWhere: COMMENTS_TAB, col: "comment_id", value: id }]);
  await removeStored(files);
  await writeAudit(actor, "content_comment_delete", "content_card", c.card_id, `${mine ? "" : `ของ ${c.author} · `}${c.body.slice(0, 80)}${files.length ? ` · ไฟล์ ${files.length}` : ""}`);
  return { deleted: id };
}

async function removeStored(files: Row[]) {
  if (!files.length) return;
  const store = await fileStore();
  for (const f of files) try { await store?.delete?.(f.storage_key); } catch (e) { logError("content-comments.removeStored", e); }
}

/** ลบการ์ด → ลบความคิดเห็นและไฟล์แนบของการ์ดนั้นด้วย (best-effort) */
export async function purgeCardComments(cardIds: string[]) {
  const ids = [...new Set(cardIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    const d = await getD1(); if (!d) return;
    await existingTabs([COMMENTS_TAB, COMMENT_FILES_TAB]);
    const files = (await Promise.all(ids.map((id) => D.selectWhere(d, COMMENT_FILES_TAB, { card_id: id })))).flat();
    await atomicWrite(ids.flatMap((id) => [{ deleteWhere: COMMENT_FILES_TAB, col: "card_id", value: id }, { deleteWhere: COMMENTS_TAB, col: "card_id", value: id }]));
    await removeStored(files);
  } catch (e) { logError("content-comments.purge", e); }
}

/** จำนวนความคิดเห็นต่อการ์ด (แสดง 💬 บนบอร์ด) */
export async function commentCounts(): Promise<Map<string, number>> {
  try { const d = await getD1(); return d ? await D.countBy(d, COMMENTS_TAB, "card_id") : new Map(); } catch { return new Map(); }
}

/** เปิดไฟล์แนบ: รูปเปิดดูในหน้าได้ · ไฟล์อื่นดาวน์โหลด */
export async function openCommentFile(fileId: string) {
  const d = await db();
  const f = fileId ? (await D.selectWhere(d, COMMENT_FILES_TAB, { file_id: fileId }))[0] : undefined;
  if (!f) throw new CommentError(404, "ไม่พบไฟล์", "NOT_FOUND");
  const store = await fileStore(), body = store ? await store.get(f.storage_key, "stream") : null;
  if (!body) throw new CommentError(404, "ไม่พบไฟล์ในที่เก็บ", "NOT_FOUND");
  return { body, name: f.file_name, mime: f.mime, inline: isImageMime(f.mime) };
}
