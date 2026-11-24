import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { cookieOf, revealPassword, UNLOCK_COOKIE, unlockedUntil } from "@/lib/prod-notes";
import { fail } from "../_fail";

export const dynamic = "force-dynamic";

// ดูรหัสผ่านของแถวหนึ่ง: ต้องใส่รหัสเปิดดูมาแล้วไม่เกิน 5 นาที (cookie ผูกอีเมล) · บันทึกทุกครั้ง
export async function POST(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production", "observer"]);
  if (!g.ok) return g.res;
  try {
    if (!(await unlockedUntil(cookieOf(req, UNLOCK_COOKIE), g.email))) return NextResponse.json({ error: "ต้องใส่รหัสเปิดดูก่อน (หรือหมดเวลา 5 นาทีแล้ว)", code: "LOCKED_VIEW" }, { status: 401 });
    const b = (await req.json().catch(() => ({}))) as { note_id?: unknown };
    return NextResponse.json(await revealPassword(String(b.note_id ?? ""), g.email), { headers: { "cache-control": "no-store" } });
  } catch (e) { return fail("/api/prod-notes/reveal", e); }
}
