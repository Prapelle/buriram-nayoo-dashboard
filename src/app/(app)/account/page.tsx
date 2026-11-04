import { requirePage } from "@/lib/page-guard";
import { PageHeader } from "@/components/PageHeader";
import { AccountManager } from "@/components/AccountManager";

export default async function AccountPage() {
  await requirePage("/account");
  return (
    <section className="max-w-7xl space-y-4">
      <PageHeader crumb="บัญชี" title="เอกสารบัญชี" sub="ใบเสนอราคา → ใบวางบิล → ใบแจ้งหนี้ · ยืนยันชำระเงินแล้วเพิ่ม Product ให้ลูกค้าและสั่งงาน Production อัตโนมัติ" />
      <AccountManager />
    </section>
  );
}
