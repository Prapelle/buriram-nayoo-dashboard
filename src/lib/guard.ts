import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkRole } from "./guard-core";
import type { Role } from "./roles";

type Guard = { ok: true; email: string; role: Role } | { ok: false; res: NextResponse };

/** เรียกต้นทุก API Route: ตรวจ Session, Role และปฏิเสธคำขอข้ามเว็บ (cross-site) ฝั่ง Server */
export async function requireRole(allowed: Role[]): Promise<Guard> {
  const h = await headers();
  const g = checkRole(await auth(), allowed, h.get("sec-fetch-site"));
  if (!g.ok) return { ok: false, res: NextResponse.json({ error: g.error }, { status: g.status }) };
  return { ok: true, email: g.email, role: g.role };
}
