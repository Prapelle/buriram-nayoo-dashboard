import { normRole } from "./roles";
import { canonChannel } from "./dashboard";
import { casWrite, dedupeCode } from "./row-guard";
import { writeAudit } from "./audit";
import { checkStaff, followupRow, leadStatusChanges, mergeStaff, staffUserNames } from "./perf";
import { logFollowup } from "./perf-log";
import { logLeadStatus } from "./perf-service";
import { CALL_DEFAULT, CALL_STATUS, isSellerLead, normCall, SELL_DEFAULT, SELL_STATUS } from "./lead-options";
import { areaLabel, AREA_SUGGEST, contactableFor, findDuplicates, LEAD_COLUMNS, leadStatusOf, nextLeadCode, normalizeEmail, normalizeLine, normalizePhone, pipelineOf, resolveNeedStatus, stampStatus, statusFieldOf, todayBkk, validateLead, type DupMatch, type Lead } from "./leads";
import { appendRows, deleteWhere, readTab, readTabs, toRow, updateById } from "./sheets";
import { readColumns } from "./tabdata";
import { diffProps, PROP_COLUMNS, validateProps, type LeadProperty } from "./lead-properties";
import type { Role } from "./roles";

/** ค่าเริ่มต้นของช่องสถานะ (ใช้เทียบก่อน/หลังเพื่อบันทึกประวัติ) */
const STATUS_DEFAULTS = { sell_status: SELL_DEFAULT, call_status: CALL_DEFAULT } as const;
/** ช่องสถานะที่นับผลงานของ Lead นี้: ขาย = sell_status · ซื้อ/เช่า/สร้าง = call_status · ยังไม่ระบุ Need = ไม่นับ */
const logFieldOf = (r: { need?: string }) => (isSellerLead(r) ? "sell_status" : r.need ? "call_status" : "") as "sell_status" | "call_status" | "";

export class LeadError extends Error {
  constructor(public status: number, message: string, public code: string, public extra: { fields?: Record<string, string>; matches?: DupMatch[]; conflict?: { field: string; value: string } } = {}) { super(message); }
}

