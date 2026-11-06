/**
 * บันทึกประวัติสำหรับประสิทธิภาพรายคน (5/11/2026)
 * การบันทึกประวัติ "ต้องไม่ทำให้การบันทึก Lead ล้ม" — ถ้าเขียนไม่สำเร็จ แค่ log error แล้วไปต่อ
 * (Lead เปลี่ยนสถานะสำเร็จแล้วตอนนี้ ผู้ใช้ไม่ควรเห็น error เพราะตารางประวัติ)
 */
import { writeAudit } from "./audit";
export { logFollowup } from "./perf-log";
import { logError } from "./log";
import {
  DEFAULT_TARGETS, DEFAULT_TARGETS_KEY, defaultTargetsOf, FOLLOWUP_COLUMNS, LEAD_LOG_COLUMNS, METRICS, metricByKey, parsePositions, PerfError, POSITIONS, POSITION_KEYS, staffNameOf, validateHoliday, validateMonth, validateTarget,
  type LeadStatusChange, type TargetInput,
} from "./perf";
import { validateWaitKinds, waitKindsOf, WAIT_KINDS_KEY } from "./content";
import { buildReport, computeMonth, type DevData } from "./perf-calc";
import { listDevelopers } from "./developers-service";
import { normRole } from "./roles";
import { appendRows, batchUpdateValues, colLetter, deleteRow, listTabs, readTabs, toRow } from "./sheets";

export async function logLeadStatus(changes: LeadStatusChange[], lead: Record<string, string>, actor: string, at: string) {
  if (!changes.length) return;
  try {
    await appendRows("LEAD_STATUS_LOG", changes.map((c) => toRow(LEAD_LOG_COLUMNS, {
      log_id: crypto.randomUUID(), lead_id: lead.lead_id ?? "", lead_code: lead.lead_code ?? "", field: c.field, from_status: c.from, to_status: c.to,
      staff: lead.staff ?? "", changed_by: actor, changed_at: at,
    })));
  } catch (e) { logError("perf.logLeadStatus", e); }
}

// ── หน้าตั้งค่า: ตำแหน่ง / เป้ารายเดือน / วันหยุดบริษัท (Super Admin) ──
const POS = "PERF_POSITIONS", TGT = "PERF_TARGETS", HOL = "PERF_HOLIDAYS";
type Row = Record<string, string>;
type Tab = { headers: string[]; rows: Record<string, string>[] };
const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();
const isActive = (v: unknown) => String(v ?? "").toUpperCase() === "TRUE";
const monthNowBkk = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);

async function load(): Promise<Record<string, Tab>> {
  try {
    const t = await readTabs([POS, TGT, HOL, "APP_USERS", "APP_CONFIG"]);
    if (!t[POS]?.headers.includes("user_email") || !t[TGT]?.headers.includes("metric_key") || !t[HOL]?.headers.includes("holiday_date") || !t.APP_USERS?.headers.includes("email")) throw new Error("missing");
    return t;
  } catch { throw new PerfError(409, "ฐานข้อมูล D1 ยังไม่พร้อม — ตารางประสิทธิภาพรายคนอยู่บน D1 (ตรวจว่าผูก binding DB แล้ว)", "DB_NOT_READY"); }
}
const activeUser = (t: Record<string, Tab>, email: string) => t.APP_USERS.rows.find((u) => u.email && norm(u.email) === email && isActive(u.active));

