"use client";
import { Skeleton } from "@/components/Skeleton";
import { DateInput } from "@/components/DateInput";
import { thDate, thDateTime, thMonth, thDayMonth } from "@/lib/thdate";
import { useCallback, useEffect, useRef, useState } from "react";
import { toCsv } from "@/lib/csv";
import { readXlsx, XlsxError, type Cell } from "@/lib/xlsx";

type Err = { row: number; column: string; raw: string; code: string; message: string };
type Plan = {
  fileName: string; fingerprint: string; headerRow: number;
  company: { name: string; taxId: string }; period: { start: string; end: string; label: string; derived: boolean };
  needs: string[]; counts: { total: number; insert: number; update: number; duplicate: number; invalid: number };
  totals: { gross: number; discount: number; totalNet: number; vat: number; paidNet: number; docs: number; customers: number; insertNet: number };
  reportTotals: Record<string, number> | null; warnings: string[]; errors: Err[]; missingOptional: string[]; mode: "skip" | "update";
  preview: { row: number; invoice_no: string; status: "insert" | "update" | "duplicate"; dupSource?: string; invoice_date: string; customer_name: string; project_name: string; salesperson: string; total_net: number; payment_status: string }[];
};
type Batch = Record<string, string>;
const thb = (n: number) => `฿${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dmy = (iso: string) => thDate(iso) || "-";
const when = (iso: string) => thDateTime(iso);
const ST: Record<string, [string, string]> = { insert: ["เพิ่มใหม่", "bg-green-100 text-green-800"], update: ["อัปเดต", "bg-blue-100 text-blue-800"], duplicate: ["ซ้ำ (ข้าม)", "bg-slate-100 text-slate-600"] };

/** incoming: ไฟล์ที่เลือกมาจากหน้า นำเข้า CSV */
export function SalesImport({ incoming, embedded = false }: { incoming?: { file: File; id: number }; embedded?: boolean } = {}) {
  // embedded = อยู่ในหน้า นำเข้า CSV: ไม่แสดงช่องอัปโหลดซ้ำ (ใช้ช่องรวมด้านบน) และไม่แสดงประวัติซ้ำ (ดูได้ที่หน้า Sales)
  const [file, setFile] = useState<{ name: string; sheet: string; grid: Cell[][]; at: string } | null>(null);
  const [edit, setEdit] = useState({ taxId: "", companyName: "", periodStart: "", periodEnd: "" });
  const [mode, setMode] = useState<"skip" | "update">("skip");
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<"idle" | "reading" | "loading" | "ready" | "committing" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ counts: Plan["counts"]; errors: Err[] } | null>(null);
  const [hist, setHist] = useState<{ state: "loading" | "ok" | "error"; rows: Batch[]; error?: string }>({ state: "loading", rows: [] });
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const loadHist = useCallback(async () => {
    try { const r = await fetch("/api/sales/history"); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); setHist({ state: "ok", rows: j.batches }); }
    catch (e) { setHist({ state: "error", rows: [], error: e instanceof Error ? e.message : "error" }); }
  }, []);
  useEffect(() => { loadHist(); }, [loadHist]);

  async function call(path: string, body: object) {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j;
  }
  const body = (f = file!, e = edit, m = mode) => ({ fileName: f.name, sheetName: f.sheet, grid: f.grid, taxId: e.taxId || undefined, companyName: e.companyName || undefined, periodStart: e.periodStart || undefined, periodEnd: e.periodEnd || undefined, mode: m });

  async function runPlan(f = file, e = edit, m = mode, fresh = false) {
    if (!f) return;
    setState("loading"); setError(""); setResult(null);
    try {
      const p: Plan = await call("/api/sales/plan", body(f, fresh ? { taxId: "", companyName: "", periodStart: "", periodEnd: "" } : e, m));
      setPlan(p); setEdit({ taxId: p.company.taxId, companyName: p.company.name, periodStart: p.period.start, periodEnd: p.period.end }); setState("ready");
    } catch (err) { setPlan(null); setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด"); setState("error"); }
  }

  useEffect(() => { if (incoming) pick(incoming.file); }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps
  async function pick(f?: File | null) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { setError("รองรับเฉพาะไฟล์ Excel .xlsx"); setState("error"); return; }
    if (f.size > 10 * 1024 * 1024) { setError("ไฟล์ใหญ่เกิน 10 MB"); setState("error"); return; }
    setState("reading"); setError(""); setPlan(null); setMode("skip"); setConfirmUpdate(false);
    try {
      const { sheet } = await readXlsx(await f.arrayBuffer());
      const next = { name: f.name, sheet: sheet.name, grid: sheet.rows, at: new Date().toISOString() };
      setFile(next); await runPlan(next, edit, "skip", true);
    } catch (e) { setError(e instanceof XlsxError ? e.message : "อ่านไฟล์ Excel ไม่สำเร็จ: " + (e instanceof Error ? e.message : "")); setState("error"); }
  }

  async function commit() {
    setState("committing"); setError("");
    try { const r = await call("/api/sales/commit", { ...body(), confirmUpdate }); setResult(r); setState("done"); loadHist(); }
    catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); setState("error"); }
  }
  function downloadErrors(errors: Err[]) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([toCsv([["source_row_number", "column", "raw_value", "error_code", "message"], ...errors.map((e) => [e.row, e.column, e.raw, e.code, e.message])])], { type: "text/csv;charset=utf-8" }));
    a.download = `sales_import_errors_${file?.name ?? "file"}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  function reset() { setFile(null); setPlan(null); setState("idle"); setError(""); setResult(null); setMode("skip"); setConfirmUpdate(false); if (input.current) input.current.value = ""; }

  const locked = state === "committing" || state === "done";
  const canCommit = state === "ready" && plan && plan.needs.length === 0 && plan.counts.insert + plan.counts.update + plan.counts.duplicate > 0 && (mode === "skip" || confirmUpdate);
  const inp = "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm";

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        {!embedded && (
        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
          className={`rounded-lg border-2 border-dashed p-8 text-center ${drag ? "border-brand-600 bg-slate-100" : "border-slate-300 bg-white"}`}>
          <p className="mb-3 text-slate-600">ลากไฟล์รายงานยอดขาย (.xlsx) มาวางที่นี่ หรือ</p>
          <button onClick={() => input.current?.click()} disabled={locked} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40">เลือกไฟล์</button>
          <input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <p className="mt-3 text-xs text-slate-500">ระบบหาหัวตารางจากชื่อคอลัมน์เอง · อ่านไฟล์ในเบราว์เซอร์ · ยังไม่เขียนข้อมูลจนกว่าจะกดยืนยัน</p>
        </div>
        )}
        {file && <p className="text-sm text-slate-600">ไฟล์: <b>{file.name}</b> · ชีต {file.sheet} · อัปโหลด {when(file.at)} · สถานะ: {({ reading: "กำลังอ่านไฟล์", loading: "กำลังตรวจสอบ", ready: "รอยืนยัน", committing: "กำลังนำเข้า", done: "นำเข้าแล้ว", error: "มีข้อผิดพลาด", idle: "" })[state]}</p>}
        {(state === "reading" || state === "loading") && <p role="status" className="text-sm text-slate-500">กำลังประมวลผล...</p>}
        {state === "error" && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {plan && state !== "idle" && state !== "reading" && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
            <div className="grid gap-3 md:grid-cols-4 text-sm">
              <label className="md:col-span-2"><span className="mb-1 block text-xs text-slate-500">บริษัทผู้ขาย</span><input className={inp + " w-full"} value={edit.companyName} disabled={locked} onChange={(e) => setEdit({ ...edit, companyName: e.target.value })} onBlur={() => runPlan()} /></label>
              <label><span className="mb-1 block text-xs text-slate-500">เลขผู้เสียภาษีผู้ขาย (13 หลัก) *</span><input className={inp + " w-full"} value={edit.taxId} disabled={locked} inputMode="numeric" onChange={(e) => setEdit({ ...edit, taxId: e.target.value })} onBlur={() => runPlan()} /></label>
              <div />
              <label><span className="mb-1 block text-xs text-slate-500">ช่วงรายงาน เริ่ม</span><DateInput className={inp} value={edit.periodStart} disabled={locked} onChange={(e) => { const v = { ...edit, periodStart: e.target.value }; setEdit(v); runPlan(file, v); }} /></label>
              <label><span className="mb-1 block text-xs text-slate-500">สิ้นสุด</span><DateInput className={inp} value={edit.periodEnd} disabled={locked} onChange={(e) => { const v = { ...edit, periodEnd: e.target.value }; setEdit(v); runPlan(file, v); }} /></label>
              <p className="self-end text-xs text-slate-500 md:col-span-2">ช่วงรายงาน: {plan.period.label || "-"}{plan.period.derived && " (ไม่พบในไฟล์ ใช้ช่วงวันที่ของเอกสาร — โปรดตรวจ)"} · หัวตารางอยู่แถว {plan.headerRow}</p>
            </div>
            {plan.needs.map((n, i) => <p key={i} role="alert" className="rounded-md bg-red-50 p-2 text-sm text-red-700">{n}</p>)}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {([["total", "รายการทั้งหมด", "text-slate-900"], ["insert", "รายการใหม่", "text-green-700"], ["duplicate", "ซ้ำ (ข้าม)", "text-slate-600"], ["update", "อัปเดต", "text-blue-700"], ["invalid", "มีข้อผิดพลาด", "text-red-700"]] as const).map(([k, l, c]) => (
                <div key={k} className="rounded-md border border-slate-200 p-3"><div className={`text-2xl font-bold ${c}`}>{plan.counts[k]}</div><div className="text-xs text-slate-500">{l}</div></div>))}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[["ยอดสุทธิรวม", thb(plan.totals.totalNet)], ["ก่อนส่วนลด", thb(plan.totals.gross)], ["ส่วนลด", thb(plan.totals.discount)], ["เอกสาร / ลูกค้า", `${plan.totals.docs} / ${plan.totals.customers}`]].map(([l, v]) => (
                <div key={l} className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">{l}</div><div className="font-semibold tabular-nums">{v}</div></div>))}
            </div>
            {plan.reportTotals?.total_net_col !== undefined && <p className="text-xs text-slate-500">ยอดรวมสุทธิตามแถวสรุปในไฟล์: {thb(plan.reportTotals.total_net_col)}</p>}
            {plan.warnings.map((w, i) => <p key={i} className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">⚠ {w}</p>)}
            {plan.missingOptional.length > 0 && <p className="text-xs text-slate-500">คอลัมน์ที่ไม่พบในไฟล์ (เว้นว่าง): {plan.missingOptional.join(", ")}</p>}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="mb-1 text-left text-xs text-slate-500">ตัวอย่าง {plan.preview.length} รายการแรก (จากทั้งหมด {plan.counts.total - plan.counts.invalid})</caption>
                <thead><tr className="border-b text-xs text-slate-500"><th className="py-1 pr-3">แถว</th><th className="pr-3">สถานะ</th><th className="pr-3">วันที่</th><th className="pr-3">เลขที่เอกสาร</th><th className="pr-3">ลูกค้า</th><th className="pr-3">โปรเจ็ค</th><th className="pr-3">พนักงานขาย</th><th className="pr-3 text-right">ยอดสุทธิ</th><th>สถานะเก็บเงิน</th></tr></thead>
                <tbody>{plan.preview.map((r) => (
                  <tr key={r.row} className="border-b border-slate-100"><td className="py-1 pr-3 text-slate-500">{r.row}</td>
                    <td className="pr-3"><span className={`rounded px-1.5 py-0.5 text-xs ${ST[r.status][1]}`}>{ST[r.status][0]}{r.dupSource === "manual" ? " (กรอกมือ)" : ""}</span></td>
                    <td className="whitespace-nowrap pr-3">{dmy(r.invoice_date)}</td><td className="pr-3">{r.invoice_no}</td><td className="max-w-48 truncate pr-3">{r.customer_name}</td><td className="max-w-40 truncate pr-3">{r.project_name}</td><td className="pr-3">{r.salesperson}</td>
                    <td className="pr-3 text-right tabular-nums">{r.total_net.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td><td>{r.payment_status}</td></tr>))}</tbody>
              </table>
            </div>

            {plan.errors.length > 0 && (
              <div><div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold text-red-700">ข้อผิดพลาด {plan.counts.invalid} แถว (แสดง 10 รายการแรก)</h3><button onClick={() => downloadErrors(plan.errors)} className="text-sm underline">ดาวน์โหลด Error Report (CSV)</button></div>
                <ul className="space-y-1 text-sm text-red-800">{plan.errors.slice(0, 10).map((e, i) => <li key={i}>แถว {e.row} · {e.column} · {e.message}</li>)}</ul></div>
            )}

            {state !== "done" && (
              <div className="space-y-3 border-t pt-4">
                <fieldset className="space-y-1 text-sm" disabled={locked}>
                  <legend className="mb-1 font-medium">เมื่อพบเอกสารที่เคยนำเข้าแล้ว</legend>
                  <label className="flex items-center gap-2"><input type="radio" checked={mode === "skip"} onChange={() => { setMode("skip"); setConfirmUpdate(false); runPlan(file, edit, "skip"); }} /> ข้ามรายการเดิม (ค่าเริ่มต้น — ไม่นับยอดซ้ำ)</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={mode === "update"} onChange={() => { setMode("update"); runPlan(file, edit, "update"); }} /> อัปเดตรายการเดิมที่ค่าเปลี่ยน</label>
                  {mode === "update" && <label className="ml-6 flex items-center gap-2 text-amber-800"><input type="checkbox" checked={confirmUpdate} onChange={(e) => setConfirmUpdate(e.target.checked)} /> ยืนยันว่าต้องการเขียนทับรายการเดิม {plan.counts.update} รายการ</label>}
                </fieldset>
                <div className="flex gap-3">
                  <button onClick={commit} disabled={!canCommit} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40">{state === "committing" ? "กำลังนำเข้า..." : `ยืนยันนำเข้า (เพิ่ม ${plan.counts.insert}${mode === "update" ? ` / อัปเดต ${plan.counts.update}` : ""})`}</button>
                  <button onClick={reset} disabled={state === "committing"} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">ยกเลิก</button>
                </div>
              </div>
            )}
          </div>
        )}
        {state === "done" && result && (
          <div role="status" className="space-y-2 rounded-lg bg-green-50 p-4 text-green-900">
            <p className="font-semibold">นำเข้าสำเร็จ {result.counts.insert + result.counts.update} รายการ (เพิ่ม {result.counts.insert} · อัปเดต {result.counts.update}) · ซ้ำ/ข้าม {result.counts.duplicate} · ไม่สำเร็จ {result.counts.invalid}</p>
            <div className="flex gap-4 text-sm">{result.errors.length > 0 && <button onClick={() => downloadErrors(result.errors)} className="underline">ดาวน์โหลด Error Report</button>}<a href="/sales" className="underline">ไปดูแดชบอร์ดยอดขาย</a><button onClick={reset} className="underline">นำเข้าไฟล์อื่น</button></div>
          </div>
        )}
      </section>

      {!embedded && <section>
        <h2 className="mb-2 text-lg font-semibold">ประวัติการนำเข้า</h2>
        {hist.state === "loading" && <Skeleton kind={"rows"} />}
        {hist.state === "error" && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">โหลดประวัติไม่ได้: {hist.error}</p>}
        {hist.state === "ok" && hist.rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">ยังไม่มีประวัติการนำเข้า</p>}
        {hist.state === "ok" && hist.rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm">
            <thead><tr className="border-b bg-slate-50 text-xs text-slate-500"><th className="p-2">เวลา</th><th>ไฟล์</th><th>ช่วงรายงาน</th><th>สถานะ</th><th>เพิ่ม/อัปเดต/ซ้ำ/ผิด</th><th className="text-right">ยอดนำเข้า</th><th className="pl-3">โดย</th></tr></thead>
            <tbody>{hist.rows.map((b) => (<tr key={b.batch_id} className="border-b border-slate-100"><td className="whitespace-nowrap p-2">{when(b.imported_at)}</td><td className="max-w-56 truncate">{b.source_file}</td><td className="whitespace-nowrap">{dmy(b.report_start)}–{dmy(b.report_end)}</td>
              <td><span className={`rounded px-1.5 py-0.5 text-xs ${b.status === "success" ? "bg-green-100 text-green-800" : b.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{b.status}</span></td>
              <td className="whitespace-nowrap">{b.rows_inserted}/{b.rows_updated}/{b.rows_skipped}/{b.rows_invalid}</td><td className="text-right tabular-nums">{b.total_net_imported ? Number(b.total_net_imported).toLocaleString("en-US") : ""}</td><td className="max-w-40 truncate pl-3">{b.imported_by}</td></tr>))}</tbody></table></div>
        )}
      </section>}
    </div>
  );
}
