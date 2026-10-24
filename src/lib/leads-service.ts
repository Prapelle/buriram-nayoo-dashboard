import { writeAudit } from "./audit";
import { findDuplicates, LEAD_COLUMNS, nextLeadCode, normalizeEmail, normalizePhone, stampStatus, todayBkk, validateLead, type DupMatch, type Lead } from "./leads";
import { appendRows, batchUpdateValues, colLetter, readTabs, toRow } from "./sheets";

export class LeadError extends Error {
  constructor(public status: number, message: string, public code: string, public extra: { fields?: Record<string, string>; matches?: DupMatch[] } = {}) { super(message); }
}

async function load() {
  try { return await readTabs(["LEADS", "APP_USERS"]); }
  catch { throw new LeadError(409, "อ่านฐานข้อมูลไม่ได้ กรุณาไปที่ ตั้งค่า → เตรียม Google Sheet", "SHEET_NOT_READY"); }
}
const pick = (r: Record<string, string>): Lead => Object.fromEntries(LEAD_COLUMNS.map((c) => [c, r[c] ?? ""]));

export async function listLeads() {
  const t = await load();
  const owners = [...new Set(t.APP_USERS.rows.filter((u) => String(u.active).toUpperCase() === "TRUE" && ["admin", "sales"].includes(u.role)).map((u) => u.email))].sort();
  const rows = t.LEADS.rows.filter((r) => r.lead_id).map(pick)
    .sort((a, b) => b.received_at.localeCompare(a.received_at) || b.lead_code.localeCompare(a.lead_code));
  return { rows, owners };
}

/** สร้าง/แก้ไข Lead: Lead Code สร้างฝั่ง Server, เตือนซ้ำจากเบอร์/อีเมลแต่ไม่ merge อัตโนมัติ */
export async function saveLead(input: Record<string, unknown>, actor: string) {
  const v = validateLead(input);
  if (!v.ok) throw new LeadError(422, "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่ระบุ", "VALIDATION", { fields: v.errors });
  const t = await load();
  const tab = t.LEADS;
  if (!tab.headers.includes("lead_id")) throw new LeadError(409, "แท็บ LEADS ยังไม่พร้อม กรุณากด เตรียม Google Sheet", "SHEET_NOT_READY");
  const rows = tab.rows;
  const now = new Date().toISOString();
  const today = todayBkk();
  const leadId = typeof input.lead_id === "string" && input.lead_id ? input.lead_id : "";

  let prev: Lead | null = null; let rowNo = 0;
  if (leadId) {
    const i = rows.findIndex((r) => r.lead_id === leadId);
    if (i < 0) throw new LeadError(404, "ไม่พบ Lead นี้ (อาจถูกลบออกจาก Sheet)", "NOT_FOUND");
    prev = pick(rows[i]); rowNo = i + 2;
    if (input.updated_at_seen !== prev.updated_at) throw new LeadError(409, "Lead นี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่ก่อนแก้ไข", "STALE");
  }

  const contactChanged = !prev || normalizePhone(prev.phone) !== normalizePhone(v.rec.phone) || normalizeEmail(prev.email) !== normalizeEmail(v.rec.email);
  if (contactChanged && input.confirmDuplicate !== true) {
    const matches = findDuplicates(rows.map(pick), v.rec, leadId || undefined);
    if (matches.length) throw new LeadError(409, "พบ Lead ที่เบอร์โทรหรืออีเมลซ้ำกับรายการนี้ (ระบบไม่รวมข้อมูลให้อัตโนมัติ)", "DUPLICATE_WARNING", { matches });
  }

  const stamps = stampStatus(prev, v.rec, today);
  if (!prev) {
    const rec: Lead = {
      ...v.rec, ...stamps, lead_id: crypto.randomUUID(), lead_code: nextLeadCode(rows.map((r) => r.lead_code), Number(today.slice(0, 4))),
      created_by: actor, created_at: now, updated_by: actor, updated_at: now,
    };
    await appendRows("LEADS", [toRow(tab.headers, rec)]);
    await writeAudit(actor, "lead_create", "lead", rec.lead_id, `สร้าง ${rec.lead_code} (${rec.source_channel}, ${rec.status})`);
    return { created: true, lead: rec };
  }
  const rec: Lead = { ...v.rec, ...stamps, lead_id: prev.lead_id, lead_code: prev.lead_code, created_by: prev.created_by, created_at: prev.created_at, updated_by: actor, updated_at: now };
  await batchUpdateValues([{ range: `'LEADS'!A${rowNo}:${colLetter(tab.headers.length - 1)}${rowNo}`, values: [toRow(tab.headers, rec)] }]);
  await writeAudit(actor, prev.status !== rec.status ? "lead_status_change" : "lead_update", "lead", rec.lead_id,
    prev.status !== rec.status ? `${rec.lead_code}: ${prev.status} → ${rec.status}` : `แก้ไข ${rec.lead_code}`);
  return { created: false, lead: rec };
}
