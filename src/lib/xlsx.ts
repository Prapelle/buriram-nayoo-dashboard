// อ่านไฟล์ .xlsx โดยไม่พึ่งไลบรารี: .xlsx คือ zip ของไฟล์ XML (ใช้ DecompressionStream ที่มีใน Browser/Node/Workers)
export type Cell = string | number | null;
export type SheetData = { name: string; rows: Cell[][] };
export class XlsxError extends Error {}

const dec = new TextDecoder("utf-8");
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf: Uint8Array): Promise<Map<string, () => Promise<Uint8Array>>> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (u32(buf, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new XlsxError("ไม่ใช่ไฟล์ .xlsx ที่ถูกต้อง (ไม่พบโครงสร้าง zip)");
  const count = u16(buf, eocd + 10), cdOff = u32(buf, eocd + 16);
  if (cdOff === 0xffffffff) throw new XlsxError("ไฟล์ใหญ่เกินกว่าที่รองรับ (ZIP64)");
  const files = new Map<string, () => Promise<Uint8Array>>();
  let p = cdOff;
  for (let n = 0; n < count; n++) {
    if (u32(buf, p) !== 0x02014b50) throw new XlsxError("โครงสร้างไฟล์ .xlsx เสียหาย");
    const method = u16(buf, p + 10), csize = u32(buf, p + 20), nameLen = u16(buf, p + 28), extraLen = u16(buf, p + 30), cmtLen = u16(buf, p + 32), local = u32(buf, p + 42);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    files.set(name, async () => {
      if (u32(buf, local) !== 0x04034b50) throw new XlsxError("โครงสร้างไฟล์ .xlsx เสียหาย");
      const start = local + 30 + u16(buf, local + 26) + u16(buf, local + 28);
      const raw = buf.subarray(start, start + csize);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new XlsxError(`ไม่รองรับวิธีบีบอัดแบบ ${method}`);
    });
    p += 46 + nameLen + extraLen + cmtLen;
  }
  return files;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unescapeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === "#") { const c = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(c) ? String.fromCodePoint(c) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const attr = (tag: string, name: string) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag); return m ? unescapeXml(m[1]) : undefined; };
const textOf = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join("");

function colIndex(ref: string): number { let n = 0; for (const ch of ref.replace(/\d/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; }

export async function readXlsx(input: ArrayBuffer | Uint8Array, preferSheet = "SalesReport"): Promise<{ sheetNames: string[]; sheet: SheetData }> {
  const files = await unzip(input instanceof Uint8Array ? input : new Uint8Array(input));
  const get = async (name: string) => { const f = files.get(name); return f ? dec.decode(await f()) : null; };
  const wb = await get("xl/workbook.xml");
  if (!wb) throw new XlsxError("ไม่ใช่ไฟล์ Excel (.xlsx) ที่ถูกต้อง");
  const rels = (await get("xl/_rels/workbook.xml.rels")) ?? "";
  const relTarget = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id") ?? "", attr(m[0], "Target") ?? ""]));
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m, i) => {
    const rid = attr(m[0], "r:id");
    const t = (rid && relTarget.get(rid)) || `worksheets/sheet${i + 1}.xml`;
    return { name: attr(m[0], "name") ?? `Sheet${i + 1}`, path: t.startsWith("/") ? t.slice(1) : `xl/${t}` };
  });
  if (!sheets.length) throw new XlsxError("ไม่พบชีตในไฟล์");
  const chosen = sheets.find((s) => s.name.toLowerCase() === preferSheet.toLowerCase()) ?? sheets[0];

  const sstXml = await get("xl/sharedStrings.xml");
  const sst = sstXml ? [...sstXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => (m[1] ? textOf(m[1]) : "")) : [];
  const xml = await get(chosen.path);
  if (!xml) throw new XlsxError(`ไม่พบข้อมูลของชีต ${chosen.name}`);

  const rows: Cell[][] = [];
  const re = /<c\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const ref = attr(attrs, "r");
    if (!ref) continue;
    let inner = "";
    if (!attrs.trimEnd().endsWith("/")) {
      const end = xml.indexOf("</c>", re.lastIndex);
      inner = xml.slice(re.lastIndex, end < 0 ? undefined : end);
      re.lastIndex = end < 0 ? xml.length : end + 4;
    }
    const t = attr(attrs, "t");
    const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    let val: Cell = null;
    if (t === "inlineStr") val = textOf(inner);
    else if (v !== undefined && v !== "") {
      if (t === "s") val = sst[Number(v)] ?? null;
      else if (t === "str") val = unescapeXml(v);
      else if (t === "b") val = Number(v);
      else if (t === "e") val = null;
      else { const n = Number(v); val = Number.isFinite(n) ? n : unescapeXml(v); }
    }
    const r = Number(ref.replace(/\D/g, "")) - 1, c = colIndex(ref);
    if (r < 0 || c < 0) continue;
    while (rows.length <= r) rows.push([]);
    const row = rows[r];
    while (row.length <= c) row.push(null);
    row[c] = val;
  }
  return { sheetNames: sheets.map((s) => s.name), sheet: { name: chosen.name, rows } };
}
