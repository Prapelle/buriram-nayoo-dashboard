/**
 * ความคิดเห็นในการ์ด Content (27/11/2026) — ค่าคงที่ล้วน (ใช้ได้ทั้งฝั่ง server และหน้าเว็บ)
 * ตารางเกิดบน D1: CONTENT_COMMENTS (ข้อความ) · CONTENT_COMMENT_FILES (ไฟล์แนบ — ตัวไฟล์อยู่ใน Cloudflare KV binding ACC_FILES)
 */
export const COMMENTS_TAB = "CONTENT_COMMENTS";
export const COMMENT_FILES_TAB = "CONTENT_COMMENT_FILES";
export const COMMENT_COLUMNS = ["comment_id", "card_id", "author", "body", "created_at", "edited_at"];
export const COMMENT_FILE_COLUMNS = ["file_id", "comment_id", "card_id", "file_name", "mime", "size", "storage_key", "uploaded_by", "uploaded_at"];
export const COMMENT_DEFS = [{ name: COMMENTS_TAB, headers: COMMENT_COLUMNS }, { name: COMMENT_FILES_TAB, headers: COMMENT_FILE_COLUMNS }];

export const MAX_COMMENT_CHARS = 2000;
export const MAX_COMMENT_FILES = 5;
export const MAX_COMMENT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_COMMENT_TOTAL_BYTES = 25 * 1024 * 1024;
/** นามสกุลที่แนบได้ → ชนิดไฟล์ที่เก็บ (ไม่เชื่อชนิดที่เบราว์เซอร์ส่งมา) */
export const COMMENT_FILE_TYPES: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  pdf: "application/pdf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
export const COMMENT_ACCEPT = Object.keys(COMMENT_FILE_TYPES).map((x) => `.${x}`).join(",");
export const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name.trim())?.[1] ?? "").toLowerCase();
export const mimeOfName = (name: string) => COMMENT_FILE_TYPES[extOf(name)] ?? "";
export const isImageMime = (m: string) => m === "image/jpeg" || m === "image/png" || m === "image/webp";
/** เขียนได้: ทุก Role ยกเว้น Observer · ลบของคนอื่นได้: Super Admin / Admin */
export const COMMENT_ROLES = ["super_admin", "admin", "ae", "marketing", "production"];
export const COMMENT_MOD_ROLES = ["super_admin", "admin"];
