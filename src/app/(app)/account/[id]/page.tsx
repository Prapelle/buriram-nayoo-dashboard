import { requirePage } from "@/lib/page-guard";
import { DocPage } from "@/components/DocPage";

export default async function DocDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const role = await requirePage("/account");
  return <DocPage docId={(await params).id} canPay={role === "super_admin" || role === "admin"} />;
}
