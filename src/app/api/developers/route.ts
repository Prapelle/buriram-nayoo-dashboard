import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { addProductType, changeDevStatus, recordContact, deleteDeveloper, deleteProduct, DevError, importDevelopers, listDevelopers, saveDeveloper, saveProduct } from "@/lib/developers-service";

export const dynamic = "force-dynamic";

function fail(e: unknown) {
  if (e instanceof DevError) return NextResponse.json({ error: e.message, code: e.code, ...e.extra }, { status: e.status });
  return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

// Developer (มีเบอร์/Line ผู้ติดต่อ) — เฉพาะ Admin และ Sales
export async function GET() {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try { return NextResponse.json(await listDevelopers()); } catch (e) { return fail(e); }
}

/** action: save (ค่าเริ่มต้น) · product · product_type · contact (บันทึกการติดต่อ) · import_plan · import_commit */
export async function POST(req: Request) {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    switch (b.action) {
      case "product": return NextResponse.json(await saveProduct(b, g.email));
      case "contact": return NextResponse.json(await recordContact(String(b.developer_id ?? ""), String(b.method ?? ""), String(b.contacted_at ?? ""), String(b.note ?? ""), String(b.updated_at_seen ?? ""), g.email));
      case "product_type": return NextResponse.json(await addProductType(String(b.name ?? ""), g.email));
      case "import_plan": return NextResponse.json(await importDevelopers(b.grid, false, g.email));
      case "import_commit": return NextResponse.json(await importDevelopers(b.grid, true, g.email));
      default: return NextResponse.json(await saveDeveloper(b, g.email));
    }
  } catch (e) { return fail(e); }
}

/** เปลี่ยน Status จากบอร์ด Sale developer */
export async function PATCH(req: Request) {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json()) as { developer_id?: string; status?: string; updated_at_seen?: string; method?: string };
    return NextResponse.json(await changeDevStatus(String(b.developer_id ?? ""), String(b.status ?? ""), String(b.updated_at_seen ?? ""), g.email, b.method === undefined ? undefined : String(b.method)));
  } catch (e) { return fail(e); }
}

/** ลบ Developer (พร้อม Product) หรือ ลบ Product (product_id) */
export async function DELETE(req: Request) {
  const g = await requireRole(["admin", "sales"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json()) as { developer_id?: string; product_id?: string; updated_at_seen?: string };
    if (b.product_id) return NextResponse.json(await deleteProduct(String(b.product_id), g.email));
    return NextResponse.json(await deleteDeveloper(String(b.developer_id ?? ""), String(b.updated_at_seen ?? ""), g.email));
  } catch (e) { return fail(e); }
}
