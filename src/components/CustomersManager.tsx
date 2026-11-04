"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { validateCustomer, type Customer } from "@/lib/account";
import { Notice, type Msg } from "./Toast";
import { btn } from "./PageHeader";

type Row = Customer & { updated_at: string; docs: number };
const blank = { developer_id: "", updated_at_seen: "", kind: "developer", company_name: "", contact_name: "", phone: "", address: "", tax_id: "" };
const inp = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const inpErr = "w-full rounded-md border border-red-500 bg-red-50 px-2 py-1.5 text-sm ring-1 ring-red-300";
const btnDanger = "inline-flex h-8 items-center gap-2 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50";
async function api(url: string, init?: RequestInit) { const r = await fetch(url, { cache: "no-store", ...init }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error ?? "ผิดพลาด"), { fields: j.fields as Record<string, string> | undefined, code: j.code as string | undefined, matches: j.matches as { dev_code: string; company_name: string }[] | undefined }); return j; }

/** รายชื่อลูกค้า: ค้นหา · เพิ่ม · แก้ไข · ลบ (Super Admin) — ผู้ติดต่อ เบอร์ ที่อยู่ เลขผู้เสียภาษี แสดงบนเอกสารอัตโนมัติ */
export function CustomersManager({ isSuper }: { isSuper: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null); const [q, setQ] = useState(""); const [msg, setMsg] = useState<Msg>(null);
  const [f, setF] = useState<typeof blank | null>(null); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setRows((await api("/api/account/customers")).customers); } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }); setRows([]); } }, []);
  useEffect(() => { void load(); }, [load]);
  const shown = useMemo(() => (rows ?? []).filter((c) => !q || `${c.code} ${c.name} ${c.contact_name} ${c.phone} ${c.tax_id} ${c.address}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const set = (k: string, v: string) => setF((p) => (p ? { ...p, [k]: v } : p));
  const ic = (k: string) => (errs[k] ? inpErr : inp);
  const e = (k: string) => errs[k] ? <span role="alert" className="mt-0.5 block text-xs font-medium text-red-600">⚠ {errs[k]}</span> : null;
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (x) { const er = x as Error & { fields?: Record<string, string> }; if (er.fields) setErrs(er.fields); setMsg({ type: "error", text: er.message }); } finally { setBusy(false); } };

  const save = (confirmDuplicate = false) => f && run(async () => {
    const v = validateCustomer(f);
    if (!v.ok) { setErrs(v.errors); setMsg({ type: "error", text: `กรอกไม่ครบหรือไม่ถูกต้อง ${Object.keys(v.errors).length} ช่อง — ดูช่องที่มีแถบสีแดง` }); return; }
    setErrs({});
    try {
      const r = await api("/api/account/customers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, confirmDuplicate }) });
      setMsg({ type: "ok", text: `${r.created ? "เพิ่ม" : "บันทึก"} ${r.customer.name} (${r.customer.code}) แล้ว` }); setF(null); await load();
    } catch (x) {
      const er = x as Error & { code?: string; matches?: { dev_code: string; company_name: string }[] };
      if (er.code === "DUPLICATE_WARNING" && !confirmDuplicate) {
        if (window.confirm(`พบลูกค้าที่ชื่อ / เบอร์ซ้ำกัน: ${(er.matches ?? []).map((m) => `${m.dev_code} ${m.company_name}`).join(", ")}\nต้องการบันทึกต่อหรือไม่?`)) { await save(true); }
        return;
      }
      throw x;
    }
  });
  const remove = (c: Row) => { if (window.confirm(`ลบลูกค้า "${c.name}" (${c.code}) ?\nProduct ของลูกค้านี้ในหน้า Developer / Home Builder จะถูกลบด้วย กู้คืนไม่ได้`)) void run(async () => { await api("/api/account/customers", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ developer_id: c.developer_id, updated_at_seen: c.updated_at }) }); setMsg({ type: "ok", text: `ลบ ${c.name} แล้ว` }); await load(); }); };

  return (
    <div className="space-y-3">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e2) => setQ(e2.target.value)} placeholder="ค้นหา ชื่อ / รหัส / เบอร์ / เลขผู้เสียภาษี / ที่อยู่" className="h-10 w-80 max-w-full rounded-lg border border-slate-300 px-3 text-sm" aria-label="ค้นหาลูกค้า" />
        <button type="button" onClick={() => { setErrs({}); setF({ ...blank }); }} className={btn.primary}>＋ เพิ่มลูกค้า</button>
        <span className="ml-auto text-sm text-slate-600">{shown.length} / {rows?.length ?? 0} ราย</span>
      </div>

      {f && (
        <div className="space-y-3 rounded-xl border border-brand-300 bg-white p-4">
          <h2 className="font-semibold">{f.developer_id ? "แก้ไขลูกค้า" : "เพิ่มลูกค้า"}</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {!f.developer_id && <label className="text-sm">ประเภท<select value={f.kind} onChange={(e2) => set("kind", e2.target.value)} className={inp}><option value="developer">Developer</option><option value="home_builder">Home Builder</option></select></label>}
            <label className="text-sm sm:col-span-2">ชื่อลูกค้า / บริษัท *<input value={f.company_name} onChange={(e2) => set("company_name", e2.target.value)} placeholder="เช่น บริษัท ซีเจ เออเบิ้ล โฮม จำกัด" className={ic("company_name")} />{e("company_name")}</label>
            <label className="text-sm">ผู้ติดต่อ<input value={f.contact_name} onChange={(e2) => set("contact_name", e2.target.value)} placeholder="เช่น คุณปริญญาพร บุญประสพ" className={ic("contact_name")} />{e("contact_name")}</label>
            <label className="text-sm">เบอร์โทร<input inputMode="tel" value={f.phone} onChange={(e2) => set("phone", e2.target.value)} placeholder="เช่น 0833651355" className={ic("phone")} />{e("phone")}</label>
            <label className="text-sm">เลขประจำตัวผู้เสียภาษี (13 หลัก)<input inputMode="numeric" value={f.tax_id} onChange={(e2) => set("tax_id", e2.target.value)} placeholder="เช่น 0325566000476" className={ic("tax_id")} />{e("tax_id")}</label>
            <label className="text-sm sm:col-span-3">ที่อยู่ (แสดงบนเอกสาร)<input value={f.address} onChange={(e2) => set("address", e2.target.value)} placeholder="เช่น 99 ถ.หลักเมือง ต.ในเมือง อ.เมือง จ.บุรีรัมย์ 31000" className={ic("address")} />{e("address")}</label>
          </div>
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => save()} className={btn.primary}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button><button type="button" disabled={busy} onClick={() => { setF(null); setErrs({}); }} className={btn.secondary}>ยกเลิก</button></div>
        </div>)}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="p-2">รหัส</th><th>ลูกค้า</th><th>ผู้ติดต่อ / เบอร์</th><th>ที่อยู่</th><th>เลขผู้เสียภาษี</th><th className="text-right">เอกสาร</th><th /></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={7} className="p-6 text-center text-slate-500">กำลังโหลด…</td></tr>}
            {rows && !shown.length && <tr><td colSpan={7} className="p-6 text-center text-slate-500">{rows.length ? "ไม่พบลูกค้าที่ตรงกับคำค้น" : "ยังไม่มีลูกค้า — กด ＋ เพิ่มลูกค้า"}</td></tr>}
            {shown.map((c) => (
              <tr key={c.developer_id} className="border-t border-slate-100 align-top hover:bg-slate-50">
                <td className="p-2 font-medium">{c.code}<div className="text-xs font-normal text-slate-500">{c.kind === "home_builder" ? "Home Builder" : "Developer"}</div></td>
                <td>{c.name}</td>
                <td>{c.contact_name || "—"}<div className="text-xs text-slate-500">{c.phone}</div></td>
                <td className="max-w-64 text-xs text-slate-700">{c.address || <span className="text-slate-400">—</span>}</td>
                <td className="tabular-nums">{c.tax_id || <span className="text-slate-400">—</span>}</td>
                <td className="text-right tabular-nums">{c.docs}</td>
                <td className="whitespace-nowrap p-2 text-right"><button type="button" disabled={busy} onClick={() => { setErrs({}); setF({ developer_id: c.developer_id, updated_at_seen: c.updated_at, kind: c.kind, company_name: c.name, contact_name: c.contact_name, phone: c.phone, address: c.address, tax_id: c.tax_id }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={`${btn.secondary} !h-8 !px-3`}>✎ แก้ไข</button>{isSuper && <button type="button" disabled={busy} onClick={() => remove(c)} className={`${btnDanger} ml-1`}>🗑 ลบ</button>}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
