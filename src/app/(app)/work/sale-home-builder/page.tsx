import { requirePage } from "@/lib/page-guard";
import { DevBoard } from "@/components/DevBoard";

export default async function SaleHomeBuilderPage() {
  const role = await requirePage("/work/sale-home-builder");
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Sale home builder</h1>
        <p className="text-sm text-slate-500">ติดตามการขายโฆษณาให้ Home Builder ตาม Status · การ์ดมาจากหน้า Home Builder · เข้าถึงได้เฉพาะ Super Admin, Admin และ AE</p>
      </div>
      <DevBoard kind="home_builder" />
    </section>
  );
}
