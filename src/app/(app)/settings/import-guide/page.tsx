import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GUIDES } from "@/lib/guides/import-guide";

// สารบัญคู่มือนำเข้าข้อมูล — กดหัวข้อเพื่อเปิดหน้าของแพลตฟอร์มนั้น (ไม่แสดงเนื้อหาทั้งหมดในหน้าเดียว)
export default async function ImportGuideIndex() {
  if (!(await auth())?.user?.role) redirect("/");
  return (
    <section className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">คู่มือนำเข้าข้อมูล</h1>
        <p className="text-sm text-slate-500">เลือกแพลตฟอร์มเพื่อดูวิธีดาวน์โหลดไฟล์ แล้วนำเข้าที่หน้า <Link href="/import" className="underline">นำเข้า CSV</Link></p>
      </div>
      <nav aria-label="สารบัญ" className="grid gap-3 sm:grid-cols-2">
        {GUIDES.map((g) => (
          <Link key={g.id} href={`/settings/import-guide/${g.id}`} className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400 hover:bg-slate-50">
            <div className="font-semibold">{g.title}</div>
            <div className="mt-1 text-xs text-slate-500">{g.where}</div>
            <div className="mt-1 text-xs text-slate-500">ผู้นำเข้า: {g.who} · {g.when}</div>
          </Link>
        ))}
      </nav>
      <div className="rounded-lg bg-sky-50 p-4 text-sm text-sky-900">
        <div className="mb-1 font-semibold">ขั้นตอนหลังดาวน์โหลดไฟล์ (ทุกแพลตฟอร์ม)</div>
        <ol className="list-decimal space-y-1 pl-5">
          <li>ไปที่ <Link href="/import" className="underline">นำเข้า CSV</Link> → ลากไฟล์มาวาง หรือกด เลือกไฟล์ (หลายไฟล์พร้อมกันได้)</li>
          <li>ตรวจประเภทรายงานและช่วงวันที่ที่ระบบอ่านได้ → กด <b>ยืนยันนำเข้า</b> (ไฟล์ถัดไปกด <b>ไฟล์ถัดไป</b>)</li>
          <li>ถ้าระบบแจ้งให้ <b>เตรียม Google Sheet</b> ให้ Admin ไปที่ ตั้งค่า → ตั้งค่าระบบ → เตรียม Google Sheet แล้วนำเข้าใหม่</li>
          <li>ไม่ต้องแก้ไฟล์ก่อนนำเข้า (ไม่ต้องเปิดแล้วบันทึกใน Excel)</li>
        </ol>
      </div>
      <p className="text-xs text-slate-500">LINE OA ไม่มีไฟล์นำเข้า — กรอกยอดรายเดือนที่หน้า LINE OA · Leads กรอกที่หน้า Leads</p>
    </section>
  );
}
