import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/lib/env";
import { readTab } from "@/lib/sheets";
import { ROLES, type Role } from "@/lib/roles";

/** คืน role ถ้าได้รับอนุญาต, null ถ้าไม่ได้รับอนุญาต, throw ถ้าอ่าน Sheet ไม่ได้ */
export async function resolveRole(emailRaw: string): Promise<Role | null> {
  const email = emailRaw.trim().toLowerCase();
  if (env.initialAdmin && email === env.initialAdmin) return "admin"; // bootstrap
  const { rows } = await readTab("APP_USERS");
  const row = rows.find((r) => r.email.trim().toLowerCase() === email);
  if (!row || row.active.toUpperCase() !== "TRUE") return null;
  return (ROLES as string[]).includes(row.role) ? (row.role as Role) : null;
}

const RECHECK_MS = 5 * 60_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google], // อ่าน AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET จาก env
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google" || !profile?.email || profile.email_verified !== true) return false;
      try { return (await resolveRole(profile.email)) !== null; } catch { return false; }
    },
    async jwt({ token, profile }) {
      if (profile?.email) {
        token.email = profile.email.toLowerCase();
        token.role = await resolveRole(token.email);
        token.roleCheckedAt = Date.now();
      } else if (token.email && Date.now() - Number(token.roleCheckedAt ?? 0) > RECHECK_MS) {
        try { token.role = await resolveRole(token.email); token.roleCheckedAt = Date.now(); }
        catch { /* ชั่วคราว: คง role เดิมไว้ถ้า Sheets API ขัดข้อง */ }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = (token.role as Role | null | undefined) ?? null;
      return session;
    },
  },
});
