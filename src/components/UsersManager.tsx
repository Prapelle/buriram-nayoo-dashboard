"use client";
import { Skeleton } from "@/components/Skeleton";
import { Notice } from "@/components/Toast";
import { useCallback, useEffect, useState } from "react";

type User = { user_id: string; email: string; display_name: string; role: string; active: boolean; updated_at: string; bootstrap: boolean };
const ROLE_LABEL: Record<string, string> = { admin: "Admin — ทุกอย่าง", marketing: "Marketing — ข้อมูลการตลาด", sales: "Sales — Leads และ Sales" };
const empty = { email: "", display_name: "", role: "marketing", active: true };

export function UsersManager() {
  const [data, setData] = useState<{ state: "loading" | "ok" | "error"; users: User[]; me: string; error?: string }>({ state: "loading", users: [], me: "" });
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<User | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/users"); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData({ state: "ok", users: j.users, me: j.me });
    } catch (e) { setData({ state: "error", users: [], me: "", error: e instanceof Error ? e.message : "error" }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(body: object, okText: string) {
    setBusy(true); setMsg(null); setErrors({});
    try {
      const r = await fetch("/api/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { if (j.fields) setErrors(j.fields); throw new Error(j.error ?? "บันทึกไม่สำเร็จ"); }
      setMsg({ type: "ok", text: okText }); setForm(empty); setEditing(null); await load();
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); await load(); }
    finally { setBusy(false); }
  }
  const submit = () => save(editing ? { ...form, user_id: editing.user_id, updated_at_seen: editing.updated_at } : form,
    editing ? `บันทึก ${form.email} แล้ว` : `เพิ่ม ${form.email.trim().toLowerCase()} แล้ว — อย่าลืมเพิ่มอีเมลนี้ใน Test users ของ Google (ดูหมายเหตุด้านล่าง)`);
  const toggle = (u: User) => save({ ...u, active: !u.active, updated_at_seen: u.updated_at }, `${u.active ? "ระงับ" : "เปิดใช้งาน"} ${u.email} แล้ว`);

  const inp = (k: string) => `w-full rounded-md border px-2 py-1.5 text-sm ${errors[k] ? "border-red-500" : "border-slate-300"}`;
  const err = (k: string) => errors[k] && <span role="alert" className="mt-0.5 block text-xs text-red-600">{errors[k]}</span>;

  return (
    <div className="space-y-4">
      <Notice msg={msg} onClose={() => setMsg(null)} />

      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid gap-3 rounded-md bg-slate-50 p-3 sm:grid-cols-2">
        <div className="text-sm font-medium sm:col-span-2">{editing ? `แก้ไข ${editing.email}` : "เพิ่มสมาชิก"}</div>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">อีเมล Google *</span>
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inp("email")} placeholder="name@gmail.com" disabled={!!editing && editing.email === data.me} />{err("email")}</label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">ชื่อที่แสดง</span>
          <input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className={inp("display_name")} />{err("display_name")}</label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">Role *</span>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className={inp("role")} disabled={!!editing && editing.email === data.me}>
            {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{err("role")}</label>
        <label className="flex items-center gap-2 self-end pb-1.5 text-sm"><input type="checkbox" checked={form.active} disabled={!!editing && editing.email === data.me} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> ใช้งานได้</label>
        <div className="flex gap-3 sm:col-span-2">
          <button disabled={busy} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40">{busy ? "กำลังบันทึก..." : editing ? "บันทึก" : "+ เพิ่มสมาชิก"}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); setForm(empty); setErrors({}); }} className="text-sm underline">ยกเลิก</button>}
        </div>
      </form>

      {data.state === "loading" && <Skeleton kind={"rows"} />}
      {data.state === "error" && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">โหลดรายชื่อไม่ได้: {data.error}</p>}
      {data.state === "ok" && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="py-1">อีเมล</th><th>ชื่อ</th><th>Role</th><th>สถานะ</th><th /></tr></thead>
            <tbody>{data.users.map((u) => {
              const self = u.email === data.me;
              return (
                <tr key={u.user_id || u.email} className={`border-b border-slate-100 ${u.active ? "" : "text-slate-400"}`}>
                  <td className="py-1.5 pr-2">{u.email}{self && <span className="ml-1 text-xs text-slate-500">(คุณ)</span>}{u.bootstrap && <span className="ml-1 rounded bg-slate-100 px-1 text-xs text-slate-600" title="ตั้งไว้ใน Cloudflare (INITIAL_ADMIN_EMAIL) เป็น Admin เสมอ">Admin เริ่มต้น</span>}</td>
                  <td className="pr-2">{u.display_name}</td><td className="pr-2">{u.role}</td>
                  <td className="pr-2">{u.active ? <span className="text-emerald-700">ใช้งานได้</span> : "ระงับ"}</td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => { setEditing(u); setForm({ email: u.email, display_name: u.display_name, role: u.role, active: u.active }); setErrors({}); setMsg(null); }} className="underline">แก้ไข</button>
                    {!self && <> · <button disabled={busy} onClick={() => toggle(u)} className={u.active ? "text-red-700 underline" : "underline"}>{u.active ? "ระงับ" : "เปิดใช้งาน"}</button></>}
                  </td>
                </tr>);
            })}</tbody>
          </table>
        </div>
      )}
      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
        <li>ระหว่างที่ Google OAuth อยู่ในโหมด Testing ต้องเพิ่มอีเมลเดียวกันใน Google Cloud Console → OAuth consent screen → <b>Test users</b> ด้วย ไม่เช่นนั้นจะล็อกอินไม่ได้</li>
        <li>การเปลี่ยน Role หรือระงับ มีผลกับผู้ที่ล็อกอินอยู่ภายใน 5 นาที · ไม่มีการลบผู้ใช้ (ระงับแทน เพื่อเก็บประวัติ) · ทุกการเปลี่ยนแปลงบันทึกใน Audit Log</li>
        <li>แก้ Role หรือระงับบัญชีของตัวเองไม่ได้ และระบบจะเหลือ Admin ที่ใช้งานได้อย่างน้อย 1 คนเสมอ · บัญชี "Admin เริ่มต้น" เป็น Admin ตามค่าใน Cloudflare เสมอ</li>
      </ul>
    </div>
  );
}
