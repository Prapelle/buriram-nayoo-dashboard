/**
 * Developer (ลูกค้าโครงการหมู่บ้าน) — อ่าน/เขียน Google Sheets
 * แท็บ DEVELOPERS (หนึ่งแถวต่อบริษัท/โครงการ) · DEVELOPER_PRODUCTS (หนึ่งแถวต่อ Product ที่ขาย) · DEVELOPER_STATUS_LOG (ประวัติ Status สำหรับรายงาน)
 * - การเปลี่ยน Status อัตโนมัติ (สิ้นเดือน / ตาม Product) ทำตอนเปิดรายการ · log อัตโนมัติมีรหัสคงที่ → เปิดพร้อมกันหลายคนไม่บันทึกซ้ำ
 * - ไม่ลบ log · ตรวจข้อมูลเก่าก่อนแก้ (updated_at) · เตือนชื่อบริษัท/โครงการ/เบอร์/Line ซ้ำ (ไม่ merge อัตโนมัติ) · บันทึก Audit Log
 */
import { writeAudit } from "./audit";
import {
  addDays, AUTO_STATUS, autoChanges, CONTACT_COLUMNS, CONTACT_METHODS, NEXT_CONTACT_DAYS, DEFAULT_PRODUCTS, DEV_COLUMNS, DEV_DEFAULT, DEV_EDITABLE, DEV_STATUS, findDevDuplicates, IMPORT_HEADERS, LOG_COLUMNS, nextDevCode, normLine, normName, normPhone,
  PRODUCT_COLUMNS, productDrivenStatus, productState, todayBkk, validateDev, validateProduct, type Dev, type DevDup, type DevProduct,
} from "./developers";
import { appendRows, batchUpdateValues, colLetter, deleteRow, listTabs, readTabs, toRow } from "./sheets";

export class DevError extends Error {
  constructor(public status: number, message: string, public code: string, public extra: { fields?: Record<string, string>; matches?: DevDup[] } = {}) { super(message); }
}
type Tab = { headers: string[]; rows: Record<string, string>[] };
const TABS = ["DEVELOPERS", "DEVELOPER_PRODUCTS", "DEVELOPER_STATUS_LOG", "APP_CONFIG"];
const CONTACTS = "DEVELOPER_CONTACTS"; // เพิ่ม 31/10/2026 — ยังไม่ได้เตรียม Sheet ก็เปิดหน้าได้ (ไม่มีประวัติ) แต่บันทึกการติดต่อไม่ได้
const CONFIG_KEY = "developer_products";

async function load(): Promise<Record<string, Tab>> {
  let t: Record<string, Tab>;
  try {
    const have = new Set((await listTabs()).map((m) => m.title));
    t = await readTabs(have.has(CONTACTS) ? [...TABS, CONTACTS] : TABS);
    if (!t[CONTACTS]) t[CONTACTS] = { headers: [], rows: [] };
  } catch { throw new DevError(409, "ยังไม่มีแท็บ Developer — ให้ Admin กด ตั้งค่า → ตั้งค่าระบบ → เตรียม Google Sheet", "SHEET_NOT_READY"); }
  if (!t.DEVELOPERS.headers.includes("developer_id") || !t.DEVELOPER_PRODUCTS.headers.includes("product_id") || !t.DEVELOPER_STATUS_LOG.headers.includes("log_id"))
    throw new DevError(409, "แท็บ Developer ยังไม่พร้อม — ให้ Admin กด เตรียม Google Sheet", "SHEET_NOT_READY");
  return t;
}
const pickDev = (r: Record<string, string>): Dev => Object.fromEntries(DEV_COLUMNS.map((c) => [c, r[c] ?? ""]));
const pickProd = (r: Record<string, string>): DevProduct => Object.fromEntries(PRODUCT_COLUMNS.map((c) => [c, r[c] ?? ""]));
export const productTypesOf = (config: Record<string, string>[]) => {
  const v = config.find((r) => r.config_key === CONFIG_KEY)?.config_value;
  return v ? v.split("|").map((x) => x.trim()).filter(Boolean) : DEFAULT_PRODUCTS;
};
const rowRange = (tab: string, headers: string[], row: number) => `'${tab}'!A${row}:${colLetter(headers.length - 1)}${row}`;

