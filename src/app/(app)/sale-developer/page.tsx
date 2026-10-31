import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DevBoard } from "@/components/DevBoard";

export default async function SaleDeveloperPage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "sales") redirect("/");
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Sale developer</h1>
        <p className="text-sm text-slate-500">ติดตามการขายโฆษณาให้โครงการหมู่บ้าน ตาม Status · การ์ดมาจากหน้า Developer · เข้าถึงได้เฉพาะ Admin และ Sales</p>
      </div>
      <DevBoard />
    </section>
  );
}
