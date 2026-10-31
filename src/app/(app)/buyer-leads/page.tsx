import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { StatusBoard } from "@/components/StatusBoard";

export default async function BuyerLeadsPage() {
  const s = await auth();
  const role = s?.user?.role;
  if (role !== "admin" && role !== "sales") redirect("/");
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Buyer Leads</h1>
        <p className="text-sm text-slate-500">ลูกค้าที่ต้องการซื้อ / เช่า / สร้าง แยกตาม Call Status · ลากการ์ดไปคอลัมน์ใหม่เพื่อเปลี่ยนสถานะ · มีข้อมูลส่วนบุคคล เข้าถึงได้เฉพาะ Admin และ Sales</p>
      </div>
      <StatusBoard kind="buyer" />
    </section>
  );
}
