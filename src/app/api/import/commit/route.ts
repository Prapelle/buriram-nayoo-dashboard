import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { HttpError, runCommit, type ImportInput } from "@/lib/import/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await requireRole(["admin", "marketing"]);
  if (!g.ok) return g.res;
  try {
    const input = (await req.json()) as ImportInput;
    return NextResponse.json(await runCommit(input, g.email, g.role));
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
