import type { Kpi } from "@/lib/dashboard";

const show = (fmt: Kpi["fmt"], v: number) => fmt === "thb" ? `฿${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : fmt === "pct" ? `${v}%` : v.toLocaleString("en-US");

/** การ์ด KPI ใช้ร่วมกันทุกหน้า: รอข้อมูล / N/A / ข้อมูลไม่ครบ / เทียบช่วงก่อน (prev = undefined คือไม่ได้เปรียบเทียบ) */
export function KpiCard({ k }: { k: Kpi & { prev?: number | null } }) {
  let cmp: React.ReactNode = null;
  if (k.prev !== undefined && k.state === "value") {
    if (k.prev === null) cmp = <span className="text-slate-400">ช่วงก่อน: รอข้อมูล</span>;
    else {
      const d = k.value! - k.prev;
      const pct = k.prev === 0 ? null : Math.round((d / Math.abs(k.prev)) * 1000) / 10;
      cmp = <span className={d > 0 ? "text-emerald-700" : d < 0 ? "text-rose-700" : "text-slate-500"}>ช่วงก่อน {show(k.fmt, k.prev)} · {d === 0 ? "เท่าเดิม" : pct === null ? "เพิ่มจาก 0" : `${pct > 0 ? "+" : ""}${pct}%`}</span>;
    }
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{k.label}</div>
      {k.state === "value" && <div className="mt-1 text-2xl font-bold tabular-nums">{show(k.fmt, k.value!)}</div>}
      {k.state === "pending" && <div className="mt-1 text-lg font-semibold text-slate-400">รอข้อมูล</div>}
      {k.state === "excluded" && <div className="mt-1 text-sm text-slate-400">ไม่รวมในตัวกรองนี้</div>}
      {k.state === "restricted" && <div className="mt-1 text-sm text-slate-400">ไม่มีสิทธิ์ดูข้อมูลนี้</div>}
      {k.state === "na" && <div className="mt-1 text-lg font-semibold text-slate-500">N/A</div>}
      {cmp && <div className="mt-1 text-xs tabular-nums">{cmp}</div>}
      {k.incomplete && k.state === "value" && <div className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900" title={k.incomplete}>ข้อมูลไม่ครบ: {k.incomplete}</div>}
      {k.note && <div className="mt-1 text-xs text-slate-500">{k.note}</div>}
    </div>
  );
}
