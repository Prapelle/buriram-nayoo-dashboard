import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { AccError, deleteCustomer, listCustomers, saveCustomer } from "@/lib/account-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof AccError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  logError("/api/account/customers", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

// รายชื่อลูกค้า: ดู / เพิ่ม / แก้ไข = Super Admin, Admin, AE · ลบ = Super Admin เท่านั้น
export async function GET() {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await listCustomers()); } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await saveCustomer((await req.json()) as Record<string, unknown>, g.email)); } catch (e) { return fail(e); }
}
export async function DELETE(req: Request) {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try { const b = (await req.json()) as { developer_id?: string; updated_at_seen?: string }; return NextResponse.json(await deleteCustomer(String(b.developer_id ?? ""), String(b.updated_at_seen ?? ""), g.email)); } catch (e) { return fail(e); }
}
