import Link from "next/link";
import { auth } from "@/auth";
import { fetchDashboardData } from "@/lib/dashboard-data";
import { CHANNELS, SERVICES, computeDashboard, type Dashboard, type Filters, type Kpi } from "@/lib/dashboard";
import { BarList, LineChart, Pending, StackedMonths, dm, my } from "@/components/charts";

export const dynamic = "force-dynamic";

const AREAS: [string, string][] = [["buriram", "บุรีรัมย์"], ["surin", "สุรินทร์"], ["multi_province", "หลายจังหวัด"], ["unknown", "ไม่ทราบ (Unknown)"]];
const dmy = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "-");
const when = (iso: string) => { if (!iso) return "ยังไม่มีข้อมูล"; try { return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }); } catch { return iso; } };
const show = (k: Kpi) => k.fmt === "thb" ? `฿${k.value!.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : k.fmt === "pct" ? `${k.value}%` : k.value!.toLocaleString("en-US");
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const iso = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

function KpiCard({ k }: { k: Kpi }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{k.label}</div>
      {k.state === "value" && <div className="mt-1 text-2xl font-bold tabular-nums">{show(k)}</div>}
      {k.state === "pending" && <div className="mt-1 text-lg font-semibold text-slate-400">รอข้อมูล</div>}
      {k.state === "excluded" && <div className="mt-1 text-sm text-slate-400">ไม่รวมในตัวกรองนี้</div>}
      {k.state === "restricted" && <div className="mt-1 text-sm text-slate-400">ไม่มีสิทธิ์ดูข้อมูลนี้</div>}
      {k.note && k.state === "value" && <div className="mt-1 text-xs text-slate-500">{k.note}</div>}
    </div>
  );
}
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</div>
);

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const role = (await auth())!.user.role!;
  const f: Filters = {
    from: iso(one(sp.from)), to: iso(one(sp.to)), channel: one(sp.channel) || undefined,
    campaign: one(sp.campaign) || undefined, area: one(sp.area) || undefined, service: one(sp.service) || undefined,
  };

  let dash: Dashboard, campaigns: string[] = [];
  try {
    const data = await fetchDashboardData(role);
    dash = computeDashboard(data, f, role);
    campaigns = [...new Set([...data.google.map((r) => r.campaign_name), ...data.meta.map((r) => r.ad_set_name), ...data.leads.map((r) => r.campaign_name)].filter(Boolean))].sort();
  } catch (e) {
    return (
      <section>
        <h1 className="mb-4 text-2xl font-bold">ภาพรวมการตลาด</h1>
        <p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {e instanceof Error ? e.message.slice(0, 200) : "ไม่ทราบสาเหตุ"}
          <br />ถ้าเพิ่งอัปเดตระบบ ให้ไปที่ <Link href="/settings" className="underline">ตั้งค่า → เตรียม Google Sheet</Link> อีกครั้ง
        </p>
      </section>
    );
  }
  const filtered = Object.values(f).some(Boolean);
  const inp = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const c = dash.charts;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ภาพรวมการตลาด</h1>
        <p className="text-sm text-slate-500">
          อัปเดตล่าสุด: {when(dash.lastImport)}
          {dash.dataRange && <> · ข้อมูลโฆษณาครอบคลุม {dmy(dash.dataRange.start)} – {dmy(dash.dataRange.end)}</>}
        </p>
      </div>

      <form method="get" action="/" className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <label><span className="mb-1 block text-xs text-slate-500">ตั้งแต่</span><input type="date" name="from" defaultValue={f.from} className={inp} /></label>
        <label><span className="mb-1 block text-xs text-slate-500">ถึง</span><input type="date" name="to" defaultValue={f.to} className={inp} /></label>
        <label><span className="mb-1 block text-xs text-slate-500">ช่องทาง</span>
          <select name="channel" defaultValue={f.channel ?? ""} className={inp}><option value="">ทั้งหมด</option>{CHANNELS.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label><span className="mb-1 block text-xs text-slate-500">Campaign / Ad set</span>
          <select name="campaign" defaultValue={f.campaign ?? ""} className={inp + " max-w-56"}><option value="">ทั้งหมด</option>{campaigns.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label><span className="mb-1 block text-xs text-slate-500">พื้นที่</span>
          <select name="area" defaultValue={f.area ?? ""} className={inp}><option value="">ทั้งหมด</option>{AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label><span className="mb-1 block text-xs text-slate-500">Service</span>
          <select name="service" defaultValue={f.service ?? ""} className={inp}><option value="">ทั้งหมด</option>{SERVICES.map((x) => <option key={x}>{x}</option>)}</select></label>
        <button className="rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white hover:bg-slate-700">ใช้ตัวกรอง</button>
        {filtered && <Link href="/" className="py-1.5 underline">ล้างตัวกรอง</Link>}
      </form>

      {!dash.hasAnyData && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-600">
          ยังไม่มีข้อมูลในระบบ — {role === "sales" ? "รอทีมการตลาดนำเข้าข้อมูล" : <>เริ่มจาก <Link href="/import" className="underline">นำเข้า CSV</Link></>}
        </div>
      )}
      {dash.warnings.map((w, i) => <p key={i} role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">⚠ {w}</p>)}
      {dash.unknownAreaRows > 0 && !f.area && <p className="rounded-md bg-slate-100 p-3 text-sm text-slate-600">ข้อมูลโฆษณา {dash.unknownAreaRows} แถวยังไม่ระบุ Area — กำหนดได้ที่แท็บ AREA_MAPPINGS ใน Google Sheet แล้วนำเข้าไฟล์ใหม่</p>}

      {dash.groups.map((g) => (
        <div key={g.title}>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{g.title}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{g.items.map((k) => <KpiCard key={k.key} k={k} />)}</div>
        </div>
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="ค่าโฆษณาแยกตามช่องทาง (฿)">{c.spendByChannel ? <BarList items={c.spendByChannel} unit="฿" title="ค่าโฆษณาแยกตามช่องทาง" /> : <Pending />}</Card>
        <Card title="Leads แยกตามช่องทาง">{c.leadsByChannel ? <BarList items={c.leadsByChannel} title="Leads แยกตามช่องทาง" /> : <Pending />}</Card>
        <Card title="Sales Pipeline (จำนวน Lead ตามสถานะ)">{c.pipeline ? <BarList items={c.pipeline} title="Sales Pipeline" /> : <Pending />}</Card>
        <Card title="LINE OA Growth (เพื่อนทั้งหมดสิ้นเดือน)">
          {c.lineGrowth && c.lineGrowth.some((r) => r.friendsEnd !== null)
            ? <LineChart label="เพื่อน LINE OA" points={c.lineGrowth.filter((r) => r.friendsEnd !== null).map((r) => ({ x: my(r.month), y: r.friendsEnd! }))} />
            : <Pending />}
        </Card>
        <Card title="Monthly Trend — ค่าโฆษณารายเดือน (฿)">{c.monthly ? <StackedMonths rows={c.monthly} /> : <Pending />}</Card>
        <Card title="แนวโน้มรายวัน — Google Ads Cost (฿)">
          {c.daily ? <LineChart label="Google Ads Cost รายวัน" unit="฿" points={c.daily.map((d) => ({ x: dm(d.date), y: d.cost }))} /> : <Pending text="รอข้อมูล (นำเข้า Google Ads Time series)" />}
        </Card>
      </div>

      <div className="space-y-1 text-xs text-slate-500">
        {dash.notes.map((n, i) => <p key={i}>• {n}</p>)}
        <p>• ระบบไม่คำนวณ ROI เชิงสาเหตุ (Attribution เป็น Manual/Unknown) · Total Paid Media Spend ใช้เฉพาะ Google Ads Campaign Report ไม่รวมรายงานรายละเอียดอื่น</p>
      </div>
    </section>
  );
}
