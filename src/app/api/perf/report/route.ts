import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { migratingResponse } from "@/lib/http-errors";
import { requireRole } from "@/lib/guard";
import { PerfError } from "@/lib/perf";
import { getPerfReport } from "@/lib/perf-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof PerfError) return NextResponse.json({ error: e.message, code: e.code, fields: e.fields }, { status: e.status });
  { const mg = migratingResponse(e); if (mg) return mg; }
  logError("/api/perf/report", e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

// รายงานประสิทธิภาพรายคน: Admin ขึ้นไปเห็นทุกคน · AE / Production เห็นเฉพาะของตัวเอง (กรองฝั่ง Server) · Marketing ไม่เกี่ยว
export async function GET(req: Request) {
  const g = await requireRole(["admin", "ae", "production"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await getPerfReport(new URL(req.url).searchParams.get("month") ?? undefined, { email: g.email, role: g.role })); } catch (e) { return fail(e); }
}
