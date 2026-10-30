"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseCsv, readTextFile, toCsv } from "@/lib/csv";
import { readXlsx } from "@/lib/xlsx";
import {
  AUTO_STATUS, DEV_DEFAULT, DEV_EDITABLE, DEV_STATUS, devFollowUps, DEV_STALE_DAYS, expiringProducts, LABEL, monthlyReport, productState, TIERS,
  type Dev, type DevProduct,
} from "@/lib/developers";

type Data = { devs: Dev[]; products: DevProduct[]; logs: Record<string, string>[]; staff: string[]; productTypes: string[]; today: string };
type Dup = { dev_code: string; company_name: string; project_main: string; matched: string[] };
const dmy = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const thb = (n: number) => `฿${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const ST_COLOR: Record<string, string> = {
  ยังไม่เข้าร่วม: "bg-slate-100", เข้าร่วมแล้ว: "bg-sky-100", มีแผนเข้าพบ: "bg-amber-100", เข้าพบแล้ว: "bg-indigo-100", ปิดการขาย: "bg-emerald-100",
  "กำลังใช้ Product": "bg-green-200", ใกล้หมดสัญญา: "bg-orange-200", ไม่ให้เข้าพบ: "bg-rose-100",
};
const MATCH_TH: Record<string, string> = { company: "ชื่อบริษัท", project: "ชื่อโครงการ", phone: "เบอร์", line: "Line" };
const emptyForm = (): Dev => ({ ...Object.fromEntries(DEV_EDITABLE.map((k) => [k, ""])), status: DEV_DEFAULT });
const emptyProd = (): DevProduct => ({ product: "", start_date: "", end_date: "", price_thb: "", notes: "" });
const TEMPLATE = [["ชื่อบริษัท", "โครงการหลัก", "โครงการรอง 1", "โครงการรอง 2", "ชื่อผู้ติดต่อ", "เบอร์", "Line", "Tier", "Nayoo URL", "Staff", "Status", "ติดต่อล่าสุด", "ติดต่อครั้งถัดไป", "Remark", "Note"],
  ["บริษัท ตัวอย่าง จำกัด", "หมู่บ้านตัวอย่าง", "", "", "คุณสมชาย", "0812345678", "@example", "A", "https://...", "พี่เอ", "เข้าร่วมแล้ว", "2026-10-01", "2026-11-05", "", ""]];

export function DevelopersManager() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [f, setF] = useState({ q: "", status: "", tier: "", staff: "", product: "" });
  const [follow, setFollow] = useState<"" | "overdue" | "today" | "stale">("");
  const [form, setForm] = useState<Dev | null>(null);
  const [editing, setEditing] = useState<Dev | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dups, setDups] = useState<Dup[] | null>(null);
  const [viewId, setViewId] = useState("");
  const [prod, setProd] = useState<DevProduct | null>(null);
  const [prodErr, setProdErr] = useState<Record<string, string>>({});
  const [newType, setNewType] = useState("");
  const [busy, setBusy] = useState(false);
  const [delAsk, setDelAsk] = useState(false);
  const [month, setMonth] = useState("");
  const [imp, setImp] = useState<{ name: string; grid: string[][]; plan?: { counts: Record<string, number>; results: { n: number; status: string; name: string; errors?: Record<string, string>; matches?: string[] }[]; committed: boolean } } | null>(null);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/developers"); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); setData(j); setErr(""); setMonth((m) => m || j.today.slice(0, 7)); }
    catch (e) { setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่ได้"); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search); const v = sp.get("follow");
    if (v === "overdue" || v === "today" || v === "stale") setFollow(v);
    if (sp.get("view")) setViewId(sp.get("view")!); // เปิดจากบอร์ด Sale developer (ปิดการขาย → เพิ่ม Product)
  }, []);

  async function call(method: string, body: object) {
    const r = await fetch("/api/developers", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw Object.assign(new Error(j.error ?? "เกิดข้อผิดพลาด"), { j }); return j;
  }

  const prodsOf = useMemo(() => { const m = new Map<string, DevProduct[]>(); for (const p of data?.products ?? []) { if (!m.has(p.developer_id)) m.set(p.developer_id, []); m.get(p.developer_id)!.push(p); } return m; }, [data]);
  const fu = useMemo(() => devFollowUps(data?.devs ?? [], data?.today ?? ""), [data]);
  const rows = useMemo(() => {
    if (!data) return [];
    const q = f.q.trim().toLowerCase();
    const ids = follow ? new Set(fu[follow].map((d) => d.developer_id)) : null;
    return data.devs.filter((d) => (!ids || ids.has(d.developer_id)) && (!f.status || (d.status || DEV_DEFAULT) === f.status) && (!f.tier || d.tier === f.tier) && (!f.staff || d.staff === f.staff)
      && (!f.product || (prodsOf.get(d.developer_id) ?? []).some((p) => p.product === f.product && productState(p, data.today) !== "expired"))
      && (!q || ["dev_code", "company_name", "project_main", "project_sub1", "project_sub2", "contact_name", "phone", "line_id", "remark", "notes"].some((k) => (d[k] ?? "").toLowerCase().includes(q))));
  }, [data, f, follow, fu, prodsOf]);
  const viewing = data?.devs.find((d) => d.developer_id === viewId) ?? null;
  const report = useMemo(() => (data && month ? monthlyReport(data.logs, data.products, data.devs, month) : []), [data, month]);
  const expiring = useMemo(() => (data ? expiringProducts(data.products, data.devs, data.today, 60) : []), [data]);

  const openForm = (d: Dev | null) => { setForm(d ? { ...emptyForm(), ...Object.fromEntries(DEV_EDITABLE.map((k) => [k, d[k] ?? ""])) } : emptyForm()); setEditing(d); setErrors({}); setDups(null); setDelAsk(false); setMsg(null); setViewId(""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  async function save(opts: { confirmDuplicate?: boolean } = {}) {
    if (!form) return; setBusy(true); setErrors({}); setMsg(null);
    try {
      const j = await call("POST", { ...form, developer_id: editing?.developer_id, updated_at_seen: editing?.updated_at, ...opts });
      setMsg({ type: "ok", text: `${j.created ? "สร้าง" : "บันทึก"} ${j.dev.dev_code} แล้ว` }); setForm(null); setEditing(null); setDups(null); setViewId(j.dev.developer_id); await load();
    } catch (e) {
      const j = (e as { j?: { code?: string; fields?: Record<string, string>; matches?: Dup[] } }).j;
      if (j?.code === "DUPLICATE_WARNING") setDups(j.matches ?? []); else setErrors(j?.fields ?? {});
      setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" });
    } finally { setBusy(false); }
  }
  async function del() {
    if (!editing) return; setBusy(true);
    try { const j = await call("DELETE", { developer_id: editing.developer_id, updated_at_seen: editing.updated_at }); setMsg({ type: "ok", text: `ลบ ${j.dev_code} แล้ว` }); setForm(null); setEditing(null); await load(); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }); } finally { setBusy(false); setDelAsk(false); }
  }
  async function saveProd() {
    if (!prod || !viewing) return; setBusy(true); setProdErr({});
    try {
      const j = await call("POST", { action: "product", ...prod, developer_id: viewing.developer_id, updated_at_seen: prod.updated_at });
      setMsg({ type: "ok", text: `บันทึก ${j.product.product} แล้ว · Status ตอนนี้: ${j.dev.status}` }); setProd(null); await load();
    } catch (e) { setProdErr((e as { j?: { fields?: Record<string, string> } }).j?.fields ?? {}); setMsg({ type: "error", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }); } finally { setBusy(false); }
  }
  async function delProd(p: DevProduct) {
    if (!window.confirm(`ลบ ${p.product} (${dmy(p.start_date)}–${dmy(p.end_date)}) ?`)) return;
    setBusy(true); try { await call("DELETE", { product_id: p.product_id }); setMsg({ type: "ok", text: `ลบ ${p.product} แล้ว` }); await load(); } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }); } finally { setBusy(false); }
  }
  async function addType() {
    setBusy(true); try { const j = await call("POST", { action: "product_type", name: newType }); setMsg({ type: "ok", text: j.added ? `เพิ่ม Product "${newType.trim()}" แล้ว` : "มี Product นี้อยู่แล้ว" }); setProd((p) => (p ? { ...p, product: newType.trim() } : p)); setNewType(""); await load(); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ" }); } finally { setBusy(false); }
  }
  async function pickImport(file?: File | null) {
    if (!file) return; setMsg(null);
    try {
      const grid: string[][] = /\.xlsx$/i.test(file.name)
        ? (await readXlsx(await file.arrayBuffer(), "")).sheet.rows.map((r) => r.map((c) => (c === null ? "" : typeof c === "number" && c > 30000 && c < 80000 ? new Date(Date.UTC(1899, 11, 30) + c * 864e5).toISOString().slice(0, 10) : String(c))))
        : parseCsv(await readTextFile(file));
      setImp({ name: file.name, grid });
      const j = await call("POST", { action: "import_plan", grid }); setImp({ name: file.name, grid, plan: j });
    } catch (e) { setImp(null); setMsg({ type: "error", text: e instanceof Error ? e.message : "อ่านไฟล์ไม่ได้" }); }
  }
  async function commitImport() {
    if (!imp) return; setBusy(true);
    try { const j = await call("POST", { action: "import_commit", grid: imp.grid }); setImp({ ...imp, plan: j }); setMsg({ type: "ok", text: `นำเข้า ${j.counts.insert} รายการแล้ว` }); await load(); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ" }); } finally { setBusy(false); }
  }
  const downloadTemplate = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + toCsv(TEMPLATE)], { type: "text/csv;charset=utf-8" })); a.download = "developer_template.csv"; a.click(); URL.revokeObjectURL(a.href); };

  if (err) return <p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">{err}</p>;
  if (!data) return <p className="text-sm text-slate-500">กำลังโหลด...</p>;
  const inp = (k: string, e = errors) => `w-full rounded-md border px-2 py-1.5 text-sm ${e[k] ? "border-red-400" : "border-slate-300"}`;
  const fld = (k: string, label = LABEL[k], o: { type?: string; area?: boolean; list?: string; req?: boolean } = {}) => (
    <label key={k} className="text-sm"><span className="mb-1 block text-xs text-slate-600">{label}{o.req && " *"}</span>
      {o.area ? <textarea rows={2} value={form![k]} onChange={(e) => setForm({ ...form!, [k]: e.target.value })} className={inp(k)} />
        : <input type={o.type ?? "text"} list={o.list} value={form![k]} onChange={(e) => setForm({ ...form!, [k]: e.target.value })} className={inp(k)} />}
      {errors[k] && <span className="text-xs text-red-600">{errors[k]}</span>}</label>
  );
  const sel = (k: string, label: string, opts: readonly string[], blank = "— เลือก —") => (
    <label key={k} className="text-sm"><span className="mb-1 block text-xs text-slate-600">{label}</span>
      <select aria-label={label} value={form![k]} onChange={(e) => setForm({ ...form!, [k]: e.target.value })} className={inp(k)}>{blank && <option value="">{blank}</option>}{opts.map((o) => <option key={o}>{o}</option>)}</select>
      {errors[k] && <span className="text-xs text-red-600">{errors[k]}</span>}</label>
  );
  const fsel = (k: keyof typeof f, label: string, opts: readonly string[]) => (
    <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">{label}</span>
      <select aria-label={`กรอง ${label}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="max-w-44 rounded-md border border-slate-300 px-2 py-1.5 text-sm"><option value="">ทั้งหมด</option>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>
  );
  const activeOf = (d: Dev) => (prodsOf.get(d.developer_id) ?? []).filter((p) => productState(p, data.today) !== "expired").sort((a, b) => a.end_date.localeCompare(b.end_date));
  const lockedStatus = editing && (AUTO_STATUS.includes(editing.status) || activeOf(editing).some((p) => productState(p, data.today) === "active"));

  return (
    <div className="space-y-5">
      {msg && <p role={msg.type === "error" ? "alert" : "status"} className={`rounded-md p-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

      {form && (
        <section className="space-y-4 rounded-lg border border-slate-300 bg-white p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">{editing ? `แก้ไข ${editing.dev_code}` : "เพิ่ม Developer ใหม่"}</h2><button onClick={() => { setForm(null); setEditing(null); }} className="text-sm underline">ปิด</button></div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            {fld("company_name")}{fld("project_main")}{fld("project_sub1")}{fld("project_sub2")}
            {fld("contact_name")}{fld("phone", LABEL.phone, { type: "tel" })}{fld("line_id")}{sel("tier", "Tier", TIERS)}
            {fld("nayoo_url", LABEL.nayoo_url, { type: "url" })}{fld("staff", "Staff", { list: "dev-staff" })}
            <datalist id="dev-staff">{data.staff.map((s) => <option key={s} value={s} />)}</datalist>
            {lockedStatus ? <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">Status</span><input disabled value={editing!.status} className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm" /><span className="text-xs text-slate-500">เปลี่ยนเองตามวันของ Product</span></label>
              : sel("status", "Status", DEV_STATUS.filter((s) => !AUTO_STATUS.includes(s)), "")}
            {fld("last_contacted_at", LABEL.last_contacted_at, { type: "date" })}{fld("next_follow_up_at", LABEL.next_follow_up_at, { type: "date" })}
          </div>
          <div className="grid gap-3 md:grid-cols-2">{fld("remark", "Remark", { area: true })}{fld("notes", "Note (บันทึกภายใน)", { area: true })}</div>
          <p className="text-xs text-slate-500">กรอกชื่อบริษัทหรือโครงการหลักอย่างน้อย 1 ช่อง · เปลี่ยน Status เป็น เข้าพบแล้ว → ติดต่อล่าสุด = วันนี้ · Product ที่ใช้อยู่ เพิ่มได้หลังบันทึก (กด ดู)</p>
          {dups && (
            <div role="alert" className="space-y-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <p>พบรายการที่อาจซ้ำ:</p><ul className="list-disc pl-5">{dups.map((d) => <li key={d.dev_code}>{d.dev_code} · {d.company_name || d.project_main} · ซ้ำที่ {d.matched.map((m) => MATCH_TH[m]).join(", ")}</li>)}</ul>
              <div className="flex gap-3"><button onClick={() => save({ confirmDuplicate: true })} disabled={busy} className="rounded-md bg-amber-700 px-3 py-1.5 text-white">บันทึกต่อ (เป็นรายการแยก)</button><button onClick={() => setDups(null)} className="underline">กลับไปแก้ไข</button></div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => save()} disabled={busy} className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">{busy ? "กำลังบันทึก..." : "บันทึก"}</button>
            {editing && !delAsk && <button onClick={() => setDelAsk(true)} className="text-sm text-red-700 underline">ลบรายการนี้</button>}
            {editing && delAsk && <span className="text-sm text-red-700">ลบ {editing.dev_code} และ Product ทั้งหมดของรายการนี้? <button onClick={del} disabled={busy} className="ml-2 rounded bg-red-700 px-2 py-1 text-white">ยืนยันลบ</button> <button onClick={() => setDelAsk(false)} className="ml-1 underline">ยกเลิก</button></span>}
          </div>
        </section>
      )}

      {viewing && !form && (
        <section className="space-y-4 rounded-lg border border-slate-300 bg-white p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">{viewing.dev_code} · {viewing.company_name || viewing.project_main}</h2>
            <span className="flex gap-4 text-sm"><button onClick={() => openForm(viewing)} className="underline">แก้ไข</button><button onClick={() => setViewId("")} className="underline">ปิด</button></span></div>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {DEV_EDITABLE.filter((k) => !["remark", "notes"].includes(k)).map((k) => <div key={k}><dt className="text-xs text-slate-500">{LABEL[k]}</dt><dd className="break-words">{k === "nayoo_url" && viewing[k] ? <a href={viewing[k]} target="_blank" rel="noopener noreferrer" className="underline">{viewing[k]}</a> : k.endsWith("_at") ? dmy(viewing[k]) || "—" : viewing[k] || <span className="text-slate-300">—</span>}</dd></div>)}
          </dl>
          {[["Remark", viewing.remark], ["Note", viewing.notes]].map(([k, v]) => <div key={k} className="text-sm"><div className="text-xs text-slate-500">{k}</div><p className="whitespace-pre-wrap">{v || <span className="text-slate-300">—</span>}</p></div>)}
          <div className="space-y-2">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Product ที่ใช้อยู่</h3>{!prod && <button onClick={() => { setProd(emptyProd()); setProdErr({}); }} className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white">+ เพิ่ม Product</button>}</div>
            {(() => {
              const ps = prodsOf.get(viewing.developer_id) ?? [];
              const cur = ps.filter((p) => productState(p, data.today) !== "expired").sort((a, b) => a.end_date.localeCompare(b.end_date)), old = ps.filter((p) => productState(p, data.today) === "expired").sort((a, b) => b.end_date.localeCompare(a.end_date));
              const line = (p: DevProduct, past = false) => (
                <li key={p.product_id} className="flex flex-wrap items-center gap-x-3 border-b border-slate-100 py-1.5 text-sm">
                  <b>{p.product}</b><span>{dmy(p.start_date)} – {dmy(p.end_date)}</span>{p.price_thb && <span className="tabular-nums">{thb(Number(p.price_thb))}</span>}
                  {!past && <span className={`rounded px-1.5 text-xs ${productState(p, data.today) === "future" ? "bg-slate-100" : "bg-green-100"}`}>{productState(p, data.today) === "future" ? "ยังไม่เริ่ม" : `เหลือ ${Math.round((Date.parse(p.end_date) - Date.parse(data.today)) / 864e5)} วัน`}</span>}
                  {p.notes && <span className="text-xs text-slate-500">{p.notes}</span>}
                  <span className="ml-auto flex gap-3 text-xs"><button onClick={() => { setProd({ ...p }); setProdErr({}); }} className="underline">แก้ไข</button><button onClick={() => delProd(p)} className="text-red-700 underline">ลบ</button></span>
                </li>);
              return <>
                {cur.length ? <ul>{cur.map((p) => line(p))}</ul> : <p className="text-sm text-slate-500">ยังไม่มี Product ที่ใช้อยู่</p>}
                <h3 className="pt-2 text-sm font-semibold">Product ที่เคยใช้ <span className="font-normal text-slate-500">(หมดอายุแล้ว)</span></h3>
                {old.length ? <ul className="text-slate-600">{old.map((p) => line(p, true))}</ul> : <p className="text-sm text-slate-500">—</p>}
              </>;
            })()}
            {prod && (
              <div className="space-y-2 rounded-md bg-slate-50 p-3">
                <div className="grid gap-2 sm:grid-cols-5">
                  <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">Product *</span><select aria-label="Product" value={prod.product} onChange={(e) => setProd({ ...prod, product: e.target.value })} className={inp("product", prodErr)}><option value="">— เลือก —</option>{data.productTypes.map((t) => <option key={t}>{t}</option>)}</select></label>
                  <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">วันเริ่ม *</span><input type="date" aria-label="วันเริ่ม" value={prod.start_date} onChange={(e) => setProd({ ...prod, start_date: e.target.value })} className={inp("start_date", prodErr)} /></label>
                  <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">วันหมดอายุ *</span><input type="date" aria-label="วันหมดอายุ" value={prod.end_date} onChange={(e) => setProd({ ...prod, end_date: e.target.value })} className={inp("end_date", prodErr)} /></label>
                  <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">ราคา (บาท)</span><input inputMode="decimal" aria-label="ราคา (บาท)" value={prod.price_thb} onChange={(e) => setProd({ ...prod, price_thb: e.target.value })} className={inp("price_thb", prodErr)} /></label>
                  <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">หมายเหตุ</span><input aria-label="หมายเหตุ Product" value={prod.notes} onChange={(e) => setProd({ ...prod, notes: e.target.value })} className={inp("notes", prodErr)} /></label>
                </div>
                {Object.values(prodErr).length > 0 && <p className="text-xs text-red-600">{Object.values(prodErr).join(" · ")}</p>}
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <button onClick={saveProd} disabled={busy} className="rounded-md bg-slate-900 px-4 py-1.5 text-white disabled:opacity-40">บันทึก Product</button><button onClick={() => setProd(null)} className="underline">ยกเลิก</button>
                  <span className="ml-auto flex items-center gap-1"><input aria-label="ชื่อ Product ใหม่" value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="ชนิด Product ใหม่" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" /><button onClick={addType} disabled={busy || !newType.trim()} className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-40">+ เพิ่มชนิด</button></span>
                </div>
                <p className="text-xs text-slate-500">Product ที่เริ่มแล้ว → Status เป็น กำลังใช้ Product (เหลือ ≤ 30 วัน = ใกล้หมดสัญญา) · หมดอายุทุกตัว → กลับไป เข้าร่วมแล้ว และย้ายไป Product ที่เคยใช้ · ยังไม่ถึงวันเริ่ม → คงที่ ปิดการขาย</p>
              </div>
            )}
          </div>
        </section>
      )}

      <nav aria-label="รายการติดตาม" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-slate-500">ติดตาม:</span>
        {([["overdue", "เลยกำหนด", fu.overdue.length, "bg-red-600"], ["today", "วันนี้", fu.today.length, "bg-amber-500"], ["stale", `ค้างเกิน ${DEV_STALE_DAYS} วัน`, fu.stale.length, "bg-slate-600"]] as const).map(([k, l, n, c]) => (
          <button key={k} aria-pressed={follow === k} onClick={() => setFollow(follow === k ? "" : k)} className={`rounded-full px-3 py-1 text-xs ${follow === k ? "bg-slate-900 text-white" : "bg-white ring-1 ring-slate-200 hover:bg-slate-100"}`}>{l} <span className={`ml-1 rounded-full px-1.5 text-white ${n ? c : "bg-slate-300"}`}>{n}</span></button>))}
        {follow && <button onClick={() => setFollow("")} className="text-xs underline">แสดงทั้งหมด</button>}
      </nav>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ค้นหา</span><input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="บริษัท / โครงการ / ผู้ติดต่อ / เบอร์ / Line" className="w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
        {fsel("status", "Status", DEV_STATUS)}{fsel("tier", "Tier", TIERS)}{fsel("staff", "Staff", data.staff)}{fsel("product", "Product ที่ใช้อยู่", data.productTypes)}
        {Object.values(f).some(Boolean) && <button onClick={() => setF({ q: "", status: "", tier: "", staff: "", product: "" })} className="py-1.5 text-sm underline">ล้าง</button>}
        <button onClick={() => openForm(null)} className="ml-auto rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">+ เพิ่ม Developer</button>
      </div>

      {data.devs.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">ยังไม่มี Developer — กด &quot;+ เพิ่ม Developer&quot; หรือนำเข้ารายชื่อจากไฟล์ด้านล่าง</p> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead><tr className="border-b bg-slate-50 text-xs text-slate-500"><th className="p-2">รหัส</th><th>บริษัท / โครงการหลัก</th><th>ผู้ติดต่อ</th><th>เบอร์ / Line</th><th>Tier</th><th>Status</th><th>Product ที่ใช้อยู่</th><th>Staff</th><th>ติดต่อครั้งถัดไป</th><th /></tr></thead>
            <tbody>{rows.map((d) => {
              const act = activeOf(d); const over = d.next_follow_up_at && d.next_follow_up_at < data.today;
              return (
                <tr key={d.developer_id} className="border-b border-slate-100 align-top">
                  <td className="p-2 font-mono text-xs">{d.dev_code}</td>
                  <td className="py-2"><div className="font-medium">{d.company_name || "—"}</div><div className="text-xs text-slate-500">{[d.project_main, d.project_sub1, d.project_sub2].filter(Boolean).join(" · ")}</div></td>
                  <td>{d.contact_name}</td><td className="text-xs">{d.phone}<div>{d.line_id}</div></td><td>{d.tier}</td>
                  <td><span className={`rounded px-1.5 py-0.5 text-xs ${ST_COLOR[d.status || DEV_DEFAULT] ?? "bg-slate-100"}`}>{d.status || DEV_DEFAULT}</span></td>
                  <td className="text-xs">{act.length ? act.map((p) => <div key={p.product_id}>{p.product} <span className="text-slate-500">ถึง {dmy(p.end_date)}</span></div>) : <span className="text-slate-300">—</span>}</td>
                  <td>{d.staff}</td><td className={over ? "font-semibold text-red-600" : ""}>{dmy(d.next_follow_up_at)}</td>
                  <td className="whitespace-nowrap pr-2 text-right"><button onClick={() => { setViewId(d.developer_id); setForm(null); setProd(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="underline">ดู</button> · <button onClick={() => openForm(d)} className="underline">แก้ไข</button></td>
                </tr>);
            })}</tbody>
          </table>
          <p className="p-2 text-xs text-slate-500">{rows.length.toLocaleString("en-US")} รายการ</p>
        </div>
      )}

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="font-semibold">สรุปรายเดือน (ต่อ Staff)</h2>
          <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">เดือน</span><input type="month" aria-label="เดือนของสรุป" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label></div>
        {report.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มีการเปลี่ยน Status ในเดือนนี้</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="py-1.5 text-left font-medium">Staff</th><th className="text-right font-medium">นัดเข้าพบ</th><th className="text-right font-medium">เข้าพบแล้ว</th><th className="text-right font-medium">ไม่ให้เข้าพบ / นัดไม่สำเร็จ</th><th className="text-right font-medium">Win (ปิดการขาย)</th><th className="text-right font-medium">ยอด Product ที่เริ่มเดือนนี้</th></tr></thead>
            <tbody>{report.map((r) => <tr key={r.staff} className="border-b border-slate-100 tabular-nums"><td className="py-1.5">{r.staff}</td><td className="text-right">{r.planned}</td><td className="text-right">{r.met}</td><td className="text-right">{r.noMeeting}</td><td className="text-right font-semibold">{r.won}</td><td className="text-right">{r.productSales ? thb(r.productSales) : "—"}</td></tr>)}</tbody>
          </table></div>
        )}
        <p className="text-xs text-slate-500">นับจากประวัติการเปลี่ยน Status (ไม่หายเมื่อการ์ดถูกย้ายกลับตอนสิ้นเดือน) · ไม่ให้เข้าพบ = ย้ายไป ไม่ให้เข้าพบ + มีแผนเข้าพบที่หมดเดือนโดยยังไม่ได้เข้าพบ</p>
        <h3 className="pt-2 text-sm font-semibold">Product ที่จะหมดอายุใน 60 วัน</h3>
        {expiring.length === 0 ? <p className="text-sm text-slate-500">ไม่มี</p> : (
          <ul className="space-y-1 text-sm">{expiring.map((x) => <li key={x.p.product_id} className="flex flex-wrap gap-x-3"><span className={`w-20 font-semibold ${x.daysLeft <= 30 ? "text-orange-700" : "text-slate-700"}`}>อีก {x.daysLeft} วัน</span><button onClick={() => setViewId(x.dev.developer_id)} className="underline">{x.dev.company_name || x.dev.project_main}</button><span>{x.p.product} หมด {dmy(x.p.end_date)}</span><span className="text-slate-500">{x.dev.staff}</span></li>)}</ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold">นำเข้ารายชื่อ Developer จากไฟล์</h2>
        <p className="text-sm text-slate-600">ไฟล์ .csv หรือ .xlsx ที่แถวแรกเป็นหัวคอลัมน์ตามฟอร์ม (ชื่อบริษัท, โครงการหลัก, ชื่อผู้ติดต่อ, เบอร์, Line, Tier, Staff, Status ...) · รายการที่ซ้ำกับที่มีอยู่จะถูกข้าม · ระบบยังไม่เขียนข้อมูลจนกว่าจะกดยืนยัน</p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="cursor-pointer rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white hover:bg-slate-700">เลือกไฟล์<input type="file" accept=".csv,text/csv,.xlsx" aria-label="ไฟล์รายชื่อ Developer" className="hidden" onChange={(e) => { pickImport(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <button onClick={downloadTemplate} className="underline">ดาวน์โหลดไฟล์ตัวอย่าง</button>
        </div>
        {imp?.plan && (
          <div className="space-y-2 text-sm">
            <p><b>{imp.name}</b>: เพิ่ม {imp.plan.counts.insert} · ซ้ำ (ข้าม) {imp.plan.counts.duplicate} · ไม่ถูกต้อง {imp.plan.counts.invalid}{imp.plan.committed && " — นำเข้าแล้ว"}</p>
            {imp.plan.results.filter((r) => r.status !== "insert").slice(0, 20).map((r) => <p key={r.n} className="text-xs text-amber-800">แถว {r.n} {r.name}: {r.status === "duplicate" ? `ซ้ำกับ ${r.matches?.join(", ")}` : Object.values(r.errors ?? {}).join(" · ")}</p>)}
            {!imp.plan.committed && imp.plan.counts.insert > 0 && <button onClick={commitImport} disabled={busy} className="rounded-md bg-slate-900 px-4 py-1.5 text-white disabled:opacity-40">ยืนยันนำเข้า {imp.plan.counts.insert} รายการ</button>}
          </div>
        )}
      </section>
    </div>
  );
}