export async function getPerfSettings(monthRaw?: string) {
  const month = monthRaw ? validateMonth(monthRaw) : monthNowBkk();
  const t = await load();
  const posBy = new Map(t[POS].rows.filter((r) => r.user_email).map((r) => [norm(r.user_email), parsePositions(r.positions)]));
  const users = t.APP_USERS.rows.filter((u) => u.email && isActive(u.active)).map((u) => ({ email: norm(u.email), name: staffNameOf(u), role: normRole(u.role) ?? String(u.role ?? ""), positions: posBy.get(norm(u.email)) ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
  // ช่อง Staff เก็บเป็นชื่อที่แสดง → ถ้าสองคนชื่อซ้ำกัน ตัวเลขจะปนกัน: แจ้งเตือนให้แก้ชื่อ
  const count = new Map<string, number>();
  // นับทุก Role (ตัวคำนวณจับชื่อกับผู้ใช้ทุกคน — แก้ 5/11/2026: เดิมนับเฉพาะ Super Admin / Admin / AE ทำให้ชื่อซ้ำกับ Production ไม่ถูกเตือน) · ไม่สนตัวพิมพ์เล็ก-ใหญ่ / ช่องว่างหัวท้าย
  for (const u of users) { const k = u.name.trim().toLowerCase(); if (k) count.set(k, (count.get(k) ?? 0) + 1); }
  const duplicateNames = [...new Set(users.filter((u) => (count.get(u.name.trim().toLowerCase()) ?? 0) > 1).map((u) => u.name))];
  const targets = t[TGT].rows.filter((r) => r.month === month && r.metric_key && r.target_value !== "").map((r) => ({ user_email: norm(r.user_email), metric_key: r.metric_key, value: Number(r.target_value) }));
  const holidays = t[HOL].rows.filter((r) => r.holiday_date).map((r) => ({ date: r.holiday_date, name: r.name })).sort((a, b) => b.date.localeCompare(a.date));
  return { month, positions: POSITIONS, metrics: METRICS, users, targets, holidays, duplicateNames, waitKinds: waitKindsOf(t.APP_CONFIG?.rows ?? []), defaults: defaultTargetsOf(t.APP_CONFIG?.rows ?? []) };
}

/** แก้รายการสิ่งที่รอจากลูกค้า (Super Admin) — รายการเก่าที่เคยใช้แล้วยังอยู่ในประวัติ ไม่กระทบวันที่ที่นับไปแล้ว */
export async function saveWaitKinds(raw: unknown, actor: string) {
  const v = validateWaitKinds(raw);
  if (!v.ok) throw new PerfError(422, v.error, "VALIDATION", { kinds: v.error });
  const t = await load(), rows = t.APP_CONFIG?.rows ?? [], headers = t.APP_CONFIG?.headers ?? [];
  const i = rows.findIndex((r) => r.config_key === WAIT_KINDS_KEY);
  const row = { config_key: WAIT_KINDS_KEY, config_value: v.value.join("|"), description: "สิ่งที่รอจากลูกค้าในการ์ด Content (คั่นด้วย |)", updated_at: new Date().toISOString() };
  if (i >= 0) await batchUpdateValues([{ range: `'APP_CONFIG'!A${i + 2}:${colLetter(headers.length - 1)}${i + 2}`, values: [toRow(headers, row)] }]);
  else await appendRows("APP_CONFIG", [toRow(headers, row)]);
  await writeAudit(actor, "content_wait_kinds", "config", WAIT_KINDS_KEY, v.value.join(" | "));
  return { kinds: v.value };
}

/** เป้าตั้งต้นต่อตำแหน่ง (Super Admin): ใช้กับทุกคนที่มีตำแหน่งนั้นที่ไม่มีเป้ารายคนของเดือน · ค่าว่าง = ไม่มีเป้าตั้งต้นข้อนั้น */
export async function saveDefaultTargets(items: { metric_key: string; value: unknown }[], actor: string) {
  if (!Array.isArray(items) || !items.length) throw new PerfError(422, "ไม่มีเป้าให้บันทึก", "VALIDATION");
  const checked = items.map((it) => { const v = validateTarget({ user_email: "", metric_key: it.metric_key, value: it.value }); return { key: v.metric.key, value: v.value }; });
  const t = await load(), rows = t.APP_CONFIG?.rows ?? [], headers = t.APP_CONFIG?.headers ?? [];
  const cur = defaultTargetsOf(rows);
  for (const c of checked) { if (c.value === null) delete cur[c.key]; else cur[c.key] = c.value; }
  const stored: Record<string, number | null> = {};
  for (const m of METRICS) { const v = cur[m.key]; if (v !== undefined) stored[m.key] = v; else if (DEFAULT_TARGETS_HAS(m.key)) stored[m.key] = null; }
  const i = rows.findIndex((r) => r.config_key === DEFAULT_TARGETS_KEY);
  const row = { config_key: DEFAULT_TARGETS_KEY, config_value: JSON.stringify(stored), description: "เป้าตั้งต้นต่อตำแหน่ง (ประสิทธิภาพรายคน)", updated_at: new Date().toISOString() };
  if (i >= 0) await batchUpdateValues([{ range: `'APP_CONFIG'!A${i + 2}:${colLetter(headers.length - 1)}${i + 2}`, values: [toRow(headers, row)] }]);
  else await appendRows("APP_CONFIG", [toRow(headers, row)]);
  await writeAudit(actor, "perf_default_targets", "config", DEFAULT_TARGETS_KEY, `เป้าตั้งต้นต่อตำแหน่ง: ${checked.map((c) => `${metricByKey(c.key)?.label}=${c.value ?? "ไม่ตั้ง"}`).join(", ")}`.slice(0, 900));
  return { defaults: cur };
}
const DEFAULT_TARGETS_HAS = (k: string) => k in DEFAULT_TARGETS;

export async function savePositions(emailRaw: string, positions: unknown, actor: string) {
  const email = norm(emailRaw);
  const list = Array.isArray(positions) ? positions.map(String) : [];
  const bad = list.filter((p) => !POSITION_KEYS.includes(p));
  if (bad.length) throw new PerfError(422, "ตำแหน่งไม่ถูกต้อง", "VALIDATION", { positions: "ตำแหน่งไม่ถูกต้อง" });
  const t = await load();
  if (!activeUser(t, email)) throw new PerfError(404, "ไม่พบผู้ใช้นี้ (หรือถูกระงับ)", "NOT_FOUND");
  const value = POSITION_KEYS.filter((k) => list.includes(k)).join(",");
  const now = new Date().toISOString();
  const idx = t[POS].rows.findIndex((r) => norm(r.user_email) === email);
  const rec = { user_email: email, positions: value, updated_by: actor, updated_at: now };
  if (idx >= 0) { const row = idx + 2; await batchUpdateValues([{ range: `'${POS}'!A${row}:${colLetter(t[POS].headers.length - 1)}${row}`, values: [toRow(t[POS].headers, rec)] }]); }
  else await appendRows(POS, [toRow(t[POS].headers, rec)]);
  await writeAudit(actor, "perf_positions", "app_user", email, `ตำแหน่ง ${email}: ${value ? parsePositions(value).map((k) => POSITIONS.find((p) => p.key === k)!.label).join(", ") : "(ไม่มี)"}`);
  return { email, positions: parsePositions(value) };
}

/** บันทึกเป้าหมายของเดือนหนึ่งหลายรายการ: ตรวจทั้งชุดก่อน (ผิดข้อเดียว = ไม่บันทึกเลย) · ค่าว่าง = ยกเลิกเป้านั้น */
export async function saveTargets(monthRaw: unknown, items: TargetInput[], actor: string) {
  const month = validateMonth(monthRaw);
  if (!Array.isArray(items) || !items.length) throw new PerfError(422, "ไม่มีเป้าหมายให้บันทึก", "VALIDATION");
  if (items.length > 500) throw new PerfError(422, "บันทึกครั้งละไม่เกิน 500 รายการ", "VALIDATION");
  const t = await load();
  const posBy = new Map(t[POS].rows.filter((r) => r.user_email).map((r) => [norm(r.user_email), parsePositions(r.positions)]));
  const checked = items.map((it) => {
    const email = norm(it.user_email);
    if (!activeUser(t, email)) throw new PerfError(404, `ไม่พบผู้ใช้ ${email || "(ว่าง)"}`, "NOT_FOUND");
    const v = validateTarget(it);
    if (!(posBy.get(email) ?? []).includes(v.metric.position)) throw new PerfError(422, `${email} ไม่มีตำแหน่งที่ใช้ตัวชี้วัด "${v.metric.label}"`, "VALIDATION", { [it.metric_key]: "ผู้ใช้ไม่มีตำแหน่งนี้" });
    return { email, ...v };
  });
  const now = new Date().toISOString();
  const H = t[TGT].headers;
  const at = new Map(t[TGT].rows.map((r, i) => [`${r.month}|${norm(r.user_email)}|${r.metric_key}`, { i, r }]));
  const updates: { range: string; values: (string | number)[][] }[] = [], adds: (string | number)[][] = [];
  let changed = 0;
  for (const c of checked) {
    const ex = at.get(`${month}|${c.email}|${c.metric.key}`);
    const val = c.value === null ? "" : String(c.value);
    if (ex) {
      if ((ex.r.target_value ?? "") === val) continue;
      const row = ex.i + 2;
      updates.push({ range: `'${TGT}'!A${row}:${colLetter(H.length - 1)}${row}`, values: [toRow(H, { ...ex.r, target_value: val, updated_by: actor, updated_at: now })] }); changed++;
    } else if (c.value !== null) {
      adds.push(toRow(H, { target_id: crypto.randomUUID(), month, user_email: c.email, position: c.metric.position, metric_key: c.metric.key, target_value: val, updated_by: actor, updated_at: now })); changed++;
    }
  }
  if (updates.length) await batchUpdateValues(updates);
  if (adds.length) await appendRows(TGT, adds);
  if (changed) await writeAudit(actor, "perf_targets", "perf_target", month, `ตั้งเป้ารายคน ${month}: เปลี่ยน ${changed} รายการ`);
  return { month, changed };
}

export async function addHoliday(date: unknown, name: unknown, actor: string) {
  const h = validateHoliday(date, name);
  const t = await load();
  if (t[HOL].rows.some((r) => r.holiday_date === h.date)) throw new PerfError(409, "วันนี้ตั้งเป็นวันหยุดแล้ว", "DUPLICATE", { holiday_date: "ซ้ำ" });
  await appendRows(HOL, [toRow(t[HOL].headers, { holiday_date: h.date, name: h.name, created_by: actor, created_at: new Date().toISOString() })]);
  await writeAudit(actor, "perf_holiday_add", "perf_holiday", h.date, `เพิ่มวันหยุด ${h.date} ${h.name}`);
  return h;
}

export async function deleteHoliday(date: unknown, actor: string) {
  const d = String(date ?? "").trim();
  const t = await load();
  const idx = t[HOL].rows.findIndex((r) => r.holiday_date === d);
  if (idx < 0) throw new PerfError(404, "ไม่พบวันหยุดนี้ (อาจถูกลบไปแล้ว)", "NOT_FOUND");
  const sheetId = (await listTabs()).find((x) => x.title === HOL)?.sheetId;
  if (sheetId === undefined) throw new PerfError(409, "ไม่พบตารางวันหยุด", "DB_NOT_READY");
  await deleteRow(sheetId, idx + 2);
  await writeAudit(actor, "perf_holiday_delete", "perf_holiday", d, `ลบวันหยุด ${d} ${t[HOL].rows[idx].name}`);
  return { date: d };
}

// ── รายงาน ทำได้ / เป้าหมาย รายเดือน ──
const emptyDev: DevData = { devs: [], products: [], logs: [], contacts: [] };
async function devData(kind: "developer" | "home_builder"): Promise<DevData> {
  try { const d = await listDevelopers(kind); return { devs: d.devs, products: d.products, logs: d.logs, contacts: d.contacts ?? [] }; }
  catch (e) { logError("perf.devData", e); return emptyDev; } // ระบบ Developer ยังไม่พร้อม = ไม่มีผลงานฝั่งนี้ ไม่ให้ทั้งรายงานล้ม
}

/** admin ขึ้นไปเห็นทุกคน · Role อื่นเห็นเฉพาะของตัวเอง (และไม่เห็นรายการที่จับคู่ชื่อไม่ได้) */
export async function getPerfReport(monthRaw: string | undefined, viewer: { email: string; role: string }) {
  const settings = await getPerfSettings(monthRaw);
  let t: Record<string, Tab>;
  try { t = await readTabs(["LEAD_STATUS_LOG", "CONTENT_CARDS", "CONTENT_MEMBERS", "CONTENT_HISTORY", "CONTENT_WAITS", "PERF_HOLIDAYS"]); }
  catch { throw new PerfError(409, "ฐานข้อมูล D1 ยังไม่พร้อม — ตารางประวัติอยู่บน D1", "DB_NOT_READY"); }
  const opt = async (name: string): Promise<Row[]> => { try { return (await readTabs([name]))[name]?.rows ?? []; } catch { return []; } };
  const [developers, homeBuilders, leads, followups, accDocs, accLines] = await Promise.all([devData("developer"), devData("home_builder"), opt("LEADS"), opt("FOLLOWUP_LOG"), opt("ACC_DOCS"), opt("ACC_LINES")]);
  const users = settings.users.map((u) => ({ email: u.email, name: u.name, positions: u.positions }));
  const calc = computeMonth({ month: settings.month, users, leadLogs: t.LEAD_STATUS_LOG.rows, leads, followups, accDocs, accLines, developers, homeBuilders, cards: t.CONTENT_CARDS.rows, members: t.CONTENT_MEMBERS.rows, history: t.CONTENT_HISTORY.rows, waits: t.CONTENT_WAITS.rows, holidays: t.PERF_HOLIDAYS.rows.map((h) => h.holiday_date).filter(Boolean) });
  const all = viewer.role === "super_admin" || viewer.role === "admin";
  const me = norm(viewer.email);
  // เป้าที่ใช้จริง: เป้ารายคนของเดือน (ถ้ามี) ทับ เป้าตั้งต้นต่อตำแหน่ง
  const personal = new Set(settings.targets.map((x) => `${norm(x.user_email)}|${x.metric_key}`));
  const effective = [...settings.targets];
  for (const u of users) for (const pos of u.positions) for (const m of METRICS.filter((x) => x.position === pos)) {
    const dv = settings.defaults[m.key]; if (dv !== undefined && !personal.has(`${norm(u.email)}|${m.key}`)) effective.push({ user_email: u.email, metric_key: m.key, value: dv });
  }
  const people = buildReport(users, calc.actuals, effective).filter((p) => all || norm(p.email) === me);
  return { month: settings.month, canSeeAll: all, people, unmatched: all ? calc.unmatched : [], duplicateNames: all ? settings.duplicateNames : [] };
}
