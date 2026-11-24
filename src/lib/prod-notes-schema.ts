/** ตาราง Production note (เกิดบน D1) — แยกไฟล์ไม่ให้ import วนกับ sheets.ts */
export const NOTES_TAB = "PROD_NOTES";
export const NOTE_COLUMNS = ["note_id", "system_name", "link", "username", "password_enc", "sort_order", "created_by", "created_at", "updated_by", "updated_at"];
export const NOTES_DEFS = [{ name: NOTES_TAB, headers: NOTE_COLUMNS }];
