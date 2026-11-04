import Link from "next/link";
import { requirePage } from "@/lib/page-guard";
import { listDocs, AccError } from "@/lib/account-service";
import { DOC_LABEL, DOC_TYPES, money, summarize, thaiDate } from "@/lib/account";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";

/** สรุปบัญชี: จำนวนเอกสารแต่ละชนิด · ยอดรอเรียกเก็บ (แยกตามขั้น) · ยอดรับแล้วจากใบเสร็จ */
export default async function AccountSummaryPage() {
  await requirePage("/account/summary");
  let data: Awaited<ReturnType<typeof listDocs>>;
  try { data = await listDocs(); } catch (e) {
    if (!(e instanceof AccError)) logError("page /account/summary", e);
    return <section><h1 className="mb-4 text-[26px] font-bold tracking-tight">สรุปบัญชี</h1><p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {e instanceof Error ? e.message.slice(0, 200) : "ไม่ทราบสาเหตุ"}</p></section>;
  }
  const s = summarize(data.docs, data.today);
  const Card = ({ title, value, note, tone = "" }: { title: string; value: string; note?: string; tone?: string }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-500">{title}</div><div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>{note && <div className="mt-1 text-xs text-slate-500">{note}</div>}</div>
  );
  const rows = [["quotation", "ใบเสนอราคา — รอลูกค้าตกลง / ยังไม่วางบิล"], ["billing", "ใบวางบิล — วางบิลแล้ว รอออกใบแจ้งหนี้ / รอชำระ"], ["invoice", "ใบแจ้งหนี้ — รอชำระ"]] as const;
  return (
    <section className="max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-[26px] font-bold tracking-tight">สรุปบัญชี</h1><p className="text-sm text-slate-500">ณ วันที่ {thaiDate(data.today)} · หนึ่งสายเอกสาร (เสนอราคา → วางบิล → แจ้งหนี้) นับเป็นหนึ่งงาน ใช้ใบล่าสุดเป็นยอดที่ต้องเก็บ ไม่นับซ้ำ</p></div>
        <div className="flex gap-2 text-sm"><Link href="/account/new" className="rounded-lg bg-brand-600 px-4 py-1.5 font-medium text-white hover:bg-brand-700">ออกใบเสนอราคา</Link><Link href="/account" className="rounded-md border border-slate-300 px-4 py-1.5">เอกสารทั้งหมด</Link></div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="ยอดรอเรียกเก็บทั้งหมด" value={`฿${money(s.outstanding)}`} note="ยอดสุทธิหลังหัก ณ ที่จ่าย − ที่ชำระแล้ว" tone="text-brand-700" />
        <Card title="เกินกำหนดชำระ" value={`฿${money(s.overdue.amount)}`} note={`${s.overdue.count} งาน (ใบวางบิล/แจ้งหนี้ที่ครบกำหนดแล้ว)`} tone={s.overdue.count ? "text-red-600" : ""} />
        <Card title="รับชำระแล้ว (จากใบเสร็จ)" value={`฿${money(s.received)}`} note={`${s.counts.receipt} ใบเสร็จ`} tone="text-green-700" />
        <Card title="เอกสารที่ยกเลิก" value={String(s.cancelled)} note="ไม่นับรวมในตัวเลขอื่น" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">จำนวนเอกสารแต่ละชนิด</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {DOC_TYPES.map((t) => <div key={t} className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{DOC_LABEL[t]}</div><div className="text-2xl font-bold tabular-nums">{s.counts[t]}</div></div>)}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <h2 className="p-4 pb-2 text-sm font-semibold">ยอดรอเรียกเก็บแยกตามขั้น (นับตามใบล่าสุดของแต่ละงาน)</h2>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="p-2 pl-4">ขั้น</th><th className="text-right">จำนวนงาน</th><th className="text-right">มูลค่ารวม (สุทธิ)</th><th className="pr-4 text-right">รอเรียกเก็บ</th></tr></thead>
          <tbody>
            {rows.map(([k, label]) => <tr key={k} className="border-t border-slate-100"><td className="p-2 pl-4">{label}</td><td className="text-right tabular-nums">{s.stages[k].count}</td><td className="text-right tabular-nums">{money(s.stages[k].amount)}</td><td className="pr-4 text-right font-medium tabular-nums">{money(s.stages[k].outstanding)}</td></tr>)}
            <tr className="border-t border-slate-300 font-semibold"><td className="p-2 pl-4">รวม</td><td className="text-right tabular-nums">{rows.reduce((n, [k]) => n + s.stages[k].count, 0)}</td><td className="text-right tabular-nums">{money(rows.reduce((n, [k]) => n + s.stages[k].amount, 0))}</td><td className="pr-4 text-right tabular-nums">{money(s.outstanding)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">ดูยอดขายตามรายงานบัญชีที่หน้า <Link href="/account/revenue" className="underline">Revenue</Link> · ยอดรับชำระจากระบบบัญชีรายเดือนอยู่ด้านบนของหน้านั้น</p>
    </section>
  );
}
