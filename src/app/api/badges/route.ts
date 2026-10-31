import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { listLeads } from "@/lib/leads-service";
import { followUps } from "@/lib/lead-insights";
import { todayBkk } from "@/lib/leads";

export const dynamic = "force-dynamic";

// ตัวเลขแจ้งเตือนบนเมนู (31/10/2026): Leads = เลยกำหนดติดตาม + ต้องติดตามวันนี้ · เฉพาะ Admin / Sales (ส่งเฉพาะจำนวน ไม่มีข้อมูลลูกค้า)
export async function GET() {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try {
    const { rows } = await listLeads();
    const f = followUps(rows as unknown as Record<string, string>[], todayBkk());
    return NextResponse.json({ leads: f.overdue.length + f.today.length, overdue: f.overdue.length });
  } catch { return NextResponse.json({ leads: 0, overdue: 0 }); }
}
