/** การสำรองข้อมูลหลังย้ายมา D1: Time Travel ของ Cloudflare (อัตโนมัติ) + ส่งออกไฟล์ด้วย wrangler */
export function BackupGuide() {
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p className="rounded-md bg-amber-50 p-3 text-amber-900">
        ข้อมูลหลักอยู่ที่ <b>Cloudflare D1</b> แล้ว — Google Sheet เดิมหยุดอัปเดตตั้งแต่วันที่สลับ (ใช้เป็นข้อมูลสำรอง ณ วันนั้น) และสคริปต์สำรอง Sheet รายสัปดาห์ <b>ไม่ได้สำรองข้อมูลปัจจุบัน</b> ให้เลิกใช้ได้
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Time Travel (อัตโนมัติ ไม่ต้องตั้งค่า):</b> D1 เก็บประวัติให้ย้อนฐานข้อมูลไปจุดเวลาใดก็ได้ในช่วง 30 วันล่าสุด (แผน Workers Paid) — กู้คืน: <code>npx wrangler d1 time-travel restore nayoo-db --timestamp=&lt;เวลา ISO&gt;</code> (ดูจุดเวลาปัจจุบัน/ย้อนหลังด้วย <code>time-travel info</code>)</li>
        <li><b>ส่งออกเป็นไฟล์เก็บเอง (แนะนำทุกสัปดาห์/ก่อนแก้ใหญ่):</b> <code>npx wrangler d1 export nayoo-db --remote --output=nayoo-backup.sql</code> แล้วเก็บไฟล์ไว้ที่ Drive</li>
        <li>ไฟล์แนบของระบบบัญชีเก็บใน Cloudflare KV (ACC_FILES) แยกต่างหาก ไม่อยู่ใน D1 — ส่งออกด้วย <code>wrangler kv</code> หากต้องการสำรอง</li>
      </ul>
    </div>
  );
}
