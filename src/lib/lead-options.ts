// ตัวเลือกของ Lead (Phase 4) แยกไฟล์เพื่อให้ Dashboard ใช้ได้โดยไม่วนอ้างอิงกับ leads.ts
export const NEEDS = ["ซื้อ", "ขาย", "เช่า", "สร้าง"];
export const BUY_NEEDS = ["ซื้อ", "เช่า", "สร้าง"]; // ใช้ Buy Status
export const SELL_NEEDS = ["ขาย"]; // ใช้ Sell Status
export const BUY_STATUS = ["Hot", "Warm", "Cold", "Archive", "Close"];
// ลำดับนี้คือลำดับคอลัมน์บนหน้า Seller Leads (ผู้ใช้กำหนด 30/10/2026)
export const SELL_STATUS = ["รอติดต่อ", "สนใจขาย", "นัดทำสัญญา", "เซ็นสัญญา", "สัญญาเปิด", "บ้านไม่พร้อมขาย", "ขายแล้ว", "ยกเลิก"];
/** Lead ขายที่ยังไม่มี Sell Status ถือว่าอยู่ขั้นแรก */
export const SELL_DEFAULT = "รอติดต่อ";
// ลำดับนี้คือลำดับคอลัมน์บนหน้า Buyer Leads (ผู้ใช้กำหนด 30/10/2026)
export const CALL_STATUS = ["รอติดต่อ", "ติดต่อได้แล้ว", "รอเข้าชม", "เข้าชมแล้ว", "จอง", "ซื้อสำเร็จ", "กู้ไม่ผ่าน", "ติดต่อไม่ได้", "ไม่สนใจ"];
export const CALL_DEFAULT = "รอติดต่อ";
/** ชื่อเดิมที่เคยบันทึกไว้ใน Sheet → ชื่อปัจจุบัน (Lead เก่ายังนับและแสดงถูกต้อง · เขียนเป็นชื่อใหม่เมื่อมีการบันทึก) */
const CALL_LEGACY: Record<string, string> = { "ยังไม่ได้โทร": "รอติดต่อ", "เข้าชมโครงการแล้ว": "เข้าชมแล้ว" };
export const normCall = (s: unknown): string => { const v = String(s ?? "").trim(); return CALL_LEGACY[v] ?? v; };
/** Call Status ที่นับเป็น Qualified Lead = คุยกับลูกค้าได้แล้วและเดินหน้าต่อ (ผู้ใช้กำหนด 28/10/2026 · ขยายตามสถานะใหม่ 30/10/2026) */
export const QUALIFIED_CALL = ["ติดต่อได้แล้ว", "รอเข้าชม", "เข้าชมแล้ว", "จอง", "ซื้อสำเร็จ", "กู้ไม่ผ่าน"];
export const CALL_SOLD = "ซื้อสำเร็จ";
export const CALL_VISIT = "เข้าชมแล้ว";
export const isQualifiedCall = (s: unknown) => QUALIFIED_CALL.includes(normCall(s));
export const PROPERTY_TYPES = ["บ้านเดี่ยว", "อาคารพาณิชย์", "ที่ดิน", "ทาวโฮม", "ทรัพย์ลงทุน", "คอนโด"];
export const CONDITIONS = ["มือ 1", "มือ 2", "1 และ 2"];
export const PRICE_RANGES = ["ต่ำกว่าล้าน", "1–1.5 m", "1.5–2.5 m", "2.5–3.5 m", "3.5–5 m", "5 up"];

