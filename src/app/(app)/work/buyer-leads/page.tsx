import { requirePage } from "@/lib/page-guard";
import { StatusBoard } from "@/components/StatusBoard";

export default async function BuyerLeadsPage() {
  const role = await requirePage("/work/buyer-leads");
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">คนต้องการซื้อ</h1>
        <p className="text-sm text-slate-500">ลูกค้าที่ต้องการซื้อ / เช่า / สร้าง แยกตาม Call Status · ลากการ์ดไปคอลัมน์ใหม่เพื่อเปลี่ยนสถานะ · มีข้อมูลส่วนบุคคล เข้าถึงได้เฉพาะ Super Admin, Admin และ AE</p>
      </div>
      <StatusBoard kind="buyer" />
    </section>
  );
}
