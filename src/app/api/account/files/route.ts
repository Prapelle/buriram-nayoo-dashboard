import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { migratingResponse } from "@/lib/http-errors";
import { requireRole } from "@/lib/guard";
import { AccError, attachFile, deleteFile, openFile } from "@/lib/account-service";
import { MAX_FILE_BYTES } from "@/lib/account";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof AccError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  { const mg = migratingResponse(e); if (mg) return mg; } logError("/api/account/files", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

/** เปิดไฟล์แนบ: GET ?id=file_id (ดาวน์โหลดเป็นไฟล์ ไม่เปิดเป็นหน้าเว็บ) */
export async function GET(req: Request) {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try {
    const f = await openFile(new URL(req.url).searchParams.get("id") ?? "");
    return new Response(f.body, { headers: { "content-type": f.mime, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, "x-content-type-options": "nosniff", "cache-control": "private, no-store" } });
  } catch (e) { return fail(e); }
}

/** ลบไฟล์แนบ: DELETE ?id=file_id — เฉพาะ Super Admin */
export async function DELETE(req: Request) {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await deleteFile(new URL(req.url).searchParams.get("id") ?? "", g.email)); } catch (e) { return fail(e); }
}

/** แนบไฟล์ (multipart: doc_id, payment_id (ไม่บังคับ), file) — Super Admin / Admin */
export async function POST(req: Request) {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try {
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_FILE_BYTES + 100_000) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 10 MB" }, { status: 413 });
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 400 });
    return NextResponse.json(await attachFile(String(form.get("doc_id") ?? ""), String(form.get("payment_id") ?? ""), { name: file.name, type: file.type, data: await file.arrayBuffer() }, g.email));
  } catch (e) { return fail(e); }
}
