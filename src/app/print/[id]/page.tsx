import { notFound } from "next/navigation";
import { requirePage } from "@/lib/page-guard";
import { AccError, getDoc } from "@/lib/account-service";
import { bahtText, DEFAULT_SELLER, DOC_LABEL, money, payableOf, thaiDate, type DocType } from "@/lib/account";
import { PrintButton } from "@/components/PrintButton";

export const dynamic = "force-dynamic";
const ORANGE = "#f4963a";

/** หน้าพิมพ์เอกสาร — จัดรูปแบบตามใบเสนอราคาต้นแบบ (QT2026100009): หัวบริษัทซ้าย · ชื่อเอกสารสีส้มขวา · ตารางรายการ · ลายเซ็น */
export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("/account");
  let d: Awaited<ReturnType<typeof getDoc>>;
  try { d = await getDoc((await params).id); } catch (e) { if (e instanceof AccError && e.status === 404) notFound(); throw e; }
  const doc = d.doc, rc = doc.doc_type === "receipt", pay = d.receipt_payment, seller = d.seller ?? DEFAULT_SELLER, title = DOC_LABEL[doc.doc_type as DocType];
  const meta: [string, string][] = [["เลขที่", doc.doc_no], ["วันที่", thaiDate(doc.doc_date)], ...(doc.due_date ? [[doc.doc_type === "quotation" ? "ใช้ได้ถึง" : "ครบกำหนด", thaiDate(doc.due_date)] as [string, string]] : []), ...(rc && d.parent_no ? [["อ้างอิงเอกสาร", d.parent_no] as [string, string]] : []), ["ผู้ขาย", doc.seller_name]];
  const meta2: [string, string][] = [["ชื่องาน", doc.job_title], ["ผู้ติดต่อ", doc.contact_name], ["เบอร์โทร", doc.contact_phone], ...(rc && pay ? [["วิธีชำระ", `${pay.method}${pay.ref ? ` (${pay.ref})` : ""}`] as [string, string]] : [])];
  return (
    <main className="mx-auto bg-white text-[13px] text-slate-900" style={{ width: "210mm", minHeight: "297mm", padding: "14mm 14mm 12mm", position: "relative", fontFamily: "'IBM Plex Sans Thai', sans-serif" }}>
      <style>{`@page{size:A4;margin:0}@media print{body{background:#fff!important}}`}</style>
      <PrintButton />
      <div aria-hidden style={{ position: "absolute", top: 0, right: 0, width: 0, height: 0, borderLeft: "60px solid transparent", borderTop: `60px solid ${ORANGE}` }} />
      <div className="flex justify-between gap-6">
        <div className="w-[48%] space-y-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/seller-logo.png" alt={seller.name} style={{ height: "24mm", width: "auto" }} className="mb-2" />
          <div className="font-semibold">{seller.name}</div><div>{seller.address}</div><div>เลขประจำตัวผู้เสียภาษี {seller.tax_id}</div><div>โทร. {seller.phone}</div>
          <div className="pt-3" style={{ color: ORANGE }}>ลูกค้า</div>
          <div>{doc.customer_contact || doc.contact_name}</div><div className="font-semibold">{doc.customer_name}</div>
          {doc.customer_address && <div>{doc.customer_address}</div>}{doc.customer_tax_id && <div>เลขประจำตัวผู้เสียภาษี {doc.customer_tax_id}</div>}
        </div>
        <div className="w-[48%]">
          <h1 className="pb-2 text-center text-[26px]" style={{ color: ORANGE }}>{title}</h1>
          <Meta rows={meta} /><div className="my-2 border-t border-slate-300" /><Meta rows={meta2} />
        </div>
      </div>
      <table className="mt-6 w-full border-collapse">
        <thead><tr className="border-y border-slate-300 text-center"><th className="w-8 py-1.5 font-medium">#</th><th className="font-medium">รายละเอียด</th><th className="w-16 font-medium">จำนวน</th><th className="w-28 text-right font-medium">ราคาต่อหน่วย</th><th className="w-28 text-right font-medium">ยอดรวม</th></tr></thead>
        <tbody>{d.lines.map((l, i) => (
          <tr key={l.line_id} className="align-top">
            <td className="py-2 text-center">{i + 1}</td>
            <td className="py-2 pr-3"><div>{l.product}</div><div className="whitespace-pre-wrap">{l.description}</div>{l.start_date && l.end_date && <div className="pt-1 text-slate-600">ระยะเวลา {thaiDate(l.start_date)} – {thaiDate(l.end_date)}</div>}</td>
            <td className="py-2 text-center">{Number(l.qty)}</td><td className="py-2 text-right">{money(l.unit_price)}</td><td className="py-2 text-right">{money(l.amount)}</td>
          </tr>))}</tbody>
      </table>
      <div className="border-t border-slate-300" />
      <div className="mt-3 ml-auto w-[55%] space-y-2 text-right">
        <Tot k="รวมเป็นเงิน" v={`${money(doc.subtotal)} บาท`} />
        {Number(doc.discount) > 0 && <Tot k="ส่วนลด" v={`-${money(doc.discount)} บาท`} />}
        {Number(doc.vat) > 0 && <Tot k={`ภาษีมูลค่าเพิ่ม ${Number(doc.vat_rate)}%`} v={`${money(doc.vat)} บาท`} />}
        <Tot k="จำนวนเงินรวมทั้งสิ้น" v={`${money(doc.total)} บาท`} />
        {Number(doc.wht) > 0 && <><Tot k={`หัก ณ ที่จ่าย ${Number(doc.wht_rate)}%`} v={`-${money(doc.wht)} บาท`} /><Tot k="ยอดชำระสุทธิ" v={`${money(payableOf(doc))} บาท`} /></>}
        {rc && <Tot k="ได้รับชำระเงินแล้ว" v={`${money(doc.paid_amount)} บาท`} />}
      </div>
      <div className="mt-1">({bahtText(rc ? Number(doc.paid_amount) : payableOf(doc))})</div>
      {doc.note && <div className="mt-4 whitespace-pre-wrap text-slate-700">หมายเหตุ: {doc.note}</div>}
      <div className="absolute left-[14mm] right-[14mm] bottom-[12mm] space-y-10">
        <div className="flex justify-between"><span>ในนาม {doc.contact_name || doc.customer_name}</span><span>ในนาม {seller.name.replace(/\s*\(.*\)$/, "")}</span></div>
        <div className="flex justify-between text-center">
          <div className="flex w-[48%] gap-4"><Sign t={rc ? "ผู้ชำระเงิน" : "ผู้สั่งซื้อสินค้า"} /><Sign t="วันที่" /></div>
          <div className="flex w-[48%] gap-4"><Sign t={rc ? "ผู้รับเงิน" : "ผู้อนุมัติ"} /><Sign t="วันที่" /></div>
        </div>
      </div>
    </main>
  );
}
function Meta({ rows }: { rows: [string, string][] }) { return <dl className="space-y-0.5">{rows.map(([k, v]) => <div key={k} className="flex"><dt className="w-24" style={{ color: ORANGE }}>{k}</dt><dd>{v}</dd></div>)}</dl>; }
function Tot({ k, v }: { k: string; v: string }) { return <div className="flex justify-between gap-4"><span style={{ color: ORANGE }}>{k}</span><span>{v}</span></div>; }
function Sign({ t }: { t: string }) { return <div className="flex-1 border-t border-slate-400 pt-1">{t}</div>; }
