"use client";
import { useEffect, useState } from "react";
/** จอเล็กกว่า md (768px) — ใช้เลือกแสดงการ์ดแทนตาราง (แสดงแบบเดียว ไม่ซ้ำกันใน DOM) */
export function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)"); setM(mq.matches);
    const on = () => setM(mq.matches); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}
