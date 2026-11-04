import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { AccError, deleteDoc, getDoc } from "@/lib/account-service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await getDoc((await ctx.params).id)); } catch (e) {
    if (e instanceof AccError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    logError("/api/account/[id]", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}

/** ลบเอกสาร — เฉพาะ Super Admin (ลบพร้อมรายการสินค้า รายการชำระ ไฟล์แนบ ใบเสร็จของใบนั้น) */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await deleteDoc((await ctx.params).id, g.email)); } catch (e) {
    if (e instanceof AccError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    logError("/api/account/[id]", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
