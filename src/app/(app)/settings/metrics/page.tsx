import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SECTIONS } from "@/lib/guides/metrics";

// สารบัญคำอธิบายตัวเลข — กดหัวข้อเพื่อเปิดหน้าของหัวข้อนั้น (ไม่แสดงตารางทั้งหมดในหน้าเดียว)
const TOPICS = [{ id: "states", title: "สถานะของตัวเลข", desc: "รอข้อมูล · N/A · ข้อมูลไม่ครบ · Missing Data · % เปรียบเทียบ" }];

export default async function MetricsIndex() {
  if (!(await auth())?.user?.role) redirect("/");
  const topics = [...TOPICS, ...SECTIONS.map((s) => ({ id: s.id, title: s.title, desc: `${s.items.length} ตัวเลข · ${s.items.slice(0, 3).map((m) => m.name).join(", ")}${s.items.length > 3 ? " ..." : ""}` }))];
  return (
    <section className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">คำอธิบายตัวเลข</h1>
        <p className="text-sm text-slate-500">เลือกหัวข้อเพื่อดูที่มา สูตร และวิธีใช้ตัวเลข · วิธีดาวน์โหลดไฟล์ดูที่ <Link href="/settings/import-guide" className="underline">คู่มือนำเข้าข้อมูล</Link></p>
      </div>
      <nav aria-label="สารบัญ" className="grid gap-3 sm:grid-cols-2">
        {topics.map((t) => (
          <Link key={t.id} href={`/settings/metrics/${t.id}`} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-400 hover:bg-slate-50">
            <div className="font-semibold">{t.title}</div>
            <div className="mt-1 text-xs text-slate-500">{t.desc}</div>
          </Link>
        ))}
      </nav>
    </section>
  );
}
