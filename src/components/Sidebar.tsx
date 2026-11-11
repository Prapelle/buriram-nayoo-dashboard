"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { canEditSales, navOfSystem, systemOf, type NavItem, type Role, type SystemId } from "@/lib/roles";
import { TableSort } from "@/components/TableSort";

// โครงหน้าแอป: แถบบนพร้อมปุ่มเบอร์เกอร์ (☰) เปิด/ปิดเมนูด้านข้าง (31/10/2026)
// - มือถือ (< md): เมนูปิดไว้ก่อน · กดแล้วเลื่อนออกมาทับหน้า · กดลิงก์ / พื้นหลัง / Esc = ปิด
// - จอใหญ่ (≥ md): เมนูเต็มไว้ก่อน · กดเพื่อย่อเหลือแถบไอคอน / ขยายกลับ · จำค่าไว้ในเบราว์เซอร์นี้
// - เมนูแบ่งกลุ่ม (การตลาด / ฝ่ายขาย / Project / ข้อมูล / ตั้งค่า) · Leads มีตัวเลข Lead ที่ต้องติดตาม (เลยกำหนด + วันนี้)
const KEY = "nayoo.sidebarHidden";
const BADGE_KEY = "nayoo.badges";
const SYS_KEY = "nayoo.system"; // ระบบล่าสุดที่เปิด (ใช้เลือกเมนูเมื่ออยู่หน้าที่ใช้ร่วมกัน เช่น รายงาน Lead / ตั้งค่า)
export type SystemTab = { id: SystemId; label: string; href: string; soon?: boolean; allowed: boolean };
const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;

const ICONS: Record<string, string> = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  page: "M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h8",
  megaphone: "M3 10v4h3l7 4V6L6 10zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  chat: "M4 5h16v11H9l-5 4z",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-4-5.5",
  board: "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z",
  report: "M6 3h12v18H6zM9 8h6M9 12h6M9 16h3",
  money: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 7v10M18 7v10",
  building: "M4 21V5l8-3v19M12 9h8v12M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2M2 21h20",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  book: "M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h8",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.5",
};
function Icon({ name }: { name?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <path d={ICONS[name ?? ""] ?? ICONS.page} />
    </svg>
  );
}

