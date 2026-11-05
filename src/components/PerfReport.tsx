"use client";
import { Skeleton } from "@/components/Skeleton";
import { Notice, type Msg } from "@/components/Toast";
import { DateInput } from "@/components/DateInput";
import { useCallback, useEffect, useState } from "react";
import { thMonth } from "@/lib/thdate";

type Line = { key: string; label: string; unit: "count" | "baht" | "percent"; how: string; actual: number | null; target: number | null; pct: number | null };
type Person = { email: string; name: string; positions: { key: string; label: string; metrics: Line[] }[]; overall: number | null };
type Report = {
  month: string; canSeeAll: boolean; people: Person[]; duplicateNames: string[];
  unmatched: { name: string; reason: "no_user" | "ambiguous" | "no_member"; source: string; count: number }[];
};
const monthNow = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
const REASON = { no_user: "ไม่ตรงกับชื่อผู้ใช้คนใด", ambiguous: "ชื่อซ้ำกับผู้ใช้หลายคน", no_member: "การ์ดไม่มีผู้ร่วมงาน" } as const;
const num = (n: number | null, unit: Line["unit"]) => (n === null ? "—" : unit === "baht" ? `฿${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : unit === "percent" ? `${n}%` : n.toLocaleString("en-US"));
const tone = (p: number | null) => (p === null ? "bg-slate-300" : p >= 100 ? "bg-green-500" : p >= 70 ? "bg-sky-500" : p >= 40 ? "bg-amber-500" : "bg-red-500");

function Bar({ pct }: { pct: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct === null ? undefined : Math.min(100, pct)}>
      <div className={`h-full rounded-full ${tone(pct)}`} style={{ width: `${pct === null ? 0 : Math.min(100, pct)}%` }} />
    </div>
  );
}

export function PerfReport() {
  const [month, setMonth] = useState(monthNow());
  const [data, setData] = useState<Report | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async (m: string) => {
    setData(null);
    try {
      const r = await fetch(`/api/perf/report?month=${m}`); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดไม่ได้" }); }
  }, []);
  useEffect(() => { load(month); }, [load, month]);

  const people = data ? [...data.people].sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1) || a.name.localeCompare(b.name, "th")) : [];
  return (
    <div className="space-y-4">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <label className="inline-block text-sm"><span className="mb-1 block text-xs text-slate-600">เดือน</span>
        <DateInput month aria-label="เดือน" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>

      {!data ? (msg?.type === "error" ? null : <Skeleton kind={"rows"} />) : (<>
        {data.canSeeAll && data.duplicateNames.length > 0 && (
          <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">ชื่อที่แสดงซ้ำกัน: {data.duplicateNames.join(", ")} — ผลงานของคนชื่อซ้ำนับให้ไม่ได้ แก้ชื่อที่แสดงในหน้า ตั้งค่าระบบ → ผู้ใช้</p>
        )}
        {data.canSeeAll && data.unmatched.length > 0 && (
          <details className="rounded-md bg-amber-50 p-3 text-sm text-amber-900" open>
            <summary className="cursor-pointer font-medium">มีผลงาน {data.unmatched.reduce((a, x) => a + x.count, 0)} รายการที่ยังนับให้ใครไม่ได้</summary>
            <p className="mt-1 text-xs">ชื่อ Staff ในข้อมูลต้องตรงกับ "ชื่อที่แสดง" ของผู้ใช้ — เปิดการ์ดนั้นแล้วเลือก Staff ใหม่จากรายชื่อ</p>
            <ul className="mt-2 space-y-0.5">{data.unmatched.map((x) => <li key={`${x.reason}|${x.source}|${x.name}`}><b>{x.name}</b> · {x.source} · {REASON[x.reason]} · {x.count} รายการ</li>)}</ul>
          </details>
        )}
        {people.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            {data.canSeeAll ? "ยังไม่มีใครถูกกำหนดตำแหน่ง — ให้ Super Admin ตั้งที่ ตั้งค่า → ตั้งเป้าประสิทธิภาพรายคน" : "คุณยังไม่ได้ถูกกำหนดตำแหน่ง — แจ้ง Super Admin เพื่อกำหนดตำแหน่งและเป้าหมาย"}
          </p>
        ) : people.map((p) => (
          <section key={p.email} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div><h2 className="font-semibold">{p.name}</h2><p className="text-xs text-slate-500">{p.positions.map((x) => x.label).join(" · ")}</p></div>
              <div className="text-right"><div className="text-2xl font-bold tabular-nums">{p.overall === null ? "—" : `${p.overall}%`}</div><div className="text-[11px] text-slate-500">ภาพรวม {thMonth(data.month)}</div></div>
            </div>
            {p.positions.map((pos) => (
              <div key={pos.key}>
                {p.positions.length > 1 && <div className="mb-1 text-xs font-semibold text-slate-600">{pos.label}</div>}
                <div className="space-y-2.5">{pos.metrics.map((m) => (
                  <div key={m.key} title={m.how}>
                    <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span>{m.label}</span>
                      <span className="tabular-nums"><b>{num(m.actual, m.unit)}</b>{m.target !== null ? <> / {num(m.target, m.unit)} <span className="text-xs text-slate-500">({m.pct === null ? "—" : `${m.pct}%`})</span></> : <span className="text-xs text-slate-400"> · ยังไม่ตั้งเป้า</span>}</span>
                    </div>
                    <Bar pct={m.pct} />
                  </div>
                ))}</div>
              </div>
            ))}
          </section>
        ))}
      </>)}
    </div>
  );
}
