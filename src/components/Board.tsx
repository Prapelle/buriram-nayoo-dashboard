"use client";
import { useEffect, useRef, useState } from "react";

// ส่วนช่วยของบอร์ด Kanban (31/10/2026)
// - จอใหญ่: แถวคอลัมน์เลื่อนแนวนอน พร้อมปุ่ม ‹ › และเงาที่ขอบเมื่อยังมีคอลัมน์ซ่อนอยู่ (ไม่ให้ดูเหมือนคอลัมน์ถูกตัด)
// - มือถือ: แท็บสถานะ (พร้อมจำนวน) แสดงทีละคอลัมน์เต็มความกว้าง

export function BoardTabs({ tabs, active, onPick }: { tabs: { key: string; label: string; count: number; cls?: string }[]; active: string; onPick: (k: string) => void }) {
  return (
    <div role="tablist" aria-label="สถานะ" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:hidden">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={active === t.key} onClick={() => onPick(t.key)}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${active === t.key ? "border-slate-900 bg-slate-900 text-white" : `border-slate-200 ${t.cls ?? "bg-white"} text-slate-800`}`}>
          {t.label} <span className={active === t.key ? "text-white/80" : "text-slate-500"}>{t.count}</span>
        </button>
      ))}
    </div>
  );
}

export function BoardScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const upd = () => setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    upd(); el.addEventListener("scroll", upd, { passive: true }); window.addEventListener("resize", upd);
    const ro = new ResizeObserver(upd); ro.observe(el);
    return () => { el.removeEventListener("scroll", upd); window.removeEventListener("resize", upd); ro.disconnect(); };
  }, []);
  const go = (d: number) => ref.current?.scrollBy({ left: d * Math.max(260, (ref.current?.clientWidth ?? 600) * 0.8), behavior: "smooth" });
  const btn = "absolute top-2 z-10 hidden h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-lg leading-none text-slate-700 shadow hover:bg-slate-50 md:flex";
  return (
    <div className="relative">
      {edge.l && <><div className="pointer-events-none absolute inset-y-0 left-0 z-[5] hidden w-8 bg-gradient-to-r from-slate-50 md:block" /><button type="button" aria-label="เลื่อนไปคอลัมน์ก่อนหน้า" onClick={() => go(-1)} className={`${btn} left-1`}>‹</button></>}
      {edge.r && <><div className="pointer-events-none absolute inset-y-0 right-0 z-[5] hidden w-8 bg-gradient-to-l from-slate-50 md:block" /><button type="button" aria-label="เลื่อนไปคอลัมน์ถัดไป" onClick={() => go(1)} className={`${btn} right-1`}>›</button></>}
      <div ref={ref} className="flex items-start gap-3 overflow-x-auto pb-3">{children}</div>
    </div>
  );
}
