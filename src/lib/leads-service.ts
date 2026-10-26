import { writeAudit } from "./audit";
import { findDuplicates, LEAD_COLUMNS, nextLeadCode, normalizeEmail, normalizePhone, stampStatus, todayBkk, validateLead, type DupMatch, type Lead } from "./leads";
import { appendRows, batchUpdateValues, colLetter, deleteRow, listTabs, readTabs, toRow } from "./sheets";
import { readColumns } from "./tabdata";

export class LeadError extends Error {
  constructor(public status: number, message: string, public code: string, public extra: { fields?: Record<string, string>; matches?: DupMatch[] } = {}) { super(message); }
}

async function load() {
  try { return await readTabs(["LEADS", "APP_USERS", "APP_CONFIG"]); }
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
      ...v.rec, ...stamps, lead_id: crypto.randomUUID(), lead_code: nextLeadCode(rows.map((r) => r.lead_code), Number(today.slice(0, 4)), Number(t.APP_CONFIG.rows.find((r) => r.config_key === `lead_code_floor_${today.slice(0, 4)}`)?.config_value) || 0),
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

/** ลบ Lead ถาวร: ต้องไม่ถูกอ้างอิงโดยรายการขาย, ตรวจว่าข้อมูลไม่เก่า, ไม่ใช้รหัสซ้ำหลังลบ, บันทึก Audit (ไม่ใส่ข้อมูลส่วนบุคคล) */
export async function deleteLead(leadId: string, updatedAtSeen: string, actor: string) {
  if (!leadId) throw new LeadError(400, "ไม่ระบุ Lead", "BAD_REQUEST");
  const t = await load();
  const i = t.LEADS.rows.findIndex((r) => r.lead_id === leadId);
  if (i < 0) throw new LeadError(404, "ไม่พบ Lead นี้ (อาจถูกลบไปแล้ว)", "NOT_FOUND");
  const row = pick(t.LEADS.rows[i]);
  if (updatedAtSeen !== row.updated_at) throw new LeadError(409, "Lead นี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่ก่อนลบ", "STALE");

  const [manual, imported] = await Promise.all([readColumns("SALES", { only: ["lead_id"] }), readColumns("SALES_TRANSACTIONS", { only: ["lead_id"] })]);
  const linked = manual.rows.filter((r) => r.lead_id === leadId).length + imported.rows.filter((r) => r.lead_id === leadId).length;
  if (linked) throw new LeadError(409, `ลบไม่ได้: มีรายการขาย ${linked} รายการเชื่อมโยงกับ Lead นี้ (ให้ลบค่า lead_id ในรายการขายก่อน)`, "LINKED_SALES");

  // กันรหัสซ้ำ: จำเลขสูงสุดที่เคยออกของปีนั้นไว้ใน APP_CONFIG
  const m = /^LD-(\d{4})-(\d+)$/.exec(row.lead_code);
  if (m) {
    const key = `lead_code_floor_${m[1]}`, num = Number(m[2]);
    const cfg = t.APP_CONFIG, idx = cfg.rows.findIndex((r) => r.config_key === key);
    const now = new Date().toISOString();
    if (idx < 0) await appendRows("APP_CONFIG", [toRow(cfg.headers, { config_key: key, config_value: String(num), description: "เลขรหัส Lead สูงสุดที่เคยออกแล้วแต่ถูกลบ (กันใช้รหัสซ้ำ)", updated_at: now })]);
    else if (num > (Number(cfg.rows[idx].config_value) || 0)) await batchUpdateValues([{ range: `'APP_CONFIG'!A${idx + 2}:${colLetter(cfg.headers.length - 1)}${idx + 2}`, values: [toRow(cfg.headers, { ...cfg.rows[idx], config_value: String(num), updated_at: now })] }]);
  }
  const tab = (await listTabs()).find((x) => x.title === "LEADS");
  if (!tab) throw new LeadError(409, "ไม่พบแท็บ LEADS", "SHEET_NOT_READY");
  await deleteRow(tab.sheetId, i + 2);
  await writeAudit(actor, "lead_delete", "lead", leadId, `ลบ ${row.lead_code} (${row.source_channel}, ${row.status})`);
  return { deleted: true, lead_code: row.lead_code };
}
