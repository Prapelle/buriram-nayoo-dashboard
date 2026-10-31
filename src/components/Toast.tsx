"use client";
import { useEffect, useRef } from "react";

// ข้อความแจ้งผลแบบเดียวกันทั้งระบบ (31/10/2026)
// - สำเร็จ / แจ้งเตือน: กล่องลอยมุมขวาล่าง (toast) หายเองใน 8 วินาที กดปิดได้
// - ผิดพลาด: กล่องสีแดงในหน้า (ไม่หายเอง) เพื่อให้อ่านและแก้ได้
export type Msg = { type: "ok" | "error" | "warn" | "info"; text: string; link?: string; linkText?: string } | null;

export function Notice({ msg, onClose }: { msg: Msg | undefined; onClose: () => void }) {
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!msg || msg.type === "error") return;
    const t = setTimeout(() => close.current(), 8000);
    return () => clearTimeout(t);
  }, [msg]);
  if (!msg) return null;
  if (msg.type === "error") return <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{msg.text}</p>;
  return (
    <div role="status" aria-live="polite"
      className={`fixed left-4 right-4 top-14 z-50 flex items-start sm:left-auto sm:top-auto sm:bottom-4 gap-3 rounded-lg border p-3 pr-2 text-sm shadow-lg sm:max-w-md ${msg.type === "ok" ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <span aria-hidden="true">{msg.type === "ok" ? "✓" : "⚠"}</span>
      <span className="min-w-0 flex-1">{msg.text}{msg.link && <> · <a href={msg.link} className="font-medium underline">{msg.linkText ?? "เปิด"}</a></>}</span>
      <button type="button" onClick={onClose} aria-label="ปิดข้อความ" className="rounded px-1.5 text-base leading-none opacity-60 hover:opacity-100">×</button>
    </div>
  );
}
