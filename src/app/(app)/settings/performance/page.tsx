import { requirePage } from "@/lib/page-guard";
import { PerfSettings } from "@/components/PerfSettings";

export default async function PerfSettingsPage() {
  await requirePage("/settings/performance");
  return (
    <section className="max-w-5xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">ประสิทธิภาพรายคน — ตั้งค่า</h1>
        <p className="text-sm text-slate-500">กำหนดตำแหน่งของแต่ละคน · ตั้งเป้ารายเดือนตามตัวชี้วัดของตำแหน่ง · วันหยุดบริษัท (ใช้นับวันทำการ) · ตัวเลขจริงนับจากการย้ายการ์ดอัตโนมัติ ไม่ต้องกดนับเอง</p>
      </div>
      <PerfSettings />
    </section>
  );
}
