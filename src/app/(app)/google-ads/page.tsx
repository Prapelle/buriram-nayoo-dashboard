import { thDate, thDateTime, thMonth, thDayMonth } from "@/lib/thdate";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DataTable } from "@/components/DataTable";
import { num } from "@/lib/dashboard";
import { SPECS } from "@/lib/import/specs";
import { readColumns } from "@/lib/tabdata";
import { applyView, fmtCell, href, inferKind, one, type Col } from "@/lib/tableview";

export const dynamic = "force-dynamic";
const HIDE = ["record_id", "raw_json", "row_key", "source_batch_id", "imported_at"];
const TYPES = SPECS.filter((s) => s.source === "google_ads");

export default async function GoogleAdsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  const sp = await searchParams;
  const spec = TYPES.find((s) => s.id === one(sp.type)) ?? TYPES[0];
  const q = one(sp.q);

  let headers: string[], rows: Record<string, string>[];
  try { ({ headers, rows } = await readColumns(spec.tab, { exclude: HIDE.filter((h) => h !== "imported_at") })); }
  catch (e) { return <section><h1 className="mb-4 text-2xl font-bold">Google Ads</h1><p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {e instanceof Error ? e.message.slice(0, 200) : "ไม่ทราบสาเหตุ"} — ลอง ตั้งค่า → เตรียม Google Sheet</p></section>; }

  const periods = [...new Set(rows.map((r) => `${r.report_start}|${r.report_end}`).filter((p) => p !== "|"))].sort().reverse();
  const period = one(sp.period) || periods[0] || "";
  const [ps, pe] = period.split("|");
  const inPeriod = period ? rows.filter((r) => r.report_start === ps && r.report_end === pe) : rows;
  const cols: Col[] = headers.filter((h) => !HIDE.includes(h) && h !== "report_start" && h !== "report_end" && h !== "comparison_start" && h !== "comparison_end")
    .map((h) => ({ key: h, label: h, kind: inferKind(h) }));
  const textKeys = cols.filter((c) => c.kind === "clip" || c.kind === "text").map((c) => c.key);
  const sort = one(sp.sort) || (cols.find((c) => c.key === "cost_thb") ? "cost_thb" : cols.find((c) => c.key === "impressions") ? "impressions" : cols[0]?.key);
  const dir = (one(sp.dir) || "desc") as "asc" | "desc";
  const v = applyView(inPeriod, { q, searchKeys: textKeys, sort, dir, page: Number(one(sp.page)) || 1 });
  const cost = v.all.reduce((s, r) => s + (num(r.cost_thb) ?? 0), 0);
  const hasCost = cols.some((c) => c.key === "cost_thb");
  const last = rows.map((r) => r.imported_at).filter(Boolean).sort().pop();
  const params = { type: spec.id, period, q };
  const inp = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <section className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Google Ads</h1>
        <p className="text-sm text-slate-500">อัปเดตล่าสุด: {last ? thDateTime(last) : "ยังไม่มีข้อมูล"} · นำเข้าได้ที่ <Link href="/import" className="underline">นำเข้า CSV</Link></p>
      </div>
      <nav aria-label="ประเภทรายงาน" className="flex flex-wrap gap-1.5">
        {TYPES.map((t) => (
          <Link key={t.id} href={href("/google-ads", { type: t.id })} aria-current={t.id === spec.id ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-xs ${t.id === spec.id ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"}`}>
            {t.label.replace("Google Ads — ", "").replace(/ \(.*\)$/, "")}
          </Link>
        ))}
      </nav>
      <p className="text-sm font-medium">{spec.label}</p>
      {spec.id === "gads_campaigns"
        ? <p className="rounded-md bg-green-50 p-2 text-xs text-green-900">รายงานนี้คือแหล่งยอดใช้จ่ายหลักของ Google Ads (Total Paid Media Spend ใช้เฉพาะรายงานนี้)</p>
        : hasCost && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">Cost ในรายงานนี้เป็นการแยกย่อยของ Campaign Report ห้ามนำมาบวกกับยอดใช้จ่ายหลัก (จะนับซ้ำ)</p>}
      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <input type="hidden" name="type" value={spec.id} />
        {periods.length > 0 && (
          <label><span className="mb-1 block text-xs text-slate-500">ช่วงรายงาน</span>
            <select name="period" defaultValue={period} className={inp}>{periods.map((p) => { const [a, b] = p.split("|"); return <option key={p} value={p}>{fmtCell("date", a)} – {fmtCell("date", b)}</option>; })}</select></label>
        )}
        {textKeys.length > 0 && <label><span className="mb-1 block text-xs text-slate-500">ค้นหา</span><input name="q" defaultValue={q} className={inp} /></label>}
        <button className="rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white">ใช้ตัวกรอง</button>
      </form>
      {hasCost && v.total > 0 && <div className="inline-block rounded-lg border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">Cost รวมของแถวที่แสดง ({v.total} แถว)</div><div className="text-xl font-bold tabular-nums">฿{cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>}
      {rows.length === 0
        ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">ยังไม่มีข้อมูลรายงานประเภทนี้ — นำเข้าที่หน้า นำเข้า CSV (ถ้าเพิ่งอัปเดตระบบ กด ตั้งค่า → เตรียม Google Sheet ก่อน)</p>
        : <DataTable cols={cols} rows={v.rows} base="/google-ads" params={params} sort={sort} dir={dir} page={v.page} pages={v.pages} total={v.total} />}
    </section>
  );
}
