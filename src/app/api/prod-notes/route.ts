import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { cookieOf, deleteNote, listNotes, saveNote, UNLOCK_COOKIE, unlockedUntil } from "@/lib/prod-notes";
import { fail } from "./_fail";

export const dynamic = "force-dynamic";

// Production note (24/11/2026): ดูได้ทุก Role (ไม่มีรหัสผ่าน) · เพิ่ม / แก้ / ลบ = Admin ขึ้นไป
export async function GET(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production", "observer"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json({ ...(await listNotes()), unlockedUntil: await unlockedUntil(cookieOf(req, UNLOCK_COOKIE), g.email) }); } catch (e) { return fail("/api/prod-notes GET", e); }
}
export async function POST(req: Request) {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    if (b.action === "delete") return NextResponse.json(await deleteNote(String(b.note_id ?? ""), g.email));
    return NextResponse.json({ note: await saveNote(b, g.email) });
  } catch (e) { return fail("/api/prod-notes POST", e); }
}
