import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { AccError, getDoc } from "@/lib/account-service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await getDoc((await ctx.params).id)); } catch (e) {
    if (e instanceof AccError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    logError("/api/account/[id]", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
