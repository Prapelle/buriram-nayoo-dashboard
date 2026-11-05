import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { getHistory } from "@/lib/content-service";
import { contentFail } from "@/lib/content-http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await requireRole(["admin", "ae", "production"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await getHistory(new URL(req.url).searchParams.get("id") ?? "")); } catch (e) { return contentFail("/api/content/history GET", e); }
}
