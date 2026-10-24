import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { listBatches } from "@/lib/import/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireRole(["admin", "marketing"]);
  if (!g.ok) return g.res;
  try {
    return NextResponse.json({ batches: await listBatches() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
