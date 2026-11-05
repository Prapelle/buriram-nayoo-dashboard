import { requirePage } from "@/lib/page-guard";
import { PageHeader } from "@/components/PageHeader";
import { ProductionTabs } from "@/components/ProductionTabs";
import { ReportBuilder } from "@/components/ReportBuilder";

export default async function ReportsPage() {
  await requirePage("/production/content/reports");
  return (
    <section className="max-w-6xl space-y-4">
      <ProductionTabs active="reports" />
      <PageHeader crumb="Production" title="รายงานลูกค้า" sub="สรุป Content งานขายที่เผยแพร่แล้วของลูกค้าหนึ่งราย พร้อมผลโพสต์ Facebook · พิมพ์ / บันทึก PDF จากเบราว์เซอร์ หรือโหลด CSV · ติ๊กการ์ดแล้วบันทึกว่าทำรายงานเสร็จ-ส่งแล้ว" />
      <ReportBuilder />
    </section>
  );
}