async function writeLogs(t: Record<string, Tab>, logs: Record<string, string>[]) {
  const have = new Set(t.DEVELOPER_STATUS_LOG.rows.map((r) => r.log_id));
  const fresh = logs.filter((l) => !have.has(l.log_id));
  if (fresh.length) { await appendRows("DEVELOPER_STATUS_LOG", fresh.map((l) => toRow(t.DEVELOPER_STATUS_LOG.headers, l))); fresh.forEach((l) => { t.DEVELOPER_STATUS_LOG.rows.push(l); have.add(l.log_id); }); }
}

/** ใช้การเปลี่ยน Status อัตโนมัติกับแถวใน Sheet (เฉพาะ developer ที่ระบุ หรือทั้งหมด) */
async function sync(t: Record<string, Tab>, onlyId?: string) {
  const today = todayBkk(), now = new Date().toISOString();
  const devs = t.DEVELOPERS.rows.filter((r) => r.developer_id && (!onlyId || r.developer_id === onlyId));
  const changes = autoChanges(devs, t.DEVELOPER_PRODUCTS.rows, today);
  if (!changes.length) return 0;
  const final = new Map<string, string>(); changes.forEach((c) => final.set(c.developer_id, c.to));
  const updates: { range: string; values: (string | number)[][] }[] = [];
  for (const [id, to] of final) {
    const i = t.DEVELOPERS.rows.findIndex((r) => r.developer_id === id); if (i < 0) continue;
    const r = t.DEVELOPERS.rows[i]; r.status = to; r.status_changed_at = now;
    updates.push({ range: rowRange("DEVELOPERS", t.DEVELOPERS.headers, i + 2), values: [toRow(t.DEVELOPERS.headers, r)] });
  }
  await batchUpdateValues(updates);
  const staffOf = new Map(t.DEVELOPERS.rows.map((r) => [r.developer_id, r.staff ?? ""]));
  await writeLogs(t, changes.map((c) => ({
    log_id: `auto:${c.developer_id}:${c.kind}:${c.from}>${c.to}:${c.kind === "auto_month_end" ? c.month : today}`, developer_id: c.developer_id, staff: staffOf.get(c.developer_id) ?? "",
    from_status: c.from, to_status: c.to, kind: c.kind, counts_as: c.counts_as, month: c.month, changed_by: "system", changed_at: now,
  })));
  return final.size;
}

export async function listDevelopers() {
  const t = await load();
  await sync(t);
  const devs = t.DEVELOPERS.rows.filter((r) => r.developer_id).map(pickDev).sort((a, b) => (a.company_name || a.project_main).localeCompare(b.company_name || b.project_main, "th"));
  const ids = new Set(devs.map((d) => d.developer_id));
  const products = t.DEVELOPER_PRODUCTS.rows.filter((r) => r.product_id && ids.has(r.developer_id)).map(pickProd);
  const logs = t.DEVELOPER_STATUS_LOG.rows.filter((r) => r.log_id).map((r) => Object.fromEntries(LOG_COLUMNS.map((c) => [c, r[c] ?? ""])));
  const staff = [...new Set(devs.map((d) => d.staff.trim()).filter(Boolean))].sort();
  const contacts = t[CONTACTS].rows.filter((r) => r.contact_id).map((r) => Object.fromEntries(CONTACT_COLUMNS.map((c) => [c, r[c] ?? ""])));
  return { devs, products, logs, contacts, staff, productTypes: productTypesOf(t.APP_CONFIG.rows), today: todayBkk() };
}

