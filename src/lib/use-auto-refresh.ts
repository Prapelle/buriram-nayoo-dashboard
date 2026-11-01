"use client";
import { useEffect, useRef } from "react";

/**
 * ใช้พร้อมกันหลายคน (1/11/2026): ดึงข้อมูลล่าสุดเองทุก 60 วินาทีขณะเปิดหน้าอยู่ และเมื่อกลับมาที่แท็บนี้
 * — เห็นการเปลี่ยนแปลงของคนอื่นโดยไม่ต้องรีเฟรช · หยุดชั่วคราวระหว่างลากการ์ด / กำลังบันทึก (paused)
 */
export function useAutoRefresh(refresh: () => void | Promise<void>, paused = false, everyMs = 60_000) {
  const fn = useRef(refresh); fn.current = refresh;
  const hold = useRef(paused); hold.current = paused;
  const last = useRef(Date.now());
  useEffect(() => {
    const run = () => { if (hold.current || document.visibilityState !== "visible") return; last.current = Date.now(); void fn.current(); };
    const t = setInterval(run, everyMs);
    const onVis = () => { if (document.visibilityState === "visible" && Date.now() - last.current > 15_000) run(); };
    document.addEventListener("visibilitychange", onVis); window.addEventListener("focus", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [everyMs]);
}
