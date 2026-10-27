// Google Sheets API + OAuth token จำลองในหน่วยความจำ (พฤติกรรมเดียวกับที่ e2e ใช้)
// ใช้กับเซิร์ฟเวอร์ Next จริงผ่าน --import ./tests/integration/preload.mjs — คำขอที่ไม่ใช่ Google ผ่านไปตามปกติ
export const tabs = new Map();
let nextId = 1;
export const stats = { calls: 0 };
const trim = (r) => { const o = [...r]; while (o.length && (o[o.length - 1] === "" || o[o.length - 1] === undefined || o[o.length - 1] === null)) o.pop(); return o.map((v) => v ?? ""); };
const colNum = (s) => [...s].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
function parseRange(r) {
  const m = /^'([^']+)'(?:!(.+))?$/.exec(decodeURIComponent(r));
  const a = m[2]; if (!a) return { tab: m[1] };
  let mm = /^(\d+):(\d+)$/.exec(a); if (mm) return { tab: m[1], r1: +mm[1], r2: +mm[2] };
  mm = /^([A-Z]+):([A-Z]+)$/.exec(a); if (mm) return { tab: m[1], c1: colNum(mm[1]) - 1, c2: colNum(mm[2]) - 1 };
  mm = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(a); return { tab: m[1], c1: colNum(mm[1]) - 1, r1: +mm[2] };
}
function write(tabName, r1, c1, values) {
  const t = tabs.get(tabName); if (!t) throw new Error(`no tab ${tabName}`);
  values.forEach((row, i) => {
    if (c1 + row.length > t.cols) throw new Error(`Range exceeds grid limits. Max columns: ${t.cols}`);
    while (t.rows.length < r1 - 1 + i + 1) t.rows.push([]);
    const dst = t.rows[r1 - 1 + i]; while (dst.length < c1) dst.push("");
    row.forEach((v, j) => { dst[c1 + j] = v; });
  });
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

export function install(sheetId = "SHEET") {
  const realFetch = globalThis.fetch;
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
  globalThis.fetch = async (url, init) => {
    const u = typeof url === "string" ? url : url instanceof URL ? String(url) : url.url;
    if (u.startsWith("https://oauth2.googleapis.com/token")) { stats.calls++; return json({ access_token: "tok", expires_in: 3600 }); }
    if (!u.startsWith(base)) return realFetch(url, init);
    stats.calls++;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    const path = u.slice(base.length);
    try {
      if (path.startsWith("?fields")) return json({ sheets: [...tabs].map(([title, t]) => ({ properties: { title, sheetId: t.id, gridProperties: { columnCount: t.cols } } })) });
      if (path === "/:batchUpdate") {
        for (const rq of body.requests) {
          if (rq.addSheet) { const p = rq.addSheet.properties; if (tabs.has(p.title)) return json({ error: { message: "dup" } }, 400); tabs.set(p.title, { id: nextId++, cols: p.gridProperties.columnCount, rows: [] }); }
          if (rq.deleteDimension) { const r = rq.deleteDimension.range; const t = [...tabs.values()].find((x) => x.id === r.sheetId); t.rows.splice(r.startIndex, r.endIndex - r.startIndex); }
          if (rq.appendDimension) { const t = [...tabs.values()].find((x) => x.id === rq.appendDimension.sheetId); t.cols += rq.appendDimension.length; }
        }
        return json({});
      }
      if (path.startsWith("/values:batchGet")) {
        const ranges = [...new URL(u).searchParams.getAll("ranges")];
        if (!u.includes("UNFORMATTED_VALUE")) return json({ error: { message: "ต้องใช้ UNFORMATTED_VALUE" } }, 400);
        const out = [];
        for (const r of ranges) {
          const p = parseRange(encodeURIComponent(r)); const t = tabs.get(p.tab);
          if (!t) return json({ error: { message: `Unable to parse range: ${r}` } }, 400);
          let rows = t.rows.map(trim);
          if (p.r1 !== undefined && p.r2 !== undefined) rows = rows.slice(p.r1 - 1, p.r2);
          if (p.c1 !== undefined && p.c2 !== undefined) rows = rows.map((x) => x.slice(p.c1, p.c2 + 1));
          while (rows.length && rows[rows.length - 1].length === 0) rows.pop();
          out.push(rows.length ? { values: rows } : {});
        }
        return json({ valueRanges: out });
      }
      if (path.includes(":append")) {
        const m = /\/values\/(.+?):append/.exec(path); const p = parseRange(m[1]);
        if (body.valueInputOption && body.valueInputOption !== "RAW" && !u.includes("valueInputOption=RAW")) return json({ error: { message: "ต้องใช้ RAW" } }, 400);
        const t = tabs.get(p.tab); let last = t.rows.length; while (last > 0 && trim(t.rows[last - 1]).length === 0) last--;
        write(p.tab, last + 1, 0, body.values);
        const letter = (n) => { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
        const w = Math.max(...body.values.map((r) => r.length));
        return json({ updates: { updatedRange: `'${p.tab}'!A${last + 1}:${letter(w - 1)}${last + body.values.length}` } });
      }
      if (path === "/values:batchUpdate") { for (const d of body.data) { const p = parseRange(d.range); write(p.tab, p.r1 ?? 1, p.c1 ?? 0, d.values); } return json({}); }
      return json({ error: { message: "unhandled " + path } }, 400);
    } catch (e) { return json({ error: { message: String(e?.message ?? e) } }, 400); }
  };
}
