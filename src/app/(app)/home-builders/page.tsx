import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DevelopersManager } from "@/components/DevelopersManager";

// Home Builder (1/11/2026): ระบบเดียวกับ Developer (ข้อมูลแยกด้วยคอลัมน์ kind) แต่ไม่มีช่องโครงการหลัก / โครงการรอง
export default async function HomeBuildersPage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "sales") redirect("/home");
  return (
    <section className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Home Builder</h1>
        <p className="text-sm text-slate-500">ลูกค้ารับสร้างบ้านที่ซื้อโฆษณา · Product ที่ใช้อยู่และวันหมดอายุ · มีข้อมูลผู้ติดต่อ เข้าถึงได้เฉพาะ Admin และ Sales</p>
      </div>
      <DevelopersManager kind="home_builder" />
    </section>
  );
}
