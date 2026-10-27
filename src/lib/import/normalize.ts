export type Kind =
  | "text" | "int" | "num" | "numLoose" | "money" | "pct"
  | "date" | "isoLoose" | "mdyDateTime" | "longDate" | "hour12";

export type Conv = { v: string | number } | { err: string; code: string };

// ค่าว่างจากต้นฉบับ: เก็บเป็นค่าว่าง ไม่ใช่ 0
const BLANK = new Set(["", "-", "--", "—", "n/a", "no data", "null", "undefined"]);
const MONTHS: Record<string, string> = { jan:"01",feb:"02",mar:"03",apr:"04",may:"05",jun:"06",jul:"07",aug:"08",sep:"09",oct:"10",nov:"11",dec:"12" };

function numOf(s: string): number | null {
  const t = s.replace(/THB|฿|,|%|\s/gi, "");
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : null;
}

export function validIsoDate(y: number, m: number, d: number): boolean {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && validIsoDate(+m[1], +m[2], +m[3]);
}

export function convert(kind: Kind, raw: string): Conv {
  const s = raw.trim();
  if (BLANK.has(s.toLowerCase())) return { v: "" };
  switch (kind) {
    case "text":
      return { v: s.length > 45000 ? s.slice(0, 45000) : s };
    case "int": {
      const n = numOf(s);
      if (n === null) return { err: `ไม่ใช่ตัวเลข: "${s}"`, code: "INVALID_NUMBER" };
      if (!Number.isInteger(n)) return { err: `ต้องเป็นจำนวนเต็ม: "${s}"`, code: "INVALID_INTEGER" };
      return { v: n };
    }
    case "num": case "money": case "pct": {
      const n = numOf(s);
      if (n !== null) return { v: n };
      if (/^[<>]/.test(s)) return { v: "" }; // เช่น "< 10%" ไม่ใช่ค่าที่แน่นอน เก็บค่าเดิมไว้ใน raw_json
      return { err: `ไม่ใช่ตัวเลข: "${s}"`, code: "INVALID_NUMBER" };
    }
    case "numLoose": {
      const n = numOf(s);
      return { v: n === null ? "" : n }; // เช่น "Using campaign budget"
    }
    case "date": {
      if (!isIsoDate(s)) return { err: `วันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD): "${s}"`, code: "INVALID_DATE" };
      return { v: s };
    }
    case "isoLoose":
      return { v: /^\d{4}-\d{2}-\d{2}T/.test(s) ? s : "" };
    case "mdyDateTime": {
      const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(s);
      if (!m || !validIsoDate(+m[3], +m[1], +m[2]) || +m[4] > 23 || +m[5] > 59)
        return { err: `วันที่เวลาไม่ถูกต้อง (ต้องเป็น MM/DD/YYYY HH:mm): "${s}"`, code: "INVALID_DATE" };
      return { v: `${m[3]}-${m[1]}-${m[2]} ${m[4]}:${m[5]}` };
    }
    case "longDate": {
      const m = /^[A-Za-z]{3}, ([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(s);
      const mon = m ? MONTHS[m[1].toLowerCase()] : undefined;
      if (!m || !mon || !validIsoDate(+m[3], +mon, +m[2]))
        return { err: `วันที่ไม่ถูกต้อง: "${s}"`, code: "INVALID_DATE" };
      return { v: `${m[3]}-${mon}-${m[2].padStart(2, "0")}` };
    }
    case "hour12": {
      const m = /^(1[0-2]|[1-9]) (AM|PM)$/i.exec(s);
      if (!m) return { err: `ชั่วโมงไม่ถูกต้อง (เช่น 12 AM): "${s}"`, code: "INVALID_HOUR" };
      return { v: `${m[1]} ${m[2].toUpperCase()}` };
    }
  }
}

export function hour24(h12: string): number | "" {
  const m = /^(\d{1,2}) (AM|PM)$/.exec(h12);
  if (!m) return "";
  return (Number(m[1]) % 12) + (m[2] === "PM" ? 12 : 0);
}

// ---------- วันที่ของสถิติ (metric_date) ของ Facebook Page ----------
export type SlashOrder = { order: "MDY" | "DMY"; ambiguous: boolean; conflict: boolean };

/** ตรวจลำดับ วัน/เดือน จากค่าทั้งไฟล์: ตัวแรก > 12 = วัน/เดือน, ตัวที่สอง > 12 = เดือน/วัน, ถ้า ≤ 12 ทุกค่า = กำกวม (ใช้ เดือน/วัน ตามรูปแบบของ Facebook) */
export function detectSlashOrder(values: string[]): SlashOrder {
  let first = 0, second = 0;
  for (const v of values) {
    const m = /^(\d{1,2})\/(\d{1,2})\/\d{4}/.exec(v.trim());
    if (!m) continue;
    if (+m[1] > 12) first++;
    if (+m[2] > 12) second++;
  }
  if (first && second) return { order: "MDY", ambiguous: false, conflict: true };
  if (first) return { order: "DMY", ambiguous: false, conflict: false };
  if (second) return { order: "MDY", ambiguous: false, conflict: false };
  return { order: "MDY", ambiguous: true, conflict: false };
}

/** แปลงวันที่ของสถิติเป็น YYYY-MM-DD (รับ YYYY-MM-DD หรือ M/D/YYYY, D/M/YYYY ตามลำดับที่ตรวจได้) คืน null ถ้าไม่ถูกต้อง */
export function parseMetricDate(raw: string, order: "MDY" | "DMY"): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s);
  if (m) return validIsoDate(+m[1], +m[2], +m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/.exec(s);
  if (!m) return null;
  const d = order === "MDY" ? +m[2] : +m[1], mo = order === "MDY" ? +m[1] : +m[2], y = +m[3];
  if (!validIsoDate(y, mo, d)) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
