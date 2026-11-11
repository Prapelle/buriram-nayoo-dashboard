import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { contentFail } from "@/lib/content-http";
import { metricsForPost } from "@/lib/fb-match";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await requireRole(["admin", "ae", "marketing", "production", "observer"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json({ metrics: await metricsForPost(new URL(req.url).searchParams.get("post_id") ?? "") }); } catch (e) { return contentFail("/api/content/metrics GET", e); }
}
