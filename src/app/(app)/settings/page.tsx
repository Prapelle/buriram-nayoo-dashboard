import { requirePage } from "@/lib/page-guard";
import { HealthCheck } from "@/components/HealthCheck";
import { UsersManager } from "@/components/UsersManager";

export default async function SettingsPage() {
  await requirePage("/settings");
  return (
    <section className="max-w-3xl space-y-6">
      <h1 className="text-[26px] font-bold tracking-tight">ตั้งค่า</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold">สมาชิกและสิทธิ์</h2>
        <p className="mb-4 text-sm text-slate-600">เพิ่มสมาชิกด้วยอีเมล Google แล้วเลือก Role · ข้อมูลเก็บในแท็บ APP_USERS ของ Google Sheet</p>
        <UsersManager />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold">ตรวจสอบระบบ</h2>
        <p className="mb-4 text-sm text-slate-600">เช็กว่า Secrets ครบ เชื่อมต่อ Google Sheets ได้ แท็บและผู้ใช้พร้อม (ไม่แสดงค่าลับ)</p>
        <HealthCheck />
      </div>
    </section>
  );
}
