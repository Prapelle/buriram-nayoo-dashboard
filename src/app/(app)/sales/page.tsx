import { RangeFields } from "@/components/RangeFields";
import { rangeOf } from "@/lib/range-memory";
import { thDate, thDateTime, thMonth, thDayMonth } from "@/lib/thdate";
import Link from "next/link";
import { Note } from "@/components/Note";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BarList, LineChart, Pending } from "@/components/charts";
import { DataTable } from "@/components/DataTable";
import { computeSales, type SalesFilters, type TxRow } from "@/lib/sales/dashboard";
import { readColumns } from "@/lib/tabdata";
import { applyView, fmtCell, href, one, type Col } from "@/lib/tableview";

export const dynamic = "force-dynamic";
const iso = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const thb = (n: number) => `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const LABELS: Record<string, string> = { company_name: "บริษัทผู้ขาย", company_tax_id: "เลขผู้เสียภาษีผู้ขาย", report_period: "ช่วงรายงาน", invoice_date: "วันที่", invoice_no: "เลขที่เอกสาร", customer_name: "ลูกค้า", customer_tax_id: "เลขผู้เสียภาษีลูกค้า", branch: "สำนักงานใหญ่/สาขา", project_name: "โปรเจ็ค", salesperson: "พนักงานขาย", gross_sales: "ขายแยกภาษี (ก่อนส่วนลด)", discount_amount: "ส่วนลด", net_value: "มูลค่า", vat_amount: "ภาษีมูลค่าเพิ่ม", total_net: "ยอดรวมสุทธิ", payment_status: "สถานะ", sales_inc_vat: "ขายรวมภาษี", discount_before_vat: "ส่วนลดก่อน VAT", discount_doc: "ส่วนลดตามเอกสาร", ref_doc_system: "เอกสารอ้างอิงในระบบ", reference_no: "เลขที่อ้างอิง", deposit_ref_doc: "เอกสารอ้างอิงรับมัดจำ", note: "หมายเหตุ", internal_note: "โน้ตภายในบริษัท", lead_id: "Lead ที่เชื่อมโยง", source_channel: "ช่องทาง", campaign_name: "แคมเปญ", source_file: "ไฟล์ต้นทาง", source_row_number: "แถวในไฟล์", imported_at: "นำเข้าเมื่อ" };
const MONEY = new Set(["gross_sales", "discount_amount", "net_value", "vat_amount", "total_net", "sales_inc_vat", "discount_before_vat", "discount_doc"]);

export default async function SalesDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "sales") redirect("/");
  const sp = await searchParams;
  const rg = await rangeOf(sp);
  const f: SalesFilters = { from: rg.from, to: rg.to, period: one(sp.period) || undefined, project: one(sp.project) || undefined, salesperson: one(sp.salesperson) || undefined, status: one(sp.status) || undefined, q: one(sp.q) || undefined };
  const doc = one(sp.doc);

  let all: TxRow[];
  try { all = (await readColumns("SALES_TRANSACTIONS", { exclude: ["raw_json", "record_id", "row_key", "source_batch_id"] })).rows; }
  catch (e) {
    return <section><h1 className="mb-4 text-[26px] font-bold tracking-tight">Revenue</h1><p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {e instanceof Error ? e.message.slice(0, 200) : "ไม่ทราบสาเหตุ"} — ลอง <Link href="/settings" className="underline">ตั้งค่า → เตรียม Google Sheet</Link></p></section>;
  }
  const v = computeSales(all, f);
  const sort = one(sp.sort) || "invoice_date", dir = (one(sp.dir) || "desc") as "asc" | "desc";
  const params: Record<string, string | undefined> = { from: f.from, to: f.to, period: f.period, project: f.project, salesperson: f.salesperson, status: f.status, q: f.q };
  const view = applyView(v.rows, { sort, dir, page: Number(one(sp.page)) || 1, size: 25 });
  const cols: Col[] = [
    { key: "invoice_date", label: "วันที่", kind: "date" }, { key: "invoice_no", label: "เลขที่เอกสาร", href: (r) => href("/sales", { ...params, doc: r.invoice_no }) },
    { key: "customer_name", label: "ลูกค้า", kind: "clip" }, { key: "project_name", label: "โปรเจ็ค", kind: "clip" }, { key: "salesperson", label: "พนักงานขาย" },
    { key: "total_net", label: "ยอดสุทธิ", kind: "thb" }, { key: "payment_status", label: "สถานะ" },
  ];
  const detail = doc ? all.find((r) => r.invoice_no === doc) : undefined;
  const last = all.map((r) => r.imported_at).filter(Boolean).sort().pop();
  const exportUrl = href("/api/export/sales-transactions", params);
  const inp = "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm";
  const sel = (name: string, label: string, val: string | undefined, opts: string[]) => (
    <label><span className="mb-1 block text-xs text-slate-500">{label}</span><select name={name} defaultValue={val ?? ""} className={inp + " max-w-48"}><option value="">ทั้งหมด</option>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>
  );
  const Card = ({ title, children }: { title: string; children: React.ReactNode }) => <div className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{children}</div>;
  const t = v.charts.time;

  return (
    <section className="max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">Revenue — ยอดขายจากรายงานบัญชี</h1>
          <p className="text-sm text-slate-500">อัปเดตล่าสุด: {last ? thDateTime(last) : "ยังไม่มีข้อมูล"}</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/sales/import" className="rounded-lg bg-brand-600 px-4 py-1.5 font-medium text-white hover:bg-brand-700">นำเข้ารายงานยอดขาย</Link>
          {all.length > 0 && <a href={exportUrl} className="rounded-md border border-slate-300 px-4 py-1.5">Export CSV{Object.values(f).some(Boolean) ? " (ตามตัวกรอง)" : ""}</a>}
        </div>
      </div>

      <form method="get" action="/sales" className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <RangeFields from={f.from} to={f.to} className={inp} remembered={rg.remembered} />
        {sel("period", "ช่วงรายงาน", f.period, v.options.periods)}{sel("project", "โปรเจ็ค", f.project, v.options.projects)}{sel("salesperson", "พนักงานขาย", f.salesperson, v.options.people)}{sel("status", "สถานะ", f.status, v.options.statuses)}
        <label><span className="mb-1 block text-xs text-slate-500">ค้นหา</span><input name="q" defaultValue={f.q} placeholder="เลขที่เอกสาร / ลูกค้า" className={inp} /></label>
        <button className="rounded-lg bg-brand-600 px-4 py-1.5 font-medium text-white">ใช้ตัวกรอง</button>
        {Object.values(f).some(Boolean) && <Link href="/sales?range=all" className="py-1.5 underline">ล้าง</Link>}
      </form>

      {all.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-600">ยังไม่มีข้อมูลยอดขาย — เริ่มจาก <Link href="/sales/import" className="underline">นำเข้ารายงานยอดขาย (Excel)</Link></div>}
      {all.length > 0 && v.rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">ไม่มีเอกสารที่ตรงกับตัวกรอง</p>}
      {v.warnings.map((w, i) => <p key={i} className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">⚠ {w}</p>)}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {v.kpis.map((k) => (
          <div key={k.key} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs text-slate-500">{k.label}</div>
            {k.value === null ? <div className="mt-1 text-lg font-semibold text-slate-400">รอข้อมูล</div> : <div className="mt-1 text-2xl font-bold tabular-nums">{k.fmt === "thb" ? thb(k.value) : k.value.toLocaleString("en-US")}</div>}
            {k.note && k.value !== null && <div className="mt-1 text-xs text-slate-500">{k.note}</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`ยอดขายสุทธิ${t?.granularity === "month" ? "รายเดือน" : "รายวัน"} (฿)`}>
          {t ? (t.granularity === "day" ? <LineChart label="ยอดขายสุทธิรายวัน" unit="฿" points={t.points.map((p) => ({ x: thDayMonth(p.x), y: p.y }))} /> : <BarList title="ยอดขายสุทธิรายเดือน" unit="฿" items={t.points.map((p) => ({ label: thMonth(p.x), value: p.y }))} />) : <Pending />}
        </Card>
        <Card title="ยอดขายสุทธิตามโปรเจ็ค (฿)">{v.charts.projects ? <BarList title="ยอดขายตามโปรเจ็ค" unit="฿" items={v.charts.projects} /> : <Pending />}</Card>
        <Card title="ยอดขายสุทธิตามพนักงานขาย (฿)">{v.charts.people ? <BarList title="ยอดขายตามพนักงานขาย" unit="฿" items={v.charts.people} /> : <Pending />}</Card>
        <Card title="สัดส่วนยอดขายตามสถานะ (฿)">{v.charts.status ? <BarList title="สัดส่วนตามสถานะ" unit="฿" items={v.charts.status} /> : <Pending />}</Card>
      </div>

      <Card title="ยอดขายที่เชื่อมโยงกับการตลาด">
        {v.linked.value === null
          ? <p className="text-sm text-slate-500">รอข้อมูล — ยังไม่มีเอกสารที่เชื่อมโยงกับ Lead หรือแคมเปญ ยอดทั้งหมดด้านบนจึงเป็น <b>ยอดขายจากรายงานบัญชี</b> ไม่ได้หมายความว่าเกิดจากการตลาด</p>
          : <p className="text-sm">เอกสารที่เชื่อมโยงได้ {v.linked.docs} ใบ รวม <b>{thb(v.linked.value)}</b> (จาก Lead/แคมเปญที่ระบุไว้)</p>}
        <Note className="mt-2" href="/settings/metrics/sales">ระบบไม่คำนวณ ROAS/ROI จากยอดขายรวม เพราะไม่มีข้อมูลเชื่อมโยงและต้นทุนโฆษณาที่ตรวจสอบได้ครบ</Note>
      </Card>

      {detail && (
        <div className="rounded-lg border border-slate-300 bg-white p-4">
          <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">รายละเอียดเอกสาร {detail.invoice_no}</h3><Link href={href("/sales", params)} className="text-sm underline">ปิด</Link></div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {Object.keys(LABELS).filter((k) => (detail[k] ?? "") !== "").map((k) => (
              <div key={k} className="flex gap-2"><dt className="shrink-0 text-slate-500">{LABELS[k]}:</dt><dd className="break-words">{MONEY.has(k) ? thb(Number(detail[k])) : k === "invoice_date" ? fmtCell("date", detail[k]) : detail[k]}</dd></div>
            ))}
          </dl>
        </div>
      )}

      {all.length > 0 && <DataTable cols={cols} rows={view.rows} base="/sales" params={params} sort={sort} dir={dir} page={view.page} pages={view.pages} total={view.total} />}
      <Note className="" href="/settings/metrics/sales">• ยอดสุทธิ = ผลรวมยอดรวมสุทธิ · ก่อนส่วนลด = ขายแยกภาษี · ส่วนลดใช้ส่วนลดตามเอกสาร (ถ้าว่างใช้ส่วนลดก่อน VAT) ไม่บวกรวมกัน · ตัวเลขทุกส่วนคำนวณจากตัวกรองเดียวกัน</Note>
    </section>
  );
}
