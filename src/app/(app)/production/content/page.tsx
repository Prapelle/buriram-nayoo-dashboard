import { requirePage } from "@/lib/page-guard";
import { PageHeader } from "@/components/PageHeader";
import { ProductionTabs } from "@/components/ProductionTabs";
import { ContentBoard } from "@/components/ContentBoard";

export default async function ContentPage() {
  const role = await requirePage("/production/content");
  return (
    <section className="max-w-[1600px] space-y-4">
      <PageHeader crumb="Production" title="บอร์ด Content" sub="ผลิต Content ตั้งแต่ไอเดียถึงเผยแพร่ แล้วต่อด้วยรายงานลูกค้า (เฉพาะงานขาย) · เปิด Job แล้วการ์ดสร้างให้ตามจำนวนโพสต์ของ Product" />
      <ProductionTabs active="content" />
      <ContentBoard canDelete={role === "super_admin" || role === "ae"} />
    </section>
  );
}
