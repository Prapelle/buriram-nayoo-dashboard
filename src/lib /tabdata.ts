import { batchGet } from "./sheets";

const letter = (i: number) => { let n = i + 1, s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/** อ่านบางคอลัมน์ของแท็บ (ข้าม raw_json ฯลฯ) ใช้ API 2 calls: header แล้วค่อยอ่านคอลัมน์ */
export async function readColumns(tab: string, opts: { only?: string[]; exclude?: string[] } = {}) {
  const [hdr] = await batchGet([`'${tab}'!1:1`]);
  const all = hdr[0] ?? [];
  const exclude = new Set(opts.exclude ?? []);
  const headers = (opts.only ? opts.only.filter((h) => all.includes(h)) : all).filter((h) => !exclude.has(h));
  if (!headers.length) return { headers: [] as string[], rows: [] as Record<string, string>[] };
  const cols = await batchGet(headers.map((h) => `'${tab}'!${letter(all.indexOf(h))}:${letter(all.indexOf(h))}`));
  const n = Math.max(0, ...cols.map((c) => c.length)) - 1;
  const rows: Record<string, string>[] = [];
  for (let i = 1; i <= n; i++) {
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = cols[j][i]?.[0] ?? ""; });
    if (Object.values(row).some((v) => v !== "")) rows.push(row);
  }
  return { headers, rows };
}

/** เพจ Facebook ที่ไม่นับ (APP_CONFIG: excluded_fb_pages คั่นด้วย |) */
export async function getExcludedPages(defaults: string[]): Promise<string[]> {
  const { rows } = await readColumns("APP_CONFIG", { only: ["config_key", "config_value"] });
  const v = rows.find((r) => r.config_key === "excluded_fb_pages")?.config_value;
  return v !== undefined ? v.split("|").map((x) => x.trim()).filter(Boolean) : defaults;
}
