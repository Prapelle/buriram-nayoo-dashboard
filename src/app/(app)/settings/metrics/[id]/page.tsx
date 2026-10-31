import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { SECTIONS, STATES } from "@/lib/guides/metrics";

// คำอธิบายตัวเลขของหัวข้อเดียว (เปิดจากสารบัญ)
const ORDER = [{ id: "states", title: "สถานะของตัวเลข" }, ...SECTIONS.map((s) => ({ id: s.id, title: s.title }))];

export default async function MetricsTopic({ params }: { params: Promise<{ id: string }> }) {
  if (!(await auth())?.user?.role) redirect("/");
  const { id } = await params;
  const i = ORDER.findIndex((t) => t.id === id);
  if (i < 0) notFound();
  const prev = ORDER[i - 1], next = ORDER[i + 1];
  const s = SECTIONS.find((x) => x.id === id);
  return (
    <section className="max-w-5xl space-y-4">
      <Link href="/settings/metrics" className="text-sm underline">← สารบัญคำอธิบายตัวเลข</Link>
      {!s ? (
        <article className="space-y-2 rounded-xl border border-slate-200 bg-white p-5">
          <h1 className="text-xl font-bold">สถานะของตัวเลข</h1>
          <dl className="space-y-2 text-sm">{STATES.map(([k, v]) => <div key={k} className="grid gap-1 sm:grid-cols-[12rem_1fr]"><dt className="font-medium">{k}</dt><dd className="text-slate-700">{v}</dd></div>)}</dl>
          <p className="text-xs text-slate-500">หลักการ: ไม่มีข้อมูลจะไม่แสดงเป็น 0 · ทุกสูตรใช้ข้อมูลช่วงวันที่เดียวกัน · ผลรวม Reach / Viewers หลายวันนับคนซ้ำ ไม่ใช่จำนวนคนไม่ซ้ำ · นำเข้าไฟล์เดิมซ้ำไม่ทำให้ตัวเลขเพิ่ม</p>
        </article>
      ) : (
        <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <h1 className="text-xl font-bold">{s.title}{s.page && <Link href={s.page} className="ml-2 text-sm font-normal underline">เปิดหน้า</Link>}</h1>
            {s.intro && <p className="text-sm text-slate-500">{s.intro}</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="border-b text-xs text-slate-500"><th className="py-1.5 pr-3">ตัวเลข</th><th className="pr-3">ที่มา</th><th className="pr-3">สูตร / วิธีคำนวณ</th><th>ใช้ทำอะไร</th></tr></thead>
              <tbody>{s.items.map((m) => (
                <tr key={m.name} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 font-medium">{m.name}</td><td className="py-2 pr-3 text-slate-600">{m.source}</td><td className="py-2 pr-3 text-slate-700">{m.formula}</td><td className="py-2 text-slate-600">{m.use}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </article>
      )}
      <nav aria-label="หัวข้อก่อนหน้า/ถัดไป" className="flex justify-between gap-3 text-sm">
        {prev ? <Link href={`/settings/metrics/${prev.id}`} className="underline">← {prev.title}</Link> : <span />}
        {next && <Link href={`/settings/metrics/${next.id}`} className="text-right underline">{next.title} →</Link>}
      </nav>
    </section>
  );
}
