import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { getBoard, saveProductSetting } from "@/lib/content-service";
import { contentFail } from "@/lib/content-http";

export const dynamic = "force-dynamic";

// ตั้งค่าต่อ Product: จำนวนโพสต์ + ระยะติดตามผล = Super Admin, Admin, AE
export async function GET() {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json({ settings: (await getBoard()).settings }); } catch (e) { return contentFail("/api/content/products GET", e); }
}
export async function PUT(req: Request) {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { const b = (await req.json().catch(() => ({}))) as Record<string, unknown>; return NextResponse.json(await saveProductSetting(String(b.product ?? ""), b.content_count, b.report_days, g.email)); } catch (e) { return contentFail("/api/content/products PUT", e); }
}
