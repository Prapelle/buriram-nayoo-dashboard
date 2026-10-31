"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * กล่องถามข้อความก่อนทำต่อ (31/10/2026) — เช่น ย้าย Call Status ไป กู้ไม่ผ่าน ต้องกรอกสาเหตุ
 * const [ask, dialog] = useAsk(); const v = await ask({ title, label, initial }); // null = ยกเลิก
 * หรือแบบตัวเลือก: await ask({ title, label, options: ["โทร", "Line", "เจอหน้า"] })
 */
type Q = { title: string; label: string; initial?: string; options?: string[]; confirm?: string };
export function useAsk(): [(q: Q) => Promise<string | null>, React.ReactNode] {
  const [q, setQ] = useState<(Q & { resolve: (v: string | null) => void }) | null>(null);
  const [v, setV] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const ask = useCallback((x: Q) => new Promise<string | null>((resolve) => { setV(x.initial ?? (x.options ? x.options[0] : "")); setQ({ ...x, resolve }); }), []);
  const done = (val: string | null) => { q?.resolve(val); setQ(null); };
  useEffect(() => {
    if (!q) return;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { q.resolve(null); setQ(null); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [q]);
  const el = q && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => done(null)}>
      <div role="dialog" aria-modal="true" aria-label={q.title} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold">{q.title}</h2>
        {q.options ? (
          <fieldset className="space-y-1.5"><legend className="mb-1 text-sm text-slate-600">{q.label}</legend>
            <div className="flex flex-wrap gap-2">{q.options.map((o) => (
              <label key={o} className={`flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm ${v === o ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : "border-slate-300"}`}>
                <input type="radio" name="ask-opt" value={o} checked={v === o} onChange={() => setV(o)} className="sr-only" />{o}</label>))}</div>
          </fieldset>
        ) : (
          <label className="block text-sm"><span className="mb-1 block text-slate-600">{q.label} *</span>
            <textarea ref={ref} rows={3} value={v} onChange={(e) => setV(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm" /></label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => done(null)} className="h-10 rounded-lg border border-slate-300 bg-white px-4 text-sm">ยกเลิก</button>
          <button type="button" disabled={!v.trim()} onClick={() => done(v.trim())} className="h-10 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white disabled:opacity-40">{q.confirm ?? "บันทึก"}</button>
        </div>
      </div>
    </div>
  );
  return [ask, el];
}
