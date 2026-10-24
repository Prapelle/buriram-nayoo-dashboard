"use client";
import { useCallback, useEffect, useState } from "react";
import { NUM_FIELDS, TEXT_FIELDS } from "@/lib/line-oa";

type Row = Record<string, string>;
const EMPTY: Row = Object.fromEntries([["report_month", ""], ...NUM_FIELDS.map(([k]) => [k, ""]), ...TEXT_FIELDS.map(([k]) => [k, ""])]);
const GROUPS: [string, string[]][] = [
  ["เพื่อน", ["friends_start", "friends_end", "new_friends", "blocked_users"]],
  ["ข้อความ", ["broadcast_count", "messages_sent", "messages_delivered", "opens", "clicks"]],
  ["การสอบถามและ Leads", ["new_chats", "inquiries", "leads", "qualified_leads"]],
];
const label = Object.fromEntries(NUM_FIELDS);
const my = (m: string) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : "");
const when = (iso: string) => { try { return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }); } catch { return iso; } };
const SHOW: [string, string][] = [["friends_end", "เพื่อนสิ้นเดือน"], ["new_friends", "เพื่อนใหม่"], ["inquiries", "Inquiries"], ["leads", "Leads"], ["qualified_leads", "Qualified"]];

export function LineOaManager() {
  const [list, setList] = useState<{ state: "loading" | "ok" | "error"; rows: Row[]; error?: string }>({ state: "loading", rows: [] });
  const [form, setForm] = useState<Row>(EMPTY);
  const [seen, setSeen] = useState<string | undefined>(undefined); // updated_at ของแถวที่เปิดแก้ไข
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ type: "ok" | "error" | "info"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/line-oa"); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setList({ state: "ok", rows: j.rows });
    } catch (e) { setList({ state: "error", rows: [], error: e instanceof Error ? e.message : "error" }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const editing = seen !== undefined;
  function open(row: Row, info?: string) {
    setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, row[k] ?? ""]))); setSeen(row.updated_at); setErrors({});
    setMsg(info ? { type: "info", text: info } : null);
  }
  function reset() { setForm(EMPTY); setSeen(undefined); setErrors({}); setMsg(null); }
  function onMonth(v: string) {
    const existing = !editing && list.rows.find((r) => r.report_month === v);
    if (existing) open(existing, `เดือน ${my(v)} มีข้อมูลอยู่แล้ว กำลังแก้ไขเดือนเดิม (จะไม่สร้างแถวซ้ำ)`);
    else setForm({ ...form, report_month: v });
  }

  async function save() {
    setSaving(true); setMsg(null); setErrors({});
    try {
      const r = await fetch("/api/line-oa", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, updated_at_seen: seen }) });
      const j = await r.json();
      if (!r.ok) { if (j.fields) setErrors(j.fields); throw new Error(j.error ?? `HTTP ${r.status}`); }
      setMsg({ type: "ok", text: j.created ? `เพิ่มข้อมูลเดือน ${my(form.report_month)} แล้ว` : `แก้ไขข้อมูลเดือน ${my(form.report_month)} แล้ว` });
      setForm(EMPTY); setSeen(undefined); await load();
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); }
    finally { setSaving(false); }
  }

  const inp = (k: string) => `w-full rounded-md border px-2 py-1.5 text-sm ${errors[k] ? "border-red-500" : "border-slate-300"}`;
  const err = (k: string) => errors[k] && <span role="alert" className="mt-0.5 block text-xs text-red-600">{errors[k]}</span>;

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{editing ? `แก้ไขข้อมูลเดือน ${my(form.report_month)}` : "เพิ่ม / แก้ไขข้อมูลรายเดือน"}</h2>
          {(editing || form.report_month) && <button onClick={reset} className="text-sm underline">ล้างฟอร์ม</button>}
        </div>
        {msg && <p role={msg.type === "error" ? "alert" : "status"} className={`rounded-md p-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-800" : msg.type === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-900"}`}>{msg.text}</p>}
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium">เดือนที่รายงาน *</span>
          <input type="month" value={form.report_month} disabled={editing} onChange={(e) => onMonth(e.target.value)} className={inp("report_month")} />
          {err("report_month")}
        </label>
        {GROUPS.map(([title, keys]) => (
          <fieldset key={title}>
            <legend className="mb-2 text-sm font-semibold text-slate-700">{title}</legend>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {keys.map((k) => (
                <label key={k} className="text-sm"><span className="mb-1 block text-xs text-slate-600">{label[k]}</span>
                  <input inputMode="numeric" value={form[k]} placeholder="ว่าง = ไม่มีข้อมูล" onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inp(k)} />{err(k)}</label>
              ))}
            </div>
          </fieldset>
        ))}
        {TEXT_FIELDS.map(([k, l]) => (
          <label key={k} className="block text-sm"><span className="mb-1 block text-xs text-slate-600">{l}</span>
            {k === "notes" ? <textarea rows={3} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inp(k)} />
              : <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className={inp(k)} />}{err(k)}</label>
        ))}
        <button onClick={save} disabled={saving || !form.report_month} className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">
          {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "บันทึก"}
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">ข้อมูลที่บันทึกแล้ว</h2>
        {list.state === "loading" && <p className="text-sm text-slate-500">กำลังโหลด...</p>}
        {list.state === "error" && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">โหลดข้อมูลไม่ได้: {list.error}</p>}
        {list.state === "ok" && list.rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">ยังไม่มีข้อมูล LINE OA — กรอกฟอร์มด้านบนเพื่อเพิ่มเดือนแรก</p>}
        {list.state === "ok" && list.rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b bg-slate-50 text-xs text-slate-500"><th className="p-2">เดือน</th>{SHOW.map(([, l]) => <th key={l} className="text-right">{l}</th>)}<th className="pl-4">แก้ไขล่าสุด</th><th /></tr></thead>
              <tbody>{list.rows.map((r) => (
                <tr key={r.report_month} className="border-b border-slate-100">
                  <td className="whitespace-nowrap p-2 font-medium">{my(r.report_month)}</td>
                  {SHOW.map(([k]) => <td key={k} className="text-right tabular-nums">{r[k] === "" ? <span className="text-slate-300">ว่าง</span> : Number(r[k]).toLocaleString("en-US")}</td>)}
                  <td className="whitespace-nowrap pl-4 text-xs text-slate-500">{when(r.updated_at)}</td>
                  <td className="p-2 text-right"><button onClick={() => { open(r); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-sm underline">แก้ไข</button></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
