import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { logError } from "@/lib/log";
import { checkGroup, cutoverGroup, d1Status, D1AdminError, initD1, rollbackGroup, unlockMigration } from "@/lib/d1-admin";
import { MigratingError } from "@/lib/d1-state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(where: string, e: unknown) {
  if (e instanceof D1AdminError || e instanceof MigratingError) return NextResponse.json({ error: e.message }, { status: e.status });
  logError(where, e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

/** สถานะฐานข้อมูล D1 + กลุ่มที่ย้าย (Super Admin เท่านั้น) */
export async function GET() {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await d1Status()); } catch (e) { return fail("/api/admin/d1 GET", e); }
}

/** action: init | check | cutover | rollback | unlock (group ใช้กับ check / cutover / rollback) */
export async function POST(req: Request) {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json().catch(() => ({}))) as { action?: string; group?: string };
    const group = String(b.group ?? "");
    switch (b.action) {
      case "init": return NextResponse.json(await initD1());
      case "check": return NextResponse.json(await checkGroup(group));
      case "cutover": return NextResponse.json(await cutoverGroup(group, g.email));
      case "rollback": await rollbackGroup(group, g.email); return NextResponse.json({ ok: true });
      case "unlock": await unlockMigration(); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 422 });
    }
  } catch (e) { return fail("/api/admin/d1 POST", e); }
}
