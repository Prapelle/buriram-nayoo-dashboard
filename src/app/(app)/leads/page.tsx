import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LeadsManager } from "@/components/LeadsManager";

export default async function LeadsPage() {
  const s = await auth();
  const role = s?.user?.role;
  if (role !== "admin" && role !== "sales") redirect("/");
  return (
    <section className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Leads</h1>
        <p className="text-sm text-slate-500">บันทึกและติดตามลูกค้า · มีข้อมูลส่วนบุคคล เข้าถึงได้เฉพาะ Admin และ Sales</p>
      </div>
      <LeadsManager />
    </section>
  );
}
