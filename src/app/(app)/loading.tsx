export default function Loading() {
  return (
    <div role="status" aria-label="กำลังโหลด" className="animate-pulse space-y-4">
      <div className="h-8 w-56 rounded bg-slate-200" />
      <div className="h-16 rounded bg-slate-200" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 rounded bg-slate-200" />)}
      </div>
    </div>
  );
}
