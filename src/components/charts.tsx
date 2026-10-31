import { thDayMonth, thMonth } from "@/lib/thdate";
// กราฟแบบ SVG/CSS ล้วน เรนเดอร์ฝั่ง Server ไม่ต้องใช้ไลบรารีเพิ่ม
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const dm = (iso: string) => thDayMonth(iso);
const my = (m: string) => thMonth(m);

export function Pending({ text = "รอข้อมูล", href }: { text?: string; href?: string }) {
  return <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">{text}{href && <> · <a href={href} className="font-medium text-brand-700 underline">นำเข้าข้อมูล</a></>}</p>;
}

export function BarList({ items, unit = "", title }: { items: { label: string; value: number }[]; unit?: string; title: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul role="list" aria-label={title} className="space-y-2">
      {items.map((i, idx) => (
        <li key={i.label} className="text-sm">
          <div className="mb-0.5 flex justify-between gap-2"><span className="truncate">{i.label}</span><span className="tabular-nums text-slate-600">{unit}{fmt(i.value)}</span></div>
          <div className="h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-brand-600" style={{ width: `${(i.value / max) * 100}%`, opacity: 1 - Math.min(idx, 4) * 0.15 }} /></div>
        </li>
      ))}
    </ul>
  );
}

export function StackedMonths({ rows }: { rows: { month: string; meta: number; google: number }[] }) {
  const max = Math.max(...rows.map((r) => r.meta + r.google), 1);
  return (
    <div>
      <div role="img" aria-label={`ค่าโฆษณารายเดือน: ${rows.map((r) => `${my(r.month)} Meta ${fmt(r.meta)} Google ${fmt(r.google)}`).join("; ")}`} className="flex h-44 items-end gap-3">
        {rows.map((r) => (
          <div key={r.month} className="flex min-w-10 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs tabular-nums text-slate-600">{fmt(r.meta + r.google)}</span>
            <div className="flex w-full max-w-16 flex-col justify-end overflow-hidden rounded-t-md" style={{ height: `${((r.meta + r.google) / max) * 130}px` }}>
              <div className="bg-brand-300" style={{ height: `${(r.google / (r.meta + r.google || 1)) * 100}%` }} />
              <div className="bg-brand-600" style={{ height: `${(r.meta / (r.meta + r.google || 1)) * 100}%` }} />
            </div>
            <span className="text-xs text-slate-500">{my(r.month)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 flex gap-4 text-xs text-slate-600"><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand-600" />Meta Ads</span><span><i className="mr-1 inline-block h-2 w-2 rounded-sm bg-brand-300" />Google Ads</span></p>
    </div>
  );
}

export function LineChart({ points, label, unit = "" }: { points: { x: string; y: number }[]; label: string; unit?: string }) {
  const W = 560, H = 160, P = 24;
  const max = Math.max(...points.map((p) => p.y), 1);
  const xs = (i: number) => P + (points.length === 1 ? (W - 2 * P) / 2 : (i / (points.length - 1)) * (W - 2 * P));
  const ys = (v: number) => H - P - (v / max) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(p.y).toFixed(1)}`).join(" ");
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${points.map((p) => `${p.x} ${fmt(p.y)}`).join(", ")}`} className="w-full">
      {[0.5, 1].map((f) => <line key={f} x1={P} y1={ys(max * f)} x2={W - P} y2={ys(max * f)} stroke="#E2E8F4" strokeDasharray="3 4" />)}
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#CBD5E6" />
      {points.length > 1 && <path d={`${d} L${xs(points.length - 1).toFixed(1)},${H - P} L${xs(0).toFixed(1)},${H - P} Z`} fill="#2563EB" opacity="0.08" />}
      <path d={d} fill="none" stroke="#2563EB" strokeWidth="2" strokeLinejoin="round" />
      {points.length <= 31 && points.map((p, i) => <circle key={i} cx={xs(i)} cy={ys(p.y)} r="2.5" fill="#2563EB" />)}
      {ticks.map((i) => <text key={i} x={xs(i)} y={H - 6} fontSize="11" textAnchor="middle" fill="#56627F">{points[i].x}</text>)}
      <text x={P} y={14} fontSize="11" fill="#56627F">สูงสุด {unit}{fmt(max)}</text>
    </svg>
  );
}
export { dm, my };
