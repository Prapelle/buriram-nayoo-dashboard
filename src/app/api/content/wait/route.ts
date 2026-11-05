import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { contentFail } from "@/lib/content-http";
import { endWait, startWait } from "@/lib/content-service";

export const dynamic = "force-dynamic";

const body = async (req: Request) => ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;

// รอลูกค้า: POST = เริ่มรอ (kind) · DELETE = ลูกค้าตอบแล้ว — ผู้ร่วมงานในการ์ดคนไหนก็ได้ (service ตรวจรายชื่อผู้ร่วมงาน)
export async function POST(req: Request) {
  const g = await requireRole(["admin", "ae", "production"]);
  if (!g.ok) return g.res;
  try { const b = await body(req); return NextResponse.json(await startWait(String(b.card_id ?? ""), b.kind, g.email)); } catch (e) { return contentFail("/api/content/wait POST", e); }
}
export async function DELETE(req: Request) {
  const g = await requireRole(["admin", "ae", "production"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await endWait(String((await body(req)).card_id ?? ""), g.email)); } catch (e) { return contentFail("/api/content/wait DELETE", e); }
}