function manualLog(dev: Dev, from: string, to: string, actor: string, now: string) {
  return { log_id: crypto.randomUUID(), developer_id: dev.developer_id, staff: dev.staff ?? "", from_status: from, to_status: to, kind: "manual", counts_as: "", month: todayBkk().slice(0, 7), changed_by: actor, changed_at: now };
}
/** ผลของการเปลี่ยน Status ด้วยมือ: เข้าพบแล้ว → ติดต่อล่าสุด = วันนี้ (+ ติดต่อครั้งถัดไป +30 วันถ้าว่าง/ผ่านไปแล้ว) · ปิดการขาย → won_at = วันนี้ */
function applyStatus(rec: Dev, to: string, now: string) {
  rec.status = to; rec.status_changed_at = now;
  if (to === "เข้าพบแล้ว") touchContact(rec, todayBkk());
  if (to === "ปิดการขาย") rec.won_at = todayBkk();
}
function touchContact(rec: Dev, date: string, method?: string) {
  rec.last_contacted_at = date;
  if (method) rec.last_contact_method = method;
  if (!rec.next_follow_up_at || rec.next_follow_up_at <= date) rec.next_follow_up_at = addDays(date, NEXT_CONTACT_DAYS);
}
/** ตรวจว่าพร้อมบันทึกการติดต่อ (มีแท็บประวัติ + คอลัมน์สถานะการเข้าพบ) */
function contactReady(t: Record<string, Tab>, method: string) {
  if (!CONTACT_METHODS.includes(method)) throw new DevError(422, "เลือกสถานะการเข้าพบ: โทร / Line / เจอหน้า", "VALIDATION", { fields: { last_contact_method: "เลือก โทร / Line / เจอหน้า" } });
  if (!t[CONTACTS].headers.includes("contact_id") || !t.DEVELOPERS.headers.includes("last_contact_method"))
    throw new DevError(409, "ยังไม่มีแท็บประวัติการติดต่อ — ให้ Admin กด ตั้งค่า → เตรียม Google Sheet ก่อน", "SHEET_NOT_READY");
}
async function writeContact(t: Record<string, Tab>, dev: Dev, method: string, date: string, source: "status" | "manual", note: string, actor: string, now: string) {
  const row = { contact_id: crypto.randomUUID(), developer_id: dev.developer_id, staff: dev.staff ?? "", method, contacted_at: date, source, note, created_by: actor, created_at: now };
  await appendRows(CONTACTS, [toRow(t[CONTACTS].headers, row)]); t[CONTACTS].rows.push(row);
}
function checkManualStatus(to: string, products: DevProduct[], developerId: string) {
  if (AUTO_STATUS.includes(to)) throw new DevError(422, `"${to}" ระบบตั้งให้เองจากวันของ Product — เพิ่ม Product ที่หน้า Developer แทน`, "AUTO_STATUS", { fields: { status: "สถานะนี้ตั้งเองไม่ได้" } });
  if (!(DEV_STATUS as readonly string[]).includes(to)) throw new DevError(422, "Status ไม่ถูกต้อง", "VALIDATION", { fields: { status: "Status ไม่ถูกต้อง" } });
  if (products.some((p) => p.developer_id === developerId && productState(p, todayBkk()) === "active"))
    throw new DevError(409, "โครงการนี้มี Product ที่ใช้อยู่ — Status เปลี่ยนเองตามวันหมดอายุของ Product", "HAS_ACTIVE_PRODUCT");
}

