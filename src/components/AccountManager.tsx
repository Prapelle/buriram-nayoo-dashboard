"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { payableOf, DOC_LABEL, DOC_TYPES, STATUS_LABEL, money, thaiDate, type DocStatus, type DocType, type Rec } from "@/lib/account";
import { Notice, type Msg } from "./Toast";
import { btn } from "./PageHeader";

const TONE: Record<string, string> = { draft: "bg-slate-100 text-slate-700", sent: "bg-blue-50 text-blue-800", approved: "bg-indigo-50 text-indigo-800", paid_partial: "bg-amber-100 text-amber-900", paid: "bg-green-100 text-green-800", cancelled: "bg-red-50 text-red-700" };

/** รายการเอกสารบัญชี: ใบเสนอราคา / ใบวางบิล / ใบแจ้งหนี้ — กรองตามชนิด สถานะ และค้นหา */
export function AccountManager() {
  const [docs, setDocs] = useState<Rec[] | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [type, setType] = useState<"" | DocType>(""); const [status, setStatus] = useState(""); const [q, setQ] = useState("");
  const load = useCallback(async () => {
    try { const r = await fetch("/api/account", { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setDocs(j.docs); } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => (docs ?? []).filter((d) => (!type || d.doc_type === type) && (!status || d.status === status) && (!q || `${d.doc_no} ${d.customer_name} ${d.job_title}`.toLowerCase().includes(q.toLowerCase()))), [docs, type, status, q]);
  const sum = shown.filter((d) => d.status !== "cancelled" && d.doc_type !== "receipt").reduce((s, d) => s + payableOf(d), 0), paid = shown.filter((d) => d.status !== "cancelled" && d.doc_type !== "receipt").reduce((s, d) => s + Number(d.paid_amount || 0), 0);
  return (
    <div className="space-y-3">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/account/new?type=quotation" className={btn.primary}>＋ ใบเสนอราคา</Link>
        <Link href="/account/new?type=billing" className={btn.secondary}>＋ ใบวางบิล</Link>
        <Link href="/account/new?type=invoice" className={btn.secondary}>＋ ใบแจ้งหนี้</Link>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาเลขที่ / ลูกค้า / ชื่องาน" className="ml-auto h-10 w-64 rounded-lg border border-slate-300 px-3 text-sm" />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {(["", ...DOC_TYPES] as const).map((x) => <button key={x} type="button" onClick={() => setType(x)} className={`rounded-full border px-3 py-1 ${type === x ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-300 bg-white"}`}>{x ? DOC_LABEL[x] : "ทั้งหมด"}</button>)}
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1" aria-label="สถานะ"><option value="">ทุกสถานะ</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <span className="ml-auto self-center text-slate-600">{shown.length} ใบ · ยอดสุทธิ ฿{money(sum)} · ชำระแล้ว ฿{money(paid)}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="p-2">เลขที่</th><th>ชนิด</th><th>วันที่</th><th>ลูกค้า / ชื่องาน</th><th className="text-right">ยอดสุทธิ</th><th className="text-right">ชำระแล้ว</th><th className="pl-3">สถานะ</th><th>งาน</th></tr></thead>
          <tbody>
            {docs === null && <tr><td colSpan={8} className="p-6 text-center text-slate-500">กำลังโหลด…</td></tr>}
            {docs && !shown.length && <tr><td colSpan={8} className="p-6 text-center text-slate-500">ยังไม่มีเอกสาร</td></tr>}
            {shown.map((d) => (
              <tr key={d.doc_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-2 font-medium"><Link href={`/account/${d.doc_id}`} className="text-brand-700 underline">{d.doc_no}</Link></td>
                <td>{DOC_LABEL[d.doc_type as DocType]}</td><td>{thaiDate(d.doc_date)}</td>
                <td><div>{d.customer_name}</div><div className="text-xs text-slate-500">{d.job_title}</div></td>
                <td className="text-right">{money(payableOf(d))}</td><td className="text-right">{money(d.paid_amount)}</td>
                <td className="pl-3"><span className={`rounded-full px-2 py-0.5 text-xs ${TONE[d.status] ?? ""}`}>{STATUS_LABEL[d.status as DocStatus] ?? d.status}</span></td>
                <td className="text-xs">{d.work_started ? <span className="text-green-700">เริ่มงานแล้ว</span> : <span className="text-slate-400">—</span>}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