/** แท็บ LEAD_PROPERTIES (เพิ่ม 4/11/2026) — ยังไม่กด เตรียม Google Sheet = ready false (หน้า Leads ยังใช้ได้ตามเดิม) */
async function loadProps(): Promise<{ ready: boolean; headers: string[]; rows: LeadProperty[] }> {
  try {
    const t = await readTab("LEAD_PROPERTIES");
    if (!t.headers.includes("property_id") || !t.headers.includes("lead_id")) return { ready: false, headers: [], rows: [] };
    return { ready: true, headers: t.headers, rows: t.rows.filter((r) => r.property_id && r.lead_id).map((r) => Object.fromEntries(PROP_COLUMNS.map((c) => [c, r[c] ?? ""])) as LeadProperty) };
  } catch { return { ready: false, headers: [], rows: [] }; }
}
type PropDiff = ReturnType<typeof diffProps>;
/** เขียนทรัพย์ของ Lead หลังบันทึก Lead แล้ว: แก้ → ลบ (จากล่างขึ้นบน ยืนยันแถวก่อนลบ) → เพิ่ม */
async function applyProps(leadId: string, d: PropDiff, actor: string, now: string) {
  if (!d.add.length && !d.update.length && !d.remove.length) return;
  const t = await readTab("LEAD_PROPERTIES"); const H = t.headers;
  // แก้/ลบตาม property_id (ไม่ใช้เลขแถว)
  for (const u of d.update) {
    const cur = t.rows.find((r) => r.property_id === u.property_id);
    if (!cur || !(await updateById("LEAD_PROPERTIES", H, "property_id", u.property_id!, toRow(H, { ...cur, url: u.url, status: u.status, updated_by: actor, updated_at: now })))) throw new LeadError(409, "ทรัพย์บางรายการถูกแก้ไข/ลบโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  }
  for (const r of d.remove) if (r.property_id) await deleteWhere("LEAD_PROPERTIES", "property_id", r.property_id);
  if (d.add.length) await appendRows("LEAD_PROPERTIES", d.add.map((a) => toRow(H, { property_id: crypto.randomUUID(), lead_id: leadId, url: a.url, status: a.status, created_by: actor, created_at: now, updated_by: actor, updated_at: now })));
}
const propSummary = (d: PropDiff | null) => d ? [d.add.length ? `ทรัพย์ +${d.add.length}` : "", d.update.length ? `แก้ทรัพย์ ${d.update.length}` : "", d.remove.length ? `ลบทรัพย์ ${d.remove.length}` : ""].filter(Boolean).join(" · ") : "";

async function load() {
  try { return await readTabs(["LEADS", "APP_USERS", "APP_CONFIG"]); }
  catch { throw new LeadError(409, "อ่านฐานข้อมูลไม่ได้ กรุณาไปที่ ตั้งค่า → เตรียม Google Sheet", "SHEET_NOT_READY"); }
}
const pick = (r: Record<string, string>): Lead => { const o: Lead = Object.fromEntries(LEAD_COLUMNS.map((c) => [c, r[c] ?? ""])); o.call_status = normCall(o.call_status); return o; };

export async function listLeads() {
  const [t, props] = await Promise.all([load(), loadProps()]);
  const staffUsers = staffUserNames(t.APP_USERS.rows, normRole);
  const staff = mergeStaff(staffUsers, t.LEADS.rows.map((r) => String(r.staff ?? "")));
  const owners = [...new Set(t.APP_USERS.rows.filter((u) => String(u.active).toUpperCase() === "TRUE" && ["super_admin", "admin", "ae"].includes(normRole(u.role) ?? "")).map((u) => u.email))].sort();
  const rows = t.LEADS.rows.filter((r) => r.lead_id).map((r) => { const l = pick(r); l.source_channel = canonChannel(l.source_channel); return l; }) // ชื่อช่องทางเก่า → Unknown (แก้ใน Sheet เมื่อบันทึก Lead นั้น)
    .sort((a, b) => b.received_at.localeCompare(a.received_at) || b.lead_code.localeCompare(a.lead_code));
  // พื้นที่ที่เคยกรอก (ชื่อที่แสดง) ใช้เป็นตัวเลือกช่วยกรอกและตัวกรอง
  const areas = [...new Set([...AREA_SUGGEST, ...rows.map((r) => areaLabel(r.area)).filter(Boolean)])];
  const byLead: Record<string, LeadProperty[]> = {};
  for (const p of props.rows) (byLead[p.lead_id] ??= []).push(p);
  return { rows, owners, staff, staffUsers, areas, properties: byLead, propertiesReady: props.ready };
}

/** สร้าง/แก้ไข Lead: Lead Code สร้างฝั่ง Server, เตือนซ้ำจากเบอร์/อีเมลแต่ไม่ merge อัตโนมัติ */
export async function saveLead(input: Record<string, unknown>, actor: string, role: Role = "ae") {
  const v = validateLead(input);
  const pv = input.properties === undefined ? null : validateProps(input.properties, String(input.need ?? ""));
  if (!v.ok || (pv && !pv.ok)) throw new LeadError(422, "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่ระบุ", "VALIDATION", { fields: { ...(v.ok ? {} : v.errors), ...(pv && !pv.ok ? pv.errors : {}) } });
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

  let prev: Lead | null = null;
  if (leadId) {
    const i = rows.findIndex((r) => r.lead_id === leadId);
    if (i < 0) throw new LeadError(404, "ไม่พบ Lead นี้ (อาจถูกลบออกจาก Sheet)", "NOT_FOUND");
    prev = pick(rows[i]);
    if (input.updated_at_seen !== prev.updated_at) throw new LeadError(409, "Lead นี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่ก่อนแก้ไข", "STALE");
  }

  // Staff ต้องเลือกจากรายชื่อผู้ใช้ (ค่าเดิมของ Lead นี้ยังคงไว้ได้)
  const staffOk = checkStaff(v.rec.staff, prev?.staff, staffUserNames(t.APP_USERS.rows, normRole));
  if (staffOk === null) throw new LeadError(422, "Staff ต้องเลือกจากรายชื่อผู้ใช้", "VALIDATION", { fields: { staff: "เลือก Staff จากรายชื่อผู้ใช้" } });
  v.rec.staff = staffOk;

  const contactChanged = !prev || normalizePhone(prev.phone) !== normalizePhone(v.rec.phone) || normalizeEmail(prev.email) !== normalizeEmail(v.rec.email) || normalizeLine(prev.line_id) !== normalizeLine(v.rec.line_id);
  // Lead ฝั่งเดียวกัน (ซื้อ/เช่า/สร้าง vs ขาย) ห้ามซ้ำเบอร์ / Line / อีเมล — คนเดียวกันมีได้ฝั่งละ 1 รายการ (4/11/2026)
  const sideChanged = !!prev && isSellerLead(prev) !== isSellerLead(v.rec);
  if (contactChanged || sideChanged) {
    const sameSide = rows.map(pick).filter((r) => isSellerLead(r) === isSellerLead(v.rec));
    const matches = findDuplicates(sameSide, v.rec, leadId || undefined);
    if (matches.length) throw new LeadError(409, `มี Lead ฝั่ง${isSellerLead(v.rec) ? "ต้องการขาย" : "ต้องการซื้อ"}ที่เบอร์โทร / Line / อีเมลซ้ำอยู่แล้ว — คนเดียวกันมีได้ฝั่งละ 1 รายการ ให้แก้ไขที่รายการเดิมแทน`, "DUPLICATE_SAME_SIDE", { matches });
  }

  // ทรัพย์ของ Lead: ตรวจทั้งหมดก่อนเขียน Lead (ไม่เขียนครึ่งเดียว)
  let pd: PropDiff | null = null;
  if (pv?.ok) {
    const props = await loadProps();
    const mine = leadId ? props.rows.filter((p) => p.lead_id === leadId) : [];
    pd = diffProps(mine, pv.rows);
    if (!props.ready && (pd.add.length || pd.update.length || pd.remove.length)) throw new LeadError(409, "ยังไม่มีแท็บ LEAD_PROPERTIES — ให้ Super Admin กด ตั้งค่า → เตรียม Google Sheet ก่อนบันทึก URL ทรัพย์", "SHEET_NOT_READY");
    if (pd.unknown.length) throw new LeadError(409, "ทรัพย์บางรายการถูกแก้ไข/ลบโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
    if (pd.remove.length && role === "admin") throw new LeadError(403, "Admin ลบรายการทรัพย์ไม่ได้ — เปลี่ยนสถานะเป็น ยกเลิก แทน", "FORBIDDEN_DELETE");
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
    await logLeadStatus(leadStatusChanges(null, rec, STATUS_DEFAULTS, logFieldOf(rec)), rec, actor, now);
    rec.lead_code = await dedupeCode("LEADS", tab.headers, "lead_code", "lead_id", rec.lead_id, rec.lead_code, (codes) => nextLeadCode(codes, Number(today.slice(0, 4)), Number(t.APP_CONFIG.rows.find((r) => r.config_key === `lead_code_floor_${today.slice(0, 4)}`)?.config_value) || 0));
    if (pd) await applyProps(rec.lead_id, pd, actor, now);
    await writeAudit(actor, "lead_create", "lead", rec.lead_id, `สร้าง ${rec.lead_code} (${rec.source_channel}, ${rec.need}${leadStatusOf(rec) ? ` / ${leadStatusOf(rec)}` : ""})${pd && propSummary(pd) ? ` · ${propSummary(pd)}` : ""}`);
    return { created: true, lead: rec };
  }
  const rec: Lead = { ...v.rec, ...stamps, lead_id: prev.lead_id, lead_code: prev.lead_code, created_by: prev.created_by, created_at: prev.created_at, updated_by: actor, updated_at: now };
  await writeLead(tab.headers, prev.lead_id, prev.updated_at, rec);
  if (pd) await applyProps(rec.lead_id, pd, actor, now);
  // เปลี่ยน Need ข้ามฝั่ง (ซื้อ↔ขาย / เพิ่งระบุ Need): ถือว่า Lead เพิ่งเข้าฝั่งใหม่ → บันทึก "" → สถานะปัจจุบัน
  // (Lead ที่เปลี่ยนเป็น ขาย จะถูกนับเป็นทรัพย์เข้าระบบ และเริ่มจับเวลาไม่ค้างสถานะ — 10/11/2026)
  const newField = logFieldOf(rec), sideMoved = !!newField && logFieldOf(prev) !== newField;
  const moved = sideMoved ? leadStatusChanges(null, rec, STATUS_DEFAULTS, newField) : leadStatusChanges(prev, rec, STATUS_DEFAULTS, newField);
  await logLeadStatus(moved, rec, actor, now);
  if (moved.length || (rec.last_contacted_at || "") !== (prev.last_contacted_at || "")) await logFollowup(followupRow("lead", { id: rec.lead_id, code: rec.lead_code, staff: rec.staff ?? "" }, prev.next_follow_up_at, actor, now));
  const ps = leadStatusOf(prev), cs = leadStatusOf(rec);
  const parts = [prev.need !== rec.need ? `Need ${prev.need || "(ว่าง)"} → ${rec.need}` : "", ps !== cs ? `สถานะ ${ps || "(ว่าง)"} → ${cs || "(ว่าง)"}` : "",
    ns.conflict ? `ล้าง ${ns.conflict.field}="${ns.conflict.value}"` : "", prev.call_status !== rec.call_status ? `Call ${prev.call_status || "(ว่าง)"} → ${rec.call_status}` : "", propSummary(pd)].filter(Boolean);
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
    else if (num > (Number(cfg.rows[idx].config_value) || 0)) await updateById("APP_CONFIG", cfg.headers, "config_key", key, toRow(cfg.headers, { ...cfg.rows[idx], config_value: String(num), updated_at: now }));
  }
  // จองแถว (ต้องยังไม่มีใครแก้) แล้วลบตาม lead_id
  await writeLead(t.LEADS.headers, leadId, row.updated_at, { ...row, updated_at: new Date().toISOString() });
  await deleteWhere("LEADS", "lead_id", leadId);
  const props = await loadProps(); const mine = props.rows.filter((p) => p.lead_id === leadId);
  if (mine.length) await applyProps(leadId, { add: [], update: [], remove: mine, unknown: [] }, actor, new Date().toISOString()); // ทรัพย์ของ Lead ที่ลบ
  await writeAudit(actor, "lead_delete", "lead", leadId, `ลบ ${row.lead_code} (${row.source_channel}, ${row.status})`);
  return { deleted: true, lead_code: row.lead_code };
}

/** เขียน Lead ตาม lead_id เฉพาะเมื่อยังไม่มีใครแก้ก่อน (ใช้พร้อมกันหลายคน): ถูกลบ → 404 · มีคนแก้ก่อน → 409 */
async function writeLead(headers: string[], id: string, updatedAt: string, rec: Record<string, string>) {
  const r = await casWrite("LEADS", headers, "lead_id", id, updatedAt, toRow(headers, rec));
  if (r === "gone") throw new LeadError(404, "ไม่พบ Lead นี้แล้ว (อาจถูกผู้อื่นลบไป) กรุณาโหลดใหม่", "NOT_FOUND");
  if (r === "stale") throw new LeadError(409, "Lead นี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่ก่อนแก้ไข", "STALE");
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
  const prev = pick(tab.rows[i]);
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
  await writeLead(tab.headers, leadId, prev.updated_at, rec);
  await logLeadStatus(leadStatusChanges(prev, rec, STATUS_DEFAULTS, logFieldOf(rec)), rec, actor, rec.updated_at);
  await logFollowup(followupRow("lead", { id: rec.lead_id, code: rec.lead_code, staff: rec.staff ?? "" }, prev.next_follow_up_at, actor, rec.updated_at));
  if (field === "sell_status") await writeAudit(actor, "lead_status_change", "lead", rec.lead_id, `${rec.lead_code}: สถานะ ${before} → ${value}`);
  else await writeAudit(actor, "lead_update", "lead", rec.lead_id, `${rec.lead_code}: Call ${before} → ${value}`);
  return { changed: true, lead: rec };
}
export const changeSellStatus = (leadId: string, sellStatus: string, updatedAtSeen: string, actor: string) => changeLeadStatus(leadId, "sell_status", sellStatus, updatedAtSeen, actor);
