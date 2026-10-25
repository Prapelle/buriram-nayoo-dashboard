import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { requireRole } from "@/lib/guard";
import { filterSales } from "@/lib/sales/dashboard";
import { salesCsv } from "@/lib/sales/export";
import { readColumns } from "@/lib/tabdata";

export const dynamic = "force-dynamic";

// ข้อมูลการเงิน/ลูกค้า: เฉพาะ Admin และ Sales และบันทึก Audit Log ทุกครั้งที่ส่งออก
export async function GET(req: Request) {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  const sp = new URL(req.url).searchParams;
  const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  try {
    const { rows } = await readColumns("SALES_TRANSACTIONS", { exclude: ["raw_json", "internal_note"] });
    const out = filterSales(rows, { from: iso(sp.get("from")), to: iso(sp.get("to")), period: sp.get("period") || undefined, project: sp.get("project") || undefined, salesperson: sp.get("salesperson") || undefined, status: sp.get("status") || undefined, q: sp.get("q") || undefined })
      .sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.invoice_no.localeCompare(b.invoice_no));
    await writeAudit(g.email, "export", "dataset", "sales_transactions", `ส่งออก ${out.length} แถว`);
    return new NextResponse(salesCsv(out), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="sales_transactions.csv"', "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
  }
}