export async function saveDeveloper(input: Record<string, unknown>, actor: string) {
  const v = validateDev(input);
  if (!v.ok) throw new DevError(422, "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่ระบุ", "VALIDATION", { fields: v.errors });
  const t = await load();
  const rows = t.DEVELOPERS.rows;
  const id = String(input.developer_id ?? "");
  const now = new Date().toISOString();
  let prev: Dev | undefined, rowNo = 0;
  if (id) {
    const i = rows.findIndex((r) => r.developer_id === id);
    if (i < 0) throw new DevError(404, "ไม่พบรายการนี้ (อาจถูกลบออกจาก Sheet)", "NOT_FOUND");
    prev = pickDev(rows[i]); rowNo = i + 2;
    if (String(input.updated_at_seen ?? "") !== prev.updated_at) throw new DevError(409, "รายการนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่ก่อนแก้ไข", "STALE");
  }
  const key = (d: Dev) => [normName(d.company_name), normName(d.project_main), normPhone(d.phone), normLine(d.line_id)].join("|");
  if ((!prev || key(prev) !== key(v.rec)) && input.confirmDuplicate !== true) {
    const m = findDevDuplicates(rows.filter((r) => r.developer_id).map(pickDev), v.rec, id || undefined);
    if (m.length) throw new DevError(409, "พบรายการที่ชื่อบริษัท / โครงการ / เบอร์ / Line ซ้ำ (ระบบไม่รวมข้อมูลให้อัตโนมัติ)", "DUPLICATE_WARNING", { matches: m });
  }
  // สถานะกลุ่มอัตโนมัติที่ฟอร์มส่งกลับมา (อาจเป็นค่าเก่าก่อนระบบเปลี่ยน) ไม่ถือว่าผู้ใช้เปลี่ยน
  const statusChanged = (prev?.status || "") !== v.rec.status && !(prev && AUTO_STATUS.includes(prev.status) && AUTO_STATUS.includes(v.rec.status));
  if (prev ? statusChanged : v.rec.status !== DEV_DEFAULT) checkManualStatus(v.rec.status, t.DEVELOPER_PRODUCTS.rows, id);
  if (prev && !statusChanged) v.rec.status = prev.status; // ไม่ทับ Status ที่ระบบเพิ่งเปลี่ยน
  const met = v.rec.status === "เข้าพบแล้ว" && (prev ? statusChanged : true);
  if (met) contactReady(t, v.rec.last_contact_method); // ย้ายมา เข้าพบแล้ว ต้องเลือกวิธี (โทร / Line / เจอหน้า)
  if (!prev) {
    const rec: Dev = { ...Object.fromEntries(DEV_COLUMNS.map((c) => [c, ""])), ...v.rec, developer_id: crypto.randomUUID(), dev_code: nextDevCode(rows.map((r) => r.dev_code)),
      created_by: actor, created_at: now, updated_by: actor, updated_at: now };
    applyStatus(rec, rec.status, now);
    if (v.rec.last_contacted_at && rec.status === "เข้าพบแล้ว") rec.last_contacted_at = v.rec.last_contacted_at;
    if (met) touchContact(rec, rec.last_contacted_at || todayBkk(), v.rec.last_contact_method);
    await appendRows("DEVELOPERS", [toRow(t.DEVELOPERS.headers, rec)]);
    if (rec.status !== DEV_DEFAULT) await writeLogs(t, [manualLog(rec, "", rec.status, actor, now)]);
    if (met) await writeContact(t, rec, v.rec.last_contact_method, rec.last_contacted_at, "status", "", actor, now);
    await writeAudit(actor, "developer_create", "developer", rec.developer_id, `${rec.dev_code} ${rec.company_name || rec.project_main}`);
    return { created: true, dev: rec };
  }
  const rec: Dev = { ...prev, ...Object.fromEntries(DEV_EDITABLE.map((k) => [k, v.rec[k]])), updated_by: actor, updated_at: now };
  if (statusChanged) { applyStatus(rec, v.rec.status, now); if (v.rec.last_contacted_at !== prev.last_contacted_at && v.rec.last_contacted_at) rec.last_contacted_at = v.rec.last_contacted_at; }
  if (met) touchContact(rec, rec.last_contacted_at || todayBkk(), v.rec.last_contact_method);
  await batchUpdateValues([{ range: rowRange("DEVELOPERS", t.DEVELOPERS.headers, rowNo), values: [toRow(t.DEVELOPERS.headers, rec)] }]);
  if (statusChanged) await writeLogs(t, [manualLog(rec, prev.status, rec.status, actor, now)]);
  if (met) await writeContact(t, rec, v.rec.last_contact_method, rec.last_contacted_at, "status", "", actor, now);
  const changed = DEV_EDITABLE.filter((k) => (prev![k] ?? "") !== (rec[k] ?? "")).map((k) => k === "status" ? `Status ${prev!.status} → ${rec.status}` : k);
  await writeAudit(actor, "developer_update", "developer", rec.developer_id, `${rec.dev_code}: ${changed.join(", ") || "ไม่มีการเปลี่ยนแปลง"}`);
  return { created: false, dev: rec };
}

