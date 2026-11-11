import { requirePage } from "@/lib/page-guard";
import { canDelete, canEditSales } from "@/lib/roles";
import { DevelopersManager } from "@/components/DevelopersManager";

export default async function DevelopersPage() {
  const role = await requirePage("/work/developers");
  return (
    <section className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Developer</h1>
        <p className="text-sm text-slate-500">ลูกค้าโครงการหมู่บ้านที่ซื้อโฆษณา · Product ที่ใช้อยู่และวันหมดอายุ · มีข้อมูลผู้ติดต่อ เข้าถึงได้เฉพาะ Admin และ AE</p>
      </div>
      <DevelopersManager canDelete={canDelete(role)} readOnly={!canEditSales(role)} />
    </section>
  );
}
