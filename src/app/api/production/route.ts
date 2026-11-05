import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { AccError, listJobs, updateJob } from "@/lib/account-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof AccError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  logError("/api/production", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

// Production: ดูได้ Super Admin / Admin / AE · แก้สถานะ Job ได้ Super Admin / Admin
export async function GET() {
  const g = await requireRole(["admin", "ae", "production"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await listJobs()); } catch (e) { return fail(e); }
}

export async function PATCH(req: Request) {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json()) as { job_id?: string; status?: string; done_idx?: string; owner?: string; note?: string; updated_at_seen?: string };
    return NextResponse.json(await updateJob(String(b.job_id ?? ""), { status: b.status, done_idx: b.done_idx, owner: b.owner, note: b.note }, String(b.updated_at_seen ?? ""), g.email));
  } catch (e) { return fail(e); }
}
