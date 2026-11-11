"use client";
import { categoryOf, DEV_EDITABLE, LABEL, productState, type Dev, type DevProduct } from "@/lib/developers";
import { thDate } from "@/lib/thdate";

const dmy = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? thDate(s) : "");
const thb = (n: number) => `฿${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const DATES = new Set(["last_contacted_at", "next_follow_up_at"]);

/** รายละเอียด Developer / Home Builder (อ่านอย่างเดียว) สำหรับหน้าต่างดูข้อมูลบนบอร์ด Sale developer / Sale home builder (11/11/2026) */
export function DevDetails({ dev, products, today, homeBuilder }: { dev: Dev; products: DevProduct[]; today: string; homeBuilder?: boolean }) {
  const keys = DEV_EDITABLE.filter((k) => !["remark", "notes"].includes(k) && !(homeBuilder && k.startsWith("project_")));
  const cur = products.filter((p) => productState(p, today) !== "expired").sort((a, b) => a.end_date.localeCompare(b.end_date));
  const old = products.filter((p) => productState(p, today) === "expired").sort((a, b) => b.end_date.localeCompare(a.end_date));
  const line = (p: DevProduct, past = false) => (
    <li key={p.product_id} className="flex flex-wrap items-center gap-x-3 border-b border-slate-100 py-1.5 text-sm">
      <span className="rounded bg-brand-50 px-1.5 text-xs text-brand-800">{categoryOf(p)}</span><b>{p.product}</b><span>{dmy(p.start_date)} – {dmy(p.end_date)}</span>{p.price_thb && <span className="tabular-nums">{thb(Number(p.price_thb))}</span>}
      {!past && <span className={`rounded px-1.5 text-xs ${productState(p, today) === "future" ? "bg-slate-100" : "bg-green-100"}`}>{productState(p, today) === "future" ? "ยังไม่เริ่ม" : "กำลังใช้"}</span>}
      {p.notes && <span className="text-xs text-slate-500">{p.notes}</span>}
    </li>);
  return (
    <>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {keys.map((k) => <div key={k} className="min-w-0"><dt className="text-xs text-slate-500">{LABEL[k] ?? k}</dt><dd className="break-words">{
          !dev[k] ? <span className="text-slate-300">—</span>
            : k === "nayoo_url" ? <a href={dev[k]} target="_blank" rel="noopener noreferrer" className="break-all text-sky-700 underline">{dev[k]}</a>
            : DATES.has(k) ? dmy(dev[k]) : dev[k]}</dd></div>)}
      </dl>
      {[["Remark", dev.remark], ["Note", dev.notes]].map(([k, v]) => <div key={k} className="text-sm"><div className="text-xs text-slate-500">{k}</div><p className="whitespace-pre-wrap">{v || <span className="text-slate-300">—</span>}</p></div>)}
      <div className="text-sm">
        <div className="text-xs text-slate-500">Product ที่ใช้อยู่</div>
        {cur.length ? <ul>{cur.map((p) => line(p))}</ul> : <p className="text-slate-500">ยังไม่มี Product ที่ใช้อยู่</p>}
        {old.length > 0 && <details className="mt-1"><summary className="cursor-pointer text-xs text-slate-500">Product ที่เคยใช้ ({old.length})</summary><ul className="text-slate-600">{old.map((p) => line(p, true))}</ul></details>}
      </div>
    </>
  );
}
