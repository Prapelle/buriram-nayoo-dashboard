import { requirePage } from "@/lib/page-guard";
import { parseDocType } from "@/lib/account";
import { DocPage } from "@/components/DocPage";

export default async function NewDocPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const role = await requirePage("/account/new");
  return <DocPage docType={parseDocType((await searchParams).type)} canPay={role === "super_admin" || role === "admin"} />;
}
