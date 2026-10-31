import { LEGACY_CHANNELS } from "./dashboard";
import { writeAudit } from "./audit";
import { CALL_DEFAULT, CALL_STATUS, normCall, SELL_DEFAULT, SELL_STATUS } from "./lead-options";
import { areaLabel, AREA_SUGGEST, contactableFor, findDuplicates, LEAD_COLUMNS, leadStatusOf, nextLeadCode, normalizeEmail, normalizeLine, normalizePhone, pipelineOf, resolveNeedStatus, stampStatus, statusFieldOf, todayBkk, validateLead, type DupMatch, type Lead } from "./leads";
import { appendRows, batchUpdateValues, colLetter, deleteRow, listTabs, readTabs, toRow } from "./sheets";
import { readColumns } from "./tabdata";

export class LeadError extends Error {
  constructor(public status: number, message: string, public code: string, public extra: { fields?: Record<string, string>; matches?: DupMatch[]; conflict?: { field: string; value: string } } = {}) { super(message); }
}

async function load() {
  try { return await readTabs(["LEADS", "APP_USERS", "APP_CONFIG"]); }
  catch { throw new LeadError(409, "อ่านฐานข้อมูลไม่ได้ กรุณาไปที่ ตั้งค่า → เตรียม Google Sheet", "SHEET_NOT_READY"); }
}
const pick = (r: Record<string, string>): Lead => { const o: Lead = Object.fromEntries(LEAD_COLUMNS.map((c) => [c, r[c] ?? ""])); o.call_status = normCall(o.call_status); return o; };

export async function listLeads() {
  const t = await load();
  const staff = [...new Set(t.LEADS.rows.map((r) => String(r.staff ?? "").trim()).filter(Boolean))].sort();
  const owners = [...new Set(t.APP_USERS.rows.filter((u) => String(u.active).toUpperCase() === "TRUE" && ["admin", "sales"].includes(u.role)).map((u) => u.email))].sort();
  const rows = t.LEADS.rows.filter((r) => r.lead_id).map(pick)
    .sort((a, b) => b.received_at.localeCompare(a.received_at) || b.lead_code.localeCompare(a.lead_code));
  // พื้นที่ที่เคยกรอก (ชื่อที่แสดง) ใช้เป็นตัวเลือกช่วยกรอกและตัวกรอง
  const areas = [...new Set([...AREA_SUGGEST, ...rows.map((r) => areaLabel(r.area)).filter(Boolean)])];
  return { rows, owners, staff, areas };
}

