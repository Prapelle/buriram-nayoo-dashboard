// ตัวเลือกของ Lead (Phase 4) แยกไฟล์เพื่อให้ Dashboard ใช้ได้โดยไม่วนอ้างอิงกับ leads.ts
export const NEEDS = ["ซื้อ", "ขาย", "เช่า", "สร้าง"];
export const BUY_NEEDS = ["ซื้อ", "เช่า", "สร้าง"]; // ใช้ Buy Status
export const SELL_NEEDS = ["ขาย"]; // ใช้ Sell Status
export const BUY_STATUS = ["Hot", "Warm", "Cold", "Archive", "Close"];
export const SELL_STATUS = ["นัดทำสัญญา", "ทำสัญญา", "เซ็นสัญญา", "ยกเลิก", "เป็นนายหน้า", "บ้านไม่พร้อมขาย", "ขายแล้ว", "สัญญาเปิด"];
export const CALL_STATUS = ["ยังไม่ได้โทร", "ติดต่อไม่ได้", "ติดต่อได้แล้ว"];
export const PROPERTY_TYPES = ["บ้านเดี่ยว", "อาคารพาณิชย์", "ที่ดิน", "ทาวโฮม", "ทรัพย์ลงทุน", "คอนโด"];
export const CONDITIONS = ["มือ 1", "มือ 2", "1 และ 2"];
export const PRICE_RANGES = ["ต่ำกว่าล้าน", "1–1.5 m", "1.5–2.5 m", "2.5–3.5 m", "3.5–5 m", "5 up"];

