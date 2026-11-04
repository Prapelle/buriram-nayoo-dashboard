import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAccess, normRole, type Role } from "./roles";

/** ตรวจสิทธิ์เข้าหน้า (ฝั่ง Server) ตามเมนูใน roles.ts — ไม่มีสิทธิ์ → หน้าแรกของ Role (/home) · ไม่ได้ล็อกอิน → /login */
export async function requirePage(path: string): Promise<Role> {
  const role = normRole((await auth())?.user?.role);
  if (!role) redirect("/login");
  if (!canAccess(role, path)) redirect("/");
  return role;
}
