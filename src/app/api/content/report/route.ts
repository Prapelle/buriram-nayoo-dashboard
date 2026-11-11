import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { contentFail } from "@/lib/content-http";
import { getReport, markReports } from "@/lib/content-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// รายงานลูกค้า: ดู / บันทึกว่าทำรายงานเสร็จ-ส่งแล้ว = Super Admin, Admin, AE, Production
export async function GET(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production", "observer"]);
  if (!g.ok) return g.res;
  const u = new URL(req.url).searchParams;
  try { return NextResponse.json(await getReport(u.get("customer") ?? "", u.get("from") ?? "", u.get("to") ?? "", u.get("sent") === "1")); } catch (e) { return contentFail("/api/content/report GET", e); }
}
export async function POST(req: Request) {
  const g = await requireRole(["admin", "ae", "production"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json().catch(() => ({}))) as { card_ids?: unknown; stage?: unknown; report_link?: unknown };
    return NextResponse.json(await markReports(Array.isArray(b.card_ids) ? b.card_ids.map(String) : [], String(b.stage ?? ""), String(b.report_link ?? ""), g.email));
  } catch (e) { return contentFail("/api/content/report POST", e); }
}
