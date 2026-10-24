"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SPECS } from "@/lib/import/specs";
import { toCsv } from "@/lib/csv";

type Err = { row: number; column: string; raw: string; code: string; message: string };
type Counts = { total: number; insert: number; update: number; skip: number; invalid: number };
type Plan = {
  spec: { id: string; label: string; tab: string; source: string; period: "file" | "user" | "snapshot"; comparison: boolean };
  detected: boolean;
  periodError?: string;
  ctx: { reportStart?: string; reportEnd?: string; comparisonStart?: string; comparisonEnd?: string; area: string; snapshotDate?: string };
  period: { start: string; end: string };
  counts: Counts; warnings: string[]; errors: Err[];
  fileDuplicate: { batchId: string; uploadedAt: string; uploadedBy: string } | null;
  previewColumns: string[];
  preview: { n: number; status: string; values: Record<string, string | number> | null }[];
};
type Batch = { batch_id: string; report_type: string; filename: string; report_start: string; report_end: string; uploaded_by: string; uploaded_at: string; status: string; rows_total: string; rows_inserted: string; rows_updated: string; rows_skipped: string; rows_invalid: string; error_summary: string };

const AREAS = [["unknown", "ไม่ทราบ (Unknown)"], ["buriram", "บุรีรัมย์"], ["surin", "สุรินทร์"], ["multi_province", "หลายจังหวัด"]];
const STATUS_TH: Record<string, [string, string]> = {
  insert: ["เพิ่มใหม่", "bg-green-100 text-green-800"], update: ["อัปเดต", "bg-blue-100 text-blue-800"],
  skip: ["ไม่เปลี่ยนแปลง", "bg-slate-100 text-slate-600"], invalid: ["ไม่ถูกต้อง", "bg-red-100 text-red-800"],
};
const dmy = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "-");
const dmyTime = (iso: string) => { try { return new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }); } catch { return iso; } };

