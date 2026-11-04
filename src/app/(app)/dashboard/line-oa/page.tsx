import { requirePage } from "@/lib/page-guard";
import { canEditMarketing } from "@/lib/roles";
import { LineOaManager } from "@/components/LineOaManager";

export default async function LineOaPage() {
  const role = await requirePage("/dashboard/line-oa");
  return (
    <section className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">LINE OA</h1>
        <p className="text-sm text-slate-500">บันทึกผลรายเดือน หนึ่งแถวต่อหนึ่งเดือน · ช่องที่ไม่มีข้อมูลให้เว้นว่าง (ไม่ต้องใส่ 0)</p>
      </div>
      <LineOaManager readOnly={!canEditMarketing(role)} />
    </section>
  );
}
