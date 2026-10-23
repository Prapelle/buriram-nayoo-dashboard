import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { NAV } from "@/lib/roles";
import { Sidebar } from "@/components/Sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user?.email || !role) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        items={NAV.filter((n) => n.roles.includes(role))}
        email={session.user.email}
        role={role}
        signOutAction={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}
      />
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
