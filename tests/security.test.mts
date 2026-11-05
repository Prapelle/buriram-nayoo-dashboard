// ตรวจความปลอดภัยแบบอัตโนมัติ (วิเคราะห์โค้ดต้นฉบับ + ทดสอบตัวตรวจสิทธิ์) รัน: npx tsx tests/security.test.mts
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import assert from "node:assert/strict";

const SRC = "src";
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(SRC);
const read = (p: string) => readFileSync(p, "utf8");
const norm = (p: string) => p.replaceAll("\\", "/");
let pass = 0; const ok = (m: string) => { pass++; console.log("  ✓", m); };

console.log("1) ทุก API Route ต้องตรวจ Session และ Role");
const routes = files.map(norm).filter((f) => /\/api\/.*route\.ts$/.test(f));
const EXPECT: Record<string, string[] | "public" | Record<string, string[]>> = {
  "src/app/api/auth/[...nextauth]/route.ts": "public", // Auth.js จัดการเอง (login/callback)
  "src/app/api/init/route.ts": ["super_admin"], "src/app/api/admin/d1/route.ts": ["super_admin"], "src/app/api/health/route.ts": ["super_admin"], "src/app/api/users/route.ts": ["super_admin"], // ตั้งค่าระบบ: Super Admin เท่านั้น
  "src/app/api/website/route.ts": { GET: ["admin", "marketing", "production"], POST: ["admin"] }, // Marketing ดูอย่างเดียว
  "src/app/api/import/plan/route.ts": ["admin"], "src/app/api/import/commit/route.ts": ["admin"], "src/app/api/import/history/route.ts": ["admin"],
  "src/app/api/line-oa/route.ts": { GET: ["admin", "marketing", "production"], POST: ["admin"] },
  "src/app/api/leads/route.ts": { GET: ["admin", "ae"], POST: ["admin", "ae"], PATCH: ["admin", "ae"], DELETE: ["ae"] }, // Admin เพิ่ม/แก้ได้ ลบไม่ได้
  "src/app/api/badges/route.ts": ["admin", "ae"], // จำนวน Lead ที่ต้องติดตาม (ตัวเลขบนเมนู)
  "src/app/api/developers/route.ts": { GET: ["admin", "ae"], POST: ["admin", "ae"], PATCH: ["admin", "ae"], DELETE: ["ae"] },
  "src/app/api/sales/plan/route.ts": ["admin"], "src/app/api/sales/commit/route.ts": ["admin"], "src/app/api/sales/history/route.ts": ["admin", "ae"],
  "src/app/api/export/sales-transactions/route.ts": ["admin"],
  "src/app/api/export/[dataset]/route.ts": ["admin"], // สิทธิ์รายชุดข้อมูลบังคับใน service (ตรวจในข้อ 3)
  // ระบบบัญชี + Production (5/11/2026): AE ออก/แก้เอกสารได้ แต่ยืนยันชำระเงิน / เริ่มงาน / แนบไฟล์ / แก้ Job = Admin ขึ้นไป
  "src/app/api/account/route.ts": { GET: ["admin", "ae"], POST: ["admin", "ae"] }, "src/app/api/account/[id]/route.ts": { GET: ["admin", "ae"], DELETE: ["super_admin"] }, "src/app/api/account/pay/route.ts": ["admin"],
  "src/app/api/account/files/route.ts": { GET: ["admin", "ae"], POST: ["admin"], DELETE: ["super_admin"] }, "src/app/api/account/customers/route.ts": { GET: ["admin", "ae"], POST: ["admin", "ae"], DELETE: ["super_admin"] }, "src/app/api/account/products/route.ts": { GET: ["admin", "ae"], POST: ["admin", "ae"], PATCH: ["admin", "ae"], DELETE: ["admin"] }, "src/app/api/production/route.ts": { GET: ["admin", "ae", "production"], PATCH: ["admin"] },
  "src/app/api/content/route.ts": { GET: ["admin", "ae", "production"], POST: ["admin", "ae", "production"], PATCH: ["admin", "ae", "production"], DELETE: ["ae"] }, "src/app/api/content/history/route.ts": ["admin", "ae", "production"], "src/app/api/content/match/route.ts": ["admin", "ae", "production"], "src/app/api/content/metrics/route.ts": ["admin", "ae", "production"], "src/app/api/content/products/route.ts": { GET: ["admin", "ae"], PUT: ["admin", "ae"] },
  "src/app/api/targets/route.ts": { GET: ["admin", "marketing", "ae", "production"], POST: ["admin"] },
};
assert.deepEqual(routes.filter((r) => !(r in EXPECT)), [], "พบ API Route ใหม่ที่ยังไม่ได้กำหนดสิทธิ์ในเทสต์นี้ — ต้องตรวจสอบก่อน");
for (const r of routes) {
  const exp = EXPECT[r]; if (exp === "public") continue;
  const src = read(r);
  const handlers = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].length;
  const guards = [...src.matchAll(/requireRole\(\[([^\]]*)\]\)/g)];
  assert.equal(guards.length, handlers, `${r}: ทุก handler ต้องเรียก requireRole`);
  if (Array.isArray(exp)) { for (const g of guards) assert.deepEqual([...g[1].matchAll(/"(\w+)"/g)].map((m) => m[1]).sort(), [...exp].sort(), `${r}: สิทธิ์ไม่ตรงที่กำหนด`); continue; }
  // สิทธิ์แยกตาม Method: แต่ละ handler ต้องเรียก requireRole ของตัวเองด้วยสิทธิ์ที่กำหนด
  const parts = src.split(/(?=export async function (?:GET|POST|PUT|PATCH|DELETE)\b)/).slice(1);
  assert.deepEqual(parts.map((x) => x.match(/^export async function (\w+)/)![1]).sort(), Object.keys(exp).sort(), `${r}: Method ไม่ตรงที่กำหนด`);
  for (const part of parts) { const m = part.match(/^export async function (\w+)/)![1]; const g = part.match(/requireRole\(\[([^\]]*)\]\)/)!; assert.deepEqual([...g[1].matchAll(/"(\w+)"/g)].map((x) => x[1]).sort(), [...exp[m]].sort(), `${r} ${m}: สิทธิ์ไม่ตรงที่กำหนด`); }
}
assert.ok(read("src/lib/guard-core.ts").includes('role !== "super_admin" && !allowed.includes(role)')); ok(`Super Admin ผ่านทุก API · API Route ${routes.length} ไฟล์: ทุก handler ตรวจ Session+Role และสิทธิ์ตรงตามที่กำหนด (Leads/Sales/ยอดขาย = Admin+Sales เท่านั้น, ข้อมูลโฆษณา = Admin+Marketing)`);

