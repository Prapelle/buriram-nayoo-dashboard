import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { systemCheck } from "@/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json({ checks: await systemCheck() }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 }); }
}
