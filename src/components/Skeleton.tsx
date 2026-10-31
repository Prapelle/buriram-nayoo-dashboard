// โครงร่างขณะโหลดข้อมูล (31/10/2026) — แทนข้อความ "กำลังโหลด..." เพื่อให้เห็นรูปหน้าที่กำลังมา
export function Skeleton({ kind = "rows", rows = 5 }: { kind?: "rows" | "board"; rows?: number }) {
  return (
    <div role="status" aria-label="กำลังโหลด" className="animate-pulse">
      <span className="sr-only">กำลังโหลด...</span>
      {kind === "board" ? (
        <div className="flex gap-3 overflow-hidden">{Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-full shrink-0 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:w-60">
            <div className="h-6 rounded bg-slate-200" />{Array.from({ length: 3 - (i % 2) }).map((_, j) => <div key={j} className="h-16 rounded bg-white" />)}
          </div>))}</div>
      ) : (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          {Array.from({ length: rows }).map((_, i) => <div key={i} className="h-7 rounded bg-slate-100" />)}
        </div>
      )}
    </div>
  );
}
