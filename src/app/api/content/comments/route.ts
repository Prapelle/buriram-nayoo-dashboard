import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { addComment, deleteComment, editComment, listComments } from "@/lib/content-comments";
import { MAX_COMMENT_TOTAL_BYTES } from "@/lib/content-comments-schema";
import { fail } from "./_fail";

export const dynamic = "force-dynamic";

/** ความคิดเห็นของการ์ด: GET ?card=<card_id> — ทุก Role */
export async function GET(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production", "observer"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await listComments(new URL(req.url).searchParams.get("card") ?? "")); } catch (e) { return fail("/api/content/comments GET", e); }
}

/** เพิ่มความคิดเห็น (multipart: card_id, body, files[]) — ทุก Role ยกเว้น Observer */
export async function POST(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production"]);
  if (!g.ok) return g.res;
  try {
    if (Number(req.headers.get("content-length") ?? 0) > MAX_COMMENT_TOTAL_BYTES + 200_000) return NextResponse.json({ error: "ไฟล์รวมกันใหญ่เกิน 25 MB" }, { status: 413 });
    const form = await req.formData();
    const files = await Promise.all(form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
    return NextResponse.json(await addComment(String(form.get("card_id") ?? ""), form.get("body"), files, g.email));
  } catch (e) { return fail("/api/content/comments POST", e); }
}

/** แก้ข้อความ { comment_id, body } — เฉพาะคนเขียน (ตรวจใน service) */
export async function PATCH(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production"]);
  if (!g.ok) return g.res;
  try { const b = await req.json().catch(() => ({})); return NextResponse.json(await editComment(String(b.comment_id ?? ""), b.body, g.email)); } catch (e) { return fail("/api/content/comments PATCH", e); }
}

/** ลบ ?id=<comment_id> — คนเขียน หรือ Super Admin / Admin (ตรวจใน service) */
export async function DELETE(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await deleteComment(new URL(req.url).searchParams.get("id") ?? "", g.email, g.role)); } catch (e) { return fail("/api/content/comments DELETE", e); }
}
