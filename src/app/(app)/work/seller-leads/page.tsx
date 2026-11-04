import { requirePage } from "@/lib/page-guard";
import { StatusBoard } from "@/components/StatusBoard";

export default async function SellerLeadsPage() {
  const role = await requirePage("/work/seller-leads");
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">คนต้องการขาย</h1>
        <p className="text-sm text-slate-500">ลูกค้าที่ต้องการขาย (Need = ขาย) แยกตาม Sell Status · ลากการ์ดไปคอลัมน์ใหม่เพื่อเปลี่ยนสถานะ · มีข้อมูลส่วนบุคคล เข้าถึงได้เฉพาะ Admin และ Sales</p>
      </div>
      <StatusBoard kind="seller" />
    </section>
  );
}
