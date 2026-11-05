"use client";
import { useCallback, useEffect, useState } from "react";

type TabReport = { tab: string; sheetRows: number; d1Rows: number; ok: boolean; hashMatch: boolean; missingColumns: string[]; sums: { column: string; sheet: number; d1: number }[]; note?: string };
type Report = { group: string; at: string; ok: boolean; tabs: TabReport[] };
type Group = { name: string; active: boolean; counts: { tab: string; rows: number | null }[]; report: Report | null };
type Status = { available: false } | { available: true; initialized: boolean; migrating: { group: string; since: string } | null; groups: Group[] };

const LABEL: Record<string, string> = {
  core: "แกนหลัก: ผู้ใช้ · Developer / Home Builder · ระบบบัญชี · Production Job",
  leads: "Leads (ผู้ซื้อ / ผู้ขาย) + ทรัพย์ของ Lead",
  sales: "Sales / Revenue · เป้าหมายรายเดือน · LINE OA · แคตตาล็อกบริการ · Area mapping",
  marketing: "ข้อมูลนำเข้าการตลาด: Meta Ads · Google Ads · Website · Facebook Page รายวัน + ประวัติการนำเข้า",
  fbposts: "สถิติโพสต์ Facebook (ตารางใหญ่ที่สุด — กด “ลองคัดลอกและตรวจเทียบ” ก่อนเสมอ)",
};

