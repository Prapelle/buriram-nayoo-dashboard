import { NextResponse } from "next/server";
import { logError } from "./log";
import { MigratingError } from "./d1-state";
import { ContentError } from "./content-service";

export function contentFail(where: string, e: unknown) {
  if (e instanceof ContentError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  if (e instanceof MigratingError) return NextResponse.json({ error: e.message }, { status: e.status });
  logError(where, e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}
