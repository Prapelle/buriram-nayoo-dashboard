/**
 * Role (4/11/2026)
 * - super_admin: ทำได้ทุกอย่าง (เดิม admin) · ตั้งค่าระบบ / ผู้ใช้ / เตรียม Sheet / ลบข้อมูล / ยืนยันนำเข้าไฟล์ซ้ำ
 * - admin: เห็นทุกหน้า (ยกเว้นตั้งค่าระบบ) · นำเข้า CSV · เพิ่ม/แก้ข้อมูลได้ แต่ลบไม่ได้
 * - ae: ฝ่ายขาย + Project (เดิม sales — ค่า "sales" ใน Sheet ถือเป็น ae)
 * - marketing: ดูอย่างเดียว — ภาพรวม · การตลาด · รายงาน Lead · คำอธิบายตัวเลข
 */
export type Role = "super_admin" | "admin" | "ae" | "marketing";
export const ROLES: Role[] = ["super_admin", "admin", "ae", "marketing"];
export const ROLE_LABEL: Record<Role, string> = { super_admin: "Super Admin", admin: "Admin", ae: "AE", marketing: "Marketing" };
export const normRole = (v: unknown): Role | null => {
  const r = String(v ?? "").trim().toLowerCase();
  if (r === "sales") return "ae"; // ชื่อเดิม
  return (ROLES as string[]).includes(r) ? (r as Role) : null;
};
/** ลบข้อมูลได้ (Lead / Developer / Home Builder / Product) — Admin ลบไม่ได้ */
export const canDelete = (role: Role) => role === "super_admin" || role === "ae";
/** ยืนยันนำเข้าไฟล์ที่เคยนำเข้าแล้ว — Super Admin เท่านั้น */
export const canOverrideImport = (role: Role) => role === "super_admin";
/** เพิ่ม / แก้ข้อมูลการตลาด (LINE OA, Website, เป้าหมาย, นำเข้า) */
export const canEditMarketing = (role: Role) => role === "super_admin" || role === "admin";

/**
 * ระบบย่อย (4/11/2026): แยกด้วย path — /dashboard = Dashboard การตลาด · /work = ติดตามงาน
 * หน้าที่ใช้ร่วมกัน (รายงาน Lead, ตั้งค่า) อยู่ที่ path เดิม และแสดงในเมนูของทุกระบบ
 * บัญชี / Production: เปิดใช้ 5/11/2026
 */
export type SystemId = "dashboard" | "work" | "account" | "production";
export type NavItem = { href: string; label: string; roles: Role[]; group?: string; icon?: string; children?: NavItem[]; system?: SystemId | "shared" };

const ALL: Role[] = ["super_admin", "admin", "ae", "marketing"];
const MKT: Role[] = ["super_admin", "admin", "marketing"]; // ภาพรวม + การตลาด (Marketing ดูอย่างเดียว)
const SALES: Role[] = ["super_admin", "admin", "ae"]; // ฝ่ายขาย + Project
const DATA: Role[] = ["super_admin", "admin"]; // นำเข้า / ส่งออก / เป้าหมาย / คู่มือนำเข้า
const SUPER: Role[] = ["super_admin"];

// Marketing ไม่เห็น Leads/Sales (PII) ตามค่าเริ่มต้น
export const NAV: NavItem[] = [
  // จัดกลุ่มเมนู (31/10/2026): group = หัวข้อกลุ่มในเมนูด้านข้าง · icon = ชื่อไอคอนใน Sidebar (แสดงเมื่อย่อเมนู)
  { href: "/dashboard", label: "ภาพรวมการตลาด", roles: MKT, icon: "home", system: "dashboard" },
  { href: "/dashboard/performance", label: "Marketing Performance", roles: MKT, group: "การตลาด", icon: "chart", system: "dashboard" },
  { href: "/dashboard/facebook-page", label: "Facebook Page", roles: MKT, group: "การตลาด", icon: "page", system: "dashboard" },
  { href: "/dashboard/facebook-ads", label: "Facebook Ads", roles: MKT, group: "การตลาด", icon: "megaphone", system: "dashboard" },
  { href: "/dashboard/google-ads", label: "Google Ads", roles: MKT, group: "การตลาด", icon: "search", system: "dashboard" },
  { href: "/dashboard/line-oa", label: "LINE OA", roles: MKT, group: "การตลาด", icon: "chat", system: "dashboard" },
  { href: "/dashboard/website", label: "Website", roles: MKT, group: "การตลาด", icon: "globe", system: "dashboard" },
  { href: "/work/leads", label: "Leads", roles: SALES, group: "ฝ่ายขาย", icon: "users", system: "work" },
  { href: "/work/seller-leads", label: "คนต้องการขาย", roles: SALES, group: "ฝ่ายขาย", icon: "board", system: "work" },
  { href: "/work/buyer-leads", label: "คนต้องการซื้อ", roles: SALES, group: "ฝ่ายขาย", icon: "board", system: "work" },
  { href: "/lead-report", label: "รายงาน Lead", roles: ALL, group: "รายงาน", icon: "report", system: "shared" },
  { href: "/work/developers", label: "Developer", roles: SALES, group: "Project", icon: "building", system: "work" },
  { href: "/work/sale-developer", label: "Sale developer", roles: SALES, group: "Project", icon: "board", system: "work" },
  { href: "/work/home-builders", label: "Home Builder", roles: SALES, group: "Project", icon: "building", system: "work" }, // 1/11/2026
  { href: "/work/sale-home-builder", label: "Sale home builder", roles: SALES, group: "Project", icon: "board", system: "work" },
  { href: "/work/sales", label: "Revenue", roles: SALES, group: "Project", icon: "money", system: "work" }, // ยอดขาย FlowAccount (มาจากโครงการหมู่บ้าน) — เปลี่ยนชื่อจาก Sales 31/10/2026
  // ระบบบัญชี + Production (5/11/2026): ดู/ออกเอกสาร = Super Admin, Admin, AE · ยืนยันชำระเงิน/เริ่มงาน/แก้ Job = Super Admin, Admin (ตรวจที่ API)
  { href: "/account", label: "เอกสารบัญชี", roles: SALES, icon: "money", system: "account" },
  { href: "/production", label: "งาน Production", roles: SALES, icon: "board", system: "production" },
  { href: "/dashboard/import", label: "นำเข้า CSV", roles: DATA, group: "ข้อมูล", icon: "upload", system: "dashboard" },
  { href: "/dashboard/export", label: "ส่งออกข้อมูล", roles: DATA, group: "ข้อมูล", icon: "download", system: "dashboard" },
  // ตั้งค่า: เมนูย่อย — ตั้งค่าระบบ (Admin) · คู่มือนำเข้าข้อมูล และ คำอธิบายตัวเลข (ทุก Role)
  { href: "/settings", label: "ตั้งค่า", roles: ALL, icon: "gear", system: "shared", children: [
    { href: "/settings", label: "ตั้งค่าระบบ", roles: SUPER, icon: "gear", system: "shared" },
    { href: "/settings/targets", label: "เป้าหมายรายเดือน", roles: DATA, icon: "target", system: "dashboard" },
    { href: "/settings/import-guide", label: "คู่มือนำเข้าข้อมูล", roles: DATA, icon: "book", system: "dashboard" },
    { href: "/settings/metrics", label: "คำอธิบายตัวเลข", roles: MKT, icon: "info", system: "shared" },
  ] },
];

