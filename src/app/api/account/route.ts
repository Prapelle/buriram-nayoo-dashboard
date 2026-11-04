import { logError } from "@/lib/log";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { parseDocType } from "@/lib/account";
import { AccError, addProductType, convertDoc, listDocs, saveDoc, setDocStatus } from "@/lib/account-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof AccError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  logError("/api/account", e); return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

// ระบบบัญชี: ดู / ออก / แก้เอกสาร = Super Admin, Admin, AE · ยืนยันชำระเงิน / เริ่มงาน แยกไปที่ /api/account/pay (Super Admin, Admin)
export async function GET() {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await listDocs(g.email)); } catch (e) { return fail(e); }
}

/** action: save (ค่าเริ่มต้น) · convert · status · product_type */
export async function POST(req: Request) {
  const g = await requireRole(["admin", "ae"]);
  if (!g.ok) return g.res;
  let b: Record<string, unknown>;
  try { b = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 }); }
  try {
    switch (b.action) {
      case "convert": return NextResponse.json(await convertDoc(String(b.doc_id ?? ""), parseDocType(b.to), g.email));
      case "status": return NextResponse.json(await setDocStatus(String(b.doc_id ?? ""), String(b.status ?? ""), g.email));
      case "product_type": return NextResponse.json(await addProductType(String(b.name ?? ""), g.email));
      default: return NextResponse.json(await saveDoc(b, g.email));
    }
  } catch (e) { return fail(e); }
}
