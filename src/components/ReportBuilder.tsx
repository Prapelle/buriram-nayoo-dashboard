"use client";
import { Notice, type Msg } from "@/components/Toast";
import { btn } from "@/components/PageHeader";
import { thDate } from "@/lib/thdate";
import { useEffect, useMemo, useState } from "react";

type M = { scope: string; as_of: string; permalink: string; views: number; reach: number; reactions: number; comments: number; shares: number; link_clicks: number };
type Row = { card_id: string; card_code: string; title: string; content_type: string; sales_goal: string; product: string; stage: string; published_at: string; report_due_date: string; report_link: string; post_id: string; metrics: M | null };
type Rep = { customer: string; rows: Row[]; matched: number; totals: Record<string, number> };
const inp = "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm";
const n = (v?: number) => (v ?? 0).toLocaleString("en-US");
const iso = (d: Date) => d.toISOString().slice(0, 10);
async function api(url: string, init?: RequestInit) { const r = await fetch(url, { cache: "no-store", ...init }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j; }
const csvCell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export function ReportBuilder({ readOnly = false }: { readOnly?: boolean }) {
  const [customers, setCustomers] = useState<{ developer_id: string; name: string }[]>([]);
  const [cust, setCust] = useState(""); const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86400000))); const [to, setTo] = useState(iso(new Date()));
  const [sent, setSent] = useState(false); const [rep, setRep] = useState<Rep | null>(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<Msg>(null);
  const [sel, setSel] = useState<Set<string>>(new Set()); const [link, setLink] = useState("");
  useEffect(() => { api("/api/content").then((j) => setCustomers(j.customers)).catch((e) => setMsg({ type: "error", text: e.message })); }, []);

  async function run() {
    if (!cust) { setMsg({ type: "error", text: "เลือกลูกค้าก่อน" }); return; }
    setBusy(true); setMsg(null);
    try { const r: Rep = await api(`/api/content/report?customer=${encodeURIComponent(cust)}&from=${from}&to=${to}&sent=${sent ? 1 : 0}`); setRep(r); setSel(new Set(r.rows.map((x) => x.card_id))); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "สร้างรายงานไม่สำเร็จ" }); } finally { setBusy(false); }
  }
  const chosen = useMemo(() => (rep?.rows ?? []).filter((r) => sel.has(r.card_id)), [rep, sel]);
  const tot = useMemo(() => { const t = { views: 0, reach: 0, reactions: 0, comments: 0, shares: 0, link_clicks: 0 }; for (const r of chosen) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += r.metrics?.[k] ?? 0; return t; }, [chosen]);
  const noPost = chosen.filter((r) => !r.post_id).length;

  async function mark(stage: string) {
    if (!chosen.length) return;
    setBusy(true);
    try { const r = await api("/api/content/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ card_ids: chosen.map((x) => x.card_id), stage, report_link: link }) });
      setMsg({ type: r.skipped.length ? "error" : "ok", text: `${stage}: ${r.done} การ์ด${r.skipped.length ? ` · ข้าม ${r.skipped.length} (${r.skipped[0].reason})` : ""}` }); await run(); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }); setBusy(false); }
  }
  function csv() {
    const head = ["รหัส", "ชื่อ Content", "ประเภท", "เป้าหมาย", "Product", "เผยแพร่", "Views", "Reach", "Reactions", "Comments", "Shares", "Link clicks", "ลิงก์โพสต์"];
    const lines = [head, ...chosen.map((r) => [r.card_code, r.title, r.content_type, r.sales_goal, r.product, r.published_at, r.metrics?.views ?? "", r.metrics?.reach ?? "", r.metrics?.reactions ?? "", r.metrics?.comments ?? "", r.metrics?.shares ?? "", r.metrics?.link_clicks ?? "", r.metrics?.permalink ?? ""]),
      ["", "รวม", "", "", "", "", tot.views, tot.reach, tot.reactions, tot.comments, tot.shares, tot.link_clicks, ""]];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `report-${rep?.customer || "customer"}-${from}_${to}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-3">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ลูกค้า</span><select value={cust} onChange={(e) => setCust(e.target.value)} className={`${inp} max-w-56`}><option value="">— เลือก —</option>{customers.map((c) => <option key={c.developer_id} value={c.developer_id}>{c.name}</option>)}</select></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">เผยแพร่ตั้งแต่</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ถึง</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} /></label>
        <label className="flex h-9 items-center gap-1.5 text-sm"><input type="checkbox" checked={sent} onChange={(e) => setSent(e.target.checked)} />รวมที่ส่งลูกค้าแล้ว</label>
        <button type="button" disabled={busy} onClick={run} className={btn.primary}>{busy ? "กำลังโหลด…" : "สร้างรายงาน"}</button>
      </div>

      {rep && (
        <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 print:border-0 print:p-0">
          <header>
            <h2 className="text-lg font-semibold">รายงานผล Content — {rep.customer}</h2>
            <p className="text-sm text-slate-600">เผยแพร่ {thDate(from)} – {thDate(to)} · {chosen.length} Content</p>
          </header>
          {rep.rows.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">ไม่มี Content งานขายที่เผยแพร่ในช่วงนี้ (ต้องติดแท็กงานขายและลากไป PUBLISHED แล้ว)</p> : (
            <>
              <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                {([["Views", tot.views], ["Reach", tot.reach], ["Reactions", tot.reactions], ["Comments", tot.comments], ["Shares", tot.shares], ["Link clicks", tot.link_clicks]] as const).map(([k, v]) => <div key={k} className="rounded-lg bg-slate-50 p-2"><dt className="text-[11px] text-slate-500">{k}</dt><dd className="text-lg font-semibold tabular-nums">{n(v)}</dd></div>)}
              </dl>
              {noPost > 0 && <p className="text-xs text-amber-700 print:hidden">⚠ {noPost} Content ยังไม่มี Post ID จึงไม่มีตัวเลข — กดจับคู่ที่บอร์ด Content หรือใส่ Post ID ที่การ์ด</p>}
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="p-2 print:hidden" /><th className="p-2">Content</th><th>เผยแพร่</th><th className="text-right">Views</th><th className="text-right">Reach</th><th className="text-right">React.</th><th className="text-right">Comm.</th><th className="text-right">Share</th><th className="text-right">Clicks</th><th className="print:hidden">สถานะ</th></tr></thead>
                <tbody>{rep.rows.map((r) => (
                  <tr key={r.card_id} className={`border-t border-slate-100 ${sel.has(r.card_id) ? "" : "opacity-40 print:hidden"}`}>
                    <td className="p-2 print:hidden"><input type="checkbox" aria-label={`เลือก ${r.card_code}`} checked={sel.has(r.card_id)} onChange={(e) => setSel((s) => { const x = new Set(s); if (e.target.checked) x.add(r.card_id); else x.delete(r.card_id); return x; })} /></td>
                    <td className="p-2"><div className="font-medium">{r.metrics?.permalink ? <a href={r.metrics.permalink} target="_blank" rel="noopener noreferrer" className="underline">{r.title}</a> : r.title}</div><div className="text-xs text-slate-500">{[r.card_code, r.content_type, r.sales_goal, r.product].filter(Boolean).join(" · ")}</div></td>
                    <td className="whitespace-nowrap">{thDate(r.published_at)}</td>
                    {(["views", "reach", "reactions", "comments", "shares", "link_clicks"] as const).map((k) => <td key={k} className="text-right tabular-nums">{r.metrics && r.metrics.scope !== "none" ? n(r.metrics[k]) : "—"}</td>)}
                    <td className="whitespace-nowrap text-xs print:hidden">{r.stage}{r.report_link && <> · <a href={r.report_link} target="_blank" rel="noopener noreferrer" className="underline">ไฟล์</a></>}</td>
                  </tr>))}</tbody>
              </table></div>
              <p className="text-[11px] text-slate-500">ตัวเลขจากสถิติโพสต์ Facebook ที่นำเข้า: ใช้ยอดสะสมล่าสุด ถ้าไม่มีใช้ผลรวมรายวัน (Reach รวมข้ามโพสต์/วันอาจนับคนซ้ำ)</p>
              <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3 print:hidden">
                <button type="button" onClick={() => window.print()} className={btn.secondary}>🖨 พิมพ์ / บันทึก PDF</button>
                <button type="button" onClick={csv} className={btn.secondary}>⬇ CSV</button>
                {!readOnly && <><label className="ml-auto min-w-56 flex-1 text-sm sm:flex-none"><span className="mb-0.5 block text-xs text-slate-500">ลิงก์ไฟล์รายงาน (Drive) — ใส่ให้ทุกการ์ดที่เลือก</span><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className={`${inp} w-full`} /></label>
                <button type="button" disabled={busy || !chosen.length} onClick={() => mark("รายงานเสร็จแล้ว")} className={btn.secondary}>✔ รายงานเสร็จแล้ว</button>
                <button type="button" disabled={busy || !chosen.length} onClick={() => mark("ส่งให้ลูกค้าแล้ว")} className={btn.primary}>ส่งให้ลูกค้าแล้ว</button></>}
              </div>
            </>)}
        </article>)}
    </div>
  );
}
