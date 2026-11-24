"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { btn } from "@/components/PageHeader";
import { Notice, type Msg } from "@/components/Toast";

/**
 * Production note (24/11/2026): ชื่อระบบ / ลิงก์ / ชื่อผู้ใช้ / รหัสผ่าน
 * - ทุก Role เห็น 3 ช่องแรก · Admin ขึ้นไปเพิ่ม / แก้ / ลบ
 * - รหัสผ่าน: กด "ดู" → ใส่รหัสเปิดดู (ตั้งโดย Super Admin) → เห็นได้ 5 นาที แล้วซ่อนเอง
 */
type Note = { note_id: string; system_name: string; link: string; username: string; has_password: boolean; updated_at: string; updated_by: string };
type Form = { note_id?: string; system_name: string; link: string; username: string; password: string; clear_password?: boolean };
const inp = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const empty: Form = { system_name: "", link: "", username: "", password: "" };

async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? `ผิดพลาด (${r.status})`), { fields: j.fields, code: j.code });
  return j as T;
}
const mmss = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function ProdNotes({ canEdit }: { canEdit: boolean }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [codeSet, setCodeSet] = useState(true);
  const [until, setUntil] = useState(0); const [now, setNow] = useState(Date.now());
  const [shown, setShown] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg | null>(null);
  const [form, setForm] = useState<Form | null>(null); const [err, setErr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<string | null>(null); // note_id ที่รอใส่รหัสเปิดดู
  const [code, setCode] = useState(""); const [codeErr, setCodeErr] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { const j = await api<{ notes: Note[]; codeSet: boolean; unlockedUntil: number }>("/api/prod-notes"); setNotes(j.notes); setCodeSet(j.codeSet); setUntil(j.unlockedUntil); }
    catch (e) { setNotes([]); setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // นับถอยหลัง 5 นาที · หมดเวลา = ซ่อนรหัสผ่านทั้งหมด
  const open = until > now;
  useEffect(() => { if (!until) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [until]);
  useEffect(() => { if (until && until <= now) { setShown({}); setUntil(0); } }, [until, now]);
  useEffect(() => { if (ask !== null) codeRef.current?.focus(); }, [ask]);

  async function reveal(id: string) {
    if (shown[id] !== undefined) { setShown(({ [id]: _, ...rest }) => rest); return; } // กดซ้ำ = ซ่อน
    if (!open) { setAsk(id); setCode(""); setCodeErr(""); return; }
    try { const j = await api<{ password: string }>("/api/prod-notes/reveal", { note_id: id }); setShown((s) => ({ ...s, [id]: j.password })); }
    catch (e) { const x = e as Error & { code?: string }; if (x.code === "LOCKED_VIEW") { setUntil(0); setAsk(id); } else setMsg({ type: "error", text: x.message }); }
  }
  async function submitCode() {
    setCodeErr("");
    try {
      const j = await api<{ unlockedUntil: number }>("/api/prod-notes/unlock", { code });
      setUntil(j.unlockedUntil); setNow(Date.now()); const id = ask; setAsk(null); setCode("");
      if (id) { const r = await api<{ password: string }>("/api/prod-notes/reveal", { note_id: id }); setShown((s) => ({ ...s, [id]: r.password })); }
    } catch (e) { setCodeErr(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
  }
  async function save() {
    if (!form) return; setBusy(true); setErr({});
    try { await api("/api/prod-notes", form); setMsg({ type: "ok", text: form.note_id ? `บันทึก ${form.system_name} แล้ว` : `เพิ่ม ${form.system_name} แล้ว` }); setForm(null); setShown({}); await load(); }
    catch (e) { const x = e as Error & { fields?: Record<string, string> }; setErr(x.fields ?? {}); setMsg({ type: "error", text: x.message }); }
    finally { setBusy(false); }
  }
  async function del(n: Note) {
    if (!window.confirm(`ลบ "${n.system_name}" ? (ลบแล้วกู้คืนไม่ได้)`)) return;
    try { await api("/api/prod-notes", { action: "delete", note_id: n.note_id }); setMsg({ type: "ok", text: `ลบ ${n.system_name} แล้ว` }); await load(); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }); }
  }
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setMsg({ type: "ok", text: `คัดลอก${what}แล้ว` }); } catch { setMsg({ type: "error", text: "คัดลอกไม่ได้" }); } };

  const fld = (k: keyof Form, label: string, el: React.ReactNode) => (
    <label className="block text-sm"><span className="mb-1 block text-xs text-slate-600">{label}</span>{el}{err[k] && <span role="alert" className="mt-0.5 block text-xs font-medium text-red-600">⚠ {err[k]}</span>}</label>);

  return (
    <div className="space-y-4">
      {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
      <div className="flex flex-wrap items-center gap-2">
        {open ? <span className="rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-900">🔓 เปิดดูรหัสผ่านอยู่ — เหลือ {mmss(until - now)}</span>
          : <span className="text-sm text-slate-500">🔒 รหัสผ่านซ่อนอยู่ — กด "ดู" แล้วใส่รหัสเปิดดู (เห็นได้ 5 นาที)</span>}
        {!codeSet && <span className="text-sm text-red-700">ยังไม่ได้ตั้งรหัสเปิดดู — ให้ Super Admin ตั้งที่ ตั้งค่า → ตั้งค่าระบบ</span>}
        {canEdit && !form && <button type="button" onClick={() => { setForm({ ...empty }); setErr({}); }} className={`${btn.primary} ml-auto`}>＋ เพิ่มแถว</button>}
      </div>

      {form && (
        <section aria-label={form.note_id ? "แก้ไขรายการ" : "เพิ่มรายการ"} className="space-y-3 rounded-xl border border-slate-300 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {fld("system_name", "ชื่อระบบ *", <input value={form.system_name} onChange={(e) => setForm({ ...form, system_name: e.target.value })} className={inp} autoFocus />)}
            {fld("link", "ลิงก์", <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://" className={inp} inputMode="url" />)}
            {fld("username", "ชื่อผู้ใช้", <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={inp} autoComplete="off" />)}
            {fld("password", form.note_id ? "รหัสผ่านใหม่ (เว้นว่าง = ใช้รหัสเดิม)" : "รหัสผ่าน", <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value, clear_password: false })} className={inp} autoComplete="new-password" />)}
          </div>
          {form.note_id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.clear_password} onChange={(e) => setForm({ ...form, clear_password: e.target.checked, password: "" })} />ลบรหัสผ่านของรายการนี้</label>}
          <div className="flex gap-2"><button type="button" onClick={save} disabled={busy} className={btn.primary}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button><button type="button" onClick={() => setForm(null)} className={btn.secondary}>ยกเลิก</button></div>
        </section>)}

      {notes === null ? <p className="text-sm text-slate-500">กำลังโหลด…</p> : !notes.length ? <p className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">ยังไม่มีรายการ</p> : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-600"><tr><th className="p-2">ชื่อระบบ</th><th className="p-2">ลิงก์</th><th className="p-2">ชื่อผู้ใช้</th><th className="p-2">รหัสผ่าน</th>{canEdit && <th className="p-2" />}</tr></thead>
              <tbody>{notes.map((n) => (
                <tr key={n.note_id} className="border-t border-slate-100 align-top">
                  <td className="p-2 font-medium">{n.system_name}</td>
                  <td className="max-w-64 truncate p-2">{n.link ? <a href={n.link} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">{n.link.replace(/^https?:\/\//, "")}</a> : <span className="text-slate-300">—</span>}</td>
                  <td className="p-2">{n.username ? <span className="inline-flex items-center gap-1">{n.username}<button type="button" onClick={() => copy(n.username, "ชื่อผู้ใช้")} aria-label={`คัดลอกชื่อผู้ใช้ ${n.system_name}`} className="text-xs text-sky-700 underline">คัดลอก</button></span> : <span className="text-slate-300">—</span>}</td>
                  <td className="p-2">{!n.has_password ? <span className="text-slate-300">—</span> : (
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="font-mono" aria-label={shown[n.note_id] !== undefined ? `รหัสผ่าน ${n.system_name}` : undefined}>{shown[n.note_id] ?? "••••••••"}</span>
                      <button type="button" onClick={() => reveal(n.note_id)} aria-label={`${shown[n.note_id] !== undefined ? "ซ่อน" : "ดู"}รหัสผ่าน ${n.system_name}`} className="text-xs text-sky-700 underline">{shown[n.note_id] !== undefined ? "ซ่อน" : "ดู"}</button>
                      {shown[n.note_id] !== undefined && <button type="button" onClick={() => copy(shown[n.note_id], "รหัสผ่าน")} className="text-xs text-sky-700 underline">คัดลอก</button>}
                    </span>)}</td>
                  {canEdit && <td className="whitespace-nowrap p-2 text-right"><button type="button" onClick={() => { setForm({ note_id: n.note_id, system_name: n.system_name, link: n.link, username: n.username, password: "" }); setErr({}); window.scrollTo({ top: 0 }); }} className="text-xs underline">แก้ไข</button> <button type="button" onClick={() => del(n)} className="ml-2 text-xs text-red-700 underline">ลบ</button></td>}
                </tr>))}</tbody>
            </table>
          </div>
          {/* มือถือ: การ์ด */}
          <ul className="space-y-2 md:hidden">{notes.map((n) => (
            <li key={n.note_id} className="space-y-1 rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="font-semibold">{n.system_name}</div>
              {n.link && <a href={n.link} target="_blank" rel="noopener noreferrer" className="block truncate text-sky-700 underline">{n.link.replace(/^https?:\/\//, "")}</a>}
              {n.username && <div>ผู้ใช้: {n.username} <button type="button" onClick={() => copy(n.username, "ชื่อผู้ใช้")} className="text-xs text-sky-700 underline">คัดลอก</button></div>}
              {n.has_password && <div>รหัสผ่าน: <span className="font-mono">{shown[n.note_id] ?? "••••••••"}</span> <button type="button" onClick={() => reveal(n.note_id)} className="text-xs text-sky-700 underline">{shown[n.note_id] !== undefined ? "ซ่อน" : "ดู"}</button>{shown[n.note_id] !== undefined && <> <button type="button" onClick={() => copy(shown[n.note_id], "รหัสผ่าน")} className="text-xs text-sky-700 underline">คัดลอก</button></>}</div>}
              {canEdit && <div className="pt-1"><button type="button" onClick={() => { setForm({ note_id: n.note_id, system_name: n.system_name, link: n.link, username: n.username, password: "" }); setErr({}); window.scrollTo({ top: 0 }); }} className="text-xs underline">แก้ไข</button> <button type="button" onClick={() => del(n)} className="ml-2 text-xs text-red-700 underline">ลบ</button></div>}
            </li>))}</ul>
        </>)}

      {ask !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="ใส่รหัสเปิดดู" onKeyDown={(e) => { if (e.key === "Escape") setAsk(null); }}>
          <form onSubmit={(e) => { e.preventDefault(); void submitCode(); }} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-5 shadow-xl">
            <h2 className="font-semibold">ใส่รหัสเปิดดูรหัสผ่าน</h2>
            <p className="text-xs text-slate-600">ใส่ถูกแล้วดูรหัสผ่านได้ 5 นาที · ระบบบันทึกการเปิดดูทุกครั้ง</p>
            <input ref={codeRef} type="password" value={code} onChange={(e) => setCode(e.target.value)} aria-label="รหัสเปิดดู" autoComplete="off" className={inp} />
            {codeErr && <p role="alert" className="text-sm text-red-700">{codeErr}</p>}
            <div className="flex gap-2"><button type="submit" disabled={!code} className={btn.primary}>ยืนยัน</button><button type="button" onClick={() => setAsk(null)} className={btn.secondary}>ยกเลิก</button></div>
          </form>
        </div>)}
    </div>
  );
}

/** หน้าตั้งค่าระบบ (Super Admin): ตั้ง / เปลี่ยนรหัสเปิดดู */
export function ProdNoteCode() {
  const [set, setSet] = useState<boolean | null>(null); const [a, setA] = useState(""); const [b, setB] = useState("");
  const [msg, setMsg] = useState<Msg | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { void api<{ codeSet: boolean }>("/api/prod-notes/code").then((j) => setSet(j.codeSet)).catch(() => setSet(false)); }, []);
  async function save() {
    if (a !== b) { setMsg({ type: "error", text: "รหัสสองช่องไม่ตรงกัน" }); return; }
    setBusy(true);
    try { await api("/api/prod-notes/code", { code: a }); setMsg({ type: "ok", text: set ? "เปลี่ยนรหัสเปิดดูแล้ว" : "ตั้งรหัสเปิดดูแล้ว" }); setSet(true); setA(""); setB(""); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3">
      {msg && <Notice msg={msg} onClose={() => setMsg(null)} />}
      <p className="text-sm">{set === null ? "กำลังโหลด…" : set ? "✅ ตั้งรหัสเปิดดูแล้ว — ใส่รหัสใหม่เพื่อเปลี่ยน" : "⚠ ยังไม่ได้ตั้งรหัส — ยังไม่มีใครดูรหัสผ่านใน Production note ได้"}</p>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">รหัสใหม่ (6 ตัวขึ้นไป)</span><input type="password" value={a} onChange={(e) => setA(e.target.value)} autoComplete="new-password" className={inp} /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">ยืนยันรหัสใหม่</span><input type="password" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" className={inp} /></label>
        <button type="submit" disabled={busy || a.length < 6} className={btn.primary}>{busy ? "กำลังบันทึก…" : set ? "เปลี่ยนรหัส" : "ตั้งรหัส"}</button>
      </form>
    </div>
  );
}
