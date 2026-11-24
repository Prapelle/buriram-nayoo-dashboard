import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { unlock, UNLOCK_COOKIE, UNLOCK_MINUTES } from "@/lib/prod-notes";
import { fail } from "../_fail";

export const dynamic = "force-dynamic";

// ใส่รหัสเปิดดู → cookie (HttpOnly) ใช้ได้ 5 นาที เฉพาะ /api/prod-notes · ทุก Role
export async function POST(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production", "observer"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json().catch(() => ({}))) as { code?: unknown };
    const t = await unlock(b.code, g.email);
    const res = NextResponse.json({ unlockedUntil: t.exp });
    res.cookies.set(UNLOCK_COOKIE, t.value, { httpOnly: true, secure: new URL(req.url).protocol === "https:", sameSite: "strict", path: "/api/prod-notes", maxAge: UNLOCK_MINUTES * 60 });
    return res;
  } catch (e) { return fail("/api/prod-notes/unlock", e); }
}
