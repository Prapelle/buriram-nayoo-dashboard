import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LineOaManager } from "@/components/LineOaManager";

export default async function LineOaPage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  return (
    <section className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">LINE OA</h1>
        <p className="text-sm text-slate-500">บันทึกผลรายเดือน หนึ่งแถวต่อหนึ่งเดือน · ช่องที่ไม่มีข้อมูลให้เว้นว่าง (ไม่ต้องใส่ 0)</p>
      </div>
      <LineOaManager />
    </section>
  );
}
