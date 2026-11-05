import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { migratingResponse } from "@/lib/http-errors";
import { requireRole } from "@/lib/guard";
import { listBatches } from "@/lib/import/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try {
    return NextResponse.json({ batches: await listBatches() });
  } catch (e) {
    { { const mg = migratingResponse(e); if (mg) return mg; } logError("/api/import/history", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 }); }
  }
}
