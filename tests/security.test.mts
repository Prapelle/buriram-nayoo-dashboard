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
const EXPECT: Record<string, string[] | "public"> = {
  "src/app/api/auth/[...nextauth]/route.ts": "public", // Auth.js จัดการเอง (login/callback)
  "src/app/api/init/route.ts": ["admin"], "src/app/api/health/route.ts": ["admin"], "src/app/api/users/route.ts": ["admin"], "src/app/api/website/route.ts": ["admin", "marketing"],
  "src/app/api/import/plan/route.ts": ["admin", "marketing"], "src/app/api/import/commit/route.ts": ["admin", "marketing"], "src/app/api/import/history/route.ts": ["admin", "marketing"],
  "src/app/api/line-oa/route.ts": ["admin", "marketing"],
  "src/app/api/leads/route.ts": ["admin", "sales"],
  "src/app/api/sales/plan/route.ts": ["admin", "sales"], "src/app/api/sales/commit/route.ts": ["admin", "sales"], "src/app/api/sales/history/route.ts": ["admin", "sales"],
  "src/app/api/export/sales-transactions/route.ts": ["admin", "sales"],
  "src/app/api/export/[dataset]/route.ts": ["admin", "marketing", "sales"], // สิทธิ์รายชุดข้อมูลบังคับใน service (ตรวจในข้อ 3)
};
assert.deepEqual(routes.filter((r) => !(r in EXPECT)), [], "พบ API Route ใหม่ที่ยังไม่ได้กำหนดสิทธิ์ในเทสต์นี้ — ต้องตรวจสอบก่อน");
for (const r of routes) {
  const exp = EXPECT[r]; if (exp === "public") continue;
  const src = read(r);
  const handlers = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].length;
  const guards = [...src.matchAll(/requireRole\(\[([^\]]*)\]\)/g)];
  assert.equal(guards.length, handlers, `${r}: ทุก handler ต้องเรียก requireRole`);
  for (const g of guards) assert.deepEqual([...g[1].matchAll(/"(\w+)"/g)].map((m) => m[1]).sort(), [...exp].sort(), `${r}: สิทธิ์ไม่ตรงที่กำหนด`);
}
ok(`API Route ${routes.length} ไฟล์: ทุก handler ตรวจ Session+Role และสิทธิ์ตรงตามที่กำหนด (Leads/Sales/ยอดขาย = Admin+Sales เท่านั้น, ข้อมูลโฆษณา = Admin+Marketing)`);

console.log("2) หน้าจอและการล็อกอิน");
const layout = read("src/app/(app)/layout.tsx"); assert.ok(layout.includes("auth()") && layout.includes('redirect("/login")') && /!role/.test(layout)); ok("Layout ของทุกหน้าในระบบ: ไม่ได้ล็อกอิน/ไม่มี Role → ส่งไปหน้า login");
const guardedPages = ["import", "facebook-page", "facebook-ads", "google-ads", "line-oa", "leads", "sales", "sales/import", "settings"];
for (const p of guardedPages) { const s = read(`src/app/(app)/${p}/page.tsx`); assert.ok(s.includes("auth()") && s.includes('redirect("/")'), `${p}: ต้องตรวจ Role ฝั่ง Server`); }
const pageRoles = (p: string) => (read(`src/app/(app)/${p}/page.tsx`).match(/role !== "(\w+)"/g) ?? []).map((x) => x.match(/"(\w+)"/)![1]).sort();
assert.deepEqual(pageRoles("leads"), ["admin", "sales"]); assert.deepEqual(pageRoles("sales"), ["admin", "sales"]); assert.deepEqual(pageRoles("sales/import"), ["admin", "sales"]); assert.deepEqual(pageRoles("import"), ["admin", "marketing"]); assert.deepEqual(pageRoles("line-oa"), ["admin", "marketing"]); assert.deepEqual(pageRoles("facebook-ads"), ["admin", "marketing"]); assert.deepEqual(pageRoles("settings"), ["admin"]);
ok(`หน้าจอที่จำกัดสิทธิ์ ${guardedPages.length} หน้า ตรวจ Role ฝั่ง Server และสิทธิ์ตรงกับ API`);
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
  if (d.sensitive) assert.ok(!d.roles.includes("marketing"), `${d.id}: ข้อมูล${d.sensitive}ห้ามเปิดให้ Marketing`);
  if (d.group === "การตลาด") assert.ok(!d.roles.includes("sales"), `${d.id}: ข้อมูลโฆษณาไม่เปิดให้ Sales`);
}
assert.deepEqual(DATASETS.filter((d) => d.sensitive).map((d) => d.id).sort(), ["leads", "sales", "sales_transactions"]); ok("ชุดข้อมูลส่วนบุคคล/การเงิน (leads, sales, sales_transactions) ไม่เปิดให้ Marketing; ข้อมูลโฆษณาไม่เปิดให้ Sales");

console.log("5) ตัวตรวจสิทธิ์ (checkRole)");
const { checkRole, crossSiteBlocked } = await import("../src/lib/guard-core");
const u = (role: string | null, email: string | null = "a@x.com") => ({ user: { email, role: role as never } });
assert.deepEqual(checkRole(null, ["admin"]), { ok: false, status: 401, error: "unauthenticated" }); assert.equal((checkRole(u(null), ["admin"]) as { status: number }).status, 401); assert.equal((checkRole(u("admin", null), ["admin"]) as { status: number }).status, 401);
assert.equal((checkRole(u("marketing"), ["admin", "sales"]) as { status: number }).status, 403); assert.equal(checkRole(u("sales"), ["admin", "sales"]).ok, true); assert.equal(checkRole(u("admin"), ["admin"]).ok, true);
ok("ไม่ล็อกอิน/ไม่มี Role → 401, Role ไม่ตรง → 403, ตรง → ผ่าน");
for (const s of ["cross-site", "same-site"]) { assert.equal(crossSiteBlocked(s), true); assert.equal((checkRole(u("admin"), ["admin"], s) as { status: number }).status, 403); }
for (const s of ["same-origin", "none", null, undefined]) assert.equal(checkRole(u("admin"), ["admin"], s).ok, true);
ok("คำขอที่มาจากเว็บอื่น (Sec-Fetch-Site: cross-site/same-site) ถูกปฏิเสธแม้มีสิทธิ์; same-origin และการเปิดลิงก์โดยตรงผ่าน");

console.log("6) CSV Injection");
const { csvSafe } = await import("../src/lib/csvsafe");
for (const v of ["=1+1", "@SUM(A1)", "+cmd|' /C calc'!A0", "-2+3+cmd", "\tx"]) assert.ok(String(csvSafe(v)).startsWith("'"), v);
for (const v of ["สมชาย", "+66 81 234 5678", "-500.25", "0812345678", "2026-09-01", "(02) 123-4567", ""]) assert.equal(csvSafe(v), v, v);
assert.equal(csvSafe(5), 5); ok("ข้อความที่ขึ้นต้นด้วย = @ + - (ที่ไม่ใช่ตัวเลข/เบอร์โทร) ถูกป้องกันก่อนเปิดใน Excel; ตัวเลข วันที่ ชื่อไทย เบอร์โทร ไม่ถูกแก้");
console.log(`\nผ่านทั้งหมด ${pass} รายการ`);
