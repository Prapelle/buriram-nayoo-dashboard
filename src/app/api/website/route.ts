import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import type { UploadBatch } from "@/lib/website/parse";
import { commitWebsite, planWebsite, saveManualWebsite, websiteOverview, WebError, type ManualInput } from "@/lib/website/service";

export const dynamic = "force-dynamic";
const fail = (e: unknown) => e instanceof WebError
  ? NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
  : NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });

// Website Analytics — Admin / Marketing (ไม่มีข้อมูลส่วนบุคคล)
export async function GET(req: Request) {
  const g = await requireRole(["admin", "marketing"]);
  if (!g.ok) return g.res;
  const u = new URL(req.url); const start = u.searchParams.get("start") ?? "", end = u.searchParams.get("end") ?? "";
  try { return NextResponse.json(await websiteOverview(start && end ? { start, end } : undefined)); } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  const g = await requireRole(["admin", "marketing"]);
  if (!g.ok) return g.res;
  try {
    const body = (await req.json()) as { action?: string; batches?: UploadBatch[]; overrideDuplicate?: boolean; manual?: ManualInput };
    if (body.action === "plan") return NextResponse.json({ plans: await planWebsite(body.batches ?? []) });
    if (body.action === "commit") return NextResponse.json(await commitWebsite(body.batches ?? [], g.email, g.role, body.overrideDuplicate === true));
    if (body.action === "manual") return NextResponse.json(await saveManualWebsite(body.manual ?? {}, g.email));
    return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  } catch (e) { return fail(e); }
}
