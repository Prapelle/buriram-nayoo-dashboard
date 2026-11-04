import { SELL_NEEDS } from "./lead-options";

/**
 * ทรัพย์ของ Lead (4/11/2026): URL ประกาศบนน่าอยู่ (nayoo.co) หลายรายการต่อ Lead + สถานะของแต่ละทรัพย์
 * - แยกจาก Call Status / Sell Status ของ Lead (ไม่กระทบรายงาน)
 * - เก็บในแท็บ LEAD_PROPERTIES (หนึ่งแถวต่อหนึ่งทรัพย์) อ้างอิง lead_id
 */
export const BUY_PROP_STATUS = ["สนใจ", "เข้าชมแล้ว", "ซื้อ", "ยกเลิก"] as const;
export const SELL_PROP_STATUS = ["สนใจขาย", "สัญญาปิด", "สัญญาเปิด", "ขายสำเร็จ", "ยกเลิก"] as const;
export const PROP_COLUMNS = ["property_id", "lead_id", "url", "status", "created_by", "created_at", "updated_by", "updated_at"];
export const MAX_PROPS = 30;

export type LeadProperty = { property_id: string; lead_id: string; url: string; status: string; created_by: string; created_at: string; updated_by: string; updated_at: string };
export type PropInput = { property_id?: string; url?: string; status?: string };

export const propSideSell = (need: string | undefined) => SELL_NEEDS.includes(String(need ?? ""));
export const propStatusesFor = (need: string | undefined): readonly string[] => (propSideSell(need) ? SELL_PROP_STATUS : BUY_PROP_STATUS);
export const propDefault = (need: string | undefined) => propStatusesFor(need)[0];

/** URL ต้องเป็นลิงก์ของน่าอยู่เท่านั้น (nayoo.co หรือโดเมนย่อย) · คืนข้อความผิดพลาด หรือ null ถ้าใช้ได้ */
export function nayooUrlError(raw: string): string | null {
  const s = raw.trim();
  if (!s) return "กรุณาใส่ URL";
  if (s.length > 2000) return "URL ยาวเกินไป";
  let u: URL;
  try { u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`); } catch { return "รูปแบบ URL ไม่ถูกต้อง"; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "URL ต้องขึ้นต้นด้วย https://";
  const h = u.hostname.toLowerCase();
  if (h !== "nayoo.co" && !h.endsWith(".nayoo.co")) return "ใส่ได้เฉพาะลิงก์ของน่าอยู่ (nayoo.co)";
  return null;
}
/** ทำให้ URL อยู่ในรูปเดียวกัน (เติม https:// ถ้าไม่มี) */
export function normNayooUrl(raw: string): string {
  const s = raw.trim();
  return /^[a-z]+:\/\//i.test(s) ? s : `https://${s}`;
}
const urlKey = (s: string) => normNayooUrl(s).replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();

/** ตรวจรายการทรัพย์ที่ส่งมาจากฟอร์ม: URL ของน่าอยู่, ไม่ซ้ำกันใน Lead เดียวกัน, สถานะตรงกับฝั่ง (ซื้อ / ขาย) */
export function validateProps(list: unknown, need: string | undefined): { ok: true; rows: { property_id?: string; url: string; status: string }[] } | { ok: false; errors: Record<string, string> } {
  if (!Array.isArray(list)) return { ok: false, errors: { properties: "รูปแบบข้อมูลทรัพย์ไม่ถูกต้อง" } };
  const errors: Record<string, string> = {};
  if (list.length > MAX_PROPS) errors.properties = `ใส่ได้ไม่เกิน ${MAX_PROPS} รายการต่อ Lead`;
  const allowed = propStatusesFor(need);
  const seen = new Map<string, number>();
  const rows = list.map((x, i) => {
    const p = (x ?? {}) as PropInput;
    const url = String(p.url ?? ""), status = String(p.status ?? "").trim() || propDefault(need);
    const e = nayooUrlError(url);
    if (e) errors[`property_${i}`] = e;
    else {
      const k = urlKey(url);
      if (seen.has(k)) errors[`property_${i}`] = `URL ซ้ำกับรายการที่ ${seen.get(k)! + 1}`; else seen.set(k, i);
    }
    if (!allowed.includes(status)) errors[`property_${i}`] ??= `สถานะ "${status}" ใช้ไม่ได้ (เลือก ${allowed.join(" / ")})`;
    return { property_id: p.property_id ? String(p.property_id) : undefined, url: e ? url : normNayooUrl(url), status };
  });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, rows };
}

/** เทียบรายการเดิมกับรายการใหม่ของ Lead หนึ่ง → เพิ่ม / แก้ / ลบ */
export function diffProps(existing: LeadProperty[], next: { property_id?: string; url: string; status: string }[]) {
  const byId = new Map(existing.map((p) => [p.property_id, p]));
  const add = next.filter((n) => !n.property_id);
  const unknown = next.filter((n) => n.property_id && !byId.has(n.property_id));
  const update = next.filter((n) => n.property_id && byId.has(n.property_id) && (byId.get(n.property_id)!.url !== n.url || byId.get(n.property_id)!.status !== n.status));
  const keep = new Set(next.map((n) => n.property_id).filter(Boolean));
  const remove = existing.filter((p) => !keep.has(p.property_id));
  return { add, update, remove, unknown };
}
