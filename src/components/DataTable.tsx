import Link from "next/link";
import { fmtCell, href, type Col } from "@/lib/tableview";

const right = (k?: string) => k === "int" || k === "num" || k === "thb" || k === "pct";

export function DataTable({ cols, rows, base, params, sort, dir, page, pages, total }: {
  cols: Col[]; rows: Record<string, string>[]; base: string; params: Record<string, string | undefined>;
  sort?: string; dir?: string; page: number; pages: number; total: number;
}) {
  if (!rows.length) return <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">ไม่มีข้อมูลที่ตรงกับตัวกรอง</p>;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-xs text-slate-500">
              {cols.map((c) => {
                const active = sort === c.key;
                const next = active && dir === "desc" ? "asc" : "desc";
                return (
                  <th key={c.key} className={`whitespace-nowrap p-2 ${right(c.kind) ? "text-right" : ""}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                    <Link href={href(base, { ...params, sort: c.key, dir: next, page: undefined })} className="hover:underline">
                      {c.label}{active ? (dir === "asc" ? " ▲" : " ▼") : ""}
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-100">
                {cols.map((c) => {
                  const v = fmtCell(c.kind, r[c.key] ?? "");
                  return <td key={c.key} className={`p-2 ${right(c.kind) ? "text-right tabular-nums" : "max-w-72 truncate"}`} title={r[c.key]}>{v === "" ? <span className="text-slate-300">ว่าง</span> : c.href ? <Link href={c.href(r)} className="underline">{v}</Link> : v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{total.toLocaleString("en-US")} แถว · หน้า {page}/{pages}</span>
        <span className="flex gap-3">
          {page > 1 && <Link href={href(base, { ...params, sort, dir, page: String(page - 1) })} className="underline">ก่อนหน้า</Link>}
          {page < pages && <Link href={href(base, { ...params, sort, dir, page: String(page + 1) })} className="underline">ถัดไป</Link>}
        </span>
      </div>
    </div>
  );
}
