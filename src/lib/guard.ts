import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Role } from "./roles";

type Guard = { ok: true; email: string; role: Role } | { ok: false; res: NextResponse };

/** เรียกต้นทุก API Route: ตรวจ Session และ Role ฝั่ง Server */
export async function requireRole(allowed: Role[]): Promise<Guard> {
  const s = await auth();
  const role = s?.user?.role;
  if (!s?.user?.email || !role) return { ok: false, res: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  if (!allowed.includes(role)) return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { ok: true, email: s.user.email, role };
}
