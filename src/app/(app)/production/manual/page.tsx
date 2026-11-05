import { requirePage } from "@/lib/page-guard";
import { ManualView } from "@/components/ManualView";

export default async function ManualPage() {
  await requirePage("/production/manual");
  return <ManualView system="production" />;
}
