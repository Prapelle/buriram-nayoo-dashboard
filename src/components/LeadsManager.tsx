"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CHANNELS, PIPELINE, SERVICES } from "@/lib/dashboard";
import { AREA_OPTIONS, EDITABLE, filterLeads, todayBkk, type DupMatch, type Lead } from "@/lib/leads";

const PAGE = 25;
const AREA_TH = Object.fromEntries(AREA_OPTIONS);
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const STATUS_COLOR: Record<string, string> = { New: "bg-slate-100", Contacted: "bg-blue-100", Qualified: "bg-indigo-100", Proposal: "bg-amber-100", Won: "bg-green-100", Lost: "bg-red-100" };
const emptyForm = (me: string): Lead => ({ ...Object.fromEntries(EDITABLE.map((k) => [k, ""])), received_at: todayBkk(), status: "New", area: "unknown", owner_email: me });

export function LeadsManager({ me }: { me: string }) {
  const [data, setData] = useState<{ state: "loading" | "ok" | "error"; rows: Lead[]; owners: string[]; error?: string }>({ state: "loading", rows: [], owners: [] });
  const [f, setF] = useState({ q: "", channel: "", area: "", status: "", service: "" });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dups, setDups] = useState<DupMatch[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [rowBusy, setRowBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/leads"); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData({ state: "ok", rows: j.rows, owners: j.owners });
    } catch (e) { setData({ state: "error", rows: [], owners: [], error: e instanceof Error ? e.message : "error" }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => filterLeads(data.rows, f), [data.rows, f]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages);
  const slice = shown.slice((cur - 1) * PAGE, cur * PAGE);
  const today = todayBkk();

  async function post(body: object) {
    const r = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, j: await r.json() };
  }

  async function save(confirmDuplicate = false) {
    if (!form) return;
    setSaving(true); setMsg(null); setErrors({}); setDups(null);
    try {
      const { ok, j } = await post({ ...form, lead_id: editing?.lead_id, updated_at_seen: editing?.updated_at, confirmDuplicate });
      if (!ok) {
        if (j.code === "DUPLICATE_WARNING") { setDups(j.matches); return; }
        if (j.fields) setErrors(j.fields);
        throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
      }
      setMsg({ type: "ok", text: j.created ? `สร้าง ${j.lead.lead_code} แล้ว` : `บันทึก ${j.lead.lead_code} แล้ว` });
      setForm(null); setEditing(null); await load();
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); }
    finally { setSaving(false); }
  }

  async function changeStatus(row: Lead, status: string) {
    setRowBusy(row.lead_id); setMsg(null);
    try {
      const { ok, j } = await post({ ...row, status, lead_id: row.lead_id, updated_at_seen: row.updated_at });
      if (!ok) throw new Error(j.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
      await load();
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); await load(); }
    finally { setRowBusy(""); }
  }

  const inp = (k: string) => `w-full rounded-md border px-2 py-1.5 text-sm ${errors[k] ? "border-red-500" : "border-slate-300"}`;
  const err = (k: string) => errors[k] && <span role="alert" className="mt-0.5 block text-xs text-red-600">{errors[k]}</span>;
  const set = (k: string, v: string) => setForm((p) => ({ ...p!, [k]: v }));
  const field = (k: string, label: string, props: { type?: string; required?: boolean; area?: boolean } = {}) => (
    <label key={k} className="text-sm"><span className="mb-1 block text-xs text-slate-600">{label}{props.required && " *"}</span>
      {props.area ? <textarea rows={2} value={form![k]} onChange={(e) => set(k, e.target.value)} className={inp(k)} />
        : <input type={props.type ?? "text"} value={form![k]} onChange={(e) => set(k, e.target.value)} className={inp(k)} />}{err(k)}</label>
  );
  const select = (k: string, label: string, opts: [string, string][], required = false, blank = false) => (
    <label key={k} className="text-sm"><span className="mb-1 block text-xs text-slate-600">{label}{required && " *"}</span>
      <select value={form![k]} onChange={(e) => set(k, e.target.value)} className={inp(k)}>{(blank || !form![k]) && <option value="">— เลือก —</option>}{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{err(k)}</label>
  );
  const fsel = (k: keyof typeof f, label: string, opts: [string, string][]) => (
    <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">{label}</span>
      <select value={f[k]} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setPage(1); }} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"><option value="">ทั้งหมด</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  );
  const pair = (a: string[]): [string, string][] => a.map((x) => [x, x]);

  return (
    <div className="space-y-5">
      {msg && <p role={msg.type === "error" ? "alert" : "status"} className={`rounded-md p-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}

      {form && (
        <section className="space-y-4 rounded-lg border border-slate-300 bg-white p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">{editing ? `แก้ไข ${editing.lead_code}` : "เพิ่ม Lead ใหม่"}</h2>
            <button onClick={() => { setForm(null); setEditing(null); setErrors({}); setDups(null); }} className="text-sm underline">ปิด</button></div>
          <div className="grid gap-3 md:grid-cols-4">
            {field("received_at", "วันที่รับ Lead", { type: "date", required: true })}
            {field("customer_name", "ชื่อลูกค้า", { required: true })}
            {field("company_name", "บริษัท")}
            {select("status", "สถานะ", PIPELINE.map((x) => [x, x]), true)}
            {field("phone", "โทรศัพท์")}
            {field("email", "อีเมล", { type: "email" })}
            {select("contactable", "ติดต่อได้", [["TRUE", "ได้"], ["FALSE", "ไม่ได้"]], false, true)}
            <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">ผู้รับผิดชอบ</span>
              <input list="owners" value={form.owner_email} onChange={(e) => set("owner_email", e.target.value)} className={inp("owner_email")} />
              <datalist id="owners">{[...new Set([me, ...data.owners])].map((o) => <option key={o} value={o} />)}</datalist>{err("owner_email")}</label>
            {select("source_channel", "ช่องทาง", pair(CHANNELS), true)}
            {select("service_category", "หมวดบริการ", pair(SERVICES), true)}
            {select("area", "พื้นที่", AREA_OPTIONS)}
            {field("campaign_name", "Campaign")}
            {field("service_interest", "บริการที่สนใจ")}
            {field("last_contacted_at", "ติดต่อล่าสุด", { type: "date" })}
            {field("next_follow_up_at", "ติดตามครั้งถัดไป", { type: "date" })}
            {field("utm_source", "UTM source")}{field("utm_medium", "UTM medium")}{field("utm_campaign", "UTM campaign")}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {field("need_description", "ความต้องการของลูกค้า", { area: true })}
            {field("notes", "หมายเหตุ", { area: true })}
          </div>
          {form.status === "Lost" && field("lost_reason", "เหตุผลที่ปิดไม่สำเร็จ")}
          {dups && (
            <div role="alert" className="space-y-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">พบ Lead ที่เบอร์โทรหรืออีเมลซ้ำ (ระบบไม่รวมข้อมูลให้อัตโนมัติ)</p>
              <ul className="list-disc pl-5">{dups.map((d) => <li key={d.lead_code}>{d.lead_code} · {d.customer_name}{d.company_name && ` (${d.company_name})`} · {d.status} · รับ {dmy(d.received_at)} · ซ้ำที่ {d.matched.map((m) => m === "phone" ? "เบอร์โทร" : "อีเมล").join(" และ ")}</li>)}</ul>
              <div className="flex gap-3"><button onClick={() => save(true)} disabled={saving} className="rounded-md bg-amber-700 px-3 py-1.5 text-white">บันทึกต่อ (เป็นรายการแยก)</button><button onClick={() => setDups(null)} className="underline">กลับไปแก้ไข</button></div>
            </div>
          )}
          <button onClick={() => save(false)} disabled={saving} className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ค้นหา</span>
          <input value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(1); }} placeholder="ชื่อ / บริษัท / เบอร์ / อีเมล / รหัส" className="w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
        {fsel("channel", "ช่องทาง", pair(CHANNELS))}{fsel("area", "พื้นที่", AREA_OPTIONS)}{fsel("status", "สถานะ", pair(PIPELINE))}{fsel("service", "บริการ", pair(SERVICES))}
        {Object.values(f).some(Boolean) && <button onClick={() => { setF({ q: "", channel: "", area: "", status: "", service: "" }); setPage(1); }} className="py-1.5 text-sm underline">ล้าง</button>}
        <button onClick={() => { setForm(emptyForm(me)); setEditing(null); setErrors({}); setDups(null); setMsg(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="ml-auto rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700">+ เพิ่ม Lead</button>
      </div>

      {data.state === "loading" && <p className="text-sm text-slate-500">กำลังโหลด...</p>}
      {data.state === "error" && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">โหลดข้อมูลไม่ได้: {data.error}</p>}
      {data.state === "ok" && data.rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">ยังไม่มี Lead — กด "+ เพิ่ม Lead" เพื่อเริ่มบันทึก</p>}
      {data.state === "ok" && data.rows.length > 0 && shown.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">ไม่มี Lead ที่ตรงกับตัวกรอง</p>}
      {shown.length > 0 && (
        <div className="space-y-2">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b bg-slate-50 text-xs text-slate-500"><th className="p-2">รหัส</th><th>รับเมื่อ</th><th>ลูกค้า</th><th>ช่องทาง</th><th>บริการ</th><th>พื้นที่</th><th>ผู้รับผิดชอบ</th><th>สถานะ</th><th>ติดตามถัดไป</th><th /></tr></thead>
              <tbody>{slice.map((r) => {
                const overdue = r.next_follow_up_at && r.next_follow_up_at < today && !["Won", "Lost"].includes(r.status);
                return (
                  <tr key={r.lead_id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap p-2 font-mono text-xs">{r.lead_code}</td><td className="whitespace-nowrap">{dmy(r.received_at)}</td>
                    <td className="max-w-56 truncate" title={`${r.customer_name} ${r.company_name}`}>{r.customer_name}{r.company_name && <span className="text-slate-500"> · {r.company_name}</span>}</td>
                    <td>{r.source_channel}</td><td>{r.service_category}</td><td>{AREA_TH[r.area || "unknown"]}</td><td className="max-w-40 truncate">{r.owner_email}</td>
                    <td><select aria-label={`สถานะ ${r.lead_code}`} value={r.status} disabled={rowBusy === r.lead_id} onChange={(e) => changeStatus(r, e.target.value)} className={`rounded px-1.5 py-1 text-xs ${STATUS_COLOR[r.status]}`}>{PIPELINE.map((s) => <option key={s}>{s}</option>)}</select></td>
                    <td className={`whitespace-nowrap ${overdue ? "font-semibold text-red-600" : ""}`}>{dmy(r.next_follow_up_at) || <span className="text-slate-300">ว่าง</span>}{overdue && " (เลยกำหนด)"}</td>
                    <td className="p-2 text-right"><button onClick={() => { setForm({ ...emptyForm(me), ...Object.fromEntries(EDITABLE.map((k) => [k, r[k] ?? ""])) }); setEditing(r); setErrors({}); setDups(null); setMsg(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="underline">แก้ไข</button></td>
                  </tr>);
              })}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500"><span>{shown.length.toLocaleString("en-US")} รายการ · หน้า {cur}/{pages}</span>
            <span className="flex gap-3">{cur > 1 && <button className="underline" onClick={() => setPage(cur - 1)}>ก่อนหน้า</button>}{cur < pages && <button className="underline" onClick={() => setPage(cur + 1)}>ถัดไป</button>}</span></div>
        </div>
      )}
    </div>
  );
}
