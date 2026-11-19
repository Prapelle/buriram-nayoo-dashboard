import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { listNotifs, markRead, todosFor } from "@/lib/notify-service";
import { logError } from "@/lib/log";

export const dynamic = "force-dynamic";

// กระดิ่งแจ้งเตือน (20/11/2026): งานที่ต้องทำ (คำนวณสด) + การเปลี่ยนแปลง (เก็บบน D1) — เฉพาะของผู้ใช้ที่ล็อกอิน
export async function GET() {
  const g = await requireRole(["admin", "ae", "marketing", "production", "observer"]);
  if (!g.ok) return g.res;
  const [todos, n] = await Promise.all([
    todosFor(g.email).catch((e) => { logError("notifications.todos", e); return []; }),
    listNotifs(g.email).catch((e) => { logError("notifications.list", e); return { items: [], unread: 0, enabled: false }; }),
  ]);
  return NextResponse.json({ todos, ...n });
}

export async function POST(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production", "observer"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json()) as { action?: string; ids?: unknown };
    if (b.action === "read_all") return NextResponse.json({ updated: await markRead(g.email, [], true) });
    if (b.action === "read") return NextResponse.json({ updated: await markRead(g.email, b.ids) });
    return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  } catch (e) { logError("notifications.post", e); return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 }); }
}
