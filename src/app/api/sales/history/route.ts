import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { migratingResponse } from "@/lib/http-errors";
import { requireRole } from "@/lib/guard";
import { listSalesImports, SalesError } from "@/lib/sales/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json({ batches: await listSalesImports() }); }
  catch (e) {
    if (e instanceof SalesError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    { { const mg = migratingResponse(e); if (mg) return mg; } logError("/api/sales/history", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 }); }
  }
}
