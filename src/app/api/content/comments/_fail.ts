import { NextResponse } from "next/server";
import { migratingResponse } from "@/lib/http-errors";
import { logError } from "@/lib/log";
import { CommentError } from "@/lib/content-comments";

export function fail(where: string, e: unknown) {
  if (e instanceof CommentError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  const mg = migratingResponse(e); if (mg) return mg;
  logError(where, e);
  return NextResponse.json({ error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" }, { status: 500 });
}
