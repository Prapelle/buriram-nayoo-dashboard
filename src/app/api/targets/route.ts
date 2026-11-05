import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { migratingResponse } from "@/lib/http-errors";
import { requireRole } from "@/lib/guard";
import { listTargets, saveTarget, TargetError, type SaveTargetInput } from "@/lib/targets";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof TargetError) return NextResponse.json({ error: e.message, code: e.code, fields: e.fields }, { status: e.status });
  { { const mg = migratingResponse(e); if (mg) return mg; } logError("/api/targets", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 }); }
}

// เป้าหมายรายเดือน: ดูได้ทุก Role · แก้ไขได้เฉพาะ Admin / Marketing
export async function GET() {
  const g = await requireRole(["admin", "marketing", "ae", "production"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json({ targets: await listTargets() }); } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await saveTarget((await req.json()) as SaveTargetInput, g.email)); } catch (e) { return fail(e); }
}
