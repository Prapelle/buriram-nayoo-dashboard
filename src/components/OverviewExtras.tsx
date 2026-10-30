import Link from "next/link";
import type { Checklist } from "@/lib/data-checklist";
import type { Progress } from "@/lib/target-progress";
import { STALE_DAYS } from "@/lib/lead-insights";

// ส่วนเสริมของหน้า ภาพรวม (30/10/2026): ยอดจริงเทียบเป้า · Checklist ข้อมูลประจำเดือน · รายการติดตามของฝ่ายขาย
const thb = (n: number) => `฿${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const ST: Record<string, string> = { ครบ: "bg-emerald-100 text-emerald-800", บางส่วน: "bg-amber-100 text-amber-900", ยังไม่มี: "bg-red-100 text-red-800" };

function Bar({ label, actual, target, pctV, elapsed, unit, note }: { label: string; actual: number | null; target: number | null; pctV: number | null; elapsed: number; unit: "thb" | "int"; note?: string }) {
  if (target === null) return null;
  const f = (n: number) => (unit === "thb" ? thb(n) : n.toLocaleString("en-US"));
  const w = Math.min(100, pctV ?? 0);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm"><span className="font-medium">{label}</span>
        <span className="tabular-nums">{actual === null ? <span className="text-slate-400">รอข้อมูล</span> : f(actual)} <span className="text-slate-400">/ {f(target)}</span> {pctV !== null && <b className={pctV > 100 && unit === "thb" ? "text-red-700" : ""}>({pctV}%)</b>}</span></div>
      <div className="relative h-2.5 rounded-full bg-slate-100" role="img" aria-label={`${label} ${pctV ?? 0}% ของเป้า`}>
        <div className={`h-2.5 rounded-full ${unit === "thb" && (pctV ?? 0) > 100 ? "bg-red-500" : "bg-slate-800"}`} style={{ width: `${w}%` }} />
        {elapsed > 0 && elapsed < 100 && <div className="absolute top-[-3px] h-4 w-0.5 bg-sky-500" style={{ left: `${elapsed}%` }} title={`ผ่านไปแล้ว ${elapsed}% ของเดือน`} />}
      </div>
      {note && <p className="text-xs text-amber-700">⚠ {note}</p>}
    </div>
  );
}

export function TargetCard({ p, canEdit }: { p: Progress | null; canEdit: boolean }) {
  if (!p) return canEdit ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-500">ยังไม่ได้ตั้งงบ / เป้า Lead ของเดือนนี้ — <Link href="/settings/targets" className="underline">ตั้งเป้าหมายรายเดือน</Link></p> : null;
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between"><h2 className="text-sm font-semibold">เป้าหมาย {p.label}{p.current && <span className="ml-2 font-normal text-slate-500">(ถึงวันนี้ · ผ่านไป {p.elapsedPct}% ของเดือน — เส้นสีฟ้า)</span>}</h2>
        {canEdit && <Link href="/settings/targets" className="text-xs underline">แก้ไขเป้า</Link>}</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Bar label="ค่าโฆษณา vs งบ" actual={p.spend} target={p.budget} pctV={p.spendPct} elapsed={p.current ? p.elapsedPct : 0} unit="thb" note={p.budget !== null ? p.spendNote : undefined} />
        <Bar label="Leads vs เป้า" actual={p.leads} target={p.leadTarget} pctV={p.leadPct} elapsed={p.current ? p.elapsedPct : 0} unit="int" />
      </div>
    </div>
  );
}

export function ChecklistCard({ lists }: { lists: Checklist[] }) {
  if (!lists.length) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {lists.map((c) => {
        const missing = c.items.length - c.done;
        return (
          <details key={c.month} open={missing > 0} className="rounded-lg border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold">ข้อมูลเดือน {c.label}: ครบ {c.done}/{c.items.length} {missing ? <span className="font-normal text-amber-700">· ยังขาด {missing} รายการ</span> : <span className="font-normal text-emerald-700">· ครบทุกแหล่ง</span>}</summary>
            <ul className="mt-3 space-y-1.5 text-sm">{c.items.map((x) => (
              <li key={x.key} className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 rounded px-1.5 text-xs ${ST[x.status]}`}>{x.status}</span>
                <span className="min-w-0"><Link href={x.href} className="font-medium underline-offset-2 hover:underline">{x.name}</Link> <span className="text-xs text-slate-500">{x.detail}</span></span>
              </li>))}</ul>
            <p className="mt-2 text-xs text-slate-500">ช่วงที่ตรวจ {c.from.slice(8)}–{c.to.slice(8)}/{c.to.slice(5, 7)} · กดชื่อรายการเพื่อดูวิธีดาวน์โหลดไฟล์</p>
          </details>
        );
      })}
    </div>
  );
}

export function FollowUpCard({ overdue, today, stale }: { overdue: number; today: number; stale: number }) {
  const box = (n: number, label: string, cls: string, q: string) => (
    <Link href={`/leads?follow=${q}`} className={`rounded-lg border p-3 ${n ? cls : "border-slate-200 bg-white text-slate-500"}`}>
      <div className="text-xs">{label}</div><div className="text-2xl font-bold tabular-nums">{n.toLocaleString("en-US")}</div>
    </Link>
  );
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">ติดตามลูกค้า (ฝ่ายขาย)</h2>
      <div className="grid grid-cols-3 gap-3">
        {box(overdue, "เลยกำหนดติดตาม", "border-red-200 bg-red-50 text-red-900", "overdue")}
        {box(today, "ต้องติดตามวันนี้", "border-amber-200 bg-amber-50 text-amber-900", "today")}
        {box(stale, `ค้างเกิน ${STALE_DAYS} วัน (ไม่มีวันติดตาม)`, "border-slate-300 bg-slate-50 text-slate-800", "stale")}
      </div>
    </div>
  );
}
