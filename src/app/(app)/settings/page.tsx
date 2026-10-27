import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { HealthCheck } from "@/components/HealthCheck";
import { InitButton } from "@/components/InitButton";
import { UsersManager } from "@/components/UsersManager";

export default async function SettingsPage() {
  const s = await auth();
  if (s?.user?.role !== "admin") redirect("/");
  return (
    <section className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">ตั้งค่า</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold">สมาชิกและสิทธิ์</h2>
        <p className="mb-4 text-sm text-slate-600">เพิ่มสมาชิกด้วยอีเมล Google แล้วเลือก Role · ข้อมูลเก็บในแท็บ APP_USERS ของ Google Sheet</p>
        <UsersManager />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold">ฐานข้อมูล Google Sheets</h2>
        <p className="mb-4 text-sm text-slate-600">
          สร้างแท็บและ Header ที่ขาด เพิ่มผู้ใช้ Admin คนแรก และค่า Config เริ่มต้น โดยไม่ลบหรือแก้ข้อมูลเดิม
        </p>
        <InitButton />
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold">ตรวจสอบระบบ</h2>
        <p className="mb-4 text-sm text-slate-600">เช็กว่า Secrets ครบ เชื่อมต่อ Google Sheets ได้ แท็บและผู้ใช้พร้อม (ไม่แสดงค่าลับ)</p>
        <HealthCheck />
      </div>
    </section>
  );
}
