import { requirePage } from "@/lib/page-guard";
import { PerfReport } from "@/components/PerfReport";

export default async function PerformancePage() {
  await requirePage("/performance");
  return (
    <section className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">ประสิทธิภาพรายคน</h1>
        <p className="text-sm text-slate-500">ผลงานรายเดือนเทียบเป้าหมาย · นับอัตโนมัติจากการย้ายการ์ดในแต่ละบอร์ด ไม่ต้องกดนับเอง</p>
      </div>
      <PerfReport />
    </section>
  );
}
