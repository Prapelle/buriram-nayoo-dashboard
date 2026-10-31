import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ExportForm, type DatasetInfo } from "@/components/ExportForm";
import { ALL_CHANNELS } from "@/lib/dashboard";
import { NEEDS } from "@/lib/lead-options";
import { DATASETS } from "@/lib/export/datasets";
import { readColumns } from "@/lib/tabdata";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  const role = (await auth())?.user?.role;
  if (!role) redirect("/login"); // layout ก็พาไป /login อยู่แล้ว แต่ page เรนเดอร์พร้อมกัน จึงต้องไม่ถือว่ามีเซสชันเสมอ
  const datasets: DatasetInfo[] = DATASETS.filter((d) => d.roles.includes(role)).map((d) => ({
    id: d.id, label: d.label, group: d.group, filename: d.filename, note: d.note, grain: d.grain, sensitive: d.sensitive, route: d.route, applies: d.applies,
  }));
  let campaigns: string[] = [];
  try {
    const src: [string, string][] = role === "sales" ? [["LEADS", "campaign_name"], ["SALES", "campaign_name"]] : [["META_ADS", "ad_set_name"], ["GOOGLE_ADS_CAMPAIGNS", "campaign_name"], ...(role === "admin" ? [["LEADS", "campaign_name"], ["SALES", "campaign_name"]] as [string, string][] : [])];
    const lists = await Promise.all(src.map(async ([t, c]) => (await readColumns(t, { only: [c] })).rows.map((r) => r[c])));
    campaigns = [...new Set(lists.flat().filter(Boolean))].sort();
  } catch { /* ไม่มีรายการ Campaign ก็ยังพิมพ์เองได้ */ }
  return (
    <section className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">ส่งออกข้อมูล</h1>
        <p className="text-sm text-slate-500">ดาวน์โหลดเป็น CSV เพื่อใช้ต่อใน Excel / Google Sheets · แต่ละไฟล์เป็นข้อมูลระดับเดียว (ดู ระดับข้อมูล) · ไฟล์กลุ่ม สรุป เป็นตัวเลขที่สรุปแล้ว ห้ามนำไปบวกกับไฟล์ต้นฉบับ</p>
      </div>
      <ExportForm datasets={datasets} channels={ALL_CHANNELS} campaigns={campaigns} needs={NEEDS} />
    </section>
  );
}
