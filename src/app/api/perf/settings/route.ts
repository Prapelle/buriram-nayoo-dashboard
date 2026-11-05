import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { migratingResponse } from "@/lib/http-errors";
import { requireRole } from "@/lib/guard";
import { PerfError } from "@/lib/perf";
import { addHoliday, deleteHoliday, getPerfSettings, savePositions, saveTargets, saveWaitKinds } from "@/lib/perf-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof PerfError) return NextResponse.json({ error: e.message, code: e.code, fields: e.fields }, { status: e.status });
  { const mg = migratingResponse(e); if (mg) return mg; }
  logError("/api/perf/settings", e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

// ตั้งค่าประสิทธิภาพรายคน (ตำแหน่ง / เป้ารายเดือน / วันหยุดบริษัท): Super Admin เท่านั้น
export async function GET(req: Request) {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await getPerfSettings(new URL(req.url).searchParams.get("month") ?? undefined)); } catch (e) { return fail(e); }
}

type Body = { action?: string; kinds?: unknown; email?: string; positions?: unknown; month?: unknown; items?: { user_email: string; metric_key: string; value: unknown }[]; date?: unknown; name?: unknown };
export async function POST(req: Request) {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json()) as Body;
    switch (b.action) {
      case "positions": return NextResponse.json(await savePositions(String(b.email ?? ""), b.positions, g.email));
      case "targets": return NextResponse.json(await saveTargets(b.month, b.items ?? [], g.email));
      case "wait_kinds": return NextResponse.json(await saveWaitKinds(b.kinds, g.email));
      case "holiday_add": return NextResponse.json(await addHoliday(b.date, b.name, g.email));
      case "holiday_delete": return NextResponse.json(await deleteHoliday(b.date, g.email));
      default: return NextResponse.json({ error: "action ไม่ถูกต้อง", code: "BAD_REQUEST" }, { status: 400 });
    }
  } catch (e) { return fail(e); }
}
