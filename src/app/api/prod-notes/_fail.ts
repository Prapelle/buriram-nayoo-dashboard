import { NextResponse } from "next/server";
import { migratingResponse } from "@/lib/http-errors";
import { logError } from "@/lib/log";
import { NoteError } from "@/lib/prod-notes";

export function fail(where: string, e: unknown) {
  if (e instanceof NoteError) return NextResponse.json({ error: e.message, code: e.code, fields: e.fields }, { status: e.status });
  const mg = migratingResponse(e); if (mg) return mg;
  logError(where, e);
  return NextResponse.json({ error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" }, { status: 500 });
}
