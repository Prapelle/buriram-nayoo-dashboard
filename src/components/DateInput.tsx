"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { thDate, thMonth } from "@/lib/thdate";

/**
 * ช่องเลือกวันที่ที่แสดงผลเป็น "31 ต.ค. 69" (31/10/2026)
 * ใช้ <input type="date"> ของเบราว์เซอร์ตามเดิม (ปฏิทิน, คีย์บอร์ด, ค่าในฟอร์ม = YYYY-MM-DD ค.ศ.)
 * แต่ซ่อนข้อความ mm/dd/yyyy ของเบราว์เซอร์ตอนไม่ได้พิมพ์ แล้ววางข้อความภาษาไทยทับ
 * month = ช่องเลือกเดือน แสดง "ต.ค. 69"
 * ใช้ได้ทั้งแบบ value/onChange และแบบฟอร์ม name/defaultValue
 */
export function DateInput({ className = "", value, defaultValue, onChange, placeholder, month = false, ...rest }:
  React.InputHTMLAttributes<HTMLInputElement> & { placeholder?: string; month?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [inner, setInner] = useState(String(defaultValue ?? ""));
  const [focus, setFocus] = useState(false);
  const [pad, setPad] = useState<string | undefined>();
  const v = value !== undefined ? String(value ?? "") : inner;
  useLayoutEffect(() => { if (ref.current) setPad(getComputedStyle(ref.current).paddingLeft); }, []);
  const full = /\bw-full\b/.test(className);
  return (
    <span className={`relative ${full ? "block w-full" : "inline-block"}`}>
      <input ref={ref} type={month ? "month" : "date"} {...rest} value={value} defaultValue={value === undefined ? defaultValue : undefined}
        onChange={(e) => { if (value === undefined) setInner(e.target.value); onChange?.(e); }}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        data-th-date={focus ? undefined : ""} className={className} />
      {!focus && (
        <span aria-hidden="true" style={{ paddingLeft: pad }}
          className={`pointer-events-none absolute inset-y-0 left-0 flex items-center whitespace-nowrap pr-8 text-sm ${v ? (rest.disabled ? "text-slate-400" : "text-slate-900") : "text-slate-400"}`}>
          {v ? (month ? thMonth(v) : thDate(v)) : (placeholder ?? (month ? "เลือกเดือน" : "เลือกวันที่"))}
        </span>
      )}
    </span>
  );
}
