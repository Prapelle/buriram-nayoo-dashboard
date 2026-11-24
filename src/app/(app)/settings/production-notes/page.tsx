import { requirePage } from "@/lib/page-guard";
import { canEditMarketing } from "@/lib/roles";
import { ProdNotes } from "@/components/ProdNotes";

export default async function ProductionNotesPage() {
  const role = await requirePage("/settings/production-notes");
  return (
    <section className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Production note</h1>
        <p className="text-sm text-slate-500">ชื่อระบบ / ลิงก์ / ชื่อผู้ใช้ / รหัสผ่าน ที่ทีมใช้ · ทุกคนดูได้ · เพิ่ม / แก้ไขได้เฉพาะ Admin ขึ้นไป · รหัสผ่านต้องใส่รหัสเปิดดูก่อน (เห็นได้ 5 นาที)</p>
      </div>
      <ProdNotes canEdit={canEditMarketing(role)} />
    </section>
  );
}
