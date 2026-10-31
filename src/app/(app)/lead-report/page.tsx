import { RangeFields } from "@/components/RangeFields";
import { rangeOf } from "@/lib/range-memory";
import Link from "next/link";
import { Note } from "@/components/Note";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchDashboardData } from "@/lib/dashboard-data";
import { channelLabel } from "@/lib/dashboard";
import { leadsInRange, loanRejectReasons, lostReasons, LOST_REASONS, sideRows, staffPerformance, staffRow, type Side } from "@/lib/lead-insights";

// รายงาน Lead (30/10/2026 · แยก 2 แท็บ 31/10/2026): คนต้องการซื้อ / คนต้องการขาย — ผลงานรายพนักงาน + เหตุผลที่ไม่สำเร็จ — ตัวเลขรวมเท่านั้น (ไม่มีชื่อ/เบอร์ลูกค้า) ทุก Role เปิดได้
export const dynamic = "force-dynamic";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const iso = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const ns = (v: number | null, suffix = "") => (v === null ? "—" : `${v.toLocaleString("en-US")}${suffix}`);
const n = (v: number | null, suffix = "") => (v === null ? <span className="text-slate-400">—</span> : `${v.toLocaleString("en-US")}${suffix}`);

export default async function LeadReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const role = (await auth())?.user?.role;
  if (!role) redirect("/login");
  const sp = await searchParams;
  const side: Side = one(sp.side) === "seller" ? "seller" : "buyer";
  const rg = await rangeOf(sp); const from = rg.from, to = rg.to;
  let all: Record<string, string>[];
  try { all = leadsInRange((await fetchDashboardData(role)).leads, from, to); }
  catch (e) { return <section><h1 className="mb-4 text-[26px] font-bold tracking-tight">รายงาน Lead</h1><p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {e instanceof Error ? e.message.slice(0, 200) : ""}</p></section>; }
  const rows = sideRows(all, side);
  const staff = staffPerformance(all, side);
  const total = staffRow("รวม", rows, side);
  const lost = lostReasons(rows);
  const reasons = LOST_REASONS.map((x) => x.key as string).filter((k) => lost.byReason.some((b) => b.reason === k));
  const loan = side === "buyer" ? loanRejectReasons(rows) : [];
  const inp = "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm";
  const th = "px-2 py-1.5 text-right font-medium";
  const buyer = side === "buyer";
  const qLabel = buyer ? "Qualified" : "Qualified (สัญญา + ขายแล้ว)";
  const wonLabel = buyer ? "ซื้อสำเร็จ" : "ขายแล้ว";
  const qs = (s: Side) => { const u = new URLSearchParams(); if (s === "seller") u.set("side", "seller"); if (from) u.set("from", from); if (to) u.set("to", to); const q = u.toString(); return "/lead-report" + (q ? "?" + q : ""); };
  const cards = (s: typeof total): [string, string][] => [["Lead ที่รับ", ns(s.leads)], [qLabel, `${ns(s.qualified)} (${ns(s.qualifiedPct, "%")})`], ...(buyer ? [["Walk in", ns(s.walkIn)] as [string, string]] : []), [wonLabel, ns(s.won)], ["%Conversion", ns(s.conversionPct, "%")]];

  return (
    <section className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">รายงาน Lead</h1>
        <p className="text-sm text-slate-500">ผลงานรายพนักงาน และเหตุผลที่ไม่สำเร็จ · นับ Lead ตามวันที่รับ{from || to ? "" : " (ทั้งหมด)"} · ตัวเลขรวมเท่านั้น</p>
      </div>
      <nav aria-label="ฝั่งของรายงาน" className="inline-flex gap-1 rounded-xl bg-slate-200/60 p-1">
        {([["buyer", "คนต้องการซื้อ"], ["seller", "คนต้องการขาย"]] as [Side, string][]).map(([k, l]) => (
          <Link key={k} href={qs(k)} prefetch={false} aria-current={side === k ? "page" : undefined}
            className={`h-9 rounded-lg px-4 text-sm leading-9 ${side === k ? "bg-white font-semibold text-brand-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>{l}</Link>))}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        {side === "seller" && <input type="hidden" name="side" value="seller" />}
        <RangeFields from={from} to={to} className={inp} labelFrom="รับ Lead ตั้งแต่" remembered={rg.remembered} />
        <button className="h-9 rounded-lg bg-brand-600 px-4 font-medium text-white hover:bg-brand-700">ใช้ตัวกรอง</button>
        {(from || to) && <Link href={qs(side).replace(/[?&]from=[^&]*|[?&]to=[^&]*/g, "") + (side === "seller" ? "&" : "?") + "range=all"} className="py-1.5 underline">ล้าง</Link>}
      </form>

      <article className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">ผลงานรายพนักงาน — {buyer ? "คนต้องการซื้อ / เช่า / สร้าง" : "คนต้องการขาย"}</h2>
        {!rows.length ? <p className="text-sm text-slate-500">ยังไม่มี Lead ในช่วงนี้</p> : (
          <>
          {/* มือถือ: การ์ดรายพนักงาน */}
          <ul className="space-y-2 md:hidden">{[...staff, total].map((s) => (
            <li key={s.staff} className={`rounded-md border border-slate-200 p-3 text-sm ${s === total ? "bg-slate-50" : ""}`}>
              <div className="font-semibold">{s.staff}</div>
              <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums">
                {cards(s).map(([k, v]) => <div key={k} className="flex justify-between gap-2"><dt className="text-xs text-slate-500">{k}</dt><dd>{v}</dd></div>)}
              </dl>
            </li>))}</ul>
          <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="px-2 py-1.5 text-left font-medium">Staff</th><th className={th}>Lead ที่รับ</th><th className={th}>{qLabel}</th><th className={th}>% Qualified</th>{buyer && <th className={th}>Walk in</th>}<th className={th}>{wonLabel}</th><th className={th}>%Conversion</th></tr></thead>
            <tbody>{[...staff, total].map((s) => (
              <tr key={s.staff} data-pin={s === total ? "" : undefined} className={`border-b border-slate-100 tabular-nums ${s === total ? "bg-slate-50 font-semibold" : ""}`}>
                <td className="px-2 py-1.5">{s.staff}</td><td className="px-2 text-right">{n(s.leads)}</td><td className="px-2 text-right">{n(s.qualified)}</td><td className="px-2 text-right">{n(s.qualifiedPct, "%")}</td>
                {buyer && <td className="px-2 text-right">{n(s.walkIn)}</td>}<td className="px-2 text-right">{n(s.won)}</td><td className="px-2 text-right">{n(s.conversionPct, "%")}</td>
              </tr>))}</tbody>
          </table></div>
          </>
        )}
        <Note className="" href="/settings/metrics/lead-report">{buyer
          ? <>Qualified = Call Status รอเข้าชม / เข้าชมแล้ว / จอง / ซื้อสำเร็จ / กู้ไม่ผ่าน · Walk in = เข้าชมแล้ว / จอง / ซื้อสำเร็จ / กู้ไม่ผ่าน · %Conversion = ซื้อสำเร็จ ÷ Lead ที่รับ × 100 · — = ยังไม่มี (หารด้วย 0 ไม่ได้)</>
          : <>Qualified ของคนต้องการขาย = สถานะ เซ็นสัญญา / สัญญาเปิด / ขายแล้ว · %Conversion = ขายแล้ว ÷ Lead ที่รับ × 100 · — = ยังไม่มี (หารด้วย 0 ไม่ได้)</>}</Note>
      </article>

      <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">เหตุผลที่ไม่สำเร็จ <span className="font-normal text-slate-500">— {lost.lost.toLocaleString("en-US")} จาก {lost.total.toLocaleString("en-US")} Lead{lost.total ? ` (${Math.round((lost.lost / lost.total) * 1000) / 10}%)` : ""}</span></h2>
        {!lost.lost ? <p className="text-sm text-slate-500">ยังไม่มี Lead ที่ไม่สำเร็จในช่วงนี้</p> : <>
          <div className="flex flex-wrap gap-2">{lost.byReason.map((b) => <span key={b.reason} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{b.reason} <b className="tabular-nums">{b.count}</b></span>)}</div>
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="px-2 py-1.5 text-left font-medium">ช่องทาง</th><th className={th}>Lead</th><th className={th}>ไม่สำเร็จ</th><th className={th}>% ไม่สำเร็จ</th>{reasons.map((r) => <th key={r} className={th}>{r}</th>)}</tr></thead>
            <tbody>{lost.byChannel.map((c) => (
              <tr key={c.channel} className="border-b border-slate-100 tabular-nums"><td className="px-2 py-1.5">{channelLabel(c.channel)}</td><td className="px-2 text-right">{c.leads}</td><td className="px-2 text-right font-medium">{c.lost}</td><td className="px-2 text-right">{n(c.lostPct, "%")}</td>
                {reasons.map((r) => <td key={r} className="px-2 text-right">{c.reasons[r] ?? <span className="text-slate-300">0</span>}</td>)}</tr>))}</tbody>
          </table></div>
        </>}
        {loan.length > 0 && <div><h3 className="text-sm font-medium">สาเหตุที่กู้ไม่ผ่าน</h3><ul className="mt-1 list-disc pl-5 text-sm text-slate-700">{loan.map((x) => <li key={x.reason}>{x.reason} <span className="text-slate-500">({x.count})</span></li>)}</ul></div>}
        {!buyer && lost.notes.length > 0 && <div><h3 className="text-sm font-medium">เหตุผลที่บันทึกไว้ (ช่อง เหตุผลที่ปิดไม่สำเร็จ)</h3><ul className="mt-1 list-disc pl-5 text-sm text-slate-700">{lost.notes.map((x) => <li key={x.reason}>{x.reason} <span className="text-slate-500">({x.count})</span></li>)}</ul></div>}
        <Note className="" href="/settings/metrics/lead-report">{buyer ? "นับจากสถานะ: Call Status กู้ไม่ผ่าน / ไม่สนใจ / ติดต่อไม่ได้ · Buy Status Archive" : "นับจากสถานะ: ยกเลิก / บ้านไม่พร้อมขาย (และ Call Status ไม่สนใจ / ติดต่อไม่ได้)"} — Lead หนึ่งรายนับเหตุผลเดียว · ช่องทางที่ % ไม่สำเร็จสูง อาจได้ Lead ไม่ตรงกลุ่ม</Note>
      </article>
    </section>
  );
}
