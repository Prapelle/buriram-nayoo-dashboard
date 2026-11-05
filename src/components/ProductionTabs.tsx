import Link from "next/link";

/** สลับมุมมองในเมนู "งาน Production": บอร์ด Content / รายงานลูกค้า */
export function ProductionTabs({ active }: { active: "content" | "reports" }) {
  const t = (on: boolean) => `rounded-full border px-4 py-1.5 text-sm ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`;
  return (
    <nav aria-label="มุมมอง Production" className="flex flex-wrap gap-2 print:hidden">
      <Link href="/production/content" className={t(active === "content")} aria-current={active === "content" ? "page" : undefined}>บอร์ด Content</Link>
      <Link href="/production/content/reports" className={t(active === "reports")} aria-current={active === "reports" ? "page" : undefined}>รายงานลูกค้า</Link>
    </nav>
  );
}
