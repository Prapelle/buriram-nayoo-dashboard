import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TargetsManager } from "@/components/TargetsManager";

export default async function TargetsPage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  return (
    <section className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">เป้าหมายรายเดือน</h1>
        <p className="text-sm text-slate-500">ตั้งงบโฆษณาและเป้าจำนวน Lead แยกแต่ละเดือน (เปลี่ยนได้ทุกเดือน) · หน้า ภาพรวมการตลาด จะแสดงยอดจริงเทียบกับเป้า</p>
      </div>
      <TargetsManager canEdit />
    </section>
  );
}
