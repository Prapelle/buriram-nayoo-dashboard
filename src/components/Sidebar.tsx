"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavItem } from "@/lib/roles";

// โครงหน้าแอป: แถบบนพร้อมปุ่มเบอร์เกอร์ (☰) เปิด/ปิดเมนูด้านข้าง (31/10/2026)
// - มือถือ (< md): เมนูปิดไว้ก่อน · กดแล้วเลื่อนออกมาทับหน้า · กดลิงก์ / พื้นหลัง / Esc = ปิด
// - จอใหญ่ (≥ md): เมนูเปิดไว้ก่อน · กดเพื่อซ่อน/แสดง · จำค่าไว้ในเบราว์เซอร์นี้ (ถ้าเบราว์เซอร์ไม่ให้เก็บก็ใช้ค่าเริ่มต้น)
const KEY = "nayoo.sidebarHidden";
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

export function AppShell({ items, email, role, signOutAction, children }: {
  items: NavItem[]; email: string; role: string; signOutAction: () => Promise<void>; children: React.ReactNode;
}) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopHidden, setDesktopHidden] = useState(false);

  useEffect(() => { try { setDesktopHidden(window.localStorage.getItem(KEY) === "1"); } catch { /* ใช้ค่าเริ่มต้น */ } }, []);
  useEffect(() => { setMobileOpen(false); }, [path]); // เปลี่ยนหน้าแล้วปิดเมนูบนมือถือ
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggle = () => {
    if (isDesktop()) {
      setDesktopHidden((h) => { const n = !h; try { window.localStorage.setItem(KEY, n ? "1" : "0"); } catch { /* ไม่จำค่า */ } return n; });
    } else setMobileOpen((o) => !o);
  };
  // aria-expanded ตามขนาดจอปัจจุบัน (ค่าเริ่มต้นก่อนโหลด = จอใหญ่เปิด)
  const [desk, setDesk] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)"); setDesk(mq.matches);
    const on = () => setDesk(mq.matches); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const expanded = desk ? !desktopHidden : mobileOpen;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-slate-200 bg-white px-3">
        <button type="button" onClick={toggle} aria-controls="side-menu" aria-expanded={expanded}
          aria-label={expanded ? "ปิดเมนู" : "เปิดเมนู"} title={expanded ? "ปิดเมนู" : "เปิดเมนู"}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-lg font-bold">Buriram NAYOO</span>
      </header>

      <div className="flex">
        {mobileOpen && <div className="fixed inset-0 top-12 z-30 bg-slate-900/40 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
        <aside id="side-menu"
          className={`fixed bottom-0 left-0 top-12 z-40 flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white p-4 transition-transform duration-200
            md:sticky md:z-auto md:h-[calc(100vh-3rem)] md:w-60 md:translate-x-0 md:transition-none
            ${mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full md:visible"}
            ${desktopHidden ? "md:hidden" : ""}`}>
          <nav aria-label="เมนูหลัก" className="flex flex-col gap-1">
            {items.map((n) => {
              if (n.children) {
                // เมนูย่อย: ตรงพอดี หรือเป็นหน้าย่อยของเมนูนั้น (เมนูย่อยที่ยาวกว่าชนะ)
                const hit = [...n.children].sort((a, b) => b.href.length - a.href.length).find((c) => path === c.href || path.startsWith(c.href + "/"));
                return (
                  <div key={n.label} className="flex flex-col gap-1">
                    <span className={`rounded-md px-3 py-2 text-sm ${hit ? "font-semibold text-slate-900" : "text-slate-700"}`}>{n.label}</span>
                    {n.children.map((c) => {
                      const active = hit?.href === c.href;
                      return (
                        <Link key={c.href} href={c.href} aria-current={active ? "page" : undefined}
                          className={`ml-3 rounded-md px-3 py-1.5 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                          {c.label}
                        </Link>
                      );
                    })}
                  </div>
                );
              }
              const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-2 text-sm ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto text-xs text-slate-500">
            <div className="truncate">{email}</div>
            <div className="mb-2">สิทธิ์: {role}</div>
            <form action={signOutAction}><button className="underline">ออกจากระบบ</button></form>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
