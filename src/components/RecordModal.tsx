"use client";
import Link from "next/link";
import { useEffect } from "react";

/** หน้าต่างดูข้อมูล (อ่านอย่างเดียว) ของการ์ดบนบอร์ด — Esc / คลิกนอกกรอบ = ปิด (11/11/2026) */
export function RecordModal({ label, kicker, title, badges, highlight, actions, onClose, children }: {
  label: string; kicker?: React.ReactNode; title: React.ReactNode; badges?: React.ReactNode; highlight?: boolean;
  actions: { href: string; text: string; primary?: boolean }[]; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 md:p-8" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`w-full max-w-3xl space-y-3 rounded-xl bg-white p-4 shadow-xl ${highlight ? "border-2 border-red-500" : ""}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {kicker && <div className="text-xs text-slate-500">{kicker}</div>}
            <h2 className="text-lg font-semibold leading-snug">{title}</h2>
            {badges && <div className="mt-1 flex flex-wrap gap-1 text-[11px]">{badges}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="px-2 text-xl leading-none text-slate-500">×</button>
        </div>
        {children}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
          {actions.map((a, i) => <Link key={a.href} href={a.href} prefetch={false} autoFocus={i === 0}
            className={a.primary ? "inline-flex h-9 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700" : "inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50"}>{a.text}</Link>)}
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50">ปิด</button>
        </div>
      </div>
    </div>
  );
}
