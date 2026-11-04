import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { MAX_FILE_BYTES } from "@/lib/account";
import { AccError, confirmPayment, issueReceipt, startWork } from "@/lib/account-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof AccError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  logError("/api/account/pay", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

/** ยืนยันการชำระเงิน (action: payment) หรือกดเริ่มงาน (action: start) — เฉพาะ Super Admin / Admin (AE ทำไม่ได้) */
export async function POST(req: Request) {
  const g = await requireRole(["admin"]);
  if (!g.ok) return g.res;
  let b: Record<string, unknown>, file: { name: string; type: string; data: ArrayBuffer } | undefined;
  try {
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES + 100_000) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 10 MB" }, { status: 413 });
      const form = await req.formData(); b = {};
      for (const [k, v] of form.entries()) { if (v instanceof File) { if (k === "file") file = { name: v.name, type: v.type, data: await v.arrayBuffer() }; } else b[k] = v; }
    } else b = (await req.json()) as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 }); }
  try {
    if (b.action === "start") return NextResponse.json(await startWork(String(b.doc_id ?? ""), g.email));
    if (b.action === "payment") return NextResponse.json(await confirmPayment(String(b.doc_id ?? ""), b, g.email, file));
    if (b.action === "receipt") return NextResponse.json(await issueReceipt(String(b.payment_id ?? ""), g.email));
    return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
  } catch (e) { return fail(e); }
}
