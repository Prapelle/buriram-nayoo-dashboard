import { requirePage } from "@/lib/page-guard";
import { canEditMarketing, canOverrideImport } from "@/lib/roles";
import { WebsiteManager } from "@/components/WebsiteManager";

export default async function WebsitePage() {
  const role = await requirePage("/dashboard/website");
  return (
    <section className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Website</h1>
        <p className="text-sm text-slate-500">ข้อมูลเว็บไซต์จาก Google Analytics 4 และ Google Search Console — เก็บแยกจากข้อมูล Social และโฆษณา · ตัวเลขสรุปดูที่หน้า Marketing Performance</p>
      </div>
      <WebsiteManager isAdmin={canOverrideImport(role)} readOnly={!canEditMarketing(role)} />
    </section>
  );
}
