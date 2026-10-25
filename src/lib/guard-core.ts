import type { Role } from "./roles";

export type SessionLike = { user?: { email?: string | null; role?: Role | null } } | null | undefined;
export type GuardResult = { ok: true; email: string; role: Role } | { ok: false; status: 401 | 403; error: string };

/** เบราว์เซอร์ส่ง Sec-Fetch-Site มาเองทุกคำขอ: ไม่รับคำขอที่มาจากเว็บอื่น (cross-site) แม้มีคุกกี้ */
export const crossSiteBlocked = (secFetchSite: string | null | undefined) =>
  !!secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none";

export function checkRole(session: SessionLike, allowed: Role[], secFetchSite?: string | null): GuardResult {
  if (crossSiteBlocked(secFetchSite)) return { ok: false, status: 403, error: "cross-site request blocked" };
  const role = session?.user?.role;
  const email = session?.user?.email;
  if (!email || !role) return { ok: false, status: 401, error: "unauthenticated" };
  if (!allowed.includes(role)) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, email, role };
}
