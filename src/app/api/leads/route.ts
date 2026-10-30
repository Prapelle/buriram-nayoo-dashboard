import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { changeLeadStatus, deleteLead, LeadError, listLeads, saveLead } from "@/lib/leads-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof LeadError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

// ข้อมูลลูกค้า (PII) — เฉพาะ Admin และ Sales
export async function GET() {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await listLeads()); } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await saveLead((await req.json()) as Record<string, unknown>, g.email)); } catch (e) { return fail(e); }
}

export async function DELETE(req: Request) {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json()) as { lead_id?: string; updated_at_seen?: string };
    return NextResponse.json(await deleteLead(String(b.lead_id ?? ""), String(b.updated_at_seen ?? ""), g.email));
  } catch (e) { return fail(e); }
}

// เปลี่ยนสถานะช่องเดียว: field = sell_status (Seller Leads) หรือ call_status (Buyer Leads)
export async function PATCH(req: Request) {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json()) as { lead_id?: string; field?: string; value?: string; updated_at_seen?: string };
    if (b.field !== "sell_status" && b.field !== "call_status") throw new LeadError(400, "ไม่รองรับช่องนี้", "BAD_REQUEST");
    return NextResponse.json(await changeLeadStatus(String(b.lead_id ?? ""), b.field, String(b.value ?? ""), String(b.updated_at_seen ?? ""), g.email));
  } catch (e) { return fail(e); }
}
