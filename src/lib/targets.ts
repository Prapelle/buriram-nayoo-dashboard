/**
 * เป้าหมายรายเดือน (แท็บ MONTHLY_TARGETS): งบโฆษณา + เป้าจำนวน Lead · หนึ่งแถวต่อเดือน (YYYY-MM)
 * - บันทึกเดือนเดิม = แก้แถวเดิม (ไม่เพิ่มแถวซ้ำ) · ตรวจข้อมูลเก่าก่อนแก้ (updated_at) · บันทึก Audit Log
 * - ว่าง = ไม่ตั้งเป้า (ไม่ใช่ 0)
 */
import { writeAudit } from "./audit";
import { appendRows, batchUpdateValues, colLetter, readTab, toRow } from "./sheets";

export class TargetError extends Error {
  constructor(public status: number, message: string, public code: string, public fields?: Record<string, string>) { super(message); }
}
export type Target = { month: string; ad_budget_thb: number | null; lead_target: number | null; notes: string; updated_by: string; updated_at: string };

const num = (v: unknown): number | null => { const s = String(v ?? "").replace(/,/g, "").trim(); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : NaN; };
export const toTarget = (r: Record<string, string>): Target => {
  const b = num(r.ad_budget_thb), l = num(r.lead_target);
  return { month: String(r.month ?? "").slice(0, 7), ad_budget_thb: Number.isNaN(b) ? null : b, lead_target: Number.isNaN(l) ? null : l, notes: r.notes ?? "", updated_by: r.updated_by ?? "", updated_at: r.updated_at ?? "" };
};

async function load() {
  try { const t = await readTab("MONTHLY_TARGETS"); if (!t.headers.includes("month")) throw new Error(); return t; }
  catch { throw new TargetError(409, "ยังไม่มีแท็บ MONTHLY_TARGETS — ให้ Admin กด ตั้งค่า → ตั้งค่าระบบ → เตรียม Google Sheet", "SHEET_NOT_READY"); }
}

export async function listTargets(): Promise<Target[]> {
  const t = await load();
  return t.rows.filter((r) => /^\d{4}-\d{2}/.test(r.month ?? "")).map(toTarget).sort((a, b) => b.month.localeCompare(a.month));
}

export type SaveTargetInput = { month?: string; ad_budget_thb?: unknown; lead_target?: unknown; notes?: string; updated_at_seen?: string };
export function validateTarget(input: SaveTargetInput): { month: string; budget: number | null; leads: number | null; notes: string } {
  const fields: Record<string, string> = {};
  const month = String(input.month ?? "").trim();
  const mm = Number(month.slice(5, 7));
  if (!/^\d{4}-\d{2}$/.test(month) || mm < 1 || mm > 12 || Number(month.slice(0, 4)) < 2020 || Number(month.slice(0, 4)) > 2100) fields.month = "เดือนไม่ถูกต้อง (YYYY-MM)";
  const budget = num(input.ad_budget_thb), leads = num(input.lead_target);
  if (budget !== null && (Number.isNaN(budget) || budget < 0 || budget > 1e9)) fields.ad_budget_thb = "งบต้องเป็นตัวเลข 0 ขึ้นไป";
  if (leads !== null && (Number.isNaN(leads) || leads < 0 || !Number.isInteger(leads) || leads > 1e6)) fields.lead_target = "เป้า Lead ต้องเป็นจำนวนเต็ม 0 ขึ้นไป";
  const notes = String(input.notes ?? "").trim();
  if (notes.length > 500) fields.notes = "หมายเหตุยาวเกิน 500 ตัวอักษร";
  if (Object.keys(fields).length) throw new TargetError(422, "ข้อมูลไม่ถูกต้อง", "VALIDATION", fields);
  return { month, budget: budget === null ? null : Math.round(budget * 100) / 100, leads, notes };
}

export async function saveTarget(input: SaveTargetInput, actor: string) {
  const v = validateTarget(input);
  const t = await load();
  const idx = t.rows.findIndex((r) => String(r.month ?? "").slice(0, 7) === v.month);
  const now = new Date().toISOString();
  const rec = { month: v.month, ad_budget_thb: v.budget ?? "", lead_target: v.leads ?? "", notes: v.notes, updated_by: actor, updated_at: now };
  if (idx >= 0) {
    const prev = t.rows[idx];
    if (input.updated_at_seen !== undefined && (prev.updated_at ?? "") !== input.updated_at_seen) throw new TargetError(409, "เป้าหมายเดือนนี้ถูกแก้ไขไปแล้ว กรุณาโหลดใหม่ก่อนแก้ไข", "STALE");
    const row = idx + 2;
    await batchUpdateValues([{ range: `'MONTHLY_TARGETS'!A${row}:${colLetter(t.headers.length - 1)}${row}`, values: [toRow(t.headers, rec)] }]);
    await writeAudit(actor, "target_update", "target", v.month, `งบ ${prev.ad_budget_thb || "-"} → ${rec.ad_budget_thb || "-"} · เป้า Lead ${prev.lead_target || "-"} → ${rec.lead_target || "-"}`);
    return { created: false, target: toTarget(rec as unknown as Record<string, string>) };
  }
  await appendRows("MONTHLY_TARGETS", [toRow(t.headers, rec)]);
  await writeAudit(actor, "target_create", "target", v.month, `งบ ${rec.ad_budget_thb || "-"} · เป้า Lead ${rec.lead_target || "-"}`);
  return { created: true, target: toTarget(rec as unknown as Record<string, string>) };
}
