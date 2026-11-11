import { canEditSales } from "@/lib/roles";
import { requirePage } from "@/lib/page-guard";
import { CustomersManager } from "@/components/CustomersManager";

export default async function CustomersPage() {
  const role = await requirePage("/account/customers");
  return (
    <section className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">รายชื่อลูกค้า</h1>
        <p className="text-sm text-slate-500">ลูกค้าชุดเดียวกับหน้า Developer / Home Builder · ผู้ติดต่อ เบอร์โทร ที่อยู่ และเลขประจำตัวผู้เสียภาษีที่นี่จะแสดงบนเอกสารบัญชีอัตโนมัติ</p>
      </div>
      <CustomersManager isSuper={role === "super_admin"} readOnly={!canEditSales(role)} />
    </section>
  );
}
