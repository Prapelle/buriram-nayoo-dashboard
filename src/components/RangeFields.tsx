"use client";
import { useEffect, useRef, useState } from "react";
import { DateInput } from "@/components/DateInput";

// ช่องช่วงวันที่ + ปุ่มช่วงสำเร็จรูป (31/10/2026) — ใช้ในฟอร์มตัวกรองแบบ GET
// กดปุ่มช่วงสำเร็จรูป = ตั้งวันที่แล้วใช้ตัวกรองทันที · ช่วงที่ใช้ล่าสุดจำไว้ (cookie) ให้หน้าอื่นใช้ต่อ · "ทั้งหมด" = ล้างช่วงที่จำ
const COOKIE = "nayoo_range";
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
function presets(t: string): { key: string; label: string; from: string; to: string }[] {
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)) - 1, q = Math.floor(m / 3) * 3;
  const d30 = new Date(Date.UTC(y, m, Number(t.slice(8, 10)) - 29)).toISOString().slice(0, 10);
  return [
    { key: "this-month", label: "เดือนนี้", from: ymd(y, m, 1), to: t },
    { key: "last-month", label: "เดือนก่อน", from: ymd(y, m - 1, 1), to: ymd(y, m, 0) },
    { key: "30d", label: "30 วันล่าสุด", from: d30, to: t },
    { key: "quarter", label: "ไตรมาสนี้", from: ymd(y, q, 1), to: t },
    { key: "year", label: "ปีนี้", from: ymd(y, 0, 1), to: t },
  ];
}
function save(from: string, to: string) {
  try {
    document.cookie = from || to
      ? `${COOKIE}=${encodeURIComponent(`${from}|${to}`)}; path=/; max-age=${60 * 60 * 24 * 90}; samesite=lax`
      : `${COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch { /* ไม่จำ */ }
}

export function RangeFields({ from = "", to = "", className, labelFrom = "ตั้งแต่", labelTo = "ถึง", remembered = false }:
  { from?: string; to?: string; className: string; labelFrom?: string; labelTo?: string; remembered?: boolean }) {
  const [a, setA] = useState(from), [b, setB] = useState(to);
  const [all, setAll] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form"); if (!form) return;
    const onSubmit = () => { const fd = new FormData(form); save(String(fd.get("from") ?? ""), String(fd.get("to") ?? "")); };
    form.addEventListener("submit", onSubmit);
    if (new URLSearchParams(window.location.search).has("range")) save("", ""); // มาจาก ล้างตัวกรอง / ทั้งหมด
    return () => form.removeEventListener("submit", onSubmit);
  }, []);
  const submit = () => setTimeout(() => ref.current?.closest("form")?.requestSubmit(), 0);
  const t = today(); const list = presets(t);
  const on = list.find((p) => p.from === a && p.to === b)?.key;
  const chip = (active: boolean) => `rounded-full border px-2.5 py-1 text-xs ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`;
  return (
    <div ref={ref} className="contents">
      <div className="flex w-full flex-wrap items-center gap-1.5" role="group" aria-label="ช่วงวันที่สำเร็จรูป">
        {list.map((p) => <button key={p.key} type="button" aria-pressed={on === p.key} onClick={() => { setA(p.from); setB(p.to); setAll(false); submit(); }} className={chip(on === p.key)}>{p.label}</button>)}
        <button type="button" aria-pressed={!a && !b} onClick={() => { setA(""); setB(""); setAll(true); submit(); }} className={chip(!a && !b)}>ทั้งหมด</button>
        {remembered && <span className="text-xs text-slate-500">· ใช้ช่วงวันที่ล่าสุดที่เลือกไว้</span>}
      </div>
      {all && <input type="hidden" name="range" value="all" />}
      <label><span className="mb-1 block text-xs text-slate-500">{labelFrom}</span><DateInput name="from" value={a} onChange={(e) => setA(e.target.value)} className={className} /></label>
      <label><span className="mb-1 block text-xs text-slate-500">{labelTo}</span><DateInput name="to" value={b} onChange={(e) => setB(e.target.value)} className={className} /></label>
    </div>
  );
}
