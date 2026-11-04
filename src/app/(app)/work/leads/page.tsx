import { requirePage } from "@/lib/page-guard";
import { canDelete } from "@/lib/roles";
import { LeadsManager } from "@/components/LeadsManager";

export default async function LeadsPage() {
  const role = await requirePage("/work/leads");
  return (
    <section className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Leads</h1>
        <p className="text-sm text-slate-500">บันทึกและติดตามลูกค้า · มีข้อมูลส่วนบุคคล เข้าถึงได้เฉพาะ Admin และ AE</p>
      </div>
      <LeadsManager canDelete={canDelete(role)} />
    </section>
  );
}
