import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { planSales, SalesError, type SalesInput } from "@/lib/sales/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await planSales((await req.json()) as SalesInput)); }
  catch (e) {
    if (e instanceof SalesError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
