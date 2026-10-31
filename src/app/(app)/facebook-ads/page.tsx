import { thDate, thDateTime, thMonth, thDayMonth } from "@/lib/thdate";
import Link from "next/link";
import { Note } from "@/components/Note";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DataTable } from "@/components/DataTable";
import { num } from "@/lib/dashboard";
import { actionCollisions, actionLabels } from "@/lib/fbactions";
import { readColumns } from "@/lib/tabdata";
import { applyView, fmtCell, href, one, type Col } from "@/lib/tableview";

export const dynamic = "force-dynamic";
const COLS: Col[] = [
  { key: "ad_set_name", label: "Ad set" }, { key: "ad_name", label: "Ad" }, { key: "ad_delivery", label: "สถานะ" }, { key: "result_indicator", label: "Action (ประเภทผลลัพธ์)" },
  { key: "results", label: "Results", kind: "int" }, { key: "cost_per_results", label: "Cost/Result", kind: "thb" }, { key: "amount_spent_thb", label: "ใช้จ่าย", kind: "thb" },
  { key: "impressions", label: "Impressions", kind: "int" }, { key: "reach", label: "Reach", kind: "int" }, { key: "area", label: "Area" }, { key: "report_start", label: "เริ่ม", kind: "date" }, { key: "report_end", label: "ถึง", kind: "date" },
];

export default async function FacebookAdsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  const sp = await searchParams;
  const q = one(sp.q), delivery = one(sp.ad_delivery), ind = one(sp.result_indicator), adset = one(sp.ad_set_name);
  const sort = one(sp.sort) || "amount_spent_thb", dir = (one(sp.dir) || "desc") as "asc" | "desc";

  let rows: Record<string, string>[];
  try { rows = (await readColumns("META_ADS", { only: [...COLS.map((c) => c.key), "imported_at"] })).rows; }
  catch (e) { return <section><h1 className="mb-4 text-2xl font-bold">Facebook Ads</h1><p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {e instanceof Error ? e.message.slice(0, 200) : "ไม่ทราบสาเหตุ"} — ลอง ตั้งค่า → เตรียม Google Sheet</p></section>; }

  // ชื่อ Action ที่แสดง: ตัด prefix actions:/Action: — ตัวกรองยังใช้ค่าดิบ ตัวเลขจึงไม่เปลี่ยน
  const label = actionLabels(rows.map((r) => r.result_indicator));
  const collisions = actionCollisions(rows.map((r) => r.result_indicator));
  const v = applyView(rows, { q, searchKeys: ["ad_name", "ad_set_name"], filters: { ad_delivery: delivery, result_indicator: ind, ad_set_name: adset }, sort, dir, page: Number(one(sp.page)) || 1 });
  const spend = v.all.reduce((s, r) => s + (num(r.amount_spent_thb) ?? 0), 0);
  // แยก Results ตามประเภทผลลัพธ์ ห้ามรวมต่างประเภทเป็นตัวเลขเดียว
  const by = new Map<string, { rows: number; results: number; spend: number }>();
  for (const r of v.all) {
    const k = r.result_indicator ? label.get(r.result_indicator.trim()) ?? r.result_indicator : "(ไม่มีผลลัพธ์)"; const cur = by.get(k) ?? { rows: 0, results: 0, spend: 0 };
    cur.rows++; cur.results += num(r.results) ?? 0; cur.spend += num(r.amount_spent_thb) ?? 0; by.set(k, cur);
  }
  const opts = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort();
  const last = rows.map((r) => r.imported_at).filter(Boolean).sort().pop();
  const params = { q, ad_delivery: delivery, result_indicator: ind, ad_set_name: adset };
  const inp = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const sel = (name: string, text: string, val: string) => (
    <label><span className="mb-1 block text-xs text-slate-500">{text}</span><select name={name} defaultValue={val} className={inp + " max-w-52"}><option value="">ทั้งหมด</option>{opts(name).map((o) => <option key={o} value={o}>{name === "result_indicator" ? label.get(o.trim()) ?? o : o}</option>)}</select></label>
  );
  const shown = v.rows.map((r) => (r.result_indicator ? { ...r, result_indicator: label.get(r.result_indicator.trim()) ?? r.result_indicator } : r));

  return (
    <section className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Facebook Ads</h1>
        <p className="text-sm text-slate-500">อัปเดตล่าสุด: {last ? thDateTime(last) : "ยังไม่มีข้อมูล"} · นำเข้าได้ที่ <Link href="/import" className="underline">นำเข้า CSV</Link></p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label><span className="mb-1 block text-xs text-slate-500">ค้นหา</span><input name="q" defaultValue={q} placeholder="ชื่อ Ad / Ad set" className={inp} /></label>
        {sel("ad_set_name", "Ad set", adset)}{sel("ad_delivery", "สถานะ", delivery)}{sel("result_indicator", "Action", ind)}
        <button className="rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white">ใช้ตัวกรอง</button>
        {(q || delivery || ind || adset) && <Link href="/facebook-ads" className="py-1.5 underline">ล้าง</Link>}
      </form>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">ค่าใช้จ่ายรวม (ตามตัวกรอง) · {v.total} แถว</div><div className="text-2xl font-bold tabular-nums">{v.total ? `฿${spend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "รอข้อมูล"}</div></div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 lg:col-span-2">
          <div className="mb-1 text-xs text-slate-500">Results แยกตาม Action (ไม่รวมต่างประเภทเป็นตัวเลขเดียว)</div>
          {by.size ? <table className="w-full text-sm"><tbody>{[...by].sort((a, b) => b[1].spend - a[1].spend).map(([k, x]) => (
            <tr key={k} className="border-b border-slate-100"><td className="py-1 pr-2">{k}</td><td className="text-right tabular-nums">{k === "(ไม่มีผลลัพธ์)" ? "—" : fmtCell("int", String(x.results))}</td><td className="text-right tabular-nums text-slate-500">{x.rows} แถว · ฿{x.spend.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td></tr>))}</tbody></table> : <p className="text-sm text-slate-400">รอข้อมูล</p>}
        </div>
      </div>
      {rows.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">ยังไม่มีข้อมูล — นำเข้า Facebookads.csv ที่หน้า นำเข้า CSV</p>
        : <DataTable cols={COLS} rows={shown} base="/facebook-ads" params={params} sort={sort} dir={dir} page={v.page} pages={v.pages} total={v.total} />}
      {collisions.length > 0 && <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">พบชื่อ Action ที่ซ้ำกันเมื่อตัด prefix ({collisions.join(", ")}) จึงแสดงชื่อเต็มของต้นฉบับแทน เพื่อไม่รวมต่างประเภทกัน</p>}
      <Note className="" href="/settings/metrics/performance" label="หมายเหตุข้อมูล">• ชื่อ Action แสดงแบบตัด prefix "actions:" / "Action:" ออก (ค่าต้นฉบับยังเก็บใน Google Sheet และอยู่ในคอลัมน์ result_indicator_raw ของไฟล์ Export)</Note>
      <Note className="" href="/settings/metrics/performance" label="หมายเหตุข้อมูล">• ไฟล์นี้ไม่มี Ad ID: โฆษณาที่ชื่อและ Ad set ซ้ำกันถูกแยกด้วยลำดับในไฟล์ · ค่า "ว่าง" คือต้นฉบับไม่มีข้อมูล ไม่ใช่ 0</Note>
    </section>
  );
}
