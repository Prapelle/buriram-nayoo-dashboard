"use client";
import { lineHref, telHref } from "@/lib/contact-links";
import { propSideSell, type LeadProperty } from "@/lib/lead-properties";
import { areaLabel, leadStatusOf, statusFieldOf, type Lead } from "@/lib/leads";
import { thDate } from "@/lib/thdate";

const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? thDate(iso) : "");
const statusLabel = (need: string) => (statusFieldOf(need) === "buy_status" ? "Buy Status" : statusFieldOf(need) === "sell_status" ? "Sell Status" : "Status");

/** รายละเอียด Lead (อ่านอย่างเดียว) — ใช้ทั้งหน้า Leads และหน้าต่างดูข้อมูลบนบอร์ด คนต้องการซื้อ / ขาย */
export function LeadDetails({ lead: v, properties = [] }: { lead: Lead; properties?: LeadProperty[] }) {
  return (
    <>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["วันที่รับ Lead", dmy(v.received_at)], ["ช่องทาง", v.source_channel], ["ชื่อลูกค้า", v.customer_name],
          ["เบอร์โทร", v.phone ? <a href={telHref(v.phone)} className="text-sky-700 underline">{v.phone}</a> : ""],
          ["Line", v.line_id ? <a href={lineHref(v.line_id)} target="_blank" rel="noreferrer" className="text-sky-700 underline">{v.line_id}</a> : ""],
          ["ความต้องการ", v.need], [statusLabel(v.need), leadStatusOf(v)], ["ประเภททรัพย์", v.property_type], ["สภาพทรัพย์", v.property_condition],
          ["ช่วงราคา", v.price_range], ["Call Status", v.call_status], ["Staff", v.staff], ["พื้นที่", areaLabel(v.area)],
          ["ความสนใจ", v.interest], ["Campaign", v.campaign_name],
          ["ติดต่อล่าสุด", dmy(v.last_contacted_at)], ["ติดตามครั้งถัดไป", dmy(v.next_follow_up_at)], ["ขั้น Pipeline (คำนวณ)", v.status], ["สร้างโดย", `${v.created_by} · ${dmy(v.created_at)}`], ["แก้ไขล่าสุด", `${v.updated_by} · ${dmy(v.updated_at)}`],
        ] as [string, React.ReactNode][]).map(([k, x]) => <div key={k} className="min-w-0 break-words"><dt className="text-xs text-slate-500">{k}</dt><dd>{x || <span className="text-slate-300">—</span>}</dd></div>)}
      </dl>
      {[["รายละเอียดเพิ่มเติม (Remark)", v.need_description], ["บันทึกภายใน (Note)", v.notes], ...(v.lost_reason ? [["เหตุผลที่ปิดไม่สำเร็จ", v.lost_reason]] : [])].map(([k, x]) => (
        <div key={k} className="text-sm"><div className="text-xs text-slate-500">{k}</div><p className="whitespace-pre-wrap">{x || <span className="text-slate-300">—</span>}</p></div>))}
      {properties.length > 0 && (
        <div className="text-sm"><div className="text-xs text-slate-500">{propSideSell(v.need) ? "ทรัพย์ที่ต้องการขาย" : "ทรัพย์ที่สนใจ"}</div>
          <ul className="mt-1 space-y-1">{properties.map((p) => <li key={p.property_id} className="flex flex-wrap items-center gap-2"><span className="rounded bg-slate-100 px-1.5 text-xs">{p.status}</span><a href={p.url} target="_blank" rel="noreferrer noopener" className="break-all text-sky-700 underline">{p.url}</a></li>)}</ul></div>)}
      {!v.need && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">Lead นี้บันทึกก่อนมีช่อง Need — กด แก้ไข เพื่อเลือก Need และสถานะ</p>}
    </>
  );
}
