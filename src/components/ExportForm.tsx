"use client";
import { DateInput } from "@/components/DateInput";
import { useMemo, useState } from "react";

export type DatasetInfo = {
  id: string; label: string; group: string; filename: string; note: string; grain: string; sensitive?: "pii" | "financial"; route?: string;
  applies: { date: string; area: boolean; channel: boolean; campaign: boolean; need?: boolean };
};
const AREAS: [string, string][] = [["buriram", "บุรีรัมย์"], ["surin", "สุรินทร์"], ["multi_province", "หลายจังหวัด"], ["unknown", "ไม่ทราบ (Unknown)"]];

export function ExportForm({ datasets, channels, campaigns, needs }: { datasets: DatasetInfo[]; channels: string[]; campaigns: string[]; needs: string[] }) {
  const [id, setId] = useState(datasets[0]?.id ?? "");
  const [f, setF] = useState({ from: "", to: "", area: "", channel: "", campaign: "", need: "", include_excluded: false });
  const [count, setCount] = useState<{ state: "idle" | "loading" | "ok" | "error"; text: string }>({ state: "idle", text: "" });
  const ds = datasets.find((d) => d.id === id);

  const url = useMemo(() => {
    if (!ds) return "";
    const p = new URLSearchParams();
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
    if (ds.applies.area && f.area) p.set("area", f.area);
    if (ds.applies.channel && f.channel) p.set("channel", f.channel);
    if (ds.applies.campaign && f.campaign) p.set("campaign", f.campaign);
    if (ds.applies.need && f.need) p.set("need", f.need);
    if (ds.id === "facebook_page_posts" && f.include_excluded) p.set("include_excluded", "1");
    const q = p.toString();
    return `${ds.route ?? `/api/export/${ds.id}`}${q ? `?${q}` : ""}`;
  }, [ds, f]);

  async function check() {
    if (!ds) return;
    setCount({ state: "loading", text: "กำลังนับ..." });
    try {
      const r = await fetch(ds.route ? url : url + (url.includes("?") ? "&" : "?") + "count=1");
      if (ds.route) { setCount({ state: "ok", text: "ชุดข้อมูลนี้ตรวจจำนวนแถวไม่ได้ล่วงหน้า (ดาวน์โหลดเพื่อดูผล)" }); return; }
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setCount({ state: "ok", text: `จะส่งออก ${j.rows.toLocaleString("en-US")} แถว${j.rows === 0 ? " (ไม่มีข้อมูลตรงกับตัวกรอง)" : ""}` });
    } catch (e) { setCount({ state: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); }
  }
  const inp = "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm disabled:bg-slate-100 disabled:text-slate-400";
  const groups = [...new Set(datasets.map((d) => d.group))];
  const na = (ok: boolean) => (ok ? "" : " (ไม่ใช้กับชุดข้อมูลนี้)");

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <label className="block text-sm"><span className="mb-1 block font-medium">ชุดข้อมูล</span>
        <select value={id} onChange={(e) => { setId(e.target.value); setCount({ state: "idle", text: "" }); }} className={inp + " w-full max-w-xl"}>
          {groups.map((g) => <optgroup key={g} label={g}>{datasets.filter((d) => d.group === g).map((d) => <option key={d.id} value={d.id}>{d.label} — {d.filename}</option>)}</optgroup>)}
        </select></label>
      {ds && (
        <>
          <p className="text-sm"><span className="font-medium">ระดับข้อมูล:</span> {ds.grain}</p>
          <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{ds.note}{ds.sensitive && <span className="ml-1 font-medium text-amber-800">· ข้อมูล{ds.sensitive === "pii" ? "ส่วนบุคคล" : "การเงิน"} การส่งออกทุกครั้งถูกบันทึก Audit Log</span>}</p>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="mb-1 block text-xs text-slate-500">ตั้งแต่ ({ds.applies.date})</span><DateInput className={inp + " w-full"} value={f.from} onChange={(e) => { setF({ ...f, from: e.target.value }); setCount({ state: "idle", text: "" }); }} /></label>
            <label><span className="mb-1 block text-xs text-slate-500">ถึง</span><DateInput className={inp + " w-full"} value={f.to} onChange={(e) => { setF({ ...f, to: e.target.value }); setCount({ state: "idle", text: "" }); }} /></label>
            <label><span className="mb-1 block text-xs text-slate-500">พื้นที่{na(ds.applies.area)}</span>
              <select className={inp + " w-full"} disabled={!ds.applies.area} value={ds.applies.area ? f.area : ""} onChange={(e) => { setF({ ...f, area: e.target.value }); setCount({ state: "idle", text: "" }); }}><option value="">ทั้งหมด</option>{AREAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label><span className="mb-1 block text-xs text-slate-500">ช่องทาง{na(ds.applies.channel)}</span>
              <select className={inp + " w-full"} disabled={!ds.applies.channel} value={ds.applies.channel ? f.channel : ""} onChange={(e) => { setF({ ...f, channel: e.target.value }); setCount({ state: "idle", text: "" }); }}><option value="">ทั้งหมด</option>{channels.map((c) => <option key={c} value={c}>{c}{["Facebook Organic", "TikTok/YouTube"].includes(c) ? " (ค่าเดิม)" : ""}</option>)}</select></label>
            <label className="sm:col-span-2"><span className="mb-1 block text-xs text-slate-500">Campaign / Ad set{na(ds.applies.campaign)}</span>
              <input list="campaigns" className={inp + " w-full"} disabled={!ds.applies.campaign} value={ds.applies.campaign ? f.campaign : ""} placeholder="ชื่อเต็ม (เลือกจากรายการได้)" onChange={(e) => { setF({ ...f, campaign: e.target.value }); setCount({ state: "idle", text: "" }); }} />
              <datalist id="campaigns">{campaigns.map((c) => <option key={c} value={c} />)}</datalist></label>
            {ds.applies.need && <label><span className="mb-1 block text-xs text-slate-500">Need</span>
              <select className={inp + " w-full"} value={f.need} onChange={(e) => { setF({ ...f, need: e.target.value }); setCount({ state: "idle", text: "" }); }}><option value="">ทั้งหมด</option>{needs.map((n) => <option key={n}>{n}</option>)}</select></label>}
            {ds.id === "facebook_page_posts" && <label className="flex items-center gap-2 self-end pb-1.5"><input type="checkbox" checked={f.include_excluded} onChange={(e) => { setF({ ...f, include_excluded: e.target.checked }); setCount({ state: "idle", text: "" }); }} /> รวมเพจที่ตั้งให้ตัดออก</label>}
          </div>
          <p className="text-xs text-slate-500">ไฟล์: UTF-8 BOM (เปิดใน Excel ได้) · วันที่ YYYY-MM-DD · เวลาระบบ ISO 8601 UTC · เงิน/ตัวเลขเป็นตัวเลขล้วน · ช่องว่างคือไม่มีข้อมูล (ไม่ใช่ 0) · ชนิดของทุกคอลัมน์ดูได้จาก data_dictionary.csv</p>
          <div className="flex flex-wrap items-center gap-3">
            <a href={url} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" download={ds.filename}>ดาวน์โหลด CSV</a>
            {!ds.route && <button onClick={check} disabled={count.state === "loading"} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm">ดูจำนวนแถวก่อนดาวน์โหลด</button>}
            {count.state !== "idle" && <span role={count.state === "error" ? "alert" : "status"} className={`text-sm ${count.state === "error" ? "text-red-700" : "text-slate-600"}`}>{count.text}</span>}
          </div>
        </>
      )}
    </div>
  );
}
