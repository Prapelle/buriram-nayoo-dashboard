import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { AccError, addProduct, deleteProduct, listProducts, renameProduct } from "@/lib/account-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof AccError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  logError("/api/account/products", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

// Product (ชนิด Product กลาง): ดู / เพิ่ม / แก้ไข(เปลี่ยนชื่อ) = Super Admin, Admin, AE · ลบ = Super Admin, Admin
export async function GET() {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await listProducts()); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await addProduct(((await req.json()) as { name?: string }).name, g.email)); } catch (e) { return fail(e); }
}
export async function PATCH(req: Request) {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { const b = (await req.json()) as { from?: string; name?: string }; return NextResponse.json(await renameProduct(b.from, b.name, g.email)); } catch (e) { return fail(e); }
}
export async function DELETE(req: Request) {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await deleteProduct(((await req.json()) as { name?: string }).name, g.email)); } catch (e) { return fail(e); }
}
