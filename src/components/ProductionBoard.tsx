"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { thaiDate, type Rec } from "@/lib/account";
import { Notice, type Msg } from "./Toast";

/** งาน Production ที่สร้างอัตโนมัติจากการยืนยันชำระเงิน: หนึ่งรายการสินค้า = หนึ่ง Job · เช็กลิสต์จากรายละเอียดในใบเสนอราคา */
export function ProductionBoard({ canEdit }: { canEdit: boolean }) {
  const [jobs, setJobs] = useState<Rec[] | null>(null); const [statuses, setStatuses] = useState<string[]>([]); const [msg, setMsg] = useState<Msg>(null); const [q, setQ] = useState("");
  const load = useCallback(async () => { try { const r = await fetch("/api/production", { cache: "no-store" }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setJobs(j.jobs); setStatuses(j.statuses); } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }); } }, []);
  useEffect(() => { void load(); }, [load]);
  const patch = async (j: Rec, b: Record<string, string>) => {
    try { const r = await fetch("/api/production", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ job_id: j.job_id, updated_at_seen: j.updated_at, ...b }) }); const x = await r.json(); if (!r.ok) throw new Error(x.error); setJobs((p) => p!.map((y) => (y.job_id === j.job_id ? x.job : y))); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }); await load(); }
  };
  const shown = (jobs ?? []).filter((j) => !q || `${j.job_code} ${j.customer_name} ${j.product} ${j.job_title}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหารหัส Job / ลูกค้า / Product" className="h-10 w-72 rounded-lg border border-slate-300 px-3 text-sm" />
      {jobs === null ? <p className="text-slate-500">กำลังโหลด…</p> : (
        <div className="grid gap-3 lg:grid-cols-4">
          {statuses.filter((s) => s !== "ยกเลิก" || shown.some((j) => j.status === s)).map((s) => (
            <div key={s} className="space-y-2 rounded-xl bg-slate-100 p-2">
              <h2 className="px-1 text-sm font-semibold">{s} <span className="font-normal text-slate-500">({shown.filter((j) => j.status === s).length})</span></h2>
              {shown.filter((j) => j.status === s).map((j) => {
                const items = j.checklist ? j.checklist.split("|") : [], done = new Set(j.done_idx ? j.done_idx.split(",") : []);
                return (
                  <article key={j.job_id} className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                    <div className="flex justify-between gap-2"><b>{j.job_code}</b><Link href={`/account/${j.doc_id}`} className="text-xs text-brand-700 underline">{j.doc_no}</Link></div>
                    <div className="font-medium">{j.customer_name}</div>
                    <div className="text-xs text-slate-600">{j.product}{j.job_title ? ` · ${j.job_title}` : ""}</div>
                    {j.start_date && <div className="text-xs text-slate-500">{thaiDate(j.start_date)} – {thaiDate(j.end_date)}</div>}
                    <ul className="space-y-0.5 text-xs">{items.map((it, i) => (
                      <li key={i}><label className="flex gap-1.5"><input type="checkbox" disabled={!canEdit} checked={done.has(String(i))} onChange={(e) => { const n = new Set(done); if (e.target.checked) n.add(String(i)); else n.delete(String(i)); void patch(j, { done_idx: [...n].join(",") }); }} /><span className={done.has(String(i)) ? "text-slate-400 line-through" : ""}>{it}</span></label></li>))}</ul>
                    <div className="text-xs text-slate-500">เสร็จ {[...done].filter((x) => Number(x) < items.length).length}/{items.length}</div>
                    {canEdit && <select value={j.status} onChange={(e) => void patch(j, { status: e.target.value })} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" aria-label="สถานะ">{statuses.map((x) => <option key={x}>{x}</option>)}</select>}
                  </article>);
              })}
            </div>))}
        </div>)}
    </div>
  );
}
