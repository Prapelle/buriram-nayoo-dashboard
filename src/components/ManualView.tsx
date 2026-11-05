import Link from "next/link";
import { MANUALS, type Manual } from "@/lib/guides/manual";

/** คู่มือการใช้งานเป็นขั้นตอน: สารบัญ + หัวข้อ + ขั้นตอนเลขลำดับ (หน้า Server ล้วน ไม่มีสถานะ) */
export function ManualView({ system }: { system: Manual["system"] }) {
  const m = MANUALS[system];
  const name = (t: string, i: number) => `${i + 1}. ${t.replace(/^\d+\.\s*/, "")}`; // เลขหัวข้อเรียงอัตโนมัติ
  return (
    <section className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">{m.title}</h1>
        <p className="mt-1 text-sm text-slate-600">{m.intro}</p>
        <p className="mt-1 text-xs text-slate-500">ผู้ใช้งาน: {m.who}</p>
      </div>
      <nav aria-label="สารบัญ" className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 text-sm font-semibold">สารบัญ</div>
        <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {m.sections.map((s, i) => <li key={s.id}><Link href={`#${s.id}`} className="text-brand-700 underline-offset-2 hover:underline">{name(s.title, i)}</Link></li>)}
        </ol>
      </nav>
      {m.sections.map((s, i) => (
        <article key={s.id} id={s.id} className="scroll-mt-20 space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <header>
            <h2 className="text-lg font-semibold">{name(s.title, i)}</h2>
            {s.where && <p className="mt-0.5 text-xs text-slate-500">ที่ไหน: {s.where}</p>}
            {s.intro && <p className="mt-2 text-sm text-slate-700">{s.intro}</p>}
          </header>
          <ol className="space-y-2 text-sm">
            {s.steps.map((t, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
                <span className="leading-relaxed">{t}</span>
              </li>
            ))}
          </ol>
          {s.tips && s.tips.length > 0 && (
            <ul className="space-y-1 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
              {s.tips.map((t, i) => <li key={i}>💡 {t}</li>)}
            </ul>
          )}
        </article>
      ))}
    </section>
  );
}