/** สร้าง/แก้ไข Lead: Lead Code สร้างฝั่ง Server, เตือนซ้ำจากเบอร์/อีเมลแต่ไม่ merge อัตโนมัติ */
export async function saveLead(input: Record<string, unknown>, actor: string) {
  const v = validateLead(input);
  if (!v.ok) throw new LeadError(422, "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่ระบุ", "VALIDATION", { fields: v.errors });
  const t = await load();
  const tab = t.LEADS;
  if (!tab.headers.includes("lead_id") || !tab.headers.includes("need")) throw new LeadError(409, "แท็บ LEADS ยังไม่พร้อม กรุณากด เตรียม Google Sheet", "SHEET_NOT_READY");
  // คอลัมน์ line_id เพิ่ม 30/10/2026: ยังไม่ได้เตรียม Sheet ก็บันทึก Lead ได้ตามเดิม แต่ถ้ากรอก Line ต้องมีคอลัมน์ก่อน (ไม่ทิ้งค่าเงียบ ๆ)
  // คอลัมน์ interest เพิ่ม 30/10/2026 เช่นกัน
  for (const [k, label] of [["line_id", "Line"], ["interest", "ความสนใจ"]] as const)
    if (String(input[k] ?? "").trim() && !tab.headers.includes(k)) throw new LeadError(409, `ยังไม่มีคอลัมน์ ${label} ในแท็บ LEADS — ให้ Admin กด ตั้งค่า → เตรียม Google Sheet ก่อน แล้วบันทึกอีกครั้ง`, "SHEET_NOT_READY", { fields: { [k]: `ยังไม่มีคอลัมน์ ${label} ใน Sheet` } });
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

  // ช่องทางเดิม (Facebook Organic, TikTok/YouTube): Lead เดิมคงค่าไว้ได้ แต่เลือกให้ Lead ใหม่ / เปลี่ยนเป็นค่านี้ไม่ได้
  if (LEGACY_CHANNELS.includes(v.rec.source_channel) && (!prev || prev.source_channel !== v.rec.source_channel))
    throw new LeadError(422, "ช่องทางนี้เลิกใช้แล้ว กรุณาเลือกช่องทางใหม่", "VALIDATION", { fields: { source_channel: "ช่องทางนี้เลิกใช้แล้ว" } });
  const contactChanged = !prev || normalizePhone(prev.phone) !== normalizePhone(v.rec.phone) || normalizeEmail(prev.email) !== normalizeEmail(v.rec.email) || normalizeLine(prev.line_id) !== normalizeLine(v.rec.line_id);
  if (contactChanged && input.confirmDuplicate !== true) {
    const matches = findDuplicates(rows.map(pick), v.rec, leadId || undefined);
    if (matches.length) throw new LeadError(409, "พบ Lead ที่เบอร์โทร / Line / อีเมลซ้ำกับรายการนี้ (ระบบไม่รวมข้อมูลให้อัตโนมัติ)", "DUPLICATE_WARNING", { matches });
  }

  // Need เปลี่ยนกลุ่ม แล้วช่องสถานะของกลุ่มเดิมมีค่าใน Sheet → ห้ามล้างเงียบ ๆ ต้องยืนยันก่อน
  const ns = resolveNeedStatus(prev, v.rec);
  if (ns.conflict && input.confirmNeedChange !== true) {
    const label = ns.conflict.field === "buy_status" ? "Buy Status" : "Sell Status";
    throw new LeadError(409, `เปลี่ยน Need เป็น "${v.rec.need}" แล้ว ${label} เดิม "${ns.conflict.value}" จะใช้ไม่ได้และจะถูกล้างเมื่อบันทึก (บันทึกค่าเดิมไว้ใน Audit Log)`, "NEED_CHANGE", { conflict: ns.conflict });
  }
  const recIn: Lead = { ...ns.rec };
  // Lead ขายที่ยังไม่มี Sell Status เริ่มที่ "รอติดต่อ"
  if (statusFieldOf(recIn.need) === "sell_status" && !recIn.sell_status) recIn.sell_status = SELL_DEFAULT;
  // ขั้น Pipeline เดิม (ใช้ใน Dashboard) คำนวณจาก Buy/Sell Status · Lead เก่าที่ยังไม่มี Need ไม่ถูกลดขั้นโดยอัตโนมัติ
  const derived = pipelineOf(recIn);
  recIn.status = prev && !prev.need && !leadStatusOf(recIn) && ["Qualified", "Proposal", "Won", "Lost"].includes(prev.status) ? prev.status : derived;
  // คุยกับลูกค้าได้แล้ว (Qualified / ไม่สนใจ) → contactable TRUE · ติดต่อไม่ได้ → FALSE
  recIn.contactable = contactableFor(recIn.call_status, recIn.contactable);
  v.rec = recIn;
  const stamps = stampStatus(prev, v.rec, today);
  if (!prev) {
    const rec: Lead = {
      ...v.rec, ...stamps, lead_id: crypto.randomUUID(), lead_code: nextLeadCode(rows.map((r) => r.lead_code), Number(today.slice(0, 4)), Number(t.APP_CONFIG.rows.find((r) => r.config_key === `lead_code_floor_${today.slice(0, 4)}`)?.config_value) || 0),
      created_by: actor, created_at: now, updated_by: actor, updated_at: now,
    };
    await appendRows("LEADS", [toRow(tab.headers, rec)]);
    await writeAudit(actor, "lead_create", "lead", rec.lead_id, `สร้าง ${rec.lead_code} (${rec.source_channel}, ${rec.need}${leadStatusOf(rec) ? ` / ${leadStatusOf(rec)}` : ""})`);
    return { created: true, lead: rec };
  }
  const rec: Lead = { ...v.rec, ...stamps, lead_id: prev.lead_id, lead_code: prev.lead_code, created_by: prev.created_by, created_at: prev.created_at, updated_by: actor, updated_at: now };
  await batchUpdateValues([{ range: `'LEADS'!A${rowNo}:${colLetter(tab.headers.length - 1)}${rowNo}`, values: [toRow(tab.headers, rec)] }]);
  const ps = leadStatusOf(prev), cs = leadStatusOf(rec);
  const parts = [prev.need !== rec.need ? `Need ${prev.need || "(ว่าง)"} → ${rec.need}` : "", ps !== cs ? `สถานะ ${ps || "(ว่าง)"} → ${cs || "(ว่าง)"}` : "",
    ns.conflict ? `ล้าง ${ns.conflict.field}="${ns.conflict.value}"` : "", prev.call_status !== rec.call_status ? `Call ${prev.call_status || "(ว่าง)"} → ${rec.call_status}` : ""].filter(Boolean);
  await writeAudit(actor, ps !== cs || prev.need !== rec.need ? "lead_status_change" : "lead_update", "lead", rec.lead_id,
    parts.length ? `${rec.lead_code}: ${parts.join(" · ")}` : `แก้ไข ${rec.lead_code}`);
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

export type StatusField = "sell_status" | "call_status";

/** เปลี่ยนสถานะช่องเดียว (ลากวางบนหน้า Seller Leads = sell_status / Buyer Leads = call_status): ตรวจข้อมูลเก่า, คำนวณขั้น Pipeline และ contactable ใหม่, บันทึก Audit */
export async function changeLeadStatus(leadId: string, field: StatusField, value: string, updatedAtSeen: string, actor: string, lostReason?: string) {
  if (!leadId) throw new LeadError(400, "ไม่ระบุ Lead", "BAD_REQUEST");
  const label = field === "sell_status" ? "Sell Status" : "Call Status";
  if (!(field === "sell_status" ? SELL_STATUS : CALL_STATUS).includes(value)) throw new LeadError(422, `${label} ไม่ถูกต้อง`, "VALIDATION", { fields: { [field]: `${label} ไม่ถูกต้อง` } });
  const t = await load();
  const tab = t.LEADS;
  if (!tab.headers.includes(field)) throw new LeadError(409, "แท็บ LEADS ยังไม่พร้อม กรุณากด เตรียม Google Sheet", "SHEET_NOT_READY");
  const i = tab.rows.findIndex((r) => r.lead_id === leadId);
  if (i < 0) throw new LeadError(404, "ไม่พบ Lead นี้ (อาจถูกลบออกจาก Sheet)", "NOT_FOUND");
  const prev = pick(tab.rows[i]); const rowNo = i + 2;
  if (field === "sell_status" && statusFieldOf(prev.need) !== "sell_status") throw new LeadError(409, "Lead นี้ไม่ใช่ Need = ขาย จึงไม่มี Sell Status", "NOT_SELL");
  if (field === "call_status" && !prev.need) throw new LeadError(409, "Lead นี้ยังไม่ระบุ Need กรุณาไปที่หน้า Leads เพื่อเลือก Need ก่อน", "NO_NEED");
  if (updatedAtSeen !== prev.updated_at) throw new LeadError(409, "Lead นี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่ก่อนแก้ไข", "STALE");
  const before = prev[field] || (field === "sell_status" ? SELL_DEFAULT : CALL_DEFAULT);
  if (prev[field] && prev[field] === value) return { changed: false, lead: prev };

  const rec: Lead = { ...prev, [field]: value };
  // ย้ายไป กู้ไม่ผ่าน → ต้องมีสาเหตุ (ช่อง lost_reason)
  if (field === "call_status" && value === "กู้ไม่ผ่าน") {
    const why = String(lostReason ?? "").trim() || prev.lost_reason;
    if (!why) throw new LeadError(422, "กรุณากรอกสาเหตุที่กู้ไม่ผ่าน", "VALIDATION", { fields: { lost_reason: "กรุณากรอกสาเหตุที่กู้ไม่ผ่าน" } });
    if (!tab.headers.includes("lost_reason")) throw new LeadError(409, "แท็บ LEADS ยังไม่พร้อม กรุณากด เตรียม Google Sheet", "SHEET_NOT_READY");
    rec.lost_reason = why;
  }
  if (field === "call_status") rec.contactable = contactableFor(value, prev.contactable);
  rec.status = pipelineOf(rec);
  Object.assign(rec, stampStatus(prev, rec, todayBkk()), { updated_by: actor, updated_at: new Date().toISOString() });
  await batchUpdateValues([{ range: `'LEADS'!A${rowNo}:${colLetter(tab.headers.length - 1)}${rowNo}`, values: [toRow(tab.headers, rec)] }]);
  if (field === "sell_status") await writeAudit(actor, "lead_status_change", "lead", rec.lead_id, `${rec.lead_code}: สถานะ ${before} → ${value}`);
  else await writeAudit(actor, "lead_update", "lead", rec.lead_id, `${rec.lead_code}: Call ${before} → ${value}`);
  return { changed: true, lead: rec };
}
export const changeSellStatus = (leadId: string, sellStatus: string, updatedAtSeen: string, actor: string) => changeLeadStatus(leadId, "sell_status", sellStatus, updatedAtSeen, actor);
