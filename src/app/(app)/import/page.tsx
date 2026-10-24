import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ImportWizard } from "@/components/ImportWizard";

export default async function ImportPage() {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  return (
    <section className="max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold">นำเข้า CSV</h1>
      <ImportWizard />
    </section>
  );
}