console.log("2) หน้าจอและการล็อกอิน");
const layout = read("src/app/(app)/layout.tsx"); assert.ok(layout.includes("auth()") && layout.includes('redirect("/login")') && /!role/.test(layout)); ok("Layout ของทุกหน้าในระบบ: ไม่ได้ล็อกอิน/ไม่มี Role → ส่งไปหน้า login");
const { canAccess, homeFor, normRole, NAV, navFor, navOfSystem, systemOf, systemsFor } = await import("../src/lib/roles");
const pageFiles = files.map(norm).filter((f) => /^src\/app\/\(app\)\/.*page\.tsx$/.test(f) && !f.includes("[slug]")); // [slug] = หน้าว่างตาม NAV (notFound ถ้าไม่มีสิทธิ์)
for (const f of pageFiles) {
  const route = "/" + f.replace(/^src\/app\/\(app\)\/?/, "").replace(/\/?page\.tsx$/, "");
  assert.ok(read(f).includes(`requirePage("${route.replace("[id]", "").replace(/\/$/, "") || "/"}`) || read(f).includes(`requirePage("${route}`), `${f}: ต้องเรียก requirePage("${route}") ตรวจ Role ฝั่ง Server`);
}
const pg = read("src/lib/page-guard.ts"); assert.ok(pg.includes('redirect("/login")') && pg.includes('redirect("/")') && pg.includes("canAccess(role, path)"));
const can = (r: string, p: string) => canAccess(normRole(r)!, p);
for (const p of ["/work/leads", "/work/buyer-leads", "/work/seller-leads", "/lead-report", "/work/developers", "/work/sale-developer", "/work/home-builders", "/work/sale-home-builder", "/account/revenue"]) assert.ok(can("ae", p), `AE ต้องเข้า ${p} ได้`);
for (const p of ["/dashboard", "/dashboard/facebook-ads", "/dashboard/performance", "/dashboard/import", "/dashboard/export", "/settings", "/settings/metrics", "/settings/targets", "/account/revenue/import"]) assert.ok(!can("ae", p), `AE ต้องเข้า ${p} ไม่ได้`);
for (const p of ["/dashboard", "/dashboard/facebook-ads", "/dashboard/facebook-page", "/dashboard/google-ads", "/dashboard/line-oa", "/dashboard/website", "/dashboard/performance", "/lead-report", "/settings/metrics"]) assert.ok(can("marketing", p), `Marketing ต้องเข้า ${p} ได้`);
for (const p of ["/work/leads", "/work/buyer-leads", "/work/developers", "/account/revenue", "/dashboard/import", "/dashboard/export", "/settings", "/settings/targets", "/settings/import-guide"]) assert.ok(!can("marketing", p), `Marketing ต้องเข้า ${p} ไม่ได้`);
for (const p of ["/dashboard", "/work/leads", "/work/developers", "/account/revenue", "/account/revenue/import", "/dashboard/import", "/dashboard/export", "/settings/targets", "/settings/metrics", "/dashboard/facebook-ads"]) assert.ok(can("admin", p), `Admin ต้องเข้า ${p} ได้`);
assert.ok(!can("admin", "/settings"), "Admin ต้องเข้าตั้งค่าระบบไม่ได้");
for (const n of NAV.flatMap((x) => ("children" in x && x.children ? x.children : [x]) as { href: string }[])) assert.ok(can("super_admin", n.href), `Super Admin ต้องเข้า ${n.href} ได้`);
assert.equal(normRole("sales"), "ae"); assert.equal(normRole("Admin"), "admin"); assert.equal(normRole("x"), null); assert.equal(homeFor("marketing"), "/"); assert.equal(homeFor("ae"), "/");
for (const r of ["super_admin", "admin", "ae", "marketing"] as const) assert.ok(can(r, "/"), `${r} ต้องเข้าหน้าเลือกระบบได้`);
assert.deepEqual(systemsFor("marketing").map((x) => x.id), ["dashboard"]); assert.deepEqual(systemsFor("ae").map((x) => x.id), ["work", "account", "production"]); assert.deepEqual(systemsFor("admin").map((x) => x.id), ["dashboard", "work", "account", "production"]);
for (const p of ["/account", "/account/new", "/account/abc", "/production"]) { assert.ok(can("ae", p) && can("admin", p), `AE/Admin ต้องเข้า ${p} ได้`); assert.ok(!can("marketing", p), `Marketing ต้องเข้า ${p} ไม่ได้`); }
assert.equal(systemOf("/account/abc"), "account"); assert.equal(systemOf("/production"), "production");
assert.equal(systemOf("/dashboard"), "dashboard"); assert.equal(systemOf("/account/revenue/import"), "account"); assert.equal(systemOf("/lead-report"), null); assert.equal(systemOf("/settings"), null);
assert.deepEqual(systemsFor("production").map((x) => x.id), ["dashboard", "production"]);
for (const p of ["/dashboard", "/dashboard/facebook-ads", "/dashboard/performance", "/dashboard/line-oa", "/settings/metrics", "/lead-report", "/production"]) assert.ok(can("production", p), `Production ต้องเข้า ${p} ได้`);
for (const p of ["/work/leads", "/work/developers", "/account", "/account/revenue", "/dashboard/import", "/dashboard/export", "/settings", "/settings/targets"]) assert.ok(!can("production", p), `Production ต้องเข้า ${p} ไม่ได้`);
assert.equal(normRole("Production"), "production");
const hrefs = (sys: "dashboard" | "work", r: "super_admin" | "ae" | "marketing") => navOfSystem(navFor(r), sys).flatMap((n) => n.children ?? [n]).map((n) => n.href);
const sd = hrefs("dashboard", "super_admin"), sw = hrefs("work", "super_admin");
assert.ok(sd.every((h) => !h.startsWith("/work")) && sw.every((h) => !h.startsWith("/dashboard")), "เมนูแต่ละระบบต้องไม่มีหน้าของอีกระบบ");
for (const h of ["/lead-report", "/settings"]) assert.ok(sd.includes(h) && sw.includes(h), `${h} ต้องอยู่ทั้งสองระบบ`);
assert.ok(sd.includes("/settings/targets") && !sw.includes("/settings/targets"));
for (const x of NAV.flatMap((n) => [n, ...(n.children ?? [])])) assert.ok(x.system === "shared" || x.href.startsWith("/" + x.system) || x.href.startsWith("/settings/"), `${x.href}: path ต้องขึ้นต้นด้วยระบบของเมนู`);
ok(`แยกระบบด้วย path: /dashboard · /work · หน้าเลือกระบบ "/" ทุก Role เข้าได้ · เมนูแต่ละระบบไม่ปนกัน · รายงาน Lead / ตั้งค่า อยู่ทั้งสองระบบ`); ok(`หน้าจอ ${pageFiles.length} หน้า ตรวจ Role ฝั่ง Server (requirePage) · สิทธิ์ AE / Marketing / Admin / Super Admin ตรงตามที่กำหนด · "sales" เดิม = AE`);
const authSrc = read("src/auth.ts"); assert.ok(/providers:\s*\[Google\]/.test(authSrc) && authSrc.includes("resolveRole(profile.email)") && authSrc.includes("email_verified")); assert.ok(!files.some((f) => /(register|signup|sign-up)/i.test(norm(f))));
ok("ปิด Public Signup: ผู้ให้บริการเดียวคือ Google, อนุญาตเฉพาะอีเมลที่อยู่ใน APP_USERS (หรือ INITIAL_ADMIN_EMAIL) และต้องยืนยันอีเมลแล้ว, ไม่มีหน้า/เส้นทางสมัครสมาชิก");

