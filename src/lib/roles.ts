export type Role = "admin" | "marketing" | "sales";
export const ROLES: Role[] = ["admin", "marketing", "sales"];

export type NavItem = { href: string; label: string; roles: Role[] };

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
  { href: "/sales", label: "Sales", roles: SALES },
  { href: "/export", label: "ส่งออกข้อมูล", roles: ALL },
  { href: "/settings", label: "ตั้งค่า", roles: ["admin"] },
];