export function ImportWizard() {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [specId, setSpecId] = useState("");
  const [period, setPeriod] = useState({ reportStart: "", reportEnd: "", comparisonStart: "", comparisonEnd: "", snapshotDate: "" });
  const [area, setArea] = useState("unknown");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "committing" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ counts: Counts; errors: Err[] } | null>(null);
  const [override, setOverride] = useState(false);
  const [history, setHistory] = useState<{ state: "loading" | "ok" | "error"; rows: Batch[]; error?: string }>({ state: "loading", rows: [] });
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch("/api/import/history"); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setHistory({ state: "ok", rows: j.batches });
    } catch (e) { setHistory({ state: "error", rows: [], error: e instanceof Error ? e.message : "error" }); }
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function call(path: string, body: object) {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j;
  }
  const payload = (f = file, over: Partial<typeof period> & { specId?: string; area?: string } = {}) => ({
    filename: f!.name, text: f!.text, specId: (over.specId ?? specId) || undefined, area: over.area ?? area,
    reportStart: (over.reportStart ?? period.reportStart) || undefined, reportEnd: (over.reportEnd ?? period.reportEnd) || undefined,
    comparisonStart: (over.comparisonStart ?? period.comparisonStart) || undefined, comparisonEnd: (over.comparisonEnd ?? period.comparisonEnd) || undefined,
    snapshotDate: (over.snapshotDate ?? period.snapshotDate) || undefined,
  });

  async function runPlan(f = file, over: Parameters<typeof payload>[1] = {}, first = false) {
    if (!f) return;
    setState("loading"); setError(""); setResult(null); setOverride(false);
    try {
      const p: Plan = await call("/api/import/plan", payload(f, first ? { specId: "", reportStart: "", reportEnd: "", comparisonStart: "", comparisonEnd: "", snapshotDate: "" } : over));
      setPlan(p);
      if (first || over.specId !== undefined) setSpecId(p.spec.id);
      setPeriod({ reportStart: p.ctx.reportStart ?? "", reportEnd: p.ctx.reportEnd ?? "", comparisonStart: p.ctx.comparisonStart ?? "", comparisonEnd: p.ctx.comparisonEnd ?? "", snapshotDate: p.ctx.snapshotDate ?? "" });
      setState("ready");
    } catch (e) { setPlan(null); setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); setState("error"); }
  }

  async function pick(f: File | undefined | null) {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setError("รองรับเฉพาะไฟล์ .csv"); setState("error"); return; }
    if (f.size > 10 * 1024 * 1024) { setError("ไฟล์ใหญ่เกิน 10 MB"); setState("error"); return; }
    const next = { name: f.name, text: await f.text() };
    setFile(next); setSpecId(""); setPlan(null);
    await runPlan(next, {}, true);
  }

  async function commit() {
    setState("committing"); setError("");
    try {
      const r = await call("/api/import/commit", { ...payload(), overrideDuplicate: override });
      setResult(r); setState("done"); loadHistory();
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); setState("error"); }
  }

  function downloadErrors(errors: Err[]) {
    const csv = toCsv([["source_row_number", "column_name", "raw_value", "error_code", "message"], ...errors.map((e) => [e.row, e.column, e.raw, e.code, e.message])]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `import_errors_${file?.name ?? "file"}.csv`; a.click(); URL.revokeObjectURL(a.href);
  }

  function reset() { setFile(null); setPlan(null); setSpecId(""); setState("idle"); setError(""); setResult(null); setOverride(false); if (input.current) input.current.value = ""; }

  const committing = state === "committing";
  const locked = state === "committing" || state === "done";
  const setP = (k: keyof typeof period, v: string) => { setPeriod({ ...period, [k]: v }); runPlan(file, { [k]: v } as Partial<typeof period>); };
  const blocked = !!plan?.fileDuplicate && !override;
  const canCommit = state === "ready" && plan && !plan.periodError && plan.counts.insert + plan.counts.update + plan.counts.skip > 0 && !blocked;
  const dateInput = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
          className={`rounded-lg border-2 border-dashed p-8 text-center ${drag ? "border-slate-900 bg-slate-100" : "border-slate-300 bg-white"}`}>
          <p className="mb-3 text-slate-600">ลากไฟล์ CSV มาวางที่นี่ หรือ</p>
          <button onClick={() => input.current?.click()} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">เลือกไฟล์</button>
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <p className="mt-3 text-xs text-slate-500">Facebook Page, Facebook Ads, Google Ads (ตรวจประเภทอัตโนมัติ) · สูงสุด 10 MB · ระบบจะยังไม่เขียนข้อมูลจนกว่าจะกดยืนยัน</p>
        </div>

        {state === "loading" && <p role="status" className="text-sm text-slate-600">กำลังตรวจไฟล์...</p>}
        {state === "error" && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {plan && state !== "idle" && state !== "error" && (
          <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-end gap-4">
              <label className="text-sm">
                <span className="mb-1 block font-medium">ประเภทรายงาน {plan.detected ? <span className="font-normal text-green-700">(ตรวจพบอัตโนมัติ)</span> : <span className="font-normal text-amber-700">(เลือกเอง — header ไม่ตรงกับประเภทนี้)</span>}</span>
                <select value={specId} disabled={locked} className={dateInput + " min-w-72"} onChange={(e) => { setSpecId(e.target.value); runPlan(file, { specId: e.target.value }); }}>
                  {SPECS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">Area</span>
                <select value={area} disabled={locked} className={dateInput} onChange={(e) => { setArea(e.target.value); runPlan(file, { area: e.target.value }); }}>
                  {AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>

            {plan.spec.period === "user" && (
              <div className="flex flex-wrap items-end gap-4 text-sm">
                <label><span className="mb-1 block font-medium">ช่วงรายงาน เริ่ม</span><input type="date" className={dateInput} value={period.reportStart} disabled={locked} onChange={(e) => setP("reportStart", e.target.value)} /></label>
                <label><span className="mb-1 block font-medium">สิ้นสุด</span><input type="date" className={dateInput} value={period.reportEnd} disabled={locked} onChange={(e) => setP("reportEnd", e.target.value)} /></label>
                {plan.spec.comparison && <>
                  <label><span className="mb-1 block font-medium">เปรียบเทียบกับ เริ่ม</span><input type="date" className={dateInput} value={period.comparisonStart} disabled={locked} onChange={(e) => setP("comparisonStart", e.target.value)} /></label>
                  <label><span className="mb-1 block font-medium">สิ้นสุด</span><input type="date" className={dateInput} value={period.comparisonEnd} disabled={locked} onChange={(e) => setP("comparisonEnd", e.target.value)} /></label>
                </>}
                <p className="basis-full text-xs text-slate-500">ไฟล์ Google Ads ไม่มีวันที่ในเนื้อไฟล์ ระบบเดาจากชื่อไฟล์ — โปรดตรวจให้ถูกต้องก่อนยืนยัน ({dmy(period.reportStart)} – {dmy(period.reportEnd)})</p>
              </div>
            )}
            {plan.spec.period === "file" && <p className="text-sm text-slate-600">ช่วงรายงานจากไฟล์: <b>{dmy(plan.period.start)} – {dmy(plan.period.end)}</b></p>}
            {plan.spec.period === "snapshot" && (
              <div className="text-sm">
                <label><span className="mb-1 block font-medium">วันที่ส่งออกข้อมูล (snapshot)</span><input type="date" className={dateInput} value={period.snapshotDate} disabled={locked} onChange={(e) => setP("snapshotDate", e.target.value)} /></label>
                <p className="mt-2 rounded-md bg-amber-50 p-2 text-amber-800">ข้อมูลโพสต์เป็นยอด <b>สะสม (Lifetime) ณ วันส่งออก</b> ไม่ใช่ยอดของเดือนที่เผยแพร่โพสต์</p>
              </div>
            )}

            {plan.periodError && <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{plan.periodError} — ระบบตรวจประเภทไฟล์ได้แล้ว แต่หาช่วงวันที่จากชื่อไฟล์ไม่เจอ กรุณากรอกวันที่ด้านบน</p>}

            <div className={`grid grid-cols-2 gap-3 sm:grid-cols-5 ${plan.periodError ? "hidden" : ""}`}>
              {([["total", "ทั้งหมด", "text-slate-900"], ["insert", "เพิ่มใหม่", "text-green-700"], ["update", "อัปเดต", "text-blue-700"], ["skip", "ข้าม (ไม่เปลี่ยน)", "text-slate-600"], ["invalid", "ไม่ถูกต้อง", "text-red-700"]] as const).map(([k, l, c]) => (
                <div key={k} className="rounded-md border border-slate-200 p-3"><div className={`text-2xl font-bold ${c}`}>{plan.counts[k].toLocaleString("th-TH")}</div><div className="text-xs text-slate-500">{l}</div></div>
              ))}
            </div>

            {plan.fileDuplicate && (
              <div role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                ไฟล์นี้ (เนื้อหาเหมือนกัน ประเภทและช่วงเวลาเดียวกัน) เคยนำเข้าสำเร็จแล้วเมื่อ {dmyTime(plan.fileDuplicate.uploadedAt)} โดย {plan.fileDuplicate.uploadedBy}
                <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> ยืนยันนำเข้าซ้ำ (เฉพาะ Admin — ตัวเลขจะไม่ถูกบวกซ้ำ เพราะระบบอัปเดตตามคีย์ข้อมูล)</label>
              </div>
            )}
            {plan.warnings.map((w, i) => <p key={i} className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">⚠ {w}</p>)}

            <div className={`overflow-x-auto ${plan.periodError ? "hidden" : ""}`}>
              <table className="w-full text-left text-sm">
                <caption className="mb-1 text-left text-xs text-slate-500">ตัวอย่าง {plan.preview.length} แถวแรก (จากทั้งหมด {plan.counts.total.toLocaleString("th-TH")})</caption>
                <thead><tr className="border-b text-xs text-slate-500"><th className="py-1 pr-3">แถว</th><th className="pr-3">สถานะ</th>{plan.previewColumns.map((c) => <th key={c} className="pr-3">{c}</th>)}</tr></thead>
                <tbody>
                  {plan.preview.map((r) => (
                    <tr key={r.n} className="border-b border-slate-100">
                      <td className="py-1 pr-3 text-slate-500">{r.n}</td>
                      <td className="pr-3"><span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TH[r.status]?.[1]}`}>{STATUS_TH[r.status]?.[0]}</span></td>
                      {plan.previewColumns.map((c) => <td key={c} className="max-w-56 truncate pr-3">{r.values ? (r.values[c] === "" ? <span className="text-slate-400">ว่าง</span> : String(r.values[c])) : "—"}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {plan.errors.length > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-semibold text-red-700">ข้อผิดพลาด {plan.counts.invalid} แถว (แสดง 10 รายการแรก)</h3><button onClick={() => downloadErrors(plan.errors)} className="text-sm underline">ดาวน์โหลด Error Report (CSV)</button></div>
                <ul className="space-y-1 text-sm text-red-800">{plan.errors.slice(0, 10).map((e, i) => <li key={i}>แถว {e.row} · {e.column} · {e.message}</li>)}</ul>
              </div>
            )}

            {state !== "done" && (
              <div className="flex gap-3">
                <button onClick={commit} disabled={!canCommit || committing} className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40">
                  {committing ? "กำลังนำเข้า..." : `ยืนยันนำเข้า (+${plan.counts.insert} / อัปเดต ${plan.counts.update})`}
                </button>
                <button onClick={reset} disabled={committing} className="rounded-md border border-slate-300 px-4 py-2 text-sm">ยกเลิก</button>
              </div>
            )}
          </div>
        )}

        {state === "done" && result && (
          <div role="status" className="space-y-2 rounded-lg bg-green-50 p-4 text-green-900">
            <p className="font-semibold">นำเข้าสำเร็จ — เพิ่ม {result.counts.insert} · อัปเดต {result.counts.update} · ข้าม {result.counts.skip} · ไม่ถูกต้อง {result.counts.invalid}</p>
            <div className="flex gap-4 text-sm">
              {result.errors.length > 0 && <button onClick={() => downloadErrors(result.errors)} className="underline">ดาวน์โหลด Error Report</button>}
              <button onClick={reset} className="underline">นำเข้าไฟล์อื่น</button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">ประวัติการนำเข้า</h2>
        {history.state === "loading" && <p className="text-sm text-slate-500">กำลังโหลด...</p>}
        {history.state === "error" && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">โหลดประวัติไม่ได้: {history.error}</p>}
        {history.state === "ok" && history.rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">ยังไม่มีประวัติการนำเข้า</p>}
        {history.state === "ok" && history.rows.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b bg-slate-50 text-xs text-slate-500"><th className="p-2">เวลา</th><th>ไฟล์</th><th>ประเภท</th><th>ช่วง</th><th>สถานะ</th><th>เพิ่ม/อัปเดต/ข้าม/ผิด</th><th>โดย</th></tr></thead>
              <tbody>{history.rows.map((b) => (
                <tr key={b.batch_id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap p-2">{dmyTime(b.uploaded_at)}</td><td className="max-w-56 truncate">{b.filename}</td><td>{b.report_type}</td>
                  <td className="whitespace-nowrap">{dmy(b.report_start)}–{dmy(b.report_end)}</td>
                  <td><span className={`rounded px-1.5 py-0.5 text-xs ${b.status === "success" ? "bg-green-100 text-green-800" : b.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{b.status}</span></td>
                  <td className="whitespace-nowrap">{b.rows_inserted}/{b.rows_updated}/{b.rows_skipped}/{b.rows_invalid}</td><td className="max-w-40 truncate">{b.uploaded_by}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
