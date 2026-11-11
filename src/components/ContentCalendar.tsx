"use client";
import { useMemo, useState } from "react";

/**
 * ปฏิทินของบอร์ด Content (10/11/2026)
 * - การ์ดอยู่ที่ "วันลง" (วันลง + วันที่รอลูกค้า = planned_eff) · เผยแพร่แล้ว = วันเผยแพร่จริง
 * - วันครบกำหนดรายงาน = ป้ายสีส้ม (ดูอย่างเดียว)
 * - ลากการ์ดที่ยังไม่เผยแพร่ไปวางวันอื่น = เลื่อนวันลง · ลากจากช่อง "ยังไม่กำหนดวัน" = ตั้งวันลง
 * - มือถือแสดงเป็นรายการตามวัน (เลื่อนวันผ่านฟอร์มแก้ไขการ์ด)
 */
type CalCard = Record<string, string> & { wait: { planned_eff: string; report_due_eff: string } };

const DONE_REPORT = new Set(["รายงานเสร็จแล้ว", "ส่งให้ลูกค้าแล้ว"]);
const WD = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
/** วันที่ตามเวลาไทยของค่าที่อาจเป็นวันที่ล้วนหรือ timestamp */
const bkkDay = (v: string) => (!v ? "" : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date(new Date(v).getTime() + 7 * 3600_000).toISOString().slice(0, 10));
const monthLabel = (y: number, m: number) => new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m, 15)));
const dayLabel = (d: string) => new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short" }).format(new Date(d + "T12:00:00Z"));

export const calDayOf = (c: CalCard) => (c.published_at ? bkkDay(c.published_at) : c.wait.planned_eff || c.planned_date || "");
const reportDayOf = (c: CalCard) => (!c.report_sent_at && !DONE_REPORT.has(c.stage) ? c.wait.report_due_eff || c.report_due_date || "" : "");

