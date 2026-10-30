"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/roles";

export function Sidebar({ items, email, role, signOutAction }: {
  items: NavItem[]; email: string; role: string; signOutAction: () => Promise<void>;
}) {
  const path = usePathname();
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 border-b border-slate-200 bg-white p-4 md:min-h-screen md:w-60 md:border-b-0 md:border-r">
      <div className="text-lg font-bold">Buriram NAYOO</div>
      <nav aria-label="เมนูหลัก" className="flex flex-row flex-wrap gap-1 md:flex-col">
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
  );
}
