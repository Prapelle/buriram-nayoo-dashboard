import { requirePage } from "@/lib/page-guard";
import { ManualView } from "@/components/ManualView";

export default async function ManualPage() {
  await requirePage("/account/manual");
  return <ManualView system="account" />;
}
