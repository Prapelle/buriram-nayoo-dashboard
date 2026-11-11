import Link from "next/link";
import { auth, signOut } from "@/auth";
import { requirePage } from "@/lib/page-guard";
import { ROLE_LABEL, systemHref, SYSTEMS } from "@/lib/roles";

export const dynamic = "force-dynamic";

const ICON: Record<string, string> = {
  dashboard: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  work: "M9 11l2 2 4-4M5 4h14v16H5zM9 2v4M15 2v4",
  account: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
  production: "M3 21V9l6 4V9l6 4V5h6v16zM7 17h2M12 17h2M17 17h2",
};

/** หน้าเลือกระบบ (4/11/2026) — หน้าแรกหลังเข้าสู่ระบบ: Dashboard · ติดตามงาน · บัญชี · Production */
export default async function SystemPicker() {
  const role = await requirePage("/");
  const email = (await auth())?.user?.email ?? "";
  return (
    <section className="mx-auto max-w-4xl space-y-6 py-2 md:py-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">เลือกระบบ</h1>
        <p className="text-sm text-slate-500">สลับระบบได้ทุกเมื่อจากปุ่มแถบด้านบน · กดโลโก้เพื่อกลับมาหน้านี้</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {SYSTEMS.map((x) => {
          const ok = !x.soon && x.roles.includes(role);
          const body = (
            <>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${ok ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-400"}`}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[x.id]} /></svg>
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-lg font-semibold">{x.label}
                  {x.soon && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">เร็ว ๆ นี้</span>}
                  {!x.soon && !ok && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">ไม่มีสิทธิ์</span>}
                </span>
                <span className="mt-0.5 block text-sm text-slate-500">{x.desc}</span>
              </span>
            </>
          );
          return ok
            ? <Link key={x.id} href={systemHref(role, x)} prefetch={false} className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-brand-600 hover:bg-brand-50/40">{body}</Link>
            : <div key={x.id} aria-disabled="true" className="flex items-start gap-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 opacity-70">{body}</div>;
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>{email} · สิทธิ์ {ROLE_LABEL[role]}</span>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}><button className="underline">ออกจากระบบ</button></form>
      </div>
    </section>
  );
}
