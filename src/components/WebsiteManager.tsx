"use client";
import { Skeleton } from "@/components/Skeleton";
import { Notice } from "@/components/Toast";
import { DateInput } from "@/components/DateInput";
import { thDate, thDateTime, thMonth, thDayMonth } from "@/lib/thdate";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assembleBatches, KIND_LABEL, parseWebsiteFile, WebParseError, type ParsedFile, type UploadBatch } from "@/lib/website/parse";
import { readTextFile } from "@/lib/csv";

type Row = Record<string, string>;
type Plan = { kind: string; label: string; filename: string; period: { start: string; end: string }; counts: { insert: number; update: number; skip: number }; fileDuplicate: { uploadedAt: string; uploadedBy: string } | null };
const dmy = (s: string) => thDate(s);
const fmt = (v: string | number | undefined, d = 0) => (v === "" || v === undefined || v === null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));
const dur = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)} นาที ${Math.round(sec % 60)} วินาที` : `${Math.round(sec * 10) / 10} วินาที`);
async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// คอลัมน์ของแต่ละตาราง: [คีย์, หัวตาราง, ชนิด]
type Col = [string, string, "n" | "dur" | "pct" | "pos"];
const SC: Col[] = [["clicks", "Clicks", "n"], ["impressions", "Impressions", "n"], ["ctr_pct", "CTR", "pct"], ["position", "ตำแหน่ง", "pos"]];
const DIM_COLS: Record<string, Col[]> = {
  ga4_page: [["views", "การดู", "n"], ["user_engagement_sec", "เวลามีส่วนร่วม/การดู", "dur"], ["key_events", "กิจกรรมสำคัญ", "n"]],
  ga4_page_title: [["views", "การดู", "n"], ["users", "ผู้ใช้ (รายหน้า)", "n"], ["event_count", "เหตุการณ์", "n"]],
  ga4_first_user_source: [["users", "ผู้ใช้ใหม่จากแหล่งนี้", "n"]], ga4_session_source: [["sessions", "Sessions", "n"]], ga4_city: [["users", "ผู้ใช้", "n"]],
  search_page: SC, search_query: SC, search_device: SC, search_country: SC, search_appearance: SC,
};
const SORT: Record<string, string> = { ga4_page: "views", ga4_page_title: "views", ga4_first_user_source: "users", ga4_session_source: "sessions", ga4_city: "users" };
const DIM_TITLE: Record<string, string> = { ga4_page_title: "GA4 Snapshot — หน้า (ชื่อหน้า)", ga4_session_source: "GA4 Snapshot — Sessions ตามแหล่งที่มา", ga4_first_user_source: "GA4 Snapshot — แหล่งที่มาของผู้ใช้ครั้งแรก", ga4_city: "GA4 Snapshot — เมือง", ga4_page: "GA4 — หน้าที่มีการดูมากที่สุด", search_page: "Search Console — หน้า", search_query: "Search Console — คำค้นหา", search_device: "Search Console — อุปกรณ์", search_country: "Search Console — ประเทศ", search_appearance: "Search Console — ลักษณะการแสดงผล" };

/** importOnly + incoming: ใช้ในหน้า นำเข้า CSV (รับไฟล์ที่เลือกมาจากหน้านั้น แสดงเฉพาะส่วนนำเข้า) */
export function WebsiteManager({ isAdmin, importOnly = false, incoming }: { isAdmin: boolean; importOnly?: boolean; incoming?: { files: File[]; id: number } }) {
  const [files, setFiles] = useState<(ParsedFile & { sha256: string })[]>([]);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [period, setPeriod] = useState({ start: "", end: "" });
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [data, setData] = useState<{ summary: Row[]; periods: { start: string; end: string }[]; selected: { start: string; end: string } | null; dims: Row[]; error?: string } | null>(null);
  const [manual, setManual] = useState({ report_start: "", report_end: "", website_users: "", page_views: "", avg_engagement_sec_per_user: "", notes: "" });
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});

  const load = useCallback(async (p?: { start: string; end: string }) => {
    try {
      const r = await fetch(`/api/website${p ? `?start=${p.start}&end=${p.end}` : ""}`); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j);
    } catch (e) { setData({ summary: [], periods: [], selected: null, dims: [], error: e instanceof Error ? e.message : "error" }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const assembled = useMemo(() => assembleBatches(files, period.start && period.end ? period : undefined), [files, period]);
  const needPeriod = files.some((f) => f.kind.startsWith("gsc_") && f.kind !== "gsc_chart" && f.kind !== "gsc_filters") && !files.some((f) => f.kind === "gsc_filters" || f.kind === "gsc_chart");

  useEffect(() => { if (incoming?.files.length) pick(incoming.files); }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps
  async function pick(list: FileList | File[] | null) {
    if (!list?.length) return;
    setReading(true); setMsg(null); setPlans(null); setFileErrors([]);
    const ok: (ParsedFile & { sha256: string })[] = [], errs: string[] = [];
    for (const f of [...list]) {
      try {
        if (f.size > 20 * 1024 * 1024) throw new WebParseError("TOO_LARGE", "ไฟล์ใหญ่เกิน 20 MB");
        const text = await readTextFile(f);
        ok.push({ ...parseWebsiteFile(f.name, text), sha256: await sha256(text) });
      } catch (e) { errs.push(`${f.name}: ${e instanceof Error ? e.message : "อ่านไม่ได้"}`); }
    }
    setFiles(ok); setFileErrors(errs); setReading(false);
  }

  async function post(body: object) {
    const r = await fetch("/api/website", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j;
  }
  async function plan(batches: UploadBatch[]) {
    setBusy(true); setMsg(null);
    try { setPlans((await post({ action: "plan", batches })).plans); } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "error" }); } finally { setBusy(false); }
  }
  async function commit() {
    setBusy(true); setMsg(null);
    try {
      const j = await post({ action: "commit", batches: assembled.batches, overrideDuplicate: override });
      const t = j.results.reduce((a: number[], x: { inserted: number; updated: number; skipped: number }) => [a[0] + x.inserted, a[1] + x.updated, a[2] + x.skipped], [0, 0, 0]);
      setMsg({ type: "ok", text: `นำเข้าแล้ว ${j.results.length} ไฟล์: เพิ่ม ${t[0]} · อัปเดต ${t[1]} · ข้าม (เหมือนเดิม) ${t[2]} แถว` });
      setFiles([]); setPlans(null); setOverride(false); await load();
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "error" }); } finally { setBusy(false); }
  }
  async function saveManual() {
    setBusy(true); setMsg(null);
    try { const j = await post({ action: "manual", manual }); setMsg({ type: "ok", text: j.created ? "บันทึกยอดผู้ใช้แล้ว" : "แก้ไขยอดผู้ใช้ของช่วงนี้แล้ว" }); await load(data?.selected ?? undefined); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "error" }); } finally { setBusy(false); }
  }

  const ga4Periods = (data?.summary ?? []).filter((r) => r.source === "ga4");
  const snapRows = (data?.summary ?? []).filter((r) => r.source === "ga4_snapshot");
  const snapKeys = new Set(snapRows.map((r) => `${r.report_start}|${r.report_end}`));
  const manualRows = (data?.summary ?? []).filter((r) => r.source === "manual");
  const gscDays = (data?.summary ?? []).filter((r) => r.source === "search_console").map((r) => r.report_start).sort();
  const inp = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const dupAny = plans?.some((p) => p.fileDuplicate);

  return (
    <div className="space-y-6">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      {data?.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{data.error}</p>}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">{importOnly ? "ไฟล์เว็บไซต์ (GA4 / Search Console)" : "1. นำเข้าไฟล์ GA4 / Search Console"}</h2>
        {incoming ? <p className="text-sm text-slate-600">ไฟล์เว็บไซต์ที่เลือกจากช่องด้านบน — ตรวจประเภทและช่วงวันที่ แล้วกด ตรวจสอบก่อนนำเข้า</p> : <p className="text-sm text-slate-600">เลือกได้หลายไฟล์พร้อมกัน (CSV): GA4 → <b>Reports snapshot</b> (มียอดผู้ใช้จริง — แนะนำ) และ/หรือ หน้าและหน้าจอ (Pages and screens) · Search Console → ส่งออก Performance แล้วเลือกไฟล์ทั้งหมดในโฟลเดอร์ (Chart, Pages, Queries, Countries, Devices, Search appearance และ <b>Filters</b> ที่ใช้บอกช่วงวันที่) · ระบบอ่านไฟล์ในเครื่องของคุณก่อน แล้วส่งเฉพาะยอดสรุปขึ้นระบบ</p>}
        {!incoming && (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); if (!reading && !busy) pick(e.dataTransfer.files); }}
          className={`rounded-lg border-2 border-dashed p-6 text-center ${drag ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-slate-50"}`}>
          <p className="mb-3 text-sm text-slate-600">ลากไฟล์ CSV มาวางที่นี่ (หลายไฟล์พร้อมกันได้) หรือ</p>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={reading || busy} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">เลือกไฟล์</button>
          <input ref={fileInput} type="file" accept=".csv,text/csv" multiple disabled={reading || busy} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} className="hidden" />
          {files.length > 0 && <p className="mt-2 text-xs text-slate-500">เลือกแล้ว {files.length} ไฟล์</p>}
        </div>
        )}
        {reading && <p className="text-sm text-slate-500">กำลังอ่านไฟล์...</p>}
        {fileErrors.map((e, i) => <p key={i} role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{e}</p>)}
        {files.length > 0 && (
          <div className="space-y-2">
            <table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-1">ไฟล์</th><th>ประเภท</th><th>ช่วงวันที่</th><th>สรุปจากไฟล์</th></tr></thead>
              <tbody>{files.map((f) => {
                const b = assembled.batches.find((x) => x.filename === f.filename);
                const per = f.period ?? b?.period;
                return (<tr key={f.filename} className="border-b border-slate-100 align-top"><td className="max-w-48 truncate py-1 pr-2" title={f.filename}>{f.filename}</td><td className="pr-2">{KIND_LABEL[f.kind]}</td>
                  <td className="whitespace-nowrap pr-2">{per ? `${dmy(per.start)} – ${dmy(per.end)}` : <span className="text-amber-700">ไม่ทราบ</span>}</td>
                  <td className="text-xs text-slate-600">{Object.entries(f.info).map(([k, v]) => `${k}: ${typeof v === "number" ? v.toLocaleString("en-US") : v}`).join(" · ")}{f.warnings.map((w, i) => <div key={i} className="mt-1 text-amber-800">⚠ {w}</div>)}</td></tr>);
              })}</tbody></table>
            {needPeriod && <div className="flex flex-wrap items-end gap-3 text-sm"><span className="text-amber-800">ไม่มีไฟล์ Filters/Chart — กรอกช่วงวันที่ของรายงาน Search Console:</span>
              <DateInput className={inp} value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} /><DateInput className={inp} value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} /></div>}
            {assembled.errors.map((e, i) => <p key={i} role="alert" className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">{e}</p>)}
            {plans && <ul className="space-y-1 rounded-md bg-slate-50 p-3 text-sm">{plans.map((p) => <li key={p.filename}><b>{p.label}</b> ({dmy(p.period.start)}–{dmy(p.period.end)}): เพิ่ม {p.counts.insert} · อัปเดต {p.counts.update} · ข้าม {p.counts.skip}{p.fileDuplicate && <span className="text-amber-800"> · ไฟล์นี้เคยนำเข้าแล้วเมื่อ {thDateTime(p.fileDuplicate.uploadedAt)}</span>}</li>)}</ul>}
            <div className="flex flex-wrap items-center gap-3">
              {!plans ? <button disabled={busy || !assembled.batches.length || assembled.errors.length > 0} onClick={() => plan(assembled.batches)} className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">ตรวจสอบก่อนนำเข้า</button>
                : <button disabled={busy || (dupAny && !override)} onClick={commit} className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">{busy ? "กำลังนำเข้า..." : "ยืนยันนำเข้า"}</button>}
              {dupAny && isAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> ยืนยันนำเข้าซ้ำ (Admin — ยอดจะอัปเดตตามคีย์ ไม่ถูกบวกซ้ำ)</label>}
              {dupAny && !isAdmin && <span className="text-sm text-amber-800">มีไฟล์ที่เคยนำเข้าแล้ว ให้ Admin เป็นผู้ยืนยัน</span>}
              <button onClick={() => { setFiles([]); setPlans(null); setFileErrors([]); }} className="text-sm underline">ล้าง</button>
            </div>
          </div>
        )}
      </section>

      {!importOnly && <>
      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">2. ยอดผู้ใช้เว็บไซต์ (กรอกเอง)</h2>
        <p className="text-sm text-slate-600"><b>ไม่ต้องกรอก ถ้านำเข้าไฟล์ GA4 Reports snapshot ของช่วงเดียวกันแล้ว</b> (ไฟล์นั้นมี Active users จริง) · ใช้เมื่อมีแต่ไฟล์ หน้าและหน้าจอ ซึ่งไม่มียอดผู้ใช้รวม — ดูยอด <b>Active users</b> ของช่วงเดียวกันใน GA4 แล้วกรอกที่นี่</p>
        {ga4Periods.some((r) => !snapKeys.has(`${r.report_start}|${r.report_end}`)) && <p className="text-xs text-slate-500">ช่วงของไฟล์ GA4 รายหน้าที่ยังไม่มียอดผู้ใช้จาก Snapshot: {ga4Periods.filter((r) => !snapKeys.has(`${r.report_start}|${r.report_end}`)).map((r) => <button key={r.row_key} type="button" className="mr-2 underline" onClick={() => setManual({ ...manual, report_start: r.report_start, report_end: r.report_end })}>{dmy(r.report_start)}–{dmy(r.report_end)}</button>)} (กดเพื่อใช้ช่วงนี้ — ช่วงต้องตรงกับไฟล์จึงจะคำนวณร่วมกันได้)</p>}
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <label><span className="mb-1 block text-xs text-slate-500">ตั้งแต่ *</span><DateInput className={inp + " w-full"} value={manual.report_start} onChange={(e) => setManual({ ...manual, report_start: e.target.value })} /></label>
          <label><span className="mb-1 block text-xs text-slate-500">ถึง *</span><DateInput className={inp + " w-full"} value={manual.report_end} onChange={(e) => setManual({ ...manual, report_end: e.target.value })} /></label>
          <label><span className="mb-1 block text-xs text-slate-500">Users *</span><input inputMode="numeric" className={inp + " w-full"} value={manual.website_users} onChange={(e) => setManual({ ...manual, website_users: e.target.value.replace(/[^\d]/g, "") })} /></label>
          <label><span className="mb-1 block text-xs text-slate-500">Page Views (กรอกเมื่อไม่มีไฟล์ GA4)</span><input inputMode="numeric" className={inp + " w-full"} value={manual.page_views} onChange={(e) => setManual({ ...manual, page_views: e.target.value.replace(/[^\d]/g, "") })} /></label>
          <label><span className="mb-1 block text-xs text-slate-500">เวลามีส่วนร่วมเฉลี่ยต่อผู้ใช้ (วินาที — เมื่อไม่มีไฟล์ GA4)</span><input inputMode="decimal" className={inp + " w-full"} value={manual.avg_engagement_sec_per_user} onChange={(e) => setManual({ ...manual, avg_engagement_sec_per_user: e.target.value.replace(/[^\d.]/g, "") })} /></label>
          <label><span className="mb-1 block text-xs text-slate-500">หมายเหตุ</span><input className={inp + " w-full"} value={manual.notes} onChange={(e) => setManual({ ...manual, notes: e.target.value })} /></label>
        </div>
        <button disabled={busy || !manual.report_start || !manual.report_end || !manual.website_users} onClick={saveManual} className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">บันทึกยอดผู้ใช้</button>
        {manualRows.length > 0 && <ul className="text-sm text-slate-600">{manualRows.map((r) => <li key={r.row_key}>{dmy(r.report_start)}–{dmy(r.report_end)}: Users {fmt(r.website_users)}{r.page_views ? ` · Page Views ${fmt(r.page_views)}` : ""}{r.avg_engagement_sec_per_user ? ` · ${dur(Number(r.avg_engagement_sec_per_user))}` : ""}{r.notes ? ` · ${r.notes}` : ""}</li>)}</ul>}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">3. ข้อมูลที่นำเข้าแล้ว</h2>
        {!data ? <Skeleton kind={"rows"} /> : (
          <>
            <ul className="text-sm text-slate-700">
              {snapRows.map((r) => <li key={r.row_key}>GA4 Reports snapshot {r.property && `(${r.property})`} {dmy(r.report_start)}–{dmy(r.report_end)}: <b>Active users {fmt(r.website_users)}</b> · ผู้ใช้ใหม่ {fmt(r.new_users)} · Page Views {fmt(r.page_views)} · Sessions {fmt(r.sessions)} · เวลามีส่วนร่วมเฉลี่ย {r.avg_engagement_sec_per_user ? dur(Number(r.avg_engagement_sec_per_user)) : "—"} · กิจกรรมสำคัญ {fmt(r.key_events)}</li>)}
              {ga4Periods.map((r) => <li key={r.row_key}>GA4 หน้าและหน้าจอ {r.property && `(${r.property})`} {dmy(r.report_start)}–{dmy(r.report_end)}: Page Views {fmt(r.page_views)} · เวลามีส่วนร่วมรวม {fmt(Number(r.user_engagement_sec) / 3600, 1)} ชม. · {fmt(r.pages_count)} หน้า</li>)}
              {gscDays.length > 0 && <li>Search Console รายวัน: {dmy(gscDays[0])}–{dmy(gscDays[gscDays.length - 1])} ({gscDays.length} วัน)</li>}
              {!ga4Periods.length && !snapRows.length && !gscDays.length && <li className="text-slate-500">ยังไม่มีข้อมูล</li>}
            </ul>
            {data.periods.length > 0 && <label className="text-sm"><span className="mr-2 text-slate-500">ช่วงของตารางรายละเอียด</span>
              <select className={inp} value={data.selected ? `${data.selected.start}|${data.selected.end}` : ""} onChange={(e) => { const [start, end] = e.target.value.split("|"); load({ start, end }); }}>
                {data.periods.map((p) => <option key={`${p.start}|${p.end}`} value={`${p.start}|${p.end}`}>{dmy(p.start)} – {dmy(p.end)}</option>)}</select></label>}
            <div className="grid gap-4 lg:grid-cols-2">
              {Object.keys(DIM_TITLE).map((t) => {
                const rows = data.dims.filter((r) => r.dimension_type === t);
                if (!rows.length) return null;
                const cols = DIM_COLS[t]; const by = SORT[t] ?? "clicks";
                const sorted = [...rows].sort((a, b) => (a.dimension_value.startsWith("(อื่น") ? 1 : b.dimension_value.startsWith("(อื่น") ? -1 : Number(b[by] || 0) - Number(a[by] || 0)));
                const shown = showAll[t] ? sorted : sorted.slice(0, 15);
                const cell = (r: Row, [k, , kind]: Col) => kind === "dur" ? (Number(r.views) > 0 ? dur(Number(r[k]) / Number(r.views)) : "—") : kind === "pct" ? (r[k] === "" ? "—" : `${fmt(r[k], 2)}%`) : fmt(r[k], kind === "pos" ? 1 : 0);
                return (
                  <div key={t} className={t === "ga4_page" || t === "ga4_page_title" ? "lg:col-span-2" : ""}>
                    <h3 className="mb-1 text-sm font-semibold">{DIM_TITLE[t]}</h3>
                    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                      <thead><tr className="border-b text-xs text-slate-500"><th className="py-1">รายการ</th>{cols.map(([k, h]) => <th key={k} className="text-right">{h}</th>)}</tr></thead>
                      <tbody>{shown.map((r) => <tr key={r.row_key} className="border-b border-slate-100"><td className="max-w-md truncate py-1 pr-2" title={r.dimension_value}>{r.dimension_value}</td>
                        {cols.map((c) => <td key={c[0]} className="text-right tabular-nums">{cell(r, c)}</td>)}</tr>)}</tbody></table></div>
                    {sorted.length > 15 && <button className="mt-1 text-xs underline" onClick={() => setShowAll({ ...showAll, [t]: !showAll[t] })}>{showAll[t] ? "แสดงน้อยลง" : `แสดงทั้งหมด ${sorted.length} รายการ`}</button>}
                  </div>);
              })}
            </div>
            <p className="text-xs text-slate-500">• ผู้ใช้ในตารางย่อย (หน้า / เมือง / แหล่งที่มา) เป็นรายกลุ่ม คนเดียวอยู่ได้หลายกลุ่ม — ยอดผู้ใช้จริงดูจาก Active users ของ Snapshot · แต่ละตาราง Google รวมข้อมูลคนละแบบ (ตามหน้า / ตามเว็บไซต์ / ไม่แสดงคำค้นที่ระบุตัวบุคคลได้) ยอดรวมของแต่ละตารางจึงไม่เท่ากัน — ห้ามนำมาบวกรวมกัน · แถว &quot;(อื่น ๆ)&quot; คือรายการที่เหลือหลัง 300 อันดับแรก</p>
          </>
        )}
      </section>
      </>}
    </div>
  );
}
