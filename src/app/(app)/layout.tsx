import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { navFor, normRole, SYSTEMS } from "@/lib/roles";
import { AppShell } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.email || !role) redirect("/login");

  return (
    <AppShell
      items={navFor(role)}
      systems={SYSTEMS.map((x) => ({ id: x.id, label: x.label, href: x.href, soon: x.soon, allowed: x.roles.includes(normRole(role)!) }))}
      email={session.user.email}
      role={role}
      signOutAction={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}
    >
      {children}
    </AppShell>
  );
}
