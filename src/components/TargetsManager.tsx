"use client";
import { useCallback, useEffect, useState } from "react";

type Target = { month: string; ad_budget_thb: number | null; lead_target: number | null; notes: string; updated_by: string; updated_at: string };
const TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const label = (m: string) => `${TH[Number(m.slice(5, 7)) - 1]} ${Number(m.slice(0, 4)) + 543}`;
const thisMonth = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
const thb = (n: number | null) => (n === null ? "—" : `฿${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);

/** ตั้งงบโฆษณาและเป้า Lead รายเดือน (บันทึกเดือนเดิม = แก้ค่าเดิม) */
export function TargetsManager({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<Target[] | null>(null);
  const [form, setForm] = useState({ month: thisMonth(), ad_budget_thb: "", lead_target: "", notes: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/targets"); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); setRows(j.targets); }
    catch (e) { setRows([]); setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดไม่ได้" }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // เลือกเดือนที่มีค่าแล้ว → เติมค่าเดิมให้แก้
  const pickMonth = (month: string) => {
    const t = rows?.find((r) => r.month === month);
    setForm({ month, ad_budget_thb: t?.ad_budget_thb?.toString() ?? "", lead_target: t?.lead_target?.toString() ?? "", notes: t?.notes ?? "" }); setErrors({});
  };
  useEffect(() => { if (rows) pickMonth(form.month); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true); setMsg(null); setErrors({});
    try {
      const prev = rows?.find((r) => r.month === form.month);
      const r = await fetch("/api/targets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, updated_at_seen: prev?.updated_at ?? undefined }) });
      const j = await r.json();
      if (!r.ok) { setErrors(j.fields ?? {}); throw new Error(j.error ?? "บันทึกไม่สำเร็จ"); }
      setMsg({ type: "ok", text: `${j.created ? "บันทึก" : "แก้ไข"}เป้าหมาย ${label(form.month)} แล้ว` }); await load();
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); } finally { setBusy(false); }
  }
  const inp = (k: string) => `w-full rounded-md border px-2 py-1.5 text-sm ${errors[k] ? "border-red-400" : "border-slate-300"}`;
  const exists = rows?.some((r) => r.month === form.month);

  return (
    <div className="space-y-5">
      {msg && <p role={msg.type === "error" ? "alert" : "status"} className={`rounded-md p-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      {canEdit && (
        <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-semibold">{exists ? `แก้ไขเป้าหมาย ${label(form.month)}` : `ตั้งเป้าหมาย ${label(form.month)}`}</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">เดือน *</span><input type="month" aria-label="เดือน" value={form.month} onChange={(e) => pickMonth(e.target.value)} className={inp("month")} />{errors.month && <span className="text-xs text-red-600">{errors.month}</span>}</label>
            <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">งบโฆษณา (บาท)</span><input inputMode="decimal" aria-label="งบโฆษณา (บาท)" value={form.ad_budget_thb} onChange={(e) => setForm({ ...form, ad_budget_thb: e.target.value })} placeholder="เช่น 60000" className={inp("ad_budget_thb")} />{errors.ad_budget_thb && <span className="text-xs text-red-600">{errors.ad_budget_thb}</span>}</label>
            <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">เป้า Lead (ราย)</span><input inputMode="numeric" aria-label="เป้า Lead (ราย)" value={form.lead_target} onChange={(e) => setForm({ ...form, lead_target: e.target.value })} placeholder="เช่น 120" className={inp("lead_target")} />{errors.lead_target && <span className="text-xs text-red-600">{errors.lead_target}</span>}</label>
            <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">หมายเหตุ</span><input aria-label="หมายเหตุ" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inp("notes")} /></label>
          </div>
          <button onClick={save} disabled={busy} className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">{busy ? "กำลังบันทึก..." : "บันทึกเป้าหมาย"}</button>
          <p className="text-xs text-slate-500">เว้นว่าง = ไม่ตั้งเป้า · บันทึกเดือนเดิมซ้ำ = แก้ค่าเดิม · ผลเทียบเป้าแสดงที่หน้า ภาพรวมการตลาด</p>
        </section>
      )}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-2 font-semibold">เป้าหมายที่ตั้งไว้</h2>
        {rows === null ? <p className="text-sm text-slate-500">กำลังโหลด...</p> : rows.length === 0 ? <p className="text-sm text-slate-500">ยังไม่ได้ตั้งเป้าหมาย</p> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="py-1.5">เดือน</th><th className="text-right">งบโฆษณา</th><th className="text-right">เป้า Lead</th><th className="pl-3">หมายเหตุ</th><th>แก้ไขล่าสุด</th>{canEdit && <th />}</tr></thead>
            <tbody>{rows.map((t) => (
              <tr key={t.month} className="border-b border-slate-100">
                <td className="py-1.5 font-medium">{label(t.month)}</td><td className="text-right tabular-nums">{thb(t.ad_budget_thb)}</td><td className="text-right tabular-nums">{t.lead_target === null ? "—" : t.lead_target.toLocaleString("en-US")}</td>
                <td className="pl-3 text-slate-600">{t.notes}</td><td className="text-xs text-slate-500">{t.updated_by}</td>
                {canEdit && <td className="text-right"><button onClick={() => { pickMonth(t.month); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-sm underline">แก้ไข</button></td>}
              </tr>))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
