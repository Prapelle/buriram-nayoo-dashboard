import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SalesImport } from "@/components/SalesImport";

export default async function SalesImportPage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "sales") redirect("/");
  return (
    <section className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">นำเข้ารายงานยอดขาย (Excel)</h1>
        <p className="text-sm text-slate-500"><Link href="/sales" className="underline">← กลับไปแดชบอร์ดยอดขาย</Link> · ไฟล์รายงานยอดขายรูปแบบ .xlsx จากระบบบัญชี</p>
      </div>
      <SalesImport />
    </section>
  );
}
