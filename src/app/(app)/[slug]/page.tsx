import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { NAV } from "@/lib/roles";

export default async function Placeholder({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const role = (await auth())?.user?.role;
  const item = NAV.find((n) => n.href === `/${slug}`);
  if (!item || !role || !item.roles.includes(role)) notFound();
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold">{item.label}</h1>
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-slate-600">
        หน้านี้จะพัฒนาในขั้นถัดไปตามลำดับใน Spec
      </p>
    </section>
  );
}
