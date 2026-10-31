import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ImportWizard } from "@/components/ImportWizard";

export default async function ImportPage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  return (
    <section className="max-w-6xl space-y-4">
      <h1 className="text-[26px] font-bold tracking-tight">นำเข้า CSV</h1>
      <p className="text-sm text-slate-500">ลากไฟล์ทุกประเภทมาที่ช่องเดียวด้านล่าง ระบบแยกประเภทให้เอง · วิธีดาวน์โหลดไฟล์จากแต่ละแพลตฟอร์ม ดูที่ <Link href="/settings/import-guide" className="underline">คู่มือนำเข้าข้อมูล</Link></p>
      <ImportWizard role={role} />
    </section>
  );
}
