"use client";
import { useState } from "react";
import { BACKUP_SCRIPT } from "@/lib/backup-script";

/** วิธีตั้งสำรอง Google Sheet อัตโนมัติ (Apps Script ในบัญชีเจ้าของ Sheet) */
export function BackupGuide() {
  const [copied, setCopied] = useState(false);
  const [show, setShow] = useState(false);
  async function copy() { try { await navigator.clipboard.writeText(BACKUP_SCRIPT); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setShow(true); } }
  return (
    <div className="space-y-3 text-sm">
      <ol className="list-decimal space-y-1 pl-5 text-slate-700">
        <li>เปิด Google Sheet ฐานข้อมูลด้วย <b>บัญชีเจ้าของไฟล์</b> → เมนู <b>ส่วนขยาย (Extensions) → Apps Script</b></li>
        <li>ลบโค้ดเดิมในหน้าต่าง แล้ว<b>วางสคริปต์</b>ด้านล่าง → กด บันทึก (ไอคอนแผ่นดิสก์)</li>
        <li>ที่แถบด้านบน เลือกฟังก์ชัน <b>installWeeklyBackup</b> → กด <b>เรียกใช้ (Run)</b> → อนุญาตสิทธิ์ตามที่ Google ถาม (ครั้งแรกครั้งเดียว)</li>
        <li>ตรวจว่ามีโฟลเดอร์ <b>NAYOO Dashboard Backup</b> ใน Google Drive และมีสำเนาไฟล์แรก — จากนั้นระบบสำรองเองทุกวันจันทร์ ตี 2</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700">{copied ? "คัดลอกแล้ว ✓" : "คัดลอกสคริปต์"}</button>
        <button type="button" onClick={() => setShow(!show)} className="text-sm underline">{show ? "ซ่อนสคริปต์" : "ดูสคริปต์"}</button>
      </div>
      {show && <pre className="max-h-80 overflow-auto rounded-lg bg-brand-600 p-3 text-xs text-slate-100">{BACKUP_SCRIPT}</pre>}
      <p className="text-xs text-slate-500">
        เก็บสำเนาล่าสุด 12 ชุด (ประมาณ 3 เดือน) สำเนาเก่ากว่านั้นย้ายไปถังขยะของ Drive (กู้คืนได้ 30 วัน) — ถ้าต้องการเก็บทั้งหมด แก้ <code>KEEP = 0</code> ·
        สำรองทันทีได้ทุกเมื่อด้วยฟังก์ชัน <b>backupNow</b> · <b>กู้คืน:</b> เปิดสำเนาที่ต้องการ แล้วคัดลอกแท็บที่ต้องการกลับมา หรือแจ้งผู้ดูแลให้เปลี่ยน GOOGLE_SHEET_ID ไปใช้ไฟล์สำเนา
      </p>
    </div>
  );
}
