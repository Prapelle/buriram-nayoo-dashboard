import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { GUIDES } from "@/lib/guides/import-guide";

// คู่มือของแพลตฟอร์มเดียว (เปิดจากสารบัญ)
export default async function ImportGuideTopic({ params }: { params: Promise<{ id: string }> }) {
  if (!(await auth())?.user?.role) redirect("/");
  const { id } = await params;
  const i = GUIDES.findIndex((g) => g.id === id);
  if (i < 0) notFound();
  const g = GUIDES[i], prev = GUIDES[i - 1], next = GUIDES[i + 1];
  return (
    <section className="max-w-4xl space-y-4">
      <Link href="/settings/import-guide" className="text-sm underline">← สารบัญคู่มือนำเข้าข้อมูล</Link>
      <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-xl font-bold">{g.title}</h1>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">ดาวน์โหลดจาก</dt><dd>{g.where}</dd></div>
          <div><dt className="text-xs text-slate-500">ผู้นำเข้า</dt><dd>{g.who}</dd></div>
          <div><dt className="text-xs text-slate-500">ความถี่</dt><dd>{g.when}</dd></div>
        </dl>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">{g.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
        {g.files && <div className="text-sm"><div className="text-xs font-semibold text-slate-500">ไฟล์ที่ได้</div><ul className="list-disc pl-5 text-slate-700">{g.files.map((s, k) => <li key={k}>{s}</li>)}</ul></div>}
        {g.tips && <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900"><div className="text-xs font-semibold">ข้อควรระวัง</div><ul className="list-disc pl-5">{g.tips.map((s, k) => <li key={k}>{s}</li>)}</ul></div>}
        <p className="text-sm">ดาวน์โหลดแล้ว นำเข้าที่หน้า <Link href="/import" className="underline">นำเข้า CSV</Link></p>
      </article>
      <nav aria-label="หัวข้อก่อนหน้า/ถัดไป" className="flex justify-between gap-3 text-sm">
        {prev ? <Link href={`/settings/import-guide/${prev.id}`} className="underline">← {prev.title}</Link> : <span />}
        {next && <Link href={`/settings/import-guide/${next.id}`} className="text-right underline">{next.title} →</Link>}
      </nav>
    </section>
  );
}
