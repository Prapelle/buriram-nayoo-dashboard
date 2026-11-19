import { NextResponse } from "next/server";
import { requireRole } from "@/lib/guard";
import { logError } from "@/lib/log";
import { checkGroup, cutoverGroup, d1Status, D1AdminError, initD1, rollbackGroup, unlockMigration } from "@/lib/d1-admin";
import { MigratingError } from "@/lib/d1-state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(where: string, e: unknown) {
  if (e instanceof D1AdminError || e instanceof MigratingError) return NextResponse.json({ error: e.message }, { status: e.status });
  logError(where, e);
  return NextResponse.json({ error: e instanceof Error ? e.message : "unknown error" }, { status: 500 });
}

/** สถานะฐานข้อมูล D1 + กลุ่มที่ย้าย (Super Admin เท่านั้น) · ?ping=1 = วัดเวลาเรียก D1 จากเครื่องที่ตอบ (20/11/2026) */
export async function GET(req: Request) {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try {
    if (new URL(req.url).searchParams.get("ping")) return NextResponse.json(await pingD1());
    const tr = new URL(req.url).searchParams.get("trace");
    if (tr) return NextResponse.json(await traceD1(tr, g.email, g.role));
    return NextResponse.json(await d1Status());
  } catch (e) { return fail("/api/admin/d1 GET", e); }
}

/** เวลาไป-กลับของคำสั่ง D1 จาก Worker: 5 คำสั่งเรียงกัน + 5 คำสั่งพร้อมกัน · colo = ศูนย์ข้อมูลที่ Worker รัน · served_by = ภูมิภาคของ D1 ที่ตอบ */
async function pingD1() {
  const { getD1 } = await import("@/lib/d1");
  const db = await getD1();
  if (!db) return { available: false };
  type R = { results: unknown[]; meta?: Record<string, unknown> };
  const one = async () => { const t = Date.now(); const r = (await db.prepare("SELECT 1 AS x").all()) as unknown as R; return { ms: Date.now() - t, meta: r.meta ?? {} }; };
  const seq: number[] = []; let meta: Record<string, unknown> = {};
  for (let i = 0; i < 5; i++) { const r = await one(); seq.push(r.ms); meta = r.meta; }
  const t0 = Date.now(); await Promise.all(Array.from({ length: 5 }, one)); const par = Date.now() - t0;
  let colo = "";
  try { const { getCloudflareContext } = await import("@opennextjs/cloudflare"); colo = String((getCloudflareContext().cf as Record<string, unknown> | undefined)?.colo ?? ""); } catch { /* */ }
  return { available: true, colo, sequential_ms: seq, parallel5_ms: par, served_by: meta.served_by_region ?? meta.served_by ?? "", served_by_primary: meta.served_by_primary ?? null, meta };
}

/** action: init | check | cutover | rollback | unlock (group ใช้กับ check / cutover / rollback) */
export async function POST(req: Request) {
  const g = await requireRole(["super_admin"]);
  if (!g.ok) return g.res;
  try {
    const b = (await req.json().catch(() => ({}))) as { action?: string; group?: string; copyBack?: boolean };
    const group = String(b.group ?? "");
    switch (b.action) {
      case "init": return NextResponse.json(await initD1());
      case "check": return NextResponse.json(await checkGroup(group));
      case "cutover": return NextResponse.json(await cutoverGroup(group, g.email));
      case "rollback": return NextResponse.json({ ok: true, ...(await rollbackGroup(group, g.email, { copyBack: b.copyBack === true })) });
      case "unlock": await unlockMigration(); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 422 });
    }
  } catch (e) { return fail("/api/admin/d1 POST", e); }
}

/** วัดคำสั่ง D1 ของงานหนึ่ง (ทีละคำขอ) — ดูว่าช้าตรงไหน: จำนวนคำสั่ง · เรียงกัน/พร้อมกัน · เวลารวม */
async function traceD1(what: string, email: string, role: string) {
  const D = await import("@/lib/d1");
  const jobs: Record<string, () => Promise<unknown>> = {
    leads: async () => (await import("@/lib/leads-service")).listLeads(),
    developers: async () => (await import("@/lib/developers-service")).listDevelopers("developer"),
    content: async () => (await import("@/lib/content-service")).getBoard(),
    notifications: async () => { const n = await import("@/lib/notify-service"); return Promise.all([n.todosFor(email), n.listNotifs(email)]); },
    perf: async () => (await import("@/lib/perf-service")).getPerfReport(undefined, { email, role }),
    badges: async () => (await import("@/lib/leads-service")).listLeads(),
    dashboard: async () => (await import("@/lib/dashboard-data")).fetchDashboardData(role as never),
  };
  const job = jobs[what];
  if (!job) return { error: `trace ได้: ${Object.keys(jobs).join(", ")}` };
  D.startTrace(); const t0 = Date.now();
  try { await job(); } finally { /* */ }
  const total = Date.now() - t0, list = D.stopTrace();
  return { what, total_ms: total, queries: list.length, d1_ms_sum: list.reduce((a, x) => a + x.ms, 0), d1_end_ms: Math.max(0, ...list.map((x) => x.startMs + x.ms)), list };
}
