// หัวหน้าแบบเดียวกันทุกหน้า (ธีมแบบ A): หมวด · ชื่อหน้า · คำอธิบาย อยู่ซ้าย — ปุ่มหลักอยู่ขวา
export function PageHeader({ crumb, title, sub, children }: { crumb?: string; title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 basis-72">
        {crumb && <div className="text-xs text-slate-500">{crumb}</div>}
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900">{title}</h1>
        {sub && <div className="mt-1 text-[13px] text-slate-600">{sub}</div>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
/** ปุ่มแบบลิงก์ตามธีม: primary = สีหลัก · secondary = มีขอบ */
export const btn = {
  primary: "inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700",
  secondary: "inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50",
};
