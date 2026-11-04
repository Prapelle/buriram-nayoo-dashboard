import { requirePage } from "@/lib/page-guard";
import { PageHeader } from "@/components/PageHeader";
import { ProductionBoard } from "@/components/ProductionBoard";

export default async function ProductionPage() {
  const role = await requirePage("/production");
  return (
    <section className="max-w-7xl space-y-4">
      <PageHeader crumb="Production" title="งาน Production" sub="สร้างอัตโนมัติเมื่อยืนยันชำระเงิน (หรือกดเริ่มงานกรณีมัดจำ) · หนึ่งรายการสินค้าในเอกสาร = หนึ่ง Job" />
      <ProductionBoard canEdit={role === "super_admin" || role === "admin"} />
    </section>
  );
}
