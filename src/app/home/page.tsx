import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { homeFor } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** หน้าแรกหลังเข้าสู่ระบบ (4/11/2026): หน้าเลือกระบบ "/" (Dashboard / ติดตามงาน / บัญชี / Production) */
export default async function Home() {
  const role = (await auth())?.user?.role;
  redirect(role ? homeFor(role) : "/login");
}
