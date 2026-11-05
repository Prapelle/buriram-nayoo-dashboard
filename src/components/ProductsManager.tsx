"use client";
import { useCallback, useEffect, useState } from "react";
import { Notice, type Msg } from "./Toast";
import { btn } from "./PageHeader";

type P = { name: string; developers: number; docs: number };
type S = { product: string; content_count: number; report_days: number };
const inp = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const inpErr = "w-full rounded-md border border-red-500 bg-red-50 px-2 py-1.5 text-sm ring-1 ring-red-300";
const btnDanger = "inline-flex h-8 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50";
async function api(url: string, init?: RequestInit) { const r = await fetch(url, { cache: "no-store", ...init }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error ?? "ผิดพลาด"), { fields: j.fields as Record<string, string> | undefined }); return j; }
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Product: เพิ่ม · แก้ไข (เปลี่ยนชื่อ แก้ทุกที่ที่ใช้) · ลบ (ลบได้เมื่อไม่มีที่ใช้งานอยู่) */
export function ProductsManager({ canDelete }: { canDelete: boolean }) {
  const [rows, setRows] = useState<P[] | null>(null); const [msg, setMsg] = useState<Msg>(null); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(""); const [edit, setEdit] = useState<{ from: string; name: string } | null>(null); const [err, setErr] = useState("");
  const load = useCallback(async () => { try { setRows((await api("/api/account/products")).products); } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }); setRows([]); } }, []);
  const [sets, setSets] = useState<Record<string, { c: string; d: string }> | null>(null);
  const loadSets = useCallback(async () => { try { const r = await api("/api/content/products"); setSets(Object.fromEntries((r.settings as S[]).map((x) => [x.product, { c: x.content_count ? String(x.content_count) : "", d: x.report_days ? String(x.report_days) : "" }]))); } catch { setSets(null); } }, []);
  useEffect(() => { void load(); void loadSets(); }, [load, loadSets]);
  const saveSet = (p: string) => run(async () => { const v = sets?.[p] ?? { c: "", d: "" }; await api("/api/content/products", json("PUT", { product: p, content_count: v.c, report_days: v.d })); setMsg({ type: "ok", text: `บันทึกตั้งค่า Content ของ "${p}" แล้ว` }); await loadSets(); });
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(""); try { await fn(); } catch (x) { const er = x as Error & { fields?: Record<string, string> }; setErr(er.fields?.name ?? ""); setMsg({ type: "error", text: er.message }); } finally { setBusy(false); } };
  const add = () => run(async () => {
    if (!name.trim()) { setErr("ใส่ชื่อ Product เช่น Top ads"); setMsg({ type: "error", text: "ใส่ชื่อ Product ก่อน" }); return; }
    const r = await api("/api/account/products", json("POST", { name })); setRows(r.products); setMsg({ type: "ok", text: `เพิ่ม Product "${name.trim()}" แล้ว` }); setName("");
  });
  const rename = () => edit && run(async () => {
    if (!edit.name.trim()) { setErr("ใส่ชื่อ Product"); setMsg({ type: "error", text: "ใส่ชื่อ Product ก่อน" }); return; }
    const r = await api("/api/account/products", json("PATCH", { from: edit.from, name: edit.name })); setRows(r.products); setEdit(null);
    setMsg({ type: "ok", text: r.updated ? `เปลี่ยนชื่อแล้ว และแก้ที่ใช้งานอยู่ ${r.updated} รายการ` : "บันทึกแล้ว" });
  });
  const remove = (p: P) => { if (window.confirm(`ลบ Product "${p.name}" ?`)) void run(async () => { const r = await api("/api/account/products", json("DELETE", { name: p.name })); setRows(r.products); setMsg({ type: "ok", text: `ลบ "${p.name}" แล้ว` }); }); };
  return (
    <div className="space-y-3">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      {(
        <div className="flex flex-wrap items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
          <label className="min-w-64 flex-1 text-sm">เพิ่ม Product ใหม่<input value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="เช่น Top ads, Super Topads, แพ็กเกจ STD" className={err && !edit ? inpErr : inp} />{err && !edit && <span role="alert" className="mt-0.5 block text-xs font-medium text-red-600">⚠ {err}</span>}</label>
          <button type="button" disabled={busy} onClick={add} className={`${btn.primary} mt-5`}>＋ เพิ่ม</button>
        </div>)}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="p-2">Product</th><th className="text-right">ใช้ที่ Developer / Home Builder</th><th className="text-right">ใช้ในเอกสาร</th>{sets && <><th className="text-right">จำนวนโพสต์</th><th className="text-right">ติดตามผล (วัน)</th></>}<th /></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={6} className="p-6 text-center text-slate-500">กำลังโหลด…</td></tr>}
            {rows?.map((p) => (
              <tr key={p.name} className="border-t border-slate-100">
                <td className="p-2">{edit?.from === p.name ? <><input value={edit.name} onChange={(e) => { setEdit({ ...edit, name: e.target.value }); setErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") void rename(); }} className={err ? inpErr : inp} aria-label="ชื่อ Product" autoFocus />{err && <span role="alert" className="mt-0.5 block text-xs font-medium text-red-600">⚠ {err}</span>}</> : p.name}</td>
                <td className="text-right tabular-nums">{p.developers}</td><td className="text-right tabular-nums">{p.docs}</td>
                {sets && <>{(["c", "d"] as const).map((k) => <td key={k} className="p-1 text-right"><input inputMode="numeric" aria-label={`${k === "c" ? "จำนวนโพสต์" : "ติดตามผลกี่วัน"} ${p.name}`} value={sets[p.name]?.[k] ?? ""} onChange={(e) => setSets({ ...sets, [p.name]: { ...(sets[p.name] ?? { c: "", d: "" }), [k]: e.target.value } })} onBlur={() => void saveSet(p.name)} placeholder="0" className="w-16 rounded-md border border-slate-300 px-1.5 py-1 text-right text-sm" /></td>)}</>}
                <td className="whitespace-nowrap p-2 text-right">{(edit?.from === p.name
                  ? <><button type="button" disabled={busy} onClick={rename} className={`${btn.primary} !h-8 !px-3`}>บันทึก</button> <button type="button" disabled={busy} onClick={() => { setEdit(null); setErr(""); }} className={`${btn.secondary} !h-8 !px-3`}>ยกเลิก</button></>
                  : <><button type="button" disabled={busy} onClick={() => { setEdit({ from: p.name, name: p.name }); setErr(""); }} className={`${btn.secondary} !h-8 !px-3`}>✎ แก้ไข</button> {canDelete && <button type="button" disabled={busy} onClick={() => remove(p)} className={btnDanger}>🗑 ลบ</button>}</>)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">จำนวนโพสต์ = จำนวนการ์ด Content ที่สร้างให้อัตโนมัติเมื่อเปิด Job (0 = ไม่สร้าง) · ติดตามผล = กี่วันหลังเผยแพร่ถึงต้องทำรายงาน (บันทึกเมื่อออกจากช่อง) · เปลี่ยนชื่อ Product จะแก้ทุกที่ที่ใช้ชื่อเดิม (Developer / Home Builder, เอกสาร, งาน Production) · ลบได้เฉพาะ Admin และเฉพาะ Product ที่ยังไม่มีที่ใช้งาน</p>
    </div>
  );
}
