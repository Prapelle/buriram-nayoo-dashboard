import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { AccError, confirmPayment, startWork } from "@/lib/account-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof AccError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  logError("/api/account/pay", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

/** ยืนยันการชำระเงิน (action: payment) หรือกดเริ่มงาน (action: start) — เฉพาะ Super Admin / Admin (AE ทำไม่ได้) */
export async function POST(req: Request) {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 }); }
  try {
    if (b.action === "start") return NextResponse.json(await startWork(String(b.doc_id ?? ""), g.email));
    if (b.action === "payment") return NextResponse.json(await confirmPayment(String(b.doc_id ?? ""), b, g.email));
    return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
  } catch (e) { return fail(e); }
}
