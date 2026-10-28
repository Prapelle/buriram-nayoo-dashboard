import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { fetchDashboardData } from "@/lib/dashboard-data";
import { dmyS } from "@/lib/dashboard";
import { computePerformance, type Performance } from "@/lib/performance";
import { KpiCard } from "@/components/KpiCard";
import { LineChart, Pending, dm, my } from "@/components/charts";

export const dynamic = "force-dynamic";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const iso = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const n2 = (v: number | null, thb = false) => (v === null ? <span className="text-slate-400">—</span> : thb ? `฿${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : v.toLocaleString("en-US"));
const KIND: Record<string, string> = { Paid: "bg-indigo-100 text-indigo-900", Organic: "bg-emerald-100 text-emerald-900", Website: "bg-sky-100 text-sky-900", Compare: "bg-slate-200 text-slate-800" };
const STATUS: Record<string, string> = { ครบ: "text-emerald-700", ไม่ครบ: "text-amber-700", รอข้อมูล: "text-slate-400" };
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</div>
);

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  const sp = await searchParams;
  const f = { from: iso(one(sp.from)), to: iso(one(sp.to)), compare: (one(sp.compare) === "yoy" ? "yoy" : one(sp.compare) === "prev" || one(sp.compare) === "1" ? "prev" : undefined) as "yoy" | "prev" | undefined, gran: (one(sp.gran) === "month" ? "month" : "day") as "day" | "month" };

  let p: Performance;
  try { p = computePerformance(await fetchDashboardData(role), f); }
  catch (e) {
    return <section><h1 className="mb-4 text-2xl font-bold">Marketing Performance</h1><p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {e instanceof Error ? e.message.slice(0, 200) : "ไม่ทราบสาเหตุ"} — ลอง <Link href="/settings" className="underline">ตั้งค่า → เตรียม Google Sheet</Link></p></section>;
  }
  const inp = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const lbl = (x: string) => (p.trend.gran === "month" ? my(x) : dm(x));

  return (
    <section className="max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marketing Performance</h1>
        <p className="text-sm text-slate-500">
          {p.range ? <>ช่วงที่คำนวณ: <b>{dmyS(p.range.from)} – {dmyS(p.range.to)}</b>{p.defaulted && " (ช่วงของข้อมูลทั้งหมดที่มี)"}</> : "ยังไม่มีข้อมูล"}
          {p.prevRange && <> · เทียบกับ{p.compare === "yoy" ? "ช่วงเดียวกันของปีก่อน" : "ช่วงก่อนหน้า"} {dmyS(p.prevRange.from)} – {dmyS(p.prevRange.to)}</>}
        </p>
      </div>

      <form method="get" action="/performance" className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <label><span className="mb-1 block text-xs text-slate-500">ตั้งแต่</span><input type="date" name="from" defaultValue={f.from} className={inp} /></label>
        <label><span className="mb-1 block text-xs text-slate-500">ถึง</span><input type="date" name="to" defaultValue={f.to} className={inp} /></label>
        <label><span className="mb-1 block text-xs text-slate-500">กราฟแนวโน้ม</span>
          <select name="gran" defaultValue={f.gran} className={inp}><option value="day">รายวัน</option><option value="month">รายเดือน</option></select></label>
        <label><span className="mb-1 block text-xs text-slate-500">เปรียบเทียบ</span>
          <select name="compare" defaultValue={f.compare ?? ""} className={inp}><option value="">ไม่เปรียบเทียบ</option><option value="yoy">ปีก่อน (YoY) ช่วงวันที่เดียวกัน</option><option value="prev">ช่วงก่อนหน้า (ยาวเท่ากัน)</option></select></label>
        <button className="rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white hover:bg-slate-700">ใช้ตัวกรอง</button>
        {(f.from || f.to || f.compare || f.gran === "month") && <Link href="/performance" className="py-1.5 underline">ล้าง</Link>}
      </form>

      {p.compareNote && <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">⚠ {p.compareNote}</p>}
      {p.compare === "yoy" && <p className="text-xs text-slate-500">YoY Change (%) = (ช่วงปัจจุบัน − ช่วงเดียวกันของปีก่อน) ÷ ปีก่อน × 100 · ปีก่อน = 0 → N/A · ไม่มีข้อมูลปีก่อน → Missing Data · ค่าปีก่อนคำนวณจากข้อมูลที่นำเข้าจริงด้วยกฎเดียวกัน</p>}
      {p.warnings.map((w, i) => <p key={i} role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">⚠ {w}</p>)}
      {!p.range && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-600">ยังไม่มีข้อมูลโฆษณาหรือ Facebook Page — เริ่มจาก <Link href="/import" className="underline">นำเข้า CSV</Link></p>}

      {p.range && p.funnel && p.channels && <FunnelAndChannels p={p} />}

      {p.groups.map((g) => (
        <div key={g.title}>
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700"><span className={`rounded px-1.5 py-0.5 text-xs ${KIND[g.kind]}`}>{g.kind}</span>{g.title}</h2>
          {g.note && <p className="mb-2 text-xs text-slate-500">{g.note}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{g.items.map((k) => <KpiCard key={k.key} k={k} />)}</div>
        </div>
      ))}

      {p.range && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={`Google Ads Spend ${p.trend.gran === "month" ? "รายเดือน" : "รายวัน"} (฿)`}>{p.trend.google ? <LineChart label="Google Ads Spend" unit="฿" points={p.trend.google.map((x) => ({ x: lbl(x.x), y: x.cost }))} /> : <Pending text={p.trend.googleNote ?? "รอข้อมูล (นำเข้า Google Ads Time series)"} />}</Card>
          <Card title={`Google Ads Clicks ${p.trend.gran === "month" ? "รายเดือน" : "รายวัน"}`}>{p.trend.google ? <LineChart label="Google Ads Clicks" points={p.trend.google.map((x) => ({ x: lbl(x.x), y: x.clicks }))} /> : <Pending text={p.trend.googleNote ?? "รอข้อมูล"} />}</Card>
          <Card title={`Facebook Page: Reactions + Comments + Shares ${p.trend.gran === "month" ? "รายเดือน" : "รายวัน"} (Organic)`}>{p.trend.fb ? <LineChart label="Facebook Engagement" points={p.trend.fb.map((x) => ({ x: lbl(x.x), y: x.engagement }))} /> : <Pending text="รอข้อมูล (นำเข้า Facebook Page แบบรายวัน)" />}</Card>
          <Card title={`Google Search Clicks ${p.trend.gran === "month" ? "รายเดือน" : "รายวัน"} (Organic · Search Console)`}>{p.trend.search ? <LineChart label="Search Clicks" points={p.trend.search.map((x) => ({ x: lbl(x.x), y: x.clicks }))} /> : <Pending text="รอข้อมูล (นำเข้า Search Console Chart ที่หน้า Website)" />}</Card>
          <Card title="Meta Ads: Results แยกตาม Action (ไม่รวมต่างประเภท)">
            {p.meta.actions.length ? <table className="w-full text-sm"><tbody>{p.meta.actions.map((a) => (
              <tr key={a.label} className="border-b border-slate-100"><td className="py-1 pr-2">{a.label}</td><td className="text-right tabular-nums">{a.label === "(ไม่มีผลลัพธ์)" ? "—" : a.results.toLocaleString("en-US")}</td><td className="text-right tabular-nums text-slate-500">฿{a.spend.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td></tr>))}</tbody></table> : <Pending />}
          </Card>
        </div>
      )}

      {p.range && (
        <Card title="สรุปตามแพลตฟอร์ม">
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="py-1">แพลตฟอร์ม</th><th>ประเภท</th><th className="text-right">Spend</th><th className="text-right">Clicks</th><th className="text-right">Engagement</th><th className="text-right">Impressions</th><th className="text-right">Page Views</th><th className="pl-3">ช่วงข้อมูล</th><th>แหล่งข้อมูล</th><th>สถานะ</th></tr></thead>
            <tbody>{p.platforms.map((r) => (
              <tr key={r.platform} className="border-b border-slate-100"><td className="py-1.5 font-medium">{r.platform}</td><td><span className={`rounded px-1.5 py-0.5 text-xs ${KIND[r.kind]}`}>{r.kind}</span></td>
                <td className="text-right tabular-nums">{n2(r.spend, true)}</td><td className="text-right tabular-nums">{n2(r.clicks)}</td><td className="text-right tabular-nums">{n2(r.engagement)}</td><td className="text-right tabular-nums">{n2(r.impressions)}</td><td className="text-right tabular-nums">{n2(r.pageViews ?? null)}</td>
                <td className="whitespace-nowrap pl-3">{r.period}</td><td>{r.source}</td><td className={STATUS[r.status]}>{r.status}</td></tr>))}</tbody>
          </table></div>
          <p className="mt-2 text-xs text-slate-500">ไม่รวม Spend ของ Paid กับตัวเลข Organic · Engagement = Reactions + Comments + Shares · ช่องว่าง (—) คือไม่มีข้อมูลหรือแพลตฟอร์มนั้นไม่มีตัวชี้วัดนี้ ไม่ใช่ 0 · Clicks ของ Google Search คือคลิกจากผลการค้นหา ไม่ใช่ผู้ใช้เว็บไซต์</p>
        </Card>
      )}

      <Card title="ความครบถ้วนของข้อมูลและแหล่งข้อมูล">
        <ul className="space-y-1.5 text-sm">{p.sources.map((s) => (
          <li key={s.name} className="flex flex-wrap gap-x-3"><span className={`w-20 font-medium ${STATUS[s.status]}`}>{s.status}</span><span className="font-medium">{s.name}</span><span className="text-slate-500">มีข้อมูล: {s.available}</span><span className="text-slate-600">{s.detail}</span></li>))}</ul>
        <p className="mt-3 text-xs text-slate-500">• Google Ads ใช้ Time series รายวันเมื่อครบทุกวันในช่วง (ตัดช่วงได้ตรง) มิฉะนั้นใช้ Campaign Report · CPC = Spend ÷ Clicks จากแหล่งและช่วงเดียวกันเสมอ (ไม่ใช้ Total Paid Media Spend) · Clicks = 0 → N/A · การเปรียบเทียบใช้ช่วงก่อนหน้าที่ยาวเท่ากัน และกฎความครบถ้วนเดียวกัน</p>
      </Card>
    </section>
  );
}

const FUNNEL_COLOR = ["#3b6fd8", "#3aa0e0", "#45c08f", "#f2c94c", "#f2a07b"];
const FUNNEL_W = [100, 86, 72, 58, 44];
function Change({ v, lowerIsBetter = false }: { v: number | null | undefined; lowerIsBetter?: boolean }) {
  if (v === undefined) return null;
  if (v === null) return <span className="text-xs text-slate-400">—</span>;
  const good = lowerIsBetter ? v < 0 : v > 0;
  return <span className={`text-xs font-medium tabular-nums ${v === 0 ? "text-slate-500" : good ? "text-emerald-700" : "text-red-700"}`}>{v > 0 ? "↑" : v < 0 ? "↓" : "→"} {Math.abs(v).toLocaleString("en-US")}%</span>;
}
function FunnelAndChannels({ p }: { p: Performance }) {
  const paid = p.channels!.filter((c) => c.cpl !== null);
  const best = paid.length > 1 ? paid.reduce((a, b) => (b.cpl! < a.cpl! ? b : a)) : null;
  const thb = (v: number | null) => (v === null ? <span className="text-slate-400">—</span> : `฿${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  return (
    <div className="grid gap-4 2xl:grid-cols-5">
      <div className="2xl:col-span-2"><Card title="Customer Funnel">
        <ol className="space-y-1.5">{p.funnel!.map((s, i) => (
          <li key={s.key} className="grid grid-cols-[minmax(0,30%)_1fr_auto] items-center gap-3" title={s.note}>
            <div className="flex justify-center"><div className="h-9" style={{ width: `${FUNNEL_W[i]}%`, background: FUNNEL_COLOR[i], clipPath: "polygon(0 0, 100% 0, 93% 100%, 7% 100%)" }} /></div>
            <div className="min-w-0"><div className="text-sm font-medium">{s.label}</div>
              <div className="truncate text-xs text-slate-500">{s.conv !== null && s.conv !== undefined ? `${s.conv.toLocaleString("en-US")}% ของขั้นก่อนหน้า · ` : ""}{s.note}</div>
              {s.incomplete && s.value !== null && <div className="truncate text-xs text-amber-700">⚠ ข้อมูลไม่ครบ: {s.incomplete}</div>}</div>
            <div className="text-right"><div className="text-lg font-bold tabular-nums">{s.value === null ? <span className="text-sm font-normal text-slate-400">รอข้อมูล</span> : s.value.toLocaleString("en-US")}</div><Change v={s.change} /></div>
          </li>))}</ol>
        <p className="mt-3 text-xs text-slate-500">แต่ละขั้นมาจากคนละแหล่งข้อมูล (Social → GA4 → Leads) จึงไม่ใช่คนกลุ่มเดียวกันที่ติดตามได้ทีละคน · Lead นับตามวันที่รับในช่วงที่เลือก{p.compare ? " · ลูกศร = เทียบ" + (p.compare === "yoy" ? "ปีก่อน" : "ช่วงก่อน") : ""}</p>
      </Card></div>
      <div className="2xl:col-span-3"><Card title="ประสิทธิภาพแต่ละช่องทาง (Cost per Lead)">
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="whitespace-nowrap border-b text-xs text-slate-500 [&>th]:px-1.5"><th className="py-1 !pl-0">ช่องทาง</th><th className="text-right">ค่าโฆษณา</th><th className="text-right">Leads</th><th className="text-right">฿ / Lead</th><th className="text-right">Qualified</th><th className="text-right">฿ / Qualified</th><th className="text-right">ซื้อสำเร็จ</th>{p.compare && <th className="text-right">แนวโน้ม ฿/Lead</th>}</tr></thead>
          <tbody>{p.channels!.map((c) => (
            <tr key={c.channel} className="whitespace-nowrap border-b border-slate-100 [&>td]:px-1.5">
              <td className="py-1.5 !pl-0"><span className="font-medium">{c.channel}</span> <span className={`rounded px-1 text-[10px] ${KIND[c.kind]}`}>{c.kind}</span>{best === c && <span className="ml-1 rounded bg-emerald-600 px-1 text-[10px] text-white">ถูกที่สุด</span>}{c.incomplete && <span className="ml-1 text-xs text-amber-700" title={c.incomplete}>⚠</span>}</td>
              <td className="text-right tabular-nums">{c.kind === "Organic" ? <span className="text-xs text-slate-400">ไม่มีค่าโฆษณา</span> : thb(c.spend)}</td>
              <td className="text-right tabular-nums">{c.leads.toLocaleString("en-US")}</td>
              <td className="text-right font-semibold tabular-nums">{c.kind === "Organic" ? <span className="text-slate-400">—</span> : c.spend !== null && !c.leads ? <span className="text-xs font-normal text-slate-400">N/A (0 Lead)</span> : thb(c.cpl)}</td>
              <td className="text-right tabular-nums">{c.qualified.toLocaleString("en-US")}</td>
              <td className="text-right tabular-nums">{c.kind === "Organic" ? <span className="text-slate-400">—</span> : thb(c.cpql)}</td>
              <td className="text-right tabular-nums">{c.sold.toLocaleString("en-US")}</td>
              {p.compare && <td className="text-right"><Change v={c.change} lowerIsBetter /></td>}
            </tr>))}</tbody>
        </table></div>
        <p className="mt-2 text-xs text-slate-500">฿ / Lead = ค่าโฆษณาของแพลตฟอร์ม ÷ Lead ที่ช่องทางตรงกัน (Meta Ads ↔ Lead ช่องทาง Facebook Ads) ในช่วงเดียวกัน · ยิ่งต่ำยิ่งคุ้ม แต่ควรดู ฿ / Qualified และ ซื้อสำเร็จ ประกอบ (ช่องทางที่ Lead ถูกแต่ไม่มีใครซื้อ อาจไม่คุ้มจริง) · ช่องทาง Organic ไม่มีข้อมูลค่าใช้จ่ายในระบบ · ⚠ = รายงานโฆษณาไม่ครอบคลุมช่วงพอดี</p>
      </Card></div>
    </div>
  );
}
