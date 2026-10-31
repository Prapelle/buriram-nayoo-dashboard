export type Role = "admin" | "marketing" | "sales";
export const ROLES: Role[] = ["admin", "marketing", "sales"];

export type NavItem = { href: string; label: string; roles: Role[]; group?: string; icon?: string; children?: NavItem[] };

const ALL: Role[] = ["admin", "marketing", "sales"];
const MKT: Role[] = ["admin", "marketing"];
const SALES: Role[] = ["admin", "sales"];

// Marketing ไม่เห็น Leads/Sales (PII) ตามค่าเริ่มต้น
export const NAV: NavItem[] = [
  // จัดกลุ่มเมนู (31/10/2026): group = หัวข้อกลุ่มในเมนูด้านข้าง · icon = ชื่อไอคอนใน Sidebar (แสดงเมื่อย่อเมนู)
  { href: "/", label: "ภาพรวมการตลาด", roles: ALL, icon: "home" },
  { href: "/performance", label: "Marketing Performance", roles: MKT, group: "การตลาด", icon: "chart" },
  { href: "/facebook-page", label: "Facebook Page", roles: MKT, group: "การตลาด", icon: "page" },
  { href: "/facebook-ads", label: "Facebook Ads", roles: MKT, group: "การตลาด", icon: "megaphone" },
  { href: "/google-ads", label: "Google Ads", roles: MKT, group: "การตลาด", icon: "search" },
  { href: "/line-oa", label: "LINE OA", roles: MKT, group: "การตลาด", icon: "chat" },
  { href: "/website", label: "Website", roles: MKT, group: "การตลาด", icon: "globe" },
  { href: "/leads", label: "Leads", roles: SALES, group: "ฝ่ายขาย", icon: "users" },
  { href: "/seller-leads", label: "Seller Leads", roles: SALES, group: "ฝ่ายขาย", icon: "board" },
  { href: "/buyer-leads", label: "Buyer Leads", roles: SALES, group: "ฝ่ายขาย", icon: "board" },
  { href: "/lead-report", label: "รายงาน Lead", roles: ALL, group: "ฝ่ายขาย", icon: "report" },
  { href: "/sales", label: "Sales", roles: SALES, group: "ฝ่ายขาย", icon: "money" },
  { href: "/developers", label: "Developer", roles: SALES, group: "โครงการหมู่บ้าน", icon: "building" },
  { href: "/sale-developer", label: "Sale developer", roles: SALES, group: "โครงการหมู่บ้าน", icon: "board" },
  { href: "/import", label: "นำเข้า CSV", roles: MKT, group: "ข้อมูล", icon: "upload" },
  { href: "/export", label: "ส่งออกข้อมูล", roles: ALL, group: "ข้อมูล", icon: "download" },
  // ตั้งค่า: เมนูย่อย — ตั้งค่าระบบ (Admin) · คู่มือนำเข้าข้อมูล และ คำอธิบายตัวเลข (ทุก Role)
  { href: "/settings", label: "ตั้งค่า", roles: ALL, icon: "gear", children: [
    { href: "/settings", label: "ตั้งค่าระบบ", roles: ["admin"], icon: "gear" },
    { href: "/settings/targets", label: "เป้าหมายรายเดือน", roles: MKT, icon: "target" },
    { href: "/settings/import-guide", label: "คู่มือนำเข้าข้อมูล", roles: ALL, icon: "book" },
    { href: "/settings/metrics", label: "คำอธิบายตัวเลข", roles: ALL, icon: "info" },
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