console.log("3) ความลับต้องไม่ไปถึง Browser");
const isClient = (f: string) => /^\s*(\/\/[^\n]*\n\s*)*["']use client["']/.test(read(f));
const clientFiles = files.map(norm).filter((f) => /\.(tsx?|jsx?)$/.test(f) && isClient(f));
const importsOf = (f: string) => [...read(f).matchAll(/(?:import|export)[^"';]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1] ?? m[2]);
const resolveMod = (from: string, spec: string): string | null => {
  let base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null; base = norm(relative(process.cwd(), resolve(base)));
  for (const c of [base + ".ts", base + ".tsx", base + "/index.ts", base]) if (existsSync(c) && statSync(c).isFile()) return norm(c);
  return null;
};
const FORBIDDEN = [/src\/lib\/sheets\.ts$/, /src\/lib\/env\.ts$/, /src\/auth\.ts$/, /src\/lib\/guard\.ts$/, /src\/lib\/health\.ts$/, /service\.ts$/, /src\/lib\/tabdata\.ts$/, /src\/lib\/audit\.ts$/, /dashboard-data\.ts$/, /init-sheet\.ts$/];
const bad: string[] = [];
for (const c of clientFiles) {
  const seen = new Set<string>(); const stack = [c];
  while (stack.length) {
    const f = stack.pop()!; if (seen.has(f)) continue; seen.add(f);
    for (const spec of importsOf(f)) {
      if (/^(jose|next\/headers|next-auth|googleapis)/.test(spec)) bad.push(`${c} → ${spec}`);
      const r = resolveMod(f, spec); if (!r) continue;
      if (FORBIDDEN.some((re) => re.test(r))) bad.push(`${c} → ${r}`); else stack.push(r);
    }
    if (/process\.env\.(?!NODE_ENV)/.test(read(f))) bad.push(`${f}: อ่าน process.env ในโค้ดฝั่ง Browser`);
  }
}
assert.deepEqual(bad, []); ok(`Client Component ${clientFiles.length} ไฟล์ (และไฟล์ที่ import ต่อ) ไม่แตะ Service Account/Sheets/Session/env ฝั่ง Server`);
assert.ok(!files.some((f) => /process\.env\.NEXT_PUBLIC_|process\.env\[["']NEXT_PUBLIC_/.test(read(f))) && !/^NEXT_PUBLIC_\w+\s*=/m.test(read(".env.example"))); ok('ไม่มีตัวแปรที่ใช้คำนำหน้า NEXT_PUBLIC_ (ซึ่งจะส่งค่าไป Browser) ทั้งในโค้ดและ .env.example');
for (const f of files) { const s = read(f); assert.ok(!/dangerouslySetInnerHTML|\beval\(|new Function\(/.test(s), `${f}: พบรูปแบบที่เสี่ยง XSS/โค้ดไดนามิก`); assert.ok(!/console\.log\(\s*process\.env/.test(s)); assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY-----\s*MI[A-Za-z0-9+/]{20}/.test(s), `${f}: พบ Private Key จริงในโค้ด`); }
ok("ไม่มี dangerouslySetInnerHTML / eval / การ log ค่า env / Private Key ฝังในโค้ด");
const gi = read(".gitignore"); assert.ok(/^\.env$/m.test(gi) && /\.env\.local/.test(gi) && /\.dev\.vars/.test(gi) && /service-account/.test(gi) && /\.pem/.test(gi));
const envEx = read(".env.example"); for (const line of envEx.split("\n").filter((l) => /^[A-Z_]+=/.test(l))) { const v = line.split("=").slice(1).join("=").split("#")[0].trim(); assert.ok(v === "" || /^"-----BEGIN PRIVATE KEY-----\\n\.\.\.\\n-----END PRIVATE KEY-----\\n"$/.test(v), `.env.example มีค่าจริง: ${line.slice(0, 40)}`); }
ok(".gitignore กันไฟล์ลับ (.env, .dev.vars, service-account*.json, *.pem) และ .env.example มีแต่ค่าว่าง/ตัวอย่าง");

console.log("4) สิทธิ์ระดับชุดข้อมูลส่งออก");
const { DATASETS } = await import("../src/lib/export/datasets");
for (const d of DATASETS) {
  if (d.sensitive) assert.ok(!d.roles.includes("production"), `${d.id}: ข้อมูล${d.sensitive}ห้ามเปิดให้ Production`);
  if (d.sensitive) assert.ok(!d.roles.includes("marketing"), `${d.id}: ข้อมูล${d.sensitive}ห้ามเปิดให้ Marketing`);
  if (d.group === "การตลาด") assert.ok(!d.roles.includes("ae"), `${d.id}: ข้อมูลโฆษณาไม่เปิดให้ AE`);
}
assert.deepEqual(DATASETS.filter((d) => d.sensitive).map((d) => d.id).sort(), ["leads", "sales", "sales_transactions"]); ok("ชุดข้อมูลส่วนบุคคล/การเงิน (leads, sales, sales_transactions) ไม่เปิดให้ Marketing; ข้อมูลโฆษณาไม่เปิดให้ Sales");

console.log("5) ตัวตรวจสิทธิ์ (checkRole)");
const { checkRole, crossSiteBlocked } = await import("../src/lib/guard-core");
const u = (role: string | null, email: string | null = "a@x.com") => ({ user: { email, role: role as never } });
assert.deepEqual(checkRole(null, ["admin"]), { ok: false, status: 401, error: "unauthenticated" }); assert.equal((checkRole(u(null), ["admin"]) as { status: number }).status, 401); assert.equal((checkRole(u("admin", null), ["admin"]) as { status: number }).status, 401);
assert.equal((checkRole(u("marketing"), ["admin", "ae"]) as { status: number }).status, 403); assert.equal(checkRole(u("sales"), ["admin", "ae"]).ok, true); assert.equal(checkRole(u("admin"), ["admin"]).ok, true);
assert.equal(checkRole(u("super_admin"), ["ae"]).ok, true); assert.equal((checkRole(u("admin"), ["ae"]) as { status: number }).status, 403); assert.equal((checkRole(u("ae"), ["admin"]) as { status: number }).status, 403);
ok("ไม่ล็อกอิน/ไม่มี Role → 401, Role ไม่ตรง → 403, ตรง → ผ่าน · Super Admin ผ่านทุกที่ · Admin ลบไม่ได้ (DELETE = AE) · \"sales\" เดิม = AE");
for (const s of ["cross-site", "same-site"]) { assert.equal(crossSiteBlocked(s), true); assert.equal((checkRole(u("admin"), ["admin"], s) as { status: number }).status, 403); }
for (const s of ["same-origin", "none", null, undefined]) assert.equal(checkRole(u("admin"), ["admin"], s).ok, true);
ok("คำขอที่มาจากเว็บอื่น (Sec-Fetch-Site: cross-site/same-site) ถูกปฏิเสธแม้มีสิทธิ์; same-origin และการเปิดลิงก์โดยตรงผ่าน");

console.log("6) CSV Injection");
const { csvSafe } = await import("../src/lib/csvsafe");
for (const v of ["=1+1", "@SUM(A1)", "+cmd|' /C calc'!A0", "-2+3+cmd", "\tx"]) assert.ok(String(csvSafe(v)).startsWith("'"), v);
for (const v of ["สมชาย", "+66 81 234 5678", "-500.25", "0812345678", "2026-09-01", "(02) 123-4567", ""]) assert.equal(csvSafe(v), v, v);
assert.equal(csvSafe(5), 5); ok("ข้อความที่ขึ้นต้นด้วย = @ + - (ที่ไม่ใช่ตัวเลข/เบอร์โทร) ถูกป้องกันก่อนเปิดใน Excel; ตัวเลข วันที่ ชื่อไทย เบอร์โทร ไม่ถูกแก้");
{
  const { navFor } = await import("../src/lib/roles");
  const kids = (r: "super_admin" | "admin" | "marketing" | "ae") => navFor(r).find((n) => n.label === "ตั้งค่า");
  assert.deepEqual(kids("super_admin")!.children!.map((c) => c.href), ["/settings", "/settings/targets", "/settings/import-guide", "/settings/metrics"]); assert.equal(kids("super_admin")!.href, "/settings");
  assert.deepEqual(kids("admin")!.children!.map((c) => c.href), ["/settings/targets", "/settings/import-guide", "/settings/metrics"]);
  assert.deepEqual(kids("marketing")!.children!.map((c) => c.href), ["/settings/metrics"]); assert.equal(kids("ae"), undefined);
  ok("เมนู ตั้งค่า: Super Admin เห็นทั้งหมด · Admin ไม่เห็น ตั้งค่าระบบ · Marketing เห็นเฉพาะคำอธิบายตัวเลข · AE ไม่เห็นเมนูตั้งค่า");
}
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
