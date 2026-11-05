import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { migratingResponse } from "@/lib/http-errors";
import { requireRole } from "@/lib/guard";
import { LineError, listLine, saveLine } from "@/lib/line-oa-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof LineError) return NextResponse.json({ error: e.message, code: e.code, fields: e.fields }, { status: e.status });
  { { const mg = migratingResponse(e); if (mg) return mg; } logError("/api/line-oa", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 }); }
}

export async function GET() {
  const g = await requireRole(["admin", "marketing", "production"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json({ rows: await listLine() }); } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await saveLine((await req.json()) as Record<string, unknown>, g.email)); } catch (e) { return fail(e); }
}
