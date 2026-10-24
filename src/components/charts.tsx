// กราฟแบบ SVG/CSS ล้วน เรนเดอร์ฝั่ง Server ไม่ต้องใช้ไลบรารีเพิ่ม
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const dm = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);
const my = (m: string) => (m.length >= 7 ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : m);

export function Pending({ text = "รอข้อมูล" }: { text?: string }) {
  return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{text}</p>;
}

export function BarList({ items, unit = "", title }: { items: { label: string; value: number }[]; unit?: string; title: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul role="list" aria-label={title} className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="text-sm">
          <div className="mb-0.5 flex justify-between gap-2"><span className="truncate">{i.label}</span><span className="tabular-nums text-slate-600">{unit}{fmt(i.value)}</span></div>
          <div className="h-2.5 rounded bg-slate-100"><div className="h-2.5 rounded bg-slate-800" style={{ width: `${(i.value / max) * 100}%` }} /></div>
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
            <div className="flex w-full max-w-16 flex-col justify-end overflow-hidden rounded-t" style={{ height: `${((r.meta + r.google) / max) * 130}px` }}>
              <div className="bg-slate-400" style={{ height: `${(r.google / (r.meta + r.google || 1)) * 100}%` }} />
              <div className="bg-slate-800" style={{ height: `${(r.meta / (r.meta + r.google || 1)) * 100}%` }} />
            </div>
            <span className="text-xs text-slate-500">{my(r.month)}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 flex gap-4 text-xs text-slate-600"><span><i className="mr-1 inline-block h-2 w-2 bg-slate-800" />Meta Ads</span><span><i className="mr-1 inline-block h-2 w-2 bg-slate-400" />Google Ads</span></p>
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
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="#cbd5e1" />
      <path d={d} fill="none" stroke="#1e293b" strokeWidth="2" />
      {points.length <= 31 && points.map((p, i) => <circle key={i} cx={xs(i)} cy={ys(p.y)} r="2.5" fill="#1e293b" />)}
      {ticks.map((i) => <text key={i} x={xs(i)} y={H - 6} fontSize="11" textAnchor="middle" fill="#64748b">{points[i].x}</text>)}
      <text x={P} y={14} fontSize="11" fill="#64748b">สูงสุด {unit}{fmt(max)}</text>
    </svg>
  );
}
export { dm, my };
