"use client";
import { useState } from "react";

/** คำอธิบายใต้ตัวเลข KPI (1/11/2026): จอใหญ่แสดงเลย · มือถือซ่อนไว้หลังปุ่ม ⓘ (การ์ดไม่ยาว) — ข้อความอยู่ใน DOM ชุดเดียว */
export function KpiNote({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-xs text-slate-500">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="text-[11px] text-slate-500 underline decoration-dotted underline-offset-2 sm:hidden">
        ⓘ {open ? "ซ่อนคำอธิบาย" : "ที่มาของตัวเลข"}
      </button>
      <div className={open ? "mt-1 text-[11px] sm:mt-0 sm:text-xs" : "max-sm:hidden"}>{text}</div>
    </div>
  );
}
