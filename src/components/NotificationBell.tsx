"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { NotifItem, Todo } from "@/lib/notify";

/**
 * กระดิ่งแจ้งเตือน (20/11/2026) บนแถบด้านบน
 * - ตัวเลข = งานที่ต้องทำ + การแจ้งเตือนที่ยังไม่อ่าน · โหลดใหม่ทุก 1 นาทีขณะเปิดแท็บนี้อยู่ และเมื่อเปลี่ยนหน้า (ไม่ถี่กว่านาทีละครั้ง)
 * - กดรายการ = เปิดรายการนั้น (และนับว่าอ่านแล้ว)
 */
type Data = { todos: Todo[]; items: NotifItem[]; unread: number; enabled: boolean };
const TONE: Record<Todo["tone"], string> = { red: "bg-red-500", amber: "bg-amber-400", sky: "bg-sky-500" };

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 1) return "เมื่อสักครู่"; if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.round(m / 60); if (h < 24) return `${h} ชม.ที่แล้ว`;
  const d = Math.round(h / 24); return d < 30 ? `${d} วันที่แล้ว` : new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short" }).format(new Date(iso));
};

export function NotificationBell() {
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"todo" | "news">("news");
  const box = useRef<HTMLDivElement>(null);
  const last = useRef(0);
  const router = useRouter(), path = usePathname();

  const load = useCallback(async (force = false) => {
    if (!force && Date.now() - last.current < 60_000) return; // เปลี่ยนหน้าบ่อย ๆ ไม่ยิงซ้ำ (ไม่เกินนาทีละครั้ง)
    last.current = Date.now();
    try { const r = await fetch("/api/notifications", { cache: "no-store" }); if (r.ok) setD(await r.json()); } catch { /* ลองใหม่รอบหน้า */ }
  }, []);
  useEffect(() => { void load(); }, [load, path]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 60_000);
    const v = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const c = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", k); document.addEventListener("mousedown", c);
    return () => { window.removeEventListener("keydown", k); document.removeEventListener("mousedown", c); };
  }, [open]);

  const post = (body: object) => fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const go = (href: string) => {
    setOpen(false);
    const u = new URL(href, window.location.origin);
    if (u.pathname === window.location.pathname) window.location.assign(href); // หน้าเดิม: โหลดใหม่ให้เปิดรายการ
    else router.push(href);
  };
  const openItem = (n: NotifItem) => {
    if (!n.read_at) { setD((x) => x && ({ ...x, unread: Math.max(0, x.unread - 1), items: x.items.map((i) => (i.notif_id === n.notif_id ? { ...i, read_at: new Date().toISOString() } : i)) })); void post({ action: "read", ids: [n.notif_id] }); }
    go(n.href);
  };
  const readAll = () => { setD((x) => x && ({ ...x, unread: 0, items: x.items.map((i) => ({ ...i, read_at: i.read_at || new Date().toISOString() })) })); void post({ action: "read_all" }); };

  const todos = d?.todos ?? [], unread = d?.unread ?? 0, count = todos.length + unread;
  const groups = [...new Set(todos.map((t) => t.group))];
  const toggle = () => { setOpen((o) => { if (!o) { setTab(unread ? "news" : todos.length ? "todo" : "news"); void load(true); } return !o; }); };

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-label={`การแจ้งเตือน${count ? ` (${count})` : ""}`} title="การแจ้งเตือน"
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {count > 0 && <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="การแจ้งเตือน" className="fixed inset-x-2 top-14 z-50 mt-1 max-h-[75vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-[26rem]">
          <div className="flex items-center gap-1 border-b border-slate-200 p-2">
            {([["news", `การแจ้งเตือน${unread ? ` (${unread})` : ""}`], ["todo", `งานที่ต้องทำ${todos.length ? ` (${todos.length})` : ""}`]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k} className={`rounded-full px-3 py-1 text-sm ${tab === k ? "bg-brand-600 font-semibold text-white" : "text-slate-700 hover:bg-slate-100"}`}>{l}</button>))}
            {tab === "news" && unread > 0 && <button type="button" onClick={readAll} className="ml-auto px-2 text-xs text-sky-700 underline">อ่านทั้งหมดแล้ว</button>}
          </div>
          <div className="max-h-[calc(75vh-3rem)] overflow-y-auto">
            {!d ? <p className="p-4 text-sm text-slate-500">กำลังโหลด…</p>
              : tab === "news" ? (
                !d.enabled ? <p className="p-4 text-sm text-slate-500">การแจ้งเตือนเมื่อมีการเปลี่ยนแปลงต้องใช้ฐานข้อมูล D1</p>
                  : !d.items.length ? <p className="p-4 text-sm text-slate-500">ยังไม่มีการแจ้งเตือน</p>
                  : <ul className="divide-y divide-slate-100">{d.items.map((n) => (
                    <li key={n.notif_id}><button type="button" onClick={() => openItem(n)} className={`flex w-full gap-2 px-3 py-2.5 text-left hover:bg-slate-50 ${n.read_at ? "" : "bg-sky-50/60"}`}>
                      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : n.kind === "claim" ? "bg-sky-500" : "bg-red-500"}`} />
                      <span className="min-w-0 flex-1"><span className={`block text-sm ${n.read_at ? "text-slate-700" : "font-semibold text-slate-900"}`}>{n.title}</span>
                        {n.body && <span className="block truncate text-xs text-slate-600">{n.body}</span>}
                        <span className="block text-[11px] text-slate-400">{ago(n.created_at)}{!n.read_at && <span className="sr-only"> · ยังไม่อ่าน</span>}</span></span>
                    </button></li>))}</ul>
              ) : !todos.length ? <p className="p-4 text-sm text-slate-500">ไม่มีงานค้าง 🎉</p>
                : groups.map((g) => (
                  <div key={g}><div className="bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">{g}</div>
                    <ul>{todos.filter((t) => t.group === g).map((t) => (
                      <li key={t.key}><button type="button" onClick={() => go(t.href)} className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50">
                        <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[t.tone]}`} /><span className="min-w-0 flex-1">{t.text}</span></button></li>))}</ul></div>))}
          </div>
        </div>)}
    </div>
  );
}