async function call(body: object) {
  const res = await fetch("/api/admin/d1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
  return j;
}

export function D1Manager() {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [shown, setShown] = useState<Report | null>(null);

  const load = useCallback(async () => {
    try { const r = await fetch("/api/admin/d1"); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); setSt(j); }
    catch (e) { setMsg({ kind: "error", text: e instanceof Error ? e.message : "โหลดสถานะไม่ได้" }); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(label: string, body: object, done: (j: any) => string | Report) { // eslint-disable-line @typescript-eslint/no-explicit-any
    setBusy(label); setMsg(null);
    try {
      const j = await call(body); const r = done(j);
      if (typeof r === "string") setMsg({ kind: "ok", text: r }); else setShown(r);
    } catch (e) { setMsg({ kind: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); }
    setBusy(""); await load();
  }

  if (!st) return <p className="text-sm text-slate-500">กำลังโหลดสถานะ...</p>;
  if (!st.available) return <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">ยังไม่พบฐานข้อมูล D1 (binding DB) — ตรวจ wrangler.jsonc แล้ว Deploy ใหม่</p>;

  const btn = "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={!!busy} onClick={() => run("init", { action: "init" }, (j) => `สร้างตารางใหม่ ${j.createdTables.length} ตาราง · เพิ่มคอลัมน์ ${Object.keys(j.addedColumns).length} ตาราง`)}
          className={`${btn} bg-brand-600 text-white hover:bg-brand-700`}>{busy === "init" ? "กำลังทำ..." : st.initialized ? "ตรวจ/เติมโครงสร้าง D1 (รันซ้ำได้)" : "1) เตรียมฐานข้อมูล D1"}</button>
        {st.migrating && <button disabled={!!busy} onClick={() => run("unlock", { action: "unlock" }, () => "ปลดล็อกแล้ว")} className={`${btn} border border-amber-300 text-amber-800`}>ปลดล็อกที่ค้าง ({st.migrating.group})</button>}
      </div>
      {st.migrating && <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">กำลังย้ายกลุ่ม {st.migrating.group} — การเขียนข้อมูลกลุ่มนี้ถูกล็อกชั่วคราว</p>}
      {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={`rounded-md p-3 text-sm ${msg.kind === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"}`}>{msg.text}</p>}

      {st.groups.map((g) => (
        <div key={g.name} className="rounded-lg border border-slate-200 p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{LABEL[g.name] ?? g.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs ${g.active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}>{g.active ? "ใช้ D1 อยู่" : "ยังใช้ Google Sheets"}</span>
          </div>
          <p className="mb-3 text-xs text-slate-500">จำนวนแถวใน D1: {g.counts.map((c) => `${c.tab} ${c.rows ?? "—"}`).join(" · ")}</p>
          <div className="flex flex-wrap gap-2">
            {!g.active && <>
              <button disabled={!!busy || !st.initialized} onClick={() => run(`check-${g.name}`, { action: "check", group: g.name }, (j) => j)} className={`${btn} border border-slate-300 hover:bg-slate-50`}>{busy === `check-${g.name}` ? "กำลังตรวจ..." : "2) ลองคัดลอกและตรวจเทียบ (ยังไม่สลับ)"}</button>
              <button disabled={!!busy || !st.initialized || !g.report?.ok}
                onClick={() => { if (confirm("สลับกลุ่มนี้มาใช้ D1 ตอนนี้?\n\nระบบจะล็อกการเขียนชั่วคราวไม่กี่วินาที คัดลอกใหม่ ตรวจเทียบทุกแท็บ แล้วสลับเฉพาะเมื่อตรงทั้งหมด\nGoogle Sheet เดิมไม่ถูกแก้หรือลบ")) void run(`cut-${g.name}`, { action: "cutover", group: g.name }, (j) => j.switched ? `สลับกลุ่ม ${g.name} มาใช้ D1 แล้ว ตรวจเทียบตรงทุกแท็บ` : j.report); }}
                className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>{busy === `cut-${g.name}` ? "กำลังย้าย (ราว 10–30 วินาที)..." : "3) ย้ายและสลับมาใช้ D1"}</button>
            </>}
            {g.active && <button disabled={!!busy} onClick={() => { if (confirm("กลับไปใช้ Google Sheets?\n\nข้อมูลที่แก้หลังสลับมา D1 จะอยู่ใน D1 เท่านั้น ไม่ย้อนกลับไปที่ Sheets")) void run(`rb-${g.name}`, { action: "rollback", group: g.name }, () => `กลับไปใช้ Google Sheets สำหรับกลุ่ม ${g.name} แล้ว`); }} className={`${btn} border border-red-300 text-red-700 hover:bg-red-50`}>กลับไปใช้ Google Sheets</button>}
            {g.report && <button onClick={() => setShown(g.report)} className={`${btn} text-slate-600 underline`}>ดูรายงานตรวจเทียบล่าสุด</button>}
          </div>
        </div>
      ))}

      {shown && (
        <div className="rounded-lg border border-slate-200 p-4">
          <p className={`mb-2 text-sm font-medium ${shown.ok ? "text-green-700" : "text-red-700"}`}>
            รายงานตรวจเทียบกลุ่ม {shown.group} ({new Date(shown.at).toLocaleString("th-TH")}) — {shown.ok ? "ตรงทุกแท็บ" : "ไม่ตรง (ยังไม่สลับ)"}
          </p>
          <div className="overflow-x-auto"><table className="w-full text-left text-xs">
            <thead><tr className="border-b text-slate-500"><th className="py-1 pr-3">แท็บ</th><th className="pr-3">Sheets</th><th className="pr-3">D1</th><th className="pr-3">เนื้อหาตรง</th><th>ยอดรวม</th></tr></thead>
            <tbody>{shown.tabs.map((t) => (
              <tr key={t.tab} className={`border-b ${t.ok ? "" : "bg-red-50"}`}>
                <td className="py-1 pr-3 font-mono">{t.tab}{t.note ? ` (${t.note})` : ""}</td><td className="pr-3">{t.sheetRows}</td><td className="pr-3">{t.d1Rows}</td>
                <td className="pr-3">{t.hashMatch ? "✓" : "✗"}{t.missingColumns.length ? ` ขาดคอลัมน์ ${t.missingColumns.join(",")}` : ""}</td>
                <td>{t.sums.map((s) => `${s.column}: ${s.sheet.toLocaleString()} / ${s.d1.toLocaleString()}`).join(" · ") || "—"}</td>
              </tr>))}</tbody>
          </table></div>
          {!shown.ok && <p className="mt-2 text-xs text-slate-600">ถ้ามีคนกรอกข้อมูลระหว่างตรวจ ผลอาจไม่ตรงชั่วคราว — ลองอีกครั้งตอนไม่มีคนใช้งาน</p>}
        </div>
      )}
    </div>
  );
}