/** เมนูตาม Role: ตัดเมนูย่อยที่ไม่มีสิทธิ์ · เมนูหลักชี้ไปเมนูย่อยแรกที่เข้าได้ (ไม่มีเมนูย่อยเหลือ = ซ่อน) */
export function navFor(role: Role): NavItem[] {
  return NAV.filter((n) => n.roles.includes(role)).flatMap((n) => {
    if (!n.children) return [n];
    const children = n.children.filter((c) => c.roles.includes(role));
    return children.length ? [{ ...n, href: children[0].href, children }] : [];
  });
}

export type SystemDef = { id: SystemId; label: string; desc: string; href: string; prefix: string; roles: Role[]; soon?: boolean };
/** ระบบย่อยทั้งหมด (ปุ่มแถบด้านบน + หน้าเลือกระบบ "/") · href = หน้าแรกของระบบ (หน้าที่โหลดเบา) */
export const SYSTEMS: SystemDef[] = [
  { id: "dashboard", label: "Dashboard", desc: "การตลาด · Facebook / Google / LINE OA / Website · นำเข้า-ส่งออกข้อมูล", href: "/dashboard/facebook-ads", prefix: "/dashboard", roles: MKT },
  { id: "work", label: "ติดตามงาน", desc: "Leads คนต้องการซื้อ / ขาย · Developer · Home Builder · Revenue", href: "/work/leads", prefix: "/work", roles: SALES },
  { id: "account", label: "บัญชี", desc: "ใบเสนอราคา · ใบวางบิล · ใบแจ้งหนี้ · ยืนยันชำระเงิน → เพิ่ม Product ให้ลูกค้า", href: "/account", prefix: "/account", roles: SALES },
  { id: "production", label: "Production", desc: "งานผลิตที่สร้างอัตโนมัติจากการชำระเงิน · เช็กลิสต์ตามรายละเอียดแพ็กเกจ", href: "/production", prefix: "/production", roles: SALES },
];
export const systemsFor = (role: Role) => SYSTEMS.filter((x) => !x.soon && x.roles.includes(role));
/** ระบบของ path (หน้าที่ใช้ร่วมกันคืน null) */
export const systemOf = (path: string): SystemId | null => SYSTEMS.find((x) => path === x.prefix || path.startsWith(x.prefix + "/"))?.id ?? null;
/** เมนูของระบบหนึ่ง = เมนูของระบบนั้น + เมนูที่ใช้ร่วมกัน */
export const navOfSystem = (items: NavItem[], sys: SystemId | null) => items.filter((n) => n.system === "shared" || !n.system || n.system === sys)
  .map((n) => (n.children ? { ...n, children: n.children.filter((c) => c.system === "shared" || !c.system || c.system === sys) } : n))
  .map((n) => (n.children && n.children.length ? { ...n, href: n.children[0].href } : n))
  .filter((n) => !n.children || n.children.length);

/** หน้าแรกหลังเข้าสู่ระบบ = หน้าเลือกระบบ (4/11/2026) */
export const homeFor = (_role?: string) => "/";

/** สิทธิ์เข้าหน้า (ใช้ NAV เป็นที่เดียว) · หน้าย่อยใช้สิทธิ์ของเมนูที่ยาวที่สุดที่ตรงกัน เช่น /settings/metrics/x → /settings/metrics · /sales/import = นำเข้า (DATA) */
const EXTRA: Record<string, Role[]> = { "/work/sales/import": DATA, "/": ALL };
export function canAccess(role: Role | null | undefined, path: string): boolean {
  if (!role) return false;
  if (EXTRA[path]) return EXTRA[path].includes(role);
  const items = NAV.flatMap((n) => [n, ...(n.children ?? [])]).filter((n) => !n.children);
  const hit = items.filter((n) => path === n.href || (n.href !== "/" && path.startsWith(n.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0];
  return !!hit && hit.roles.includes(role);
}
