import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { initializeSpreadsheet } from "@/lib/init-sheet";

export const dynamic = "force-dynamic";

export async function POST() {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try {
    return NextResponse.json(await initializeSpreadsheet(g.email));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
