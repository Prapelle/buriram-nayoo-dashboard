import { requirePage } from "@/lib/page-guard";
import { ProductsManager } from "@/components/ProductsManager";

export default async function ProductsPage() {
  const role = await requirePage("/account/products");
  return (
    <section className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Product</h1>
        <p className="text-sm text-slate-500">รายการ Product ชุดเดียวกับที่ใช้ในใบเสนอราคา และหน้า Developer / Home Builder · เพิ่ม แก้ไขชื่อ หรือลบ</p>
      </div>
      <ProductsManager canEdit={role === "super_admin" || role === "admin"} />
    </section>
  );
}
