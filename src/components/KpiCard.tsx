import Link from "next/link";
import type { Kpi } from "@/lib/dashboard";
import { changePct } from "@/lib/compare";

const dur = (v: number) => { const m = Math.floor(v / 60), sec = Math.round(v - m * 60); return m ? `${m} นาที ${sec} วินาที` : `${Math.round(v * 10) / 10} วินาที`; };
const show = (fmt: Kpi["fmt"], v: number) => fmt === "sec" ? dur(v) : fmt === "thb" ? `฿${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : fmt === "pct" ? `${v}%` : v.toLocaleString("en-US");

/** การ์ด KPI ใช้ร่วมกันทุกหน้า: รอข้อมูล / N/A / ข้อมูลไม่ครบ / เทียบปีก่อนหรือช่วงก่อน (prev = undefined คือไม่ได้เปรียบเทียบ, null คือไม่มีข้อมูล) */
export function KpiCard({ k, importHref }: { k: Kpi; importHref?: string }) {
  const L = k.prevLabel ?? "ช่วงก่อน";
  let cmp: React.ReactNode = null;
  if (k.prev !== undefined && k.state === "value") {
    if (k.prevBlocked) cmp = <span className="text-slate-400">{L}: เทียบไม่ได้ — {k.prevBlocked}</span>;
    else if (k.prev === null) cmp = <span className="text-slate-400">{L}: Missing Data (ไม่มีข้อมูล)</span>;
    else {
      const c = changePct(k.value, k.prev);
      const d = k.value! - k.prev;
      cmp = <span className={c.pct === null ? "text-slate-500" : d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-slate-500"}>
        {L} {show(k.fmt, k.prev)} · {c.reason === "zero" ? `N/A (${L} = 0)` : `${c.pct! > 0 ? "+" : ""}${c.pct}%`}</span>;
    }
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{k.label}</div>
      {k.state === "value" && <div className="mt-1 text-2xl font-bold tabular-nums">{show(k.fmt, k.value!)}</div>}
      {k.state === "pending" && <div className="mt-1 flex items-baseline gap-2"><span className="text-lg font-semibold text-slate-400">รอข้อมูล</span>{importHref && <Link href={importHref} className="text-xs text-slate-600 underline">นำเข้าข้อมูล →</Link>}</div>}
      {k.state === "excluded" && <div className="mt-1 text-sm text-slate-400">ไม่รวมในตัวกรองนี้</div>}
      {k.state === "restricted" && <div className="mt-1 text-sm text-slate-400">ไม่มีสิทธิ์ดูข้อมูลนี้</div>}
      {k.state === "na" && <div className="mt-1 text-lg font-semibold text-slate-500">N/A</div>}
      {cmp && <div className="mt-1 text-xs tabular-nums">{cmp}</div>}
      {cmp && k.prevIncomplete && <div className="mt-1 inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800" title={k.prevIncomplete}>{L} ข้อมูลไม่ครบ: {k.prevIncomplete}</div>}
      {k.incomplete && k.state === "value" && <div className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900" title={k.incomplete}>ข้อมูลไม่ครบ: {k.incomplete}</div>}
      {k.note && <div className="mt-1 text-xs text-slate-500">{k.note}</div>}
    </div>
  );
}
