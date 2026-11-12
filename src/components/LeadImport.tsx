"use client";
import { useRef, useState } from "react";
import { parseCsv, readTextFile, toCsv } from "@/lib/csv";
import { readXlsx } from "@/lib/xlsx";
import { LEAD_TEMPLATE, MAX_IMPORT_ROWS } from "@/lib/lead-import";
import { CHANNELS } from "@/lib/dashboard";
import { BUY_STATUS, CALL_STATUS, CONDITIONS, NEEDS, PRICE_RANGES, PROPERTY_TYPES, SELL_STATUS } from "@/lib/leads";

/**
 * นำเข้า Lead จากไฟล์ CSV / XLSX (12/11/2026)
 * เลือกไฟล์ → ระบบตรวจก่อน (เพิ่ม / ซ้ำ / ไม่ถูกต้อง) → กดยืนยันจึงเพิ่มจริง · แถวที่ ชื่อ / เบอร์โทร / Line ซ้ำ (ฝั่งเดียวกัน) ถูกข้าม
 */
type Plan = { counts: { insert: number; duplicate: number; invalid: number }; results: { n: number; status: string; name: string; errors?: Record<string, string>; matches?: string[] }[]; committed: boolean; codes?: string[] };

const btnCls = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50";

export function downloadLeadTemplate() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([toCsv(LEAD_TEMPLATE)], { type: "text/csv;charset=utf-8" }));
  a.download = "lead_import_template.csv"; a.click(); URL.revokeObjectURL(a.href);
}

async function readGrid(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { sheet } = await readXlsx(await file.arrayBuffer(), "");
    return sheet.rows.map((r) => r.map((c) => (c === null ? "" : typeof c === "number" && c > 30000 && c < 80000 && Number.isInteger(c) ? new Date(Date.UTC(1899, 11, 30) + c * 864e5).toISOString().slice(0, 10) : String(c))));
  }
  return parseCsv(await readTextFile(file));
}

