import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DevelopersManager } from "@/components/DevelopersManager";

export default async function DevelopersPage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "sales") redirect("/");
  return (
    <section className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Developer</h1>
        <p className="text-sm text-slate-500">ลูกค้าโครงการหมู่บ้านที่ซื้อโฆษณา · Product ที่ใช้อยู่และวันหมดอายุ · มีข้อมูลผู้ติดต่อ เข้าถึงได้เฉพาะ Admin และ Sales</p>
      </div>
      <DevelopersManager />
    </section>
  );
}
