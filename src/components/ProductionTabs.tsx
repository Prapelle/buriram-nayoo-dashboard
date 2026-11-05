import Link from "next/link";

/** สลับมุมมองในเมนู "งาน Production" เมนูเดียว: บอร์ด Content (ค่าเริ่มต้น) / Job เช็กลิสต์ */
export function ProductionTabs({ active }: { active: "content" | "jobs" }) {
  const t = (on: boolean) => `rounded-full border px-4 py-1.5 text-sm ${on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`;
  return (
    <nav aria-label="มุมมอง Production" className="flex gap-2">
      <Link href="/production/content" className={t(active === "content")} aria-current={active === "content" ? "page" : undefined}>บอร์ด Content</Link>
      <Link href="/production" className={t(active === "jobs")} aria-current={active === "jobs" ? "page" : undefined}>Job · เช็กลิสต์</Link>
    </nav>
  );
}