/** คืน ปุ่ม (วางในแถบเครื่องมือ) และ แผงผลการตรวจ (วางใต้แถบ) */
export function useLeadImport(onDone: (text: string) => void) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<{ name: string; grid: string[][]; plan?: Plan } | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  async function post(action: "import_plan" | "import_commit", grid: string[][]): Promise<Plan> {
    const r = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, grid }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `นำเข้าไม่สำเร็จ (${r.status})`);
    return j as Plan;
  }
  async function pick(file?: File | null) {
    if (!file) return; setErr(""); setBusy(true);
    try {
      const grid = await readGrid(file);
      if (grid.length - 1 > MAX_IMPORT_ROWS) throw new Error(`ไฟล์มี ${grid.length - 1} แถว — นำเข้าได้ครั้งละไม่เกิน ${MAX_IMPORT_ROWS.toLocaleString()} แถว`);
      setImp({ name: file.name, grid, plan: await post("import_plan", grid) });
    } catch (e) { setImp(null); setErr(e instanceof Error ? e.message : "อ่านไฟล์ไม่ได้"); } finally { setBusy(false); }
  }
  async function commit() {
    if (!imp) return; setBusy(true); setErr("");
    try {
      const plan = await post("import_commit", imp.grid); setImp({ ...imp, plan });
      onDone(plan.committed ? `นำเข้า ${plan.counts.insert} รายการแล้ว${plan.codes?.length ? ` (${plan.codes[0]}–${plan.codes[plan.codes.length - 1]})` : ""}` : "ไม่มีรายการที่เพิ่มได้");
    } catch (e) { setErr(e instanceof Error ? e.message : "นำเข้าไม่สำเร็จ"); } finally { setBusy(false); }
  }

  const p = imp?.plan; const problems = p?.results.filter((r) => r.status !== "insert") ?? [];
  const buttons = (
    <>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={btnCls}>{busy && !imp ? "กำลังตรวจไฟล์…" : "นำเข้า CSV"}</button>
      <input ref={fileRef} type="file" accept=".csv,text/csv,.xlsx" aria-label="ไฟล์ Lead (CSV / XLSX)" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button type="button" onClick={downloadLeadTemplate} className={btnCls}>ดาวน์โหลดฟอร์ม CSV</button>
    </>);
  const panel = (err || imp) ? (
        <section aria-label="ผลการนำเข้า Lead" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex flex-wrap items-start gap-2">
            <h2 className="font-semibold">นำเข้า Lead จากไฟล์{imp && <span className="font-normal text-slate-600"> · {imp.name}</span>}</h2>
            <button type="button" onClick={() => { setImp(null); setErr(""); }} className="ml-auto text-sm underline">ปิด</button>
          </div>
          {err && <p role="alert" className="rounded-md bg-red-50 p-2 text-red-700">{err}</p>}
          {p && (<>
            <p>เพิ่มได้ <b>{p.counts.insert}</b> · ซ้ำ (ข้าม) <b>{p.counts.duplicate}</b> · ไม่ถูกต้อง <b>{p.counts.invalid}</b>{p.committed && <span className="font-semibold text-emerald-700"> — นำเข้าแล้ว</span>}</p>
            {problems.length > 0 && (
              <ul className="max-h-60 space-y-0.5 overflow-y-auto rounded-md bg-amber-50 p-2 text-xs text-amber-900" aria-label="แถวที่ไม่ได้นำเข้า">
                {problems.map((r) => <li key={r.n}>แถว {r.n} {r.name || "(ไม่มีชื่อ)"}: {r.status === "duplicate" ? `ซ้ำกับ ${r.matches?.join(", ")}` : Object.values(r.errors ?? {}).join(" · ")}</li>)}
              </ul>)}
            {!p.committed && p.counts.insert > 0 && <button type="button" onClick={commit} disabled={busy} className="rounded-lg bg-brand-600 px-4 py-1.5 font-medium text-white hover:bg-brand-700 disabled:opacity-40">{busy ? "กำลังนำเข้า…" : `ยืนยันนำเข้า ${p.counts.insert} รายการ`}</button>}
            {!p.committed && p.counts.insert === 0 && <p className="text-slate-600">ไม่มีแถวที่เพิ่มได้ — แก้ไฟล์แล้วเลือกใหม่</p>}
          </>)}
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer">วิธีกรอกไฟล์</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              <li>ใช้หัวคอลัมน์ตามฟอร์ม · ต้องมี <b>ชื่อลูกค้า</b> และ <b>ความต้องการ</b> · วันที่รับว่าง = วันนี้ · ช่องทางว่าง = Unknown</li>
              <li>วันที่: 2026-11-12 หรือ 12/11/2026 หรือ 12/11/2569</li>
              <li>ซ้ำ = ฝั่งเดียวกัน (ซื้อ/เช่า/สร้าง หรือ ขาย) และ ชื่อ / เบอร์โทร / Line เหมือน Lead ที่มีอยู่หรือแถวก่อนหน้าในไฟล์ → ข้าม</li>
              <li>ความต้องการ: {NEEDS.join(" / ")} · ช่องทาง: {CHANNELS.join(" / ")}</li>
              <li>สถานะ — ซื้อ/เช่า/สร้าง: {BUY_STATUS.join(" / ")} · ขาย: {SELL_STATUS.join(" / ")}</li>
              <li>Call Status: {CALL_STATUS.join(" / ")} · ประเภททรัพย์: {PROPERTY_TYPES.join(" / ")}</li>
              <li>ช่วงราคา: {PRICE_RANGES.join(" / ")} · สภาพทรัพย์: {CONDITIONS.join(" / ")} · Staff ต้องตรงกับชื่อผู้ใช้</li>
            </ul>
          </details>
        </section>) : null;
  return { buttons, panel };
}
