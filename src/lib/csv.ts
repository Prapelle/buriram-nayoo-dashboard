export class CsvError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** RFC 4180: รองรับ UTF-8 BOM, quoted field, comma/ขึ้นบรรทัดใหม่ในเครื่องหมายคำพูด, "" escape, CRLF */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") continue;
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (inQuotes) throw new CsvError("UNTERMINATED_QUOTE", `เครื่องหมายคำพูดไม่ปิด (ใกล้ record ที่ ${rows.length + 1}) ไฟล์อาจเสียหาย`);
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export type Table = { headers: string[]; records: { n: number; cells: string[] }[] };

/** n = ลำดับแถวข้อมูลในไฟล์ โดย header คือแถวที่ 1 (ข้อมูลแถวแรก n=2) */
export function parseTable(text: string): Table {
  const rows = parseCsv(text);
  if (!rows.length) throw new CsvError("EMPTY_FILE", "ไฟล์ว่างเปล่า");
  const headers = rows[0].map((h) => h.trim());
  return { headers, records: rows.slice(1).map((cells, i) => ({ n: i + 2, cells })) };
}

export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\ufeff" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}
