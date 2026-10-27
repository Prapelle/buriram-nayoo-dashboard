import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { listUsers, saveUser, UserError, type SaveUserInput } from "@/lib/users-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof UserError) return NextResponse.json({ error: e.message, code: e.code, fields: e.fields }, { status: e.status });
  return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

// จัดการผู้ใช้ — เฉพาะ Admin
export async function GET() {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json({ users: await listUsers(), me: g.email.toLowerCase() }); } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await saveUser((await req.json()) as SaveUserInput, g.email)); } catch (e) { return fail(e); }
}
