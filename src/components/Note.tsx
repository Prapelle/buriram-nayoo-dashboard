import Link from "next/link";

/**
 * คำอธิบายที่มาของตัวเลข (31/10/2026): ซ่อนไว้หลังปุ่ม ⓘ แทนข้อความสีเทายาวใต้ตาราง/การ์ด
 * กดเพื่อเปิด/ปิด (ใช้ <details> ไม่ต้องใช้ JavaScript) · href = ลิงก์ไปหน้าคำอธิบายตัวเลขของหัวข้อนั้น
 */
export function Note({ children, label = "ที่มาของตัวเลข", href, className = "" }: { children: React.ReactNode; label?: string; href?: string; className?: string }) {
  return (
    <details className={`group text-xs text-slate-500 ${className}`}>
      <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 rounded px-1 py-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px] font-bold leading-none">i</span>
        <span>{label}</span><span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-1 space-y-1 rounded-md bg-slate-50 p-2.5 leading-relaxed text-slate-600">
        {children}
        {href && <p><Link href={href} className="underline">ดูคำอธิบายตัวเลขทั้งหมด →</Link></p>}
      </div>
    </details>
  );
}
