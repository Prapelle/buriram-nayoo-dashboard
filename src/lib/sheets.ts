import { SignJWT, importPKCS8 } from "jose";
import { env } from "./env";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
let cached: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const key = await importPKCS8(env.saKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(env.saEmail)
    .setSubject(env.saEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`Google token error ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

const RETRY = new Set([429, 500, 502, 503, 504]);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let lastErr = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = await getAccessToken();
    const res = await fetch(`${API}/${env.sheetId}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });
    if (res.ok) return (await res.json()) as T;
    lastErr = `Sheets API ${res.status}: ${(await res.text()).slice(0, 300)}`;
    if (!RETRY.has(res.status)) break;
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt + Math.random() * 250));
  }
  throw new Error(lastErr);
}

export type TabMeta = { title: string; sheetId: number; columnCount: number };

export async function listTabs(): Promise<TabMeta[]> {
  const j = await call<{ sheets: { properties: { title: string; sheetId: number; gridProperties: { columnCount: number } } }[] }>(
    "?fields=sheets.properties(sheetId,title,gridProperties.columnCount)",
  );
  return j.sheets.map((s) => ({ title: s.properties.title, sheetId: s.properties.sheetId, columnCount: s.properties.gridProperties.columnCount }));
}

export async function addTabs(defs: { title: string; columns: number }[]) {
  if (!defs.length) return;
  await call("/:batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: defs.map((d) => ({
        addSheet: { properties: { title: d.title, gridProperties: { rowCount: 1000, columnCount: d.columns, frozenRowCount: 1 } } },
      })),
    }),
  });
}

export async function expandColumns(sheetId: number, by: number) {
  await call("/:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests: [{ appendDimension: { sheetId, dimension: "COLUMNS", length: by } }] }),
  });
}

/** ลบทั้งแถวออกจากชีต (แถวถัดไปเลื่อนขึ้น) ห้ามลบแถว header */
export async function deleteRow(sheetId: number, rowNumber: number) {
  if (rowNumber < 2) throw new Error("ไม่สามารถลบแถว header");
  await call("/:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber } } }] }),
  });
}

export async function batchGet(ranges: string[]): Promise<string[][][]> {
  const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const j = await call<{ valueRanges: { values?: (string | number | boolean)[][] }[] }>(
    `/values:batchGet?${q}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
  );
  // แปลงเป็นข้อความทั้งหมด (ตัวเลขได้ค่าเต็มความละเอียด ไม่ถูกปัดตามรูปแบบเซลล์)
  return j.valueRanges.map((v) => (v.values ?? []).map((r) => r.map((c) => String(c))));
}

export async function batchUpdateValues(data: { range: string; values: (string | number)[][] }[]) {
  if (!data.length) return;
  await call("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }), // RAW: ข้อความที่ขึ้นต้นด้วย = จะไม่ถูกตีเป็นสูตร
  });
}

/** เพิ่มแถวต่อท้ายตาราง คืนค่า range ที่เขียน เช่น 'TAB'!A5:T7 (ใช้หาเลขแถว) */
export async function appendRows(tab: string, rows: (string | number)[][]): Promise<string> {
  if (!rows.length) return "";
  const j = await call<{ updates?: { updatedRange?: string } }>(
    `/values/${encodeURIComponent(`'${tab}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: rows }) },
  );
  return j.updates?.updatedRange ?? "";
}

/** อ่านหลายแท็บในคำขอเดียว (ลดจำนวน API calls) */
export async function readTabs(tabs: string[]): Promise<Record<string, { headers: string[]; rows: Record<string, string>[] }>> {
  const all = await batchGet(tabs.map((t) => `'${t}'`));
  const out: Record<string, { headers: string[]; rows: Record<string, string>[] }> = {};
  tabs.forEach((t, i) => {
    const values = all[i];
    const headers = values[0] ?? [];
    out[t] = { headers, rows: values.slice(1).map((r) => Object.fromEntries(headers.map((h, j) => [h, r[j] ?? ""]))) };
  });
  return out;
}

/** เลขแถวแรกจาก updatedRange เช่น 'TAB'!A5:T7 -> 5 */
export function firstRowOf(range: string): number {
  const m = /!?[A-Z]+(\d+)(?::[A-Z]+\d+)?$/.exec(range);
  return m ? Number(m[1]) : 0;
}

/** อ่านทั้งแท็บ คืนค่าเป็น object ตามชื่อ header (ไม่พึ่งลำดับคอลัมน์) */
export async function readTab(tab: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const [values] = await batchGet([`'${tab}'`]);
  const headers = values[0] ?? [];
  const rows = values.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  return { headers, rows };
}

export function colLetter(index: number): string {
  let n = index + 1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export function toRow(headers: string[], obj: Record<string, string | number | boolean | null | undefined>): (string | number)[] {
  return headers.map((h) => { const v = obj[h]; return v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v; });
}
