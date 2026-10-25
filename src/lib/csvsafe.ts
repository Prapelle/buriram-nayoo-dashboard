/** ป้องกัน CSV/Formula Injection เมื่อเปิดไฟล์ใน Excel: ข้อความที่ขึ้นต้นด้วย = @ (หรือ + - ที่ไม่ใช่ตัวเลข/เบอร์โทร) จะถูกนำหน้าด้วย ' */
export function csvSafe<T extends string | number>(v: T): T | string {
  if (typeof v !== "string") return v;
  if (/^[=@\t\r]/.test(v) || (/^[+-]/.test(v) && !/^[+-]?[\d\s().,-]+$/.test(v))) return "'" + v;
  return v;
}
