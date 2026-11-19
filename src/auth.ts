import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { env } from "@/lib/env";
import { readTab } from "@/lib/sheets";
import { normRole, type Role } from "@/lib/roles";

/** คืน role ถ้าได้รับอนุญาต, null ถ้าไม่ได้รับอนุญาต, throw ถ้าอ่าน Sheet ไม่ได้ */
export async function resolveRole(emailRaw: string): Promise<Role | null> {
  const email = emailRaw.trim().toLowerCase();
  if (env.initialAdmin && email === env.initialAdmin) return "super_admin"; // bootstrap
  const { rows } = await readTab("APP_USERS");
  const row = rows.find((r) => r.email.trim().toLowerCase() === email);
  if (!row || row.active.toUpperCase() !== "TRUE") return null;
  return normRole(row.role); // "sales" (ชื่อเดิม) → ae
}

const RECHECK_MS = 5 * 60_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google], // อ่าน AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET จาก env
  // ล็อกอินครั้งเดียวอยู่ได้ 30 วัน (19/11/2026) · ต่ออายุให้เองวันละครั้งเมื่อใช้งาน → ไม่ได้เปิดเกิน 30 วันจึงต้องล็อกอินใหม่
  // ความปลอดภัย: ยังตรวจสิทธิ์จาก APP_USERS ทุก 5 นาที (RECHECK_MS) — ปิดผู้ใช้ / เปลี่ยน Role มีผลภายใน 5 นาทีแม้ session ยังไม่หมดอายุ
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
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
      session.user.role = normRole(token.role); // token เก่าที่ยังเป็น "sales" → ae
      return session;
    },
  },
});
