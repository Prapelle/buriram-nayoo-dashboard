import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DevBoard } from "@/components/DevBoard";

export default async function SaleHomeBuilderPage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "sales") redirect("/home");
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Sale home builder</h1>
        <p className="text-sm text-slate-500">ติดตามการขายโฆษณาให้ Home Builder ตาม Status · การ์ดมาจากหน้า Home Builder · เข้าถึงได้เฉพาะ Admin และ Sales</p>
      </div>
      <DevBoard kind="home_builder" />
    </section>
  );
}
