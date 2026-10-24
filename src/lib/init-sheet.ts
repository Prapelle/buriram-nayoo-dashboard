import { TABS } from "./schema";
import { addTabs, appendRows, batchGet, batchUpdateValues, colLetter, expandColumns, listTabs, readTab, toRow } from "./sheets";
import { env } from "./env";

export type InitReport = { createdTabs: string[]; addedHeaders: Record<string, string[]>; seeded: string[] };

/** รันซ้ำได้: สร้างเฉพาะแท็บ/คอลัมน์ที่ขาด ไม่ลบหรือเขียนทับข้อมูลเดิม */
export async function initializeSpreadsheet(actor: string): Promise<InitReport> {
  const report: InitReport = { createdTabs: [], addedHeaders: {}, seeded: [] };
  const now = new Date().toISOString();

  const existing = await listTabs();
  const byTitle = new Map(existing.map((t) => [t.title, t]));

  const missing = TABS.filter((t) => !byTitle.has(t.name));
  await addTabs(missing.map((t) => ({ title: t.name, columns: Math.max(26, t.headers.length + 6) })));
  report.createdTabs = missing.map((t) => t.name);

  const headerRows = await batchGet(TABS.map((t) => `'${t.name}'!1:1`));
  const updates: { range: string; values: string[][] }[] = [];
  for (let i = 0; i < TABS.length; i++) {
    const t = TABS[i];
    const current = headerRows[i]?.[0] ?? [];
    const toAdd = t.headers.filter((h) => !current.includes(h));
    if (!toAdd.length) continue;
    const meta = byTitle.get(t.name);
    const need = current.length + toAdd.length;
    if (meta && need > meta.columnCount) await expandColumns(meta.sheetId, need - meta.columnCount + 4);
    updates.push({ range: `'${t.name}'!${colLetter(current.length)}1`, values: [toAdd] });
    report.addedHeaders[t.name] = toAdd;
  }
  await batchUpdateValues(updates);

  // Seed: Admin คนแรก
  if (env.initialAdmin) {
    const users = await readTab("APP_USERS");
    if (!users.rows.some((r) => r.email.toLowerCase() === env.initialAdmin)) {
      await appendRows("APP_USERS", [toRow(users.headers, {
        user_id: crypto.randomUUID(), email: env.initialAdmin, display_name: "Initial Admin",
        role: "admin", active: true, created_at: now, updated_at: now, created_by: "system",
      })]);
      report.seeded.push("APP_USERS: initial admin");
    }
  }

  // Seed: Config เริ่มต้น (เฉพาะ key ที่ยังไม่มี)
  const cfg = await readTab("APP_CONFIG");
  const have = new Set(cfg.rows.map((r) => r.config_key));
  const defaults = [
    ["max_upload_mb", "10", "ขนาดไฟล์ CSV สูงสุด (MB)"],
    ["timezone", "Asia/Bangkok", "เขตเวลาที่ใช้แสดงผล"],
    ["date_format", "DD/MM/YYYY", "รูปแบบวันที่ในหน้าจอ"],
    ["excluded_fb_pages", "BAAN Prompt Community - Buriram&Surin", "ชื่อหรือ Page ID ของเพจ Facebook ที่ไม่นับใน Dashboard (คั่นหลายค่าด้วย |)"],
  ].filter(([k]) => !have.has(k));
  if (defaults.length) {
    await appendRows("APP_CONFIG", defaults.map(([k, v, d]) => toRow(cfg.headers, { config_key: k, config_value: v, description: d, updated_at: now })));
    report.seeded.push(`APP_CONFIG: ${defaults.map(([k]) => k).join(", ")}`);
  }

  const audit = await readTab("AUDIT_LOG");
  await appendRows("AUDIT_LOG", [toRow(audit.headers, {
    audit_id: crypto.randomUUID(), actor_email: actor, action: "init_spreadsheet", entity_type: "spreadsheet",
    entity_id: env.sheetId, timestamp: now,
    summary: `tabs+${report.createdTabs.length}, headers+${Object.keys(report.addedHeaders).length} tabs`,
  })]);

  return report;
}
