import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { StatusBoard } from "@/components/StatusBoard";

export default async function SellerLeadsPage() {
  const s = await auth();
  const role = s?.user?.role;
  if (role !== "admin" && role !== "sales") redirect("/");
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Seller Leads</h1>
        <p className="text-sm text-slate-500">ลูกค้าที่ต้องการขาย (Need = ขาย) แยกตาม Sell Status · ลากการ์ดไปคอลัมน์ใหม่เพื่อเปลี่ยนสถานะ · มีข้อมูลส่วนบุคคล เข้าถึงได้เฉพาะ Admin และ Sales</p>
      </div>
      <StatusBoard kind="seller" />
    </section>
  );
}
