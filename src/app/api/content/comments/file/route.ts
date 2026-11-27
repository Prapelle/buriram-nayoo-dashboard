import { requireRole } from "@/lib/guard";
import { openCommentFile } from "@/lib/content-comments";
import { fail } from "../_fail";

export const dynamic = "force-dynamic";

/** เปิดไฟล์แนบของความคิดเห็น: GET ?id=<file_id> — ทุก Role · รูปเปิดดูในหน้าได้ ไฟล์อื่นดาวน์โหลด */
export async function GET(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production", "observer"]);
  if (!g.ok) return g.res;
  try {
    const f = await openCommentFile(new URL(req.url).searchParams.get("id") ?? "");
    return new Response(f.body, { headers: {
      "content-type": f.mime, "content-disposition": `${f.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; img-src 'self'; sandbox", "cache-control": "private, max-age=3600",
    } });
  } catch (e) { return fail("/api/content/comments/file GET", e); }
}