/** เปลี่ยน Status จากบอร์ด Sale developer (ลากการ์ด / เมนู) */
export async function changeDevStatus(id: string, to: string, updatedAtSeen: string, actor: string, method?: string) {
  if (!id) throw new DevError(400, "ไม่ระบุรายการ", "BAD_REQUEST");
  const t = await load();
  const i = t.DEVELOPERS.rows.findIndex((r) => r.developer_id === id);
  if (i < 0) throw new DevError(404, "ไม่พบรายการนี้", "NOT_FOUND");
  const prev = pickDev(t.DEVELOPERS.rows[i]);
  if (updatedAtSeen !== prev.updated_at) throw new DevError(409, "รายการนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  if ((prev.status || DEV_DEFAULT) === to) return { changed: false, dev: prev };
  checkManualStatus(to, t.DEVELOPER_PRODUCTS.rows, id);
  if (to === "เข้าพบแล้ว") contactReady(t, String(method ?? ""));
  const now = new Date().toISOString();
  const rec: Dev = { ...prev, updated_by: actor, updated_at: now };
  applyStatus(rec, to, now);
  if (to === "เข้าพบแล้ว") rec.last_contact_method = String(method);
  await batchUpdateValues([{ range: rowRange("DEVELOPERS", t.DEVELOPERS.headers, i + 2), values: [toRow(t.DEVELOPERS.headers, rec)] }]);
  await writeLogs(t, [manualLog(rec, prev.status || DEV_DEFAULT, to, actor, now)]);
  if (to === "เข้าพบแล้ว") await writeContact(t, rec, String(method), rec.last_contacted_at, "status", "", actor, now);
  await writeAudit(actor, "developer_status", "developer", id, `${rec.dev_code}: ${prev.status || DEV_DEFAULT} → ${to}`);
  return { changed: true, dev: rec };
}

/** บันทึกการติดต่อ (ไม่เปลี่ยน Status): อัปเดตติดต่อล่าสุด + สถานะการเข้าพบ · นับในยอด โทร / Line / เจอหน้า แต่ไม่นับเป็น "เข้าพบ" */
export async function recordContact(id: string, method: string, date: string, note: string, updatedAtSeen: string, actor: string) {
  const t = await load();
  const i = t.DEVELOPERS.rows.findIndex((r) => r.developer_id === id);
  if (i < 0) throw new DevError(404, "ไม่พบรายการนี้", "NOT_FOUND");
  const prev = pickDev(t.DEVELOPERS.rows[i]);
  if (updatedAtSeen !== prev.updated_at) throw new DevError(409, "รายการนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  contactReady(t, method);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= todayBkk() ? date : todayBkk();
  if (String(note ?? "").length > 500) throw new DevError(422, "หมายเหตุยาวเกิน 500 ตัวอักษร", "VALIDATION", { fields: { note: "ยาวเกิน 500 ตัวอักษร" } });
  const now = new Date().toISOString();
  const rec: Dev = { ...prev, updated_by: actor, updated_at: now };
  if (!prev.last_contacted_at || d >= prev.last_contacted_at) touchContact(rec, d, method);
  await batchUpdateValues([{ range: rowRange("DEVELOPERS", t.DEVELOPERS.headers, i + 2), values: [toRow(t.DEVELOPERS.headers, rec)] }]);
  await writeContact(t, rec, method, d, "manual", String(note ?? "").trim(), actor, now);
  await writeAudit(actor, "developer_contact", "developer", id, `${rec.dev_code}: ติดต่อ (${method}) ${d}`);
  return { dev: rec };
}

export async function deleteDeveloper(id: string, updatedAtSeen: string, actor: string) {
  const t = await load();
  const i = t.DEVELOPERS.rows.findIndex((r) => r.developer_id === id);
  if (i < 0) throw new DevError(404, "ไม่พบรายการนี้", "NOT_FOUND");
  const prev = t.DEVELOPERS.rows[i];
  if (updatedAtSeen !== (prev.updated_at ?? "")) throw new DevError(409, "รายการนี้ถูกแก้ไขโดยผู้อื่นไปแล้ว กรุณาโหลดใหม่", "STALE");
  const meta = await listTabs();
  const sid = (n: string) => meta.find((m) => m.title === n)!.sheetId;
  // ลบ Product ของรายการนี้ก่อน (จากแถวล่างขึ้นบน เลขแถวจะไม่เลื่อน) · ประวัติ Status เก็บไว้สำหรับรายงาน
  const prodRows = t.DEVELOPER_PRODUCTS.rows.map((r, k) => (r.developer_id === id ? k + 2 : 0)).filter(Boolean).sort((a, b) => b - a);
  for (const r of prodRows) await deleteRow(sid("DEVELOPER_PRODUCTS"), r);
  await deleteRow(sid("DEVELOPERS"), i + 2);
  await writeAudit(actor, "developer_delete", "developer", id, `ลบ ${prev.dev_code} ${prev.company_name || prev.project_main} (+ Product ${prodRows.length} รายการ)`);
  return { deleted: true, dev_code: prev.dev_code };
}

export async function saveProduct(input: Record<string, unknown>, actor: string) {
  const t = await load();
  const types = productTypesOf(t.APP_CONFIG.rows);
  const v = validateProduct(input, types);
  if (!v.ok) throw new DevError(422, "ข้อมูล Product ไม่ถูกต้อง", "VALIDATION", { fields: v.errors });
  const devId = String(input.developer_id ?? "");
  if (!t.DEVELOPERS.rows.some((r) => r.developer_id === devId)) throw new DevError(404, "ไม่พบ Developer", "NOT_FOUND");
  const now = new Date().toISOString();
  const pid = String(input.product_id ?? "");
  let rec: DevProduct;
  if (pid) {
    const i = t.DEVELOPER_PRODUCTS.rows.findIndex((r) => r.product_id === pid && r.developer_id === devId);
    if (i < 0) throw new DevError(404, "ไม่พบ Product นี้", "NOT_FOUND");
    const prev = t.DEVELOPER_PRODUCTS.rows[i];
    if (String(input.updated_at_seen ?? "") !== (prev.updated_at ?? "")) throw new DevError(409, "Product นี้ถูกแก้ไขไปแล้ว กรุณาโหลดใหม่", "STALE");
    rec = { ...pickProd(prev), ...v.rec, updated_by: actor, updated_at: now };
    await batchUpdateValues([{ range: rowRange("DEVELOPER_PRODUCTS", t.DEVELOPER_PRODUCTS.headers, i + 2), values: [toRow(t.DEVELOPER_PRODUCTS.headers, rec)] }]);
    t.DEVELOPER_PRODUCTS.rows[i] = rec;
  } else {
    rec = { ...v.rec, product_id: crypto.randomUUID(), developer_id: devId, created_by: actor, created_at: now, updated_by: actor, updated_at: now };
    await appendRows("DEVELOPER_PRODUCTS", [toRow(t.DEVELOPER_PRODUCTS.headers, rec)]);
    t.DEVELOPER_PRODUCTS.rows.push(rec);
  }
  await sync(t, devId); // Status เปลี่ยนทันทีตามวันของ Product
  await writeAudit(actor, pid ? "developer_product_update" : "developer_product_create", "developer", devId, `${rec.product} ${rec.start_date}–${rec.end_date}${rec.price_thb ? ` ฿${rec.price_thb}` : ""}`);
  const dev = pickDev(t.DEVELOPERS.rows.find((r) => r.developer_id === devId)!);
  return { product: rec, dev, statusHint: productDrivenStatus(dev.status, t.DEVELOPER_PRODUCTS.rows.filter((r) => r.developer_id === devId), todayBkk()) };
}

export async function deleteProduct(productId: string, actor: string) {
  const t = await load();
  const i = t.DEVELOPER_PRODUCTS.rows.findIndex((r) => r.product_id === productId);
  if (i < 0) throw new DevError(404, "ไม่พบ Product นี้", "NOT_FOUND");
  const p = t.DEVELOPER_PRODUCTS.rows[i];
  const sid = (await listTabs()).find((m) => m.title === "DEVELOPER_PRODUCTS")!.sheetId;
  await deleteRow(sid, i + 2);
  t.DEVELOPER_PRODUCTS.rows.splice(i, 1);
  await sync(t, p.developer_id);
  await writeAudit(actor, "developer_product_delete", "developer", p.developer_id, `ลบ ${p.product} ${p.start_date}–${p.end_date}`);
  return { deleted: true };
}

/** เพิ่มชนิด Product (เก็บใน APP_CONFIG: developer_products คั่นด้วย |) */
export async function addProductType(name: string, actor: string) {
  const n = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!n || n.length > 60 || n.includes("|")) throw new DevError(422, "ชื่อ Product ต้องมี 1–60 ตัวอักษร และไม่มีเครื่องหมาย |", "VALIDATION", { fields: { name: "ชื่อไม่ถูกต้อง" } });
  const t = await load();
  const types = productTypesOf(t.APP_CONFIG.rows);
  if (types.some((x) => x.toLowerCase() === n.toLowerCase())) return { types, added: false };
  const next = [...types, n];
  const i = t.APP_CONFIG.rows.findIndex((r) => r.config_key === "developer_products");
  const row = { config_key: "developer_products", config_value: next.join("|"), description: "ชนิด Product ที่ขายให้ Developer (คั่นด้วย |)", updated_at: new Date().toISOString() };
  if (i >= 0) await batchUpdateValues([{ range: rowRange("APP_CONFIG", t.APP_CONFIG.headers, i + 2), values: [toRow(t.APP_CONFIG.headers, row)] }]);
  else await appendRows("APP_CONFIG", [toRow(t.APP_CONFIG.headers, row)]);
  await writeAudit(actor, "developer_product_type", "config", "developer_products", `เพิ่ม ${n}`);
  return { types: next, added: true };
}

/** นำเข้ารายชื่อ Developer จากไฟล์ (หัวคอลัมน์ภาษาไทยตามฟอร์ม) — plan = ตรวจอย่างเดียว · commit = เพิ่มเฉพาะแถวที่ถูกต้องและไม่ซ้ำ */
export type ImportRowResult = { n: number; status: "insert" | "duplicate" | "invalid"; name: string; errors?: Record<string, string>; matches?: string[] };
export async function importDevelopers(grid: unknown, commit: boolean, actor: string) {
  if (!Array.isArray(grid) || grid.length < 2 || grid.length > 2001) throw new DevError(422, "ไฟล์ต้องมีหัวคอลัมน์และข้อมูล 1–2,000 แถว", "VALIDATION");
  const head = (grid[0] as unknown[]).map((h) => normName(h));
  const map = head.map((h) => IMPORT_HEADERS[h]);
  if (!map.includes("company_name") && !map.includes("project_main")) throw new DevError(422, "ไม่พบคอลัมน์ ชื่อบริษัท หรือ โครงการหลัก — ใช้ไฟล์ตัวอย่างจากปุ่ม ดาวน์โหลดไฟล์ตัวอย่าง", "MISSING_HEADERS");
  const t = await load();
  const existing = t.DEVELOPERS.rows.filter((r) => r.developer_id).map(pickDev);
  const seen: Dev[] = [];
  const results: ImportRowResult[] = []; const toAdd: Dev[] = [];
  (grid as unknown[][]).slice(1).forEach((cells, k) => {
    if (!Array.isArray(cells) || cells.every((c) => String(c ?? "").trim() === "")) return;
    const input: Record<string, string> = {};
    map.forEach((f, j) => { if (f) input[f] = String(cells[j] ?? "").trim(); });
    if (AUTO_STATUS.includes(input.status ?? "")) input.status = "ปิดการขาย"; // สถานะที่มาจาก Product: เพิ่ม Product ภายหลัง
    const v = validateDev(input);
    const name = input.company_name || input.project_main || "";
    if (!v.ok) { results.push({ n: k + 2, status: "invalid", name, errors: v.errors }); return; }
    const m = findDevDuplicates([...existing, ...seen], v.rec);
    if (m.length) { results.push({ n: k + 2, status: "duplicate", name, matches: m.map((x) => x.dev_code || "(แถวก่อนหน้าในไฟล์)") }); return; }
    seen.push({ ...v.rec, developer_id: `new${k}`, dev_code: "" });
    results.push({ n: k + 2, status: "insert", name }); toAdd.push(v.rec);
  });
  const counts = { insert: toAdd.length, duplicate: results.filter((r) => r.status === "duplicate").length, invalid: results.filter((r) => r.status === "invalid").length };
  if (!commit || !toAdd.length) return { counts, results: results.slice(0, 200), committed: false };
  const now = new Date().toISOString();
  const codes = existing.map((d) => d.dev_code);
  const recs = toAdd.map((r) => {
    const code = nextDevCode(codes); codes.push(code);
    const rec: Dev = { ...Object.fromEntries(DEV_COLUMNS.map((c) => [c, ""])), ...r, developer_id: crypto.randomUUID(), dev_code: code, status_changed_at: now, won_at: r.status === "ปิดการขาย" ? now.slice(0, 10) : "", created_by: actor, created_at: now, updated_by: actor, updated_at: now };
    return rec;
  });
  for (let i = 0; i < recs.length; i += 500) await appendRows("DEVELOPERS", recs.slice(i, i + 500).map((r) => toRow(t.DEVELOPERS.headers, r)));
  await writeAudit(actor, "developer_import", "developer", "-", `นำเข้า ${recs.length} รายการ · ซ้ำ ${counts.duplicate} · ไม่ถูกต้อง ${counts.invalid}`);
  return { counts, results: results.slice(0, 200), committed: true };
}
