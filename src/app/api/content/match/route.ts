import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { contentFail } from "@/lib/content-http";
import { matchFacebookPosts } from "@/lib/fb-match";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// จับคู่การ์ด Content กับโพสต์ Facebook ที่นำเข้าแล้ว (ตามวันที่ + ข้อความ)
export async function POST() {
  const g = await requireRole(["admin", "ae", "production"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await matchFacebookPosts(g.email)); } catch (e) { return contentFail("/api/content/match POST", e); }
}
