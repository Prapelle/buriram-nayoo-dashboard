/**
 * กลุ่มแท็บที่ย้ายจาก Google Sheets ไป D1 ทีละกลุ่ม (สลับทั้งกลุ่มพร้อมกัน)
 * รอบที่ 1 = core: ผู้ใช้/Config/Audit, Developer + Home Builder, ระบบบัญชี, Production Job
 * รอบถัดไปเพิ่มกลุ่มใหม่ที่นี่ (Leads, ข้อมูลนำเข้าการตลาด, Sales ฯลฯ)
 */
import { TABS } from "./schema";

const MARKETING_TABS = ["IMPORT_BATCHES", "IMPORT_ERRORS", ...TABS.filter((t) => t.group === "marketing" && t.name !== "FB_PAGE_POSTS").map((t) => t.name)];

export const GROUP_TABS: Record<string, string[]> = {
  core: [
    "APP_USERS", "APP_CONFIG", "AUDIT_LOG",
    "DEVELOPERS", "DEVELOPER_PRODUCTS", "DEVELOPER_STATUS_LOG", "DEVELOPER_CONTACTS",
    "ACC_DOCS", "ACC_LINES", "ACC_PAYMENTS", "ACC_FILES", "ACC_CUSTOMERS", "PRODUCTION_JOBS",
  ],
  // รอบ 3: กลุ่มที่เหลือ — แยกเล็ก/ใหญ่ เพื่อสลับทีละกลุ่มและย้อนกลับแยกกันได้
  leads: ["LEADS", "LEAD_PROPERTIES"],
  sales: ["SALES", "SALES_TRANSACTIONS", "SALES_IMPORT_LOG", "MONTHLY_TARGETS", "LINE_OA_MONTHLY", "SERVICE_CATALOG", "AREA_MAPPINGS"],
  marketing: MARKETING_TABS, // ข้อมูลนำเข้า Meta Ads / Google Ads / Website / Facebook Page ระดับเพจ + ประวัติการนำเข้า
  fbposts: ["FB_PAGE_POSTS"], // สถิติโพสต์ Facebook — ตารางใหญ่สุด แยกไว้ท้ายสุด ให้กด "ตรวจ" ก่อนเสมอ
};

export const GROUP_LABEL: Record<string, string> = {
  core: "แกนหลัก: ผู้ใช้ · Developer / Home Builder · ระบบบัญชี · Production Job",
  leads: "Leads (ผู้ซื้อ / ผู้ขาย) + ทรัพย์ของ Lead",
  sales: "Sales / Revenue · เป้าหมายรายเดือน · LINE OA · แคตตาล็อกบริการ · Area mapping",
  marketing: "ข้อมูลนำเข้าการตลาด: Meta Ads · Google Ads · Website · Facebook Page รายวัน + ประวัติการนำเข้า",
  fbposts: "สถิติโพสต์ Facebook (ตารางใหญ่ที่สุด — กด ตรวจ ก่อนสลับ)",
};

/** ตารางที่ "เกิดบน D1" ไม่มีต้นทางใน Google Sheets — ใช้ D1 เสมอเมื่อผูก binding DB (ไม่ต้องย้าย/สลับ) */
export const NATIVE_TABS = ["CONTENT_CARDS", "CONTENT_MEMBERS", "CONTENT_HISTORY", "PRODUCT_SETTINGS"];

export const tabsOfGroups = (groups: string[]) => groups.flatMap((g) => GROUP_TABS[g] ?? []);

/** sheetId สมมติของตารางบน D1 (ติดลบ ไม่ชนกับ sheetId จริงของ Google) ใช้กับ listTabs → deleteRow */
const ALL = [...Object.values(GROUP_TABS).flat(), ...NATIVE_TABS].sort();
export const d1SheetId = (tab: string) => -(ALL.indexOf(tab) + 1);
export const d1TabOfSheetId = (id: number) => (id < 0 ? ALL[-id - 1] : undefined);
