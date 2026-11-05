/**
 * กลุ่มแท็บที่ย้ายจาก Google Sheets ไป D1 ทีละกลุ่ม (สลับทั้งกลุ่มพร้อมกัน)
 * รอบที่ 1 = core: ผู้ใช้/Config/Audit, Developer + Home Builder, ระบบบัญชี, Production Job
 * รอบถัดไปเพิ่มกลุ่มใหม่ที่นี่ (Leads, ข้อมูลนำเข้าการตลาด, Sales ฯลฯ)
 */
export const GROUP_TABS: Record<string, string[]> = {
  core: [
    "APP_USERS", "APP_CONFIG", "AUDIT_LOG",
    "DEVELOPERS", "DEVELOPER_PRODUCTS", "DEVELOPER_STATUS_LOG", "DEVELOPER_CONTACTS",
    "ACC_DOCS", "ACC_LINES", "ACC_PAYMENTS", "ACC_FILES", "ACC_CUSTOMERS", "PRODUCTION_JOBS",
  ],
};

export const GROUP_LABEL: Record<string, string> = {
  core: "แกนหลัก: ผู้ใช้ · Developer / Home Builder · ระบบบัญชี · Production Job",
};

export const tabsOfGroups = (groups: string[]) => groups.flatMap((g) => GROUP_TABS[g] ?? []);

/** sheetId สมมติของตารางบน D1 (ติดลบ ไม่ชนกับ sheetId จริงของ Google) ใช้กับ listTabs → deleteRow */
const ALL = Object.values(GROUP_TABS).flat().sort();
export const d1SheetId = (tab: string) => -(ALL.indexOf(tab) + 1);
export const d1TabOfSheetId = (id: number) => (id < 0 ? ALL[-id - 1] : undefined);
