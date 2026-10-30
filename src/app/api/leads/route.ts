import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { changeSellStatus, deleteLead, LeadError, listLeads, saveLead } from "@/lib/leads-service";

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

// เปลี่ยน Sell Status อย่างเดียว (หน้า Seller Leads)
export async function PATCH(req: Request) {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json()) as { lead_id?: string; sell_status?: string; updated_at_seen?: string };
    return NextResponse.json(await changeSellStatus(String(b.lead_id ?? ""), String(b.sell_status ?? ""), String(b.updated_at_seen ?? ""), g.email));
  } catch (e) { return fail(e); }
}
