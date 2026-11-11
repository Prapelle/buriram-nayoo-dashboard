import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { migratingResponse } from "@/lib/http-errors";
import { requireRole } from "@/lib/guard";
import { deleteBatchData, HttpError, listBatches } from "@/lib/import/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireRole(["admin", "ae", "marketing", "production", "observer"]);
  if (!g.ok) return g.res;
  try {
    return NextResponse.json({ batches: await listBatches() });
  } catch (e) {
    { { const mg = migratingResponse(e); if (mg) return mg; } logError("/api/import/history", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 }); }
  }
}

/** ลบข้อมูลของรายงานที่นำเข้า (Super Admin เท่านั้น) · body: { batchId, confirm } — confirm ไม่ใช่ true = นับจำนวนแถวที่จะลบอย่างเดียว */
export async function POST(req: Request) {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try {
    const body = (await req.json().catch(() => ({}))) as { batchId?: unknown; confirm?: unknown };
    return NextResponse.json(await deleteBatchData(String(body.batchId ?? ""), g.email, body.confirm === true));
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    { const mg = migratingResponse(e); if (mg) return mg; }
    logError("/api/import/history POST", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
