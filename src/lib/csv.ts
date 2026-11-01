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

/** ถอดรหัสไฟล์ข้อความตาม BOM: UTF-16 LE/BE (ไฟล์ส่งออกของ Meta Business Suite) หรือ UTF-8 (ค่าเริ่มต้น) */
export function decodeText(bytes: Uint8Array): string {
  const enc = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  return new TextDecoder(enc).decode(bytes); // TextDecoder ตัด BOM ออกให้
}
export async function readTextFile(f: Blob): Promise<string> { return decodeText(new Uint8Array(await f.arrayBuffer())); }

/**
 * ไฟล์ CSV ใหญ่ (1/11/2026): แบ่งตามแถวเป็นส่วนละ ~1 MB (ลดงานต่อคำขอของ Server · เดิม 3 MB บางส่วนล้มเหลว 500/503) (หัวตารางซ้ำทุกส่วน) — ส่งทีละส่วนไม่ให้คำขอใหญ่เกินที่ Server รับไหว
 * · แบ่งแบบเดิมทุกครั้ง (ไฟล์เดิม → ส่วนเดิม) ระบบกันไฟล์ซ้ำจึงยังทำงาน · แถวซ้ำข้ามส่วนกันด้วย row_key เหมือนเดิม
 * · ไฟล์ที่หัวตารางพิเศษ (sep= / หลายบรรทัด) ไม่แบ่ง
 */
export function splitCsv(name: string, text: string, partBytes = 1024 * 1024): { name: string; text: string }[] {
  if (/^\uFEFF?sep=/i.test(text)) return [{ name, text }];
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 3 || rows[0].filter((c) => c.trim()).length < 3) return [{ name, text }];
  const [head, ...body] = rows;
  const parts = Math.max(1, Math.ceil(new TextEncoder().encode(text).length / partBytes)); const per = Math.ceil(body.length / parts);
  if (parts === 1) return [{ name, text }];
  const base = name.replace(/\.csv$/i, "");
  return Array.from({ length: parts }, (_, i) => body.slice(i * per, (i + 1) * per)).filter((b) => b.length)
    .map((b, i, all) => ({ name: `${base} (ส่วน ${i + 1} จาก ${all.length}).csv`, text: toCsv([head, ...b]) }));
}
