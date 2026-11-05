import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { contentFail } from "@/lib/content-http";
import { deleteCard, getBoard, moveCard, saveCard } from "@/lib/content-service";

export const dynamic = "force-dynamic";

const body = async (req: Request) => ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

// บอร์ด Content: ดู / สร้าง-แก้ / ย้ายสถานะ = Super Admin, Admin, AE, Production · ลบ = Super Admin, AE
export async function GET() {
  const g = await requireRole(["admin", "ae", "production"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await getBoard()); } catch (e) { return contentFail("/api/content GET", e); }
}
export async function POST(req: Request) {
  const g = await requireRole(["admin", "ae", "production"]);
  if (!g.ok) return g.res;
  try { const b = await body(req); return NextResponse.json(await saveCard(b, g.email, b.card_id ? String(b.card_id) : undefined)); } catch (e) { return contentFail("/api/content POST", e); }
}
export async function PATCH(req: Request) {
  const g = await requireRole(["admin", "ae", "production"]);
  if (!g.ok) return g.res;
  try { const b = await body(req); return NextResponse.json(await moveCard(String(b.card_id ?? ""), String(b.stage ?? ""), g.email, b.updated_at_seen === undefined ? undefined : String(b.updated_at_seen))); } catch (e) { return contentFail("/api/content PATCH", e); }
}
export async function DELETE(req: Request) {
  const g = await requireRole(["ae"]);
  if (!g.ok) return g.res;
  try { await deleteCard(String((await body(req)).card_id ?? ""), g.email); return NextResponse.json({ ok: true }); } catch (e) { return contentFail("/api/content DELETE", e); }
}
