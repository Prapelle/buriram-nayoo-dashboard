import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { codeIsSet, setViewCode } from "@/lib/prod-notes";
import { fail } from "../_fail";

export const dynamic = "force-dynamic";

// รหัสเปิดดู Production note: ตั้ง / เปลี่ยน เฉพาะ Super Admin (หน้าตั้งค่าระบบ)
export async function GET() {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json({ codeSet: await codeIsSet() }); } catch (e) { return fail("/api/prod-notes/code GET", e); }
}
export async function POST(req: Request) {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await setViewCode(((await req.json().catch(() => ({}))) as { code?: unknown }).code, g.email)); } catch (e) { return fail("/api/prod-notes/code POST", e); }
}
