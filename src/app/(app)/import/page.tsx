import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ImportWizard } from "@/components/ImportWizard";

export default async function ImportPage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  return (
    <section className="max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold">นำเข้า CSV</h1>
      <p className="text-sm text-slate-500">นำเข้าไฟล์ได้ทุกประเภทที่ระบบรองรับจากหน้านี้ (ไฟล์ Website และรายงานยอดขายยังนำเข้าที่หน้า Website / Sales ได้ตามเดิม)</p>
      <ImportWizard role={role} />
    </section>
  );
}
