export type Kind = "text" | "int" | "num" | "thb" | "pct" | "date" | "datetime" | "clip";
export type Col = { key: string; label: string; kind?: Kind };
export type View = { q?: string; searchKeys?: string[]; filters?: Record<string, string>; sort?: string; dir?: "asc" | "desc"; page?: number; size?: number };

const nf = (n: number, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d === 0 ? 2 : d });

/** ค่าว่างแสดงเป็น "ว่าง" (ไม่ใช่ 0) */
export function fmtCell(kind: Kind | undefined, v: string): string {
  if (v === "" || v === undefined) return "";
  const n = Number(v);
  switch (kind) {
    case "int": return isNaN(n) ? v : nf(n);
    case "num": return isNaN(n) ? v : nf(n, 2);
    case "thb": return isNaN(n) ? v : `฿${nf(n, 2)}`;
    case "pct": return isNaN(n) ? v : `${nf(n, 2)}%`;
    case "date": return /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : v;
    case "datetime": return /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)} ${v.slice(11, 16)}` : v;
    case "clip": return v.length > 70 ? v.slice(0, 70) + "…" : v;
    default: return v;
  }
}

export function applyView(rows: Record<string, string>[], v: View) {
  let out = rows;
  for (const [k, val] of Object.entries(v.filters ?? {})) if (val) out = out.filter((r) => r[k] === val);
  const q = v.q?.trim().toLowerCase();
  if (q && v.searchKeys?.length) out = out.filter((r) => v.searchKeys!.some((k) => (r[k] ?? "").toLowerCase().includes(q)));
  if (v.sort) {
    const k = v.sort, dir = v.dir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      const x = a[k] ?? "", y = b[k] ?? "";
      if (x === "" && y === "") return 0;
      if (x === "") return 1;           // ค่าว่างไว้ท้ายเสมอ
      if (y === "") return -1;
      const nx = Number(x), ny = Number(y);
      return (!isNaN(nx) && !isNaN(ny) ? nx - ny : x.localeCompare(y)) * dir;
    });
  }
  const size = v.size ?? 50;
  const pages = Math.max(1, Math.ceil(out.length / size));
  const page = Math.min(Math.max(1, v.page ?? 1), pages);
  return { rows: out.slice((page - 1) * size, page * size), total: out.length, pages, page, all: out };
}

/** เดาชนิดคอลัมน์จากชื่อ (ใช้กับแท็บ Google Ads รายละเอียด) */
export function inferKind(key: string): Kind {
  if (/_thb$/.test(key)) return "thb";
  if (/_pct$/.test(key)) return "pct";
  if (/^(report_start|report_end|comparison_start|comparison_end|date)$/.test(key)) return "date";
  if (/^(clicks|impressions|interactions|hour_24)/.test(key) || /_comparison$/.test(key) && !/_thb$/.test(key)) return "int";
  if (key === "conversions") return "num";
  if (/queries|name|term|keyword|word/.test(key)) return "clip";
  return "text";
}

export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function href(base: string, params: Record<string, string | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}
