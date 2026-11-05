import { redirect } from "next/navigation";
import { requirePage } from "@/lib/page-guard";

// หน้า Job เดิมปิดแล้ว — งาน Production ทั้งหมดอยู่ที่บอร์ด Content (ลิงก์/บุ๊กมาร์กเก่าพามาที่นี่)
export default async function ProductionPage() { await requirePage("/production"); redirect("/production/content"); }
