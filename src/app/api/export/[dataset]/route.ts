import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { exportDataset, ExportError, parseFilters } from "@/lib/export/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ dataset: string }> }) {
  const g = await requireRole(["admin", "marketing", "sales"]);
  if (!g.ok) return g.res;
  try {
    const { dataset } = await ctx.params;
    const url = new URL(req.url);
    const f = parseFilters(url.searchParams);
    if (url.searchParams.get("count") === "1") return NextResponse.json(await exportDataset(dataset, f, g.role, g.email, { countOnly: true }));
    const r = await exportDataset(dataset, f, g.role, g.email);
    return new NextResponse(r.csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${r.filename}"`, "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof ExportError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
