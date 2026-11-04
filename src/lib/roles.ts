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

export type NavItem = { href: string; label: string; roles: Role[]; group?: string; icon?: string; children?: NavItem[] };

const ALL: Role[] = ["super_admin", "admin", "ae", "marketing"];
const MKT: Role[] = ["super_admin", "admin", "marketing"]; // ภาพรวม + การตลาด (Marketing ดูอย่างเดียว)
const SALES: Role[] = ["super_admin", "admin", "ae"]; // ฝ่ายขาย + Project
const DATA: Role[] = ["super_admin", "admin"]; // นำเข้า / ส่งออก / เป้าหมาย / คู่มือนำเข้า
const SUPER: Role[] = ["super_admin"];

// Marketing ไม่เห็น Leads/Sales (PII) ตามค่าเริ่มต้น
export const NAV: NavItem[] = [
  // จัดกลุ่มเมนู (31/10/2026): group = หัวข้อกลุ่มในเมนูด้านข้าง · icon = ชื่อไอคอนใน Sidebar (แสดงเมื่อย่อเมนู)
  { href: "/", label: "ภาพรวมการตลาด", roles: MKT, icon: "home" },
  { href: "/performance", label: "Marketing Performance", roles: MKT, group: "การตลาด", icon: "chart" },
  { href: "/facebook-page", label: "Facebook Page", roles: MKT, group: "การตลาด", icon: "page" },
  { href: "/facebook-ads", label: "Facebook Ads", roles: MKT, group: "การตลาด", icon: "megaphone" },
  { href: "/google-ads", label: "Google Ads", roles: MKT, group: "การตลาด", icon: "search" },
  { href: "/line-oa", label: "LINE OA", roles: MKT, group: "การตลาด", icon: "chat" },
  { href: "/website", label: "Website", roles: MKT, group: "การตลาด", icon: "globe" },
  { href: "/leads", label: "Leads", roles: SALES, group: "ฝ่ายขาย", icon: "users" },
  { href: "/seller-leads", label: "คนต้องการขาย", roles: SALES, group: "ฝ่ายขาย", icon: "board" },
  { href: "/buyer-leads", label: "คนต้องการซื้อ", roles: SALES, group: "ฝ่ายขาย", icon: "board" },
  { href: "/lead-report", label: "รายงาน Lead", roles: ALL, group: "ฝ่ายขาย", icon: "report" },
  { href: "/developers", label: "Developer", roles: SALES, group: "Project", icon: "building" },
  { href: "/sale-developer", label: "Sale developer", roles: SALES, group: "Project", icon: "board" },
  { href: "/home-builders", label: "Home Builder", roles: SALES, group: "Project", icon: "building" }, // 1/11/2026
  { href: "/sale-home-builder", label: "Sale home builder", roles: SALES, group: "Project", icon: "board" },
  { href: "/sales", label: "Revenue", roles: SALES, group: "Project", icon: "money" }, // ยอดขาย FlowAccount (มาจากโครงการหมู่บ้าน) — เปลี่ยนชื่อจาก Sales 31/10/2026
  { href: "/import", label: "นำเข้า CSV", roles: DATA, group: "ข้อมูล", icon: "upload" },
  { href: "/export", label: "ส่งออกข้อมูล", roles: DATA, group: "ข้อมูล", icon: "download" },
  // ตั้งค่า: เมนูย่อย — ตั้งค่าระบบ (Admin) · คู่มือนำเข้าข้อมูล และ คำอธิบายตัวเลข (ทุก Role)
  { href: "/settings", label: "ตั้งค่า", roles: ALL, icon: "gear", children: [
    { href: "/settings", label: "ตั้งค่าระบบ", roles: SUPER, icon: "gear" },
    { href: "/settings/targets", label: "เป้าหมายรายเดือน", roles: DATA, icon: "target" },
    { href: "/settings/import-guide", label: "คู่มือนำเข้าข้อมูล", roles: DATA, icon: "book" },
    { href: "/settings/metrics", label: "คำอธิบายตัวเลข", roles: MKT, icon: "info" },
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

/** หน้าแรกหลังเข้าสู่ระบบ: AE / Admin / Super Admin → Leads · Marketing → Facebook Ads (หน้าที่โหลดเบา) */
export const homeFor = (role: string) => (normRole(role) === "marketing" ? "/facebook-ads" : "/leads");

/** สิทธิ์เข้าหน้า (ใช้ NAV เป็นที่เดียว) · หน้าย่อยใช้สิทธิ์ของเมนูที่ยาวที่สุดที่ตรงกัน เช่น /settings/metrics/x → /settings/metrics · /sales/import = นำเข้า (DATA) */
const EXTRA: Record<string, Role[]> = { "/sales/import": DATA };
export function canAccess(role: Role | null | undefined, path: string): boolean {
  if (!role) return false;
  if (EXTRA[path]) return EXTRA[path].includes(role);
  const items = NAV.flatMap((n) => [n, ...(n.children ?? [])]).filter((n) => !n.children);
  const hit = items.filter((n) => path === n.href || (n.href !== "/" && path.startsWith(n.href + "/"))).sort((a, b) => b.href.length - a.href.length)[0];
  return !!hit && hit.roles.includes(role);
}