export function AppShell({ items: allItems, systems, email, role, signOutAction, children }: {
  items: NavItem[]; systems: SystemTab[]; email: string; role: string; signOutAction: () => Promise<void>; children: React.ReactNode;
}) {
  const path = usePathname();
  // ระบบที่กำลังใช้: จาก path (/dashboard, /work) · หน้าที่ใช้ร่วมกัน → ระบบล่าสุดที่เปิด · ไม่เคยเปิด → ระบบแรกที่มีสิทธิ์
  const allowed = systems.filter((x) => x.allowed && !x.soon);
  const [lastSys, setLastSys] = useState<SystemId | null>(null);
  useEffect(() => { try { const v = window.localStorage.getItem(SYS_KEY) as SystemId | null; if (v) setLastSys(v); } catch { /* */ } }, []);
  const pathSys = systemOf(path);
  useEffect(() => { if (pathSys) { setLastSys(pathSys); try { window.localStorage.setItem(SYS_KEY, pathSys); } catch { /* */ } } }, [pathSys]);
  const sys: SystemId | null = pathSys ?? (lastSys && allowed.some((x) => x.id === lastSys) ? lastSys : allowed[0]?.id ?? null);
  const picker = path === "/"; // หน้าเลือกระบบ: ไม่มีเมนูด้านข้าง
  const items = navOfSystem(allItems, sys);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [rail, setRail] = useState(false); // จอใหญ่: ย่อเหลือไอคอน
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => { try { setRail(window.localStorage.getItem(KEY) === "1"); } catch { /* ใช้ค่าเริ่มต้น */ } }, []);
  useEffect(() => { setMobileOpen(false); }, [path]); // เปลี่ยนหน้าแล้วปิดเมนูบนมือถือ
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);
  // ตัวเลขบนเมนู: หน้าอื่นโหลดใหม่ไม่เกินทุก 1 นาที (เก็บไว้ในแท็บนี้) — ทุก Role ที่เห็น Lead
  useEffect(() => {
    if (!canEditSales(role as Role)) return; // ตัวเลขบนเมนูเฉพาะผู้แก้ Lead
    let cached: { at: number; v: Record<string, number> } | null = null;
    try { cached = JSON.parse(window.sessionStorage.getItem(BADGE_KEY) ?? "null"); } catch { /* ไม่มีค่าเก็บ */ }
    if (cached?.v) setBadges(cached.v);
    if (cached && Date.now() - cached.at < 60_000 && !["/work/leads", "/work/buyer-leads", "/work/seller-leads"].includes(path)) return; // หน้าที่เกี่ยวกับ Lead โหลดใหม่ทุกครั้ง
    let alive = true;
    fetch("/api/badges").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!alive || !j) return; const v = { "/work/leads": Number(j.leads) || 0 }; setBadges(v);
      try { window.sessionStorage.setItem(BADGE_KEY, JSON.stringify({ at: Date.now(), v })); } catch { /* ไม่เก็บ */ }
    }).catch(() => {});
    return () => { alive = false; };
  }, [role, path]);

  const [desk, setDesk] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)"); setDesk(mq.matches);
    const on = () => setDesk(mq.matches); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const toggle = () => {
    if (isDesktop()) setRail((h) => { const n = !h; try { window.localStorage.setItem(KEY, n ? "1" : "0"); } catch { /* ไม่จำค่า */ } return n; });
    else setMobileOpen((o) => !o);
  };
  const expanded = desk ? !rail : mobileOpen;
  const compact = desk && rail; // แสดงเฉพาะไอคอน

  const link = (n: NavItem, active: boolean, sub = false) => {
    const b = badges[n.href] ?? 0;
    return (
      <Link key={n.href + n.label} href={n.href} prefetch={false} aria-current={active ? "page" : undefined} title={compact ? n.label : undefined} aria-label={compact ? n.label : undefined}
        className={`flex items-center gap-2.5 rounded-md text-sm ${compact ? "justify-center px-0 py-2" : sub ? "ml-3 px-3 py-1.5" : "px-3 py-2"} ${active ? "bg-brand-50 font-semibold text-brand-700 shadow-[inset_3px_0_0_var(--color-brand-600)]" : sub ? "text-slate-600 hover:bg-slate-100" : "text-slate-700 hover:bg-slate-100"}`}>
        <span className="relative"><Icon name={n.icon} />{compact && b > 0 && <span className="absolute -right-2 -top-2 h-2.5 w-2.5 rounded-full bg-red-600" />}</span>
        {!compact && <span className="min-w-0 flex-1 truncate">{n.label}</span>}
        {!compact && b > 0 && <span title="Lead ที่ต้องติดตาม (เลยกำหนด + วันนี้)" className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold text-white">{b}</span>}
      </Link>
    );
  };

  // แถบเมนูด้านล่างบนมือถือ: ฝ่ายขาย/Admin = งานลูกค้า · Marketing = งานข้อมูล
  const flat = items.flatMap((n) => n.children ?? [n]);
  const BOTTOM: Record<string, [string, string][]> = {
    dashboard: [["/dashboard", "ภาพรวม"], ["/dashboard/facebook-ads", "FB Ads"], ["/dashboard/performance", "Performance"], ["/lead-report", "รายงาน"]],
    work: [["/work/leads", "Leads"], ["/work/buyer-leads", "ต้องการซื้อ"], ["/work/seller-leads", "ต้องการขาย"], ["/lead-report", "รายงาน"]],
  };
  const bottom = picker ? [] : (BOTTOM[sys ?? ""] ?? []).map(([h, short]) => { const n = flat.find((x) => x.href === h); return n ? { ...n, short } : null; }).filter((x): x is NavItem & { short: string } => !!x);

  let lastGroup: string | undefined;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-3 md:px-4">
        {!picker && <button type="button" onClick={toggle} aria-controls="side-menu" aria-expanded={expanded}
          aria-label={expanded ? "ปิดเมนู" : "เปิดเมนู"} title={expanded ? "ปิดเมนู" : "เปิดเมนู"}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>}
        <Link href="/" prefetch={false} className="flex shrink-0 items-center gap-2.5 text-slate-900" aria-label="Buriram NAYOO — เลือกระบบ" title="เลือกระบบ">
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src="/logo.png" alt="" width={32} height={32} className="h-8 w-8" />
          <span className="hidden text-[17px] font-bold lg:inline">Buriram NAYOO</span>
        </Link>
        {/* ปุ่มระบบย่อย (4/11/2026): Dashboard · ติดตามงาน · บัญชี · Production (2 ระบบหลังยังไม่เปิด) */}
        <nav aria-label="ระบบ" className="-my-1 flex min-w-0 items-center gap-1 overflow-x-auto py-1">
          {systems.filter((x) => x.allowed || x.soon).map((x) => x.soon || !x.allowed
            ? <span key={x.id} aria-disabled="true" title={`${x.label} — เร็ว ๆ นี้`} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm text-slate-400">{x.label}<span className="hidden rounded bg-slate-100 px-1 text-[10px] sm:inline">เร็ว ๆ นี้</span></span>
            : <Link key={x.id} href={x.href} prefetch={false} aria-current={sys === x.id && !picker ? "true" : undefined}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${sys === x.id && !picker ? "bg-brand-600 font-semibold text-white" : "text-slate-700 hover:bg-slate-100"}`}>{x.label}</Link>)}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2.5 text-sm text-slate-600">
          <span className="hidden max-w-48 truncate xl:inline">{email}</span>
          <span title={`${email} · สิทธิ์ ${role}`} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800">{(email[0] ?? "?").toUpperCase()}</span>
        </div>
      </header>

      <div className="flex">
        {!picker && mobileOpen && <div className="fixed inset-0 top-14 z-30 bg-slate-900/40 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
        {!picker && <aside id="side-menu" data-compact={compact ? "" : undefined}
          className={`fixed bottom-0 left-0 top-14 z-40 flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-white transition-transform duration-200
            md:sticky md:z-auto md:h-[calc(100vh-3.5rem)] md:translate-x-0 md:transition-none ${compact ? "p-2 md:w-16" : "p-4 md:w-64"}
            ${mobileOpen ? "visible translate-x-0" : "invisible -translate-x-full md:visible"}`}>
          <nav aria-label="เมนูหลัก" className="flex flex-col gap-0.5">
            {items.map((n) => {
              const head = n.group && n.group !== lastGroup ? n.group : null; lastGroup = n.group ?? lastGroup;
              const heading = head && (compact ? <hr key={"g" + head} className="my-2 border-slate-200" /> : <div key={"g" + head} className="mt-3 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{head}</div>);
              if (n.children) {
                // เมนูย่อย: ตรงพอดี หรือเป็นหน้าย่อยของเมนูนั้น (เมนูย่อยที่ยาวกว่าชนะ)
                const hit = [...n.children].sort((a, b) => b.href.length - a.href.length).find((c) => path === c.href || path.startsWith(c.href + "/"));
                return (
                  <div key={n.label} className="flex flex-col gap-0.5">
                    {compact ? <hr className="my-2 border-slate-200" /> : <span className={`mt-3 flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${hit ? "font-semibold text-slate-900" : "text-slate-700"}`}><Icon name={n.icon} />{n.label}</span>}
                    {n.children.map((c) => link(c, hit?.href === c.href, true))}
                  </div>
                );
              }
              const active = n.href === "/dashboard" ? path === "/dashboard" : path === n.href || path.startsWith(n.href + "/");
              return [heading, link(n, active)];
            })}
          </nav>
          <div className={`mt-auto text-xs text-slate-500 ${compact ? "hidden" : ""}`}>
            <div className="truncate">{email}</div>
            <div className="mb-2">สิทธิ์: {role}</div>
            <form action={signOutAction}><button className="underline">ออกจากระบบ</button></form>
          </div>
        </aside>}
        <main className={`min-w-0 flex-1 p-4 md:p-8 ${bottom.length ? "pb-24 md:pb-8" : ""}`}>{children}</main>
      </div>
      {/* มือถือ: แถบเมนูด้านล่าง (เมนูที่ใช้บ่อยตามบทบาท) */}
      {bottom.length > 0 && (
        <nav aria-label="เมนูลัด" className="fixed inset-x-0 bottom-0 z-30 grid h-16 border-t border-slate-200 bg-white md:hidden" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}>
          {bottom.map((n) => {
            const on = n.href === "/dashboard" ? path === "/dashboard" : path === n.href || path.startsWith(n.href + "/"); const b = badges[n.href] ?? 0;
            return (
              <Link key={n.href} href={n.href} prefetch={false} aria-current={on ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 text-[11px] ${on ? "font-semibold text-brand-700" : "text-slate-600"}`}>
                <span className="relative"><Icon name={n.icon} />{b > 0 && <span className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{b}</span>}</span>
                {n.short ?? n.label}
              </Link>);
          })}
        </nav>
      )}
      <TableSort />
    </div>
  );
}
