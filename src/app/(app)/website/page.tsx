import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { WebsiteManager } from "@/components/WebsiteManager";

export default async function WebsitePage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  return (
    <section className="max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Website</h1>
        <p className="text-sm text-slate-500">ข้อมูลเว็บไซต์จาก Google Analytics 4 และ Google Search Console — เก็บแยกจากข้อมูล Social และโฆษณา · ตัวเลขสรุปดูที่หน้า Marketing Performance</p>
      </div>
      <WebsiteManager isAdmin={role === "admin"} />
    </section>
  );
}