export function ContentCalendar<C extends CalCard>({ cards, today, stageCls, busy, readOnly = false, onOpen, onReschedule }: {
  cards: C[]; today: string; stageCls: Record<string, string>; busy: Set<string>; readOnly?: boolean;
  onOpen: (c: C) => void; onReschedule: (c: C, day: string) => void;
}) {
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [dragId, setDragId] = useState(""); const [over, setOver] = useState("");
  const [open, setOpen] = useState(""); // วันที่กดดูทั้งหมด

  const { posts, reports, unscheduled } = useMemo(() => {
    const posts = new Map<string, C[]>(), reports = new Map<string, C[]>(), unscheduled: C[] = [];
    for (const c of cards) {
      const d = calDayOf(c);
      if (d) (posts.get(d) ?? posts.set(d, []).get(d)!).push(c); else unscheduled.push(c);
      const r = reportDayOf(c);
      if (r) (reports.get(r) ?? reports.set(r, []).get(r)!).push(c);
    }
    return { posts, reports, unscheduled };
  }, [cards]);

  // ตารางเดือน: เริ่มวันจันทร์ · ช่องก่อน/หลังเดือนเว้นว่าง
  const first = new Date(Date.UTC(ym.y, ym.m, 1)), lead = (first.getUTCDay() + 6) % 7, days = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(ym.y, ym.m, i + 1))];
  while (cells.length % 7) cells.push(null);
  const shift = (n: number) => setYm(({ y, m }) => { const d = new Date(Date.UTC(y, m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const inMonth = (d: string) => d.startsWith(`${ym.y}-${pad(ym.m + 1)}-`);
  const byId = (id: string) => cards.find((c) => c.card_id === id);
  const drop = (day: string) => { const c = byId(dragId); setDragId(""); setOver(""); if (c && !readOnly && !c.published_at && calDayOf(c) !== day) onReschedule(c, day); };

  const item = (c: C, compact: boolean) => {
    const movable = !readOnly && !c.published_at && !busy.has(c.card_id);
    return (
      <button key={c.card_id} type="button" onClick={() => onOpen(c)} draggable={movable}
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.card_id); e.dataTransfer.effectAllowed = "move"; setDragId(c.card_id); }} onDragEnd={() => { setDragId(""); setOver(""); }}
        title={`${c.card_code} ${c.title} · ${c.stage}${c.published_at ? " · เผยแพร่แล้ว" : movable ? " · ลากเพื่อเลื่อนวันลง" : ""}`}
        className={`flex w-full items-center gap-1.5 rounded bg-white px-1.5 py-1 text-left text-xs shadow-sm ${c.sales_tag === "TRUE" ? "border-2 border-red-500" : "border border-slate-200"} ${movable ? "cursor-grab active:cursor-grabbing" : ""} ${busy.has(c.card_id) || dragId === c.card_id ? "opacity-40" : ""}`}>
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${stageCls[c.stage] ?? "bg-slate-200"}`} />
        <span className={`min-w-0 flex-1 ${compact ? "truncate" : ""}`}>{c.published_at && "✓ "}{c.title}</span>
        {!compact && <span className="shrink-0 text-[11px] text-slate-500">{c.stage}</span>}
      </button>);
  };
  const reportTag = (c: C) => (
    <button key={"r" + c.card_id} type="button" onClick={() => onOpen(c)} title={`ครบกำหนดรายงาน ${c.card_code} ${c.title}`}
      className="w-full truncate rounded bg-orange-100 px-1.5 py-0.5 text-left text-[11px] text-orange-800">📄 รายงาน {c.title}</button>);

  const MAX = 3;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => shift(-1)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50" aria-label="เดือนก่อน">‹</button>
        <h2 className="min-w-40 text-center text-lg font-semibold">{monthLabel(ym.y, ym.m)}</h2>
        <button type="button" onClick={() => shift(1)} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50" aria-label="เดือนถัดไป">›</button>
        <button type="button" onClick={() => setYm({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })} className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50">วันนี้</button>
        <span className="ml-auto hidden text-xs text-slate-500 md:inline">{readOnly ? "" : "ลากการ์ดไปวันอื่นเพื่อเลื่อนวันลง · "}✓ = เผยแพร่แล้ว (เลื่อนไม่ได้) · 📄 = ครบกำหนดรายงาน</span>
      </div>

      {unscheduled.length > 0 && (
        <details className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2" open={unscheduled.length <= 6}>
          <summary className="cursor-pointer text-sm font-medium text-slate-700">ยังไม่กำหนดวันลง ({unscheduled.length}) {!readOnly && <span className="hidden font-normal text-slate-500 md:inline">— ลากไปวางในปฏิทินเพื่อตั้งวันลง</span>}</summary>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">{unscheduled.map((c) => item(c, true))}</div>
        </details>)}

      {/* จอใหญ่: ตารางเดือน */}
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 md:block">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-600">
          {WD.map((w, i) => <div key={w} className={`py-1.5 ${i === 6 ? "text-slate-400" : ""}`}>{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            if (!d) return <div key={"x" + i} className="min-h-28 border-b border-r border-slate-100 bg-slate-50/50" />;
            const ps = posts.get(d) ?? [], rs = reports.get(d) ?? [], all = open === d;
            const sunday = i % 7 === 6;
            return (
              <div key={d} data-day={d} onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(d); } }} onDragLeave={() => setOver((o) => (o === d ? "" : o))} onDrop={(e) => { e.preventDefault(); drop(d); }}
                className={`min-h-28 space-y-1 border-b border-r border-slate-100 p-1 ${sunday ? "bg-slate-50" : "bg-white"} ${over === d ? "ring-2 ring-inset ring-brand-600" : ""}`}>
                <div className={`flex items-center justify-between text-xs ${d === today ? "font-bold text-brand-700" : sunday ? "text-slate-400" : "text-slate-500"}`}>
                  <span className={d === today ? "rounded-full bg-brand-600 px-1.5 text-white" : ""}>{Number(d.slice(8))}</span>
                  {ps.length > 0 && <span className="text-[10px] text-slate-400">{ps.length}</span>}
                </div>
                {(all ? ps : ps.slice(0, MAX)).map((c) => item(c, true))}
                {ps.length > MAX && <button type="button" onClick={() => setOpen(all ? "" : d)} className="w-full text-left text-[11px] text-sky-700 underline">{all ? "ย่อ" : `+${ps.length - MAX} รายการ`}</button>}
                {rs.map(reportTag)}
              </div>);
          })}
        </div>
      </div>

      {/* มือถือ: รายการตามวันของเดือนนี้ */}
      <div className="space-y-2 md:hidden">
        {(() => {
          const ds = [...new Set([...posts.keys(), ...reports.keys()])].filter(inMonth).sort();
          if (!ds.length) return <p className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-500">ไม่มีงานในเดือนนี้</p>;
          return ds.map((d) => (
            <div key={d} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className={`mb-1 text-sm font-semibold ${d === today ? "text-brand-700" : ""}`}>{dayLabel(d)}{d === today && " · วันนี้"}</div>
              <div className="space-y-1">{(posts.get(d) ?? []).map((c) => item(c, false))}{(reports.get(d) ?? []).map(reportTag)}</div>
            </div>));
        })()}
        {!readOnly && <p className="text-xs text-slate-500">เลื่อนวันลงบนมือถือ: กดการ์ด → แก้ "วันลง (กำหนดเผยแพร่)"</p>}
      </div>
    </div>
  );
}
