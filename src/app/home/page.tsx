import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { homeFor } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** หน้าแรกหลังเข้าสู่ระบบ (2/11/2026): ไปหน้าที่โหลดเบาตาม Role — ไม่เปิดหน้าภาพรวม (อ่านข้อมูลการตลาดทั้งหมด) ทุกครั้งที่เข้าเว็บ */
export default async function Home() {
  const role = (await auth())?.user?.role;
  redirect(role ? homeFor(role) : "/login");
}
