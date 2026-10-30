export type Role = "admin" | "marketing" | "sales";
export const ROLES: Role[] = ["admin", "marketing", "sales"];

export type NavItem = { href: string; label: string; roles: Role[]; children?: NavItem[] };

const ALL: Role[] = ["admin", "marketing", "sales"];
const MKT: Role[] = ["admin", "marketing"];
const SALES: Role[] = ["admin", "sales"];

// Marketing ไม่เห็น Leads/Sales (PII) ตามค่าเริ่มต้น
export const NAV: NavItem[] = [
  { href: "/", label: "ภาพรวมการตลาด", roles: ALL },
  { href: "/performance", label: "Marketing Performance", roles: MKT },
  { href: "/import", label: "นำเข้า CSV", roles: MKT },
  { href: "/facebook-page", label: "Facebook Page", roles: MKT },
  { href: "/facebook-ads", label: "Facebook Ads", roles: MKT },
  { href: "/google-ads", label: "Google Ads", roles: MKT },
  { href: "/line-oa", label: "LINE OA", roles: MKT },
  { href: "/website", label: "Website", roles: MKT },
  { href: "/leads", label: "Leads", roles: SALES },
  { href: "/seller-leads", label: "Seller Leads", roles: SALES },
  { href: "/buyer-leads", label: "Buyer Leads", roles: SALES },
  { href: "/lead-report", label: "รายงาน Lead", roles: ALL },
  { href: "/developers", label: "Developer", roles: SALES },
  { href: "/sale-developer", label: "Sale developer", roles: SALES },
  { href: "/sales", label: "Sales", roles: SALES },
  { href: "/export", label: "ส่งออกข้อมูล", roles: ALL },
  // ตั้งค่า: เมนูย่อย — ตั้งค่าระบบ (Admin) · คู่มือนำเข้าข้อมูล และ คำอธิบายตัวเลข (ทุก Role)
  { href: "/settings", label: "ตั้งค่า", roles: ALL, children: [
    { href: "/settings", label: "ตั้งค่าระบบ", roles: ["admin"] },
    { href: "/settings/targets", label: "เป้าหมายรายเดือน", roles: MKT },
    { href: "/settings/import-guide", label: "คู่มือนำเข้าข้อมูล", roles: ALL },
    { href: "/settings/metrics", label: "คำอธิบายตัวเลข", roles: ALL },
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
