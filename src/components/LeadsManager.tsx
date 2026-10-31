"use client";
import { useIsMobile } from "@/lib/use-mobile";
import { Skeleton } from "@/components/Skeleton";
import { Notice } from "@/components/Toast";
import { DateInput } from "@/components/DateInput";
import { thDate, thDateTime, thMonth, thDayMonth } from "@/lib/thdate";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CHANNELS } from "@/lib/dashboard";
import { CALL_DEFAULT, normCall } from "@/lib/lead-options";
import { CLOSED_BUY, CLOSED_CALL, CLOSED_SELL, followUps, STALE_DAYS } from "@/lib/lead-insights";
import { lineHref, telHref } from "@/lib/contact-links";
import {
  areaLabel, BUY_STATUS, CALL_STATUS, CONDITIONS, EDITABLE, NEEDS, PRICE_RANGES, PROPERTY_TYPES, SELL_NEEDS, SELL_STATUS,
  filterLeads, leadStatusOf, statusFieldOf, statusOptionsOf, todayBkk, type DupMatch, type Lead,
} from "@/lib/leads";

const PAGE = 25;

const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? thDate(iso) : "");
const STATUS_COLOR: Record<string, string> = {
  Hot: "bg-red-100", Warm: "bg-amber-100", Cold: "bg-sky-100", Archive: "bg-slate-200", Close: "bg-green-100",
  รอติดต่อ: "bg-slate-100", สนใจขาย: "bg-sky-100", นัดทำสัญญา: "bg-amber-100", เซ็นสัญญา: "bg-indigo-100", สัญญาเปิด: "bg-violet-100",
  ขายแล้ว: "bg-green-100", ยกเลิก: "bg-slate-200", บ้านไม่พร้อมขาย: "bg-slate-200",
};
const CALL_COLOR: Record<string, string> = { รอติดต่อ: "bg-slate-100", ติดต่อได้แล้ว: "bg-green-50", รอเข้าชม: "bg-yellow-50", เข้าชมแล้ว: "bg-sky-50", จอง: "bg-violet-100", ซื้อสำเร็จ: "bg-emerald-100", กู้ไม่ผ่าน: "bg-orange-100", ติดต่อไม่ได้: "bg-red-50", ไม่สนใจ: "bg-amber-50" };
const CLOSED = ["Close", "Archive", "ขายแล้ว", "ยกเลิก", "บ้านไม่พร้อมขาย"];
const emptyForm = (): Lead => ({ ...Object.fromEntries(EDITABLE.map((k) => [k, ""])), received_at: todayBkk(), area: "", call_status: CALL_DEFAULT });
const EMPTY_F = { q: "", from: "", to: "", channel: "", need: "", status: "", callStatus: "", staff: "", area: "", service: "" };
const statusLabel = (need: string) => (statusFieldOf(need) === "buy_status" ? "Buy Status" : statusFieldOf(need) === "sell_status" ? "Sell Status" : "Status");
const addDays = (d: string, n: number) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const FOLLOW_DAYS = 3; // เปลี่ยนสถานะในฟอร์ม → เสนอวันติดตามครั้งถัดไป = วันนี้ + 3 วัน (แก้ได้)
const isClosedValue = (field: string, v: string) => (field === "call_status" ? CLOSED_CALL : field === "sell_status" ? CLOSED_SELL : CLOSED_BUY).includes(v);
type SortKey = "lead_code" | "received_at" | "customer_name" | "source_channel" | "need" | "status" | "call_status" | "staff" | "next_follow_up_at";
type Conflict = { field: string; value: string };

export function LeadsManager() {
  const [data, setData] = useState<{ state: "loading" | "ok" | "error"; rows: Lead[]; staff: string[]; areas: string[]; error?: string }>({ state: "loading", rows: [], staff: [], areas: [] });
  const mobile = useIsMobile();
  const [f, setF] = useState(EMPTY_F);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<Lead | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [viewing, setViewing] = useState<Lead | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dups, setDups] = useState<DupMatch[] | null>(null);
  const [needAsk, setNeedAsk] = useState<{ msg: string; conflict: Conflict } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [rowBusy, setRowBusy] = useState("");
  const [delAsk, setDelAsk] = useState(false);
  const [sortBy, setSortBy] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [autoFollow, setAutoFollow] = useState(""); // วันติดตามที่ระบบเสนอให้ (แสดงคำอธิบาย)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/leads"); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData({ state: "ok", rows: j.rows, staff: j.staff ?? [], areas: j.areas ?? [] });
    } catch (e) { setData({ state: "error", rows: [], staff: [], areas: [], error: e instanceof Error ? e.message : "error" }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // รายการติดตาม (เลยกำหนด / วันนี้ / ค้างนาน) · เปิดจากการ์ดหน้า ภาพรวม ด้วย ?follow=...
  const [follow, setFollow] = useState<"" | "overdue" | "today" | "stale">("");
  useEffect(() => { const v = new URLSearchParams(window.location.search).get("follow"); if (v === "overdue" || v === "today" || v === "stale") setFollow(v); }, []);
  const fu = useMemo(() => followUps(data.rows, todayBkk()), [data.rows]);
  const shown = useMemo(() => {
    const base = filterLeads(data.rows, f);
    if (!follow) return base;
    const ids = new Set(fu[follow].map((r) => r.lead_id));
    const order = new Map(fu[follow].map((r, i) => [r.lead_id, i]));
    return base.filter((r) => ids.has(r.lead_id)).sort((a, b) => order.get(a.lead_id)! - order.get(b.lead_id)!);
  }, [data.rows, f, follow, fu]);
  // เรียงตามหัวคอลัมน์ (ทุกหน้า ไม่ใช่เฉพาะหน้าที่แสดง) · ค่าว่างอยู่ท้ายเสมอ
  const sorted = useMemo(() => {
    if (!sortBy) return shown;
    const val = (r: Lead) => sortBy.key === "status" ? leadStatusOf(r) : sortBy.key === "call_status" ? (normCall(r.call_status) || CALL_DEFAULT) : String(r[sortBy.key] ?? "");
    return [...shown].sort((a, b) => {
      const x = val(a), y = val(b); if (!x && !y) return 0; if (!x) return 1; if (!y) return -1;
      const c = x.localeCompare(y, "th"); return sortBy.dir === "asc" ? c : -c;
    });
  }, [shown, sortBy]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages);
  const slice = sorted.slice((cur - 1) * PAGE, cur * PAGE);
  const today = todayBkk();

  async function post(body: object) {
    const r = await fetch("/api/leads", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, j: await r.json() };
  }
  const closeForm = () => { setForm(null); setEditing(null); setErrors({}); setDups(null); setNeedAsk(null); setDelAsk(false); };
  const openForm = (r: Lead | null) => {
    setForm(r ? { ...emptyForm(), ...Object.fromEntries(EDITABLE.map((k) => [k, r[k] ?? ""])), call_status: normCall(r.call_status) || CALL_DEFAULT, area: areaLabel(r.area) } : emptyForm());
    setEditing(r); setViewing(null); setErrors({}); setDups(null); setNeedAsk(null); setDelAsk(false); setMsg(null);
    setAutoFollow("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  async function save(opts: { confirmDuplicate?: boolean; confirmNeedChange?: boolean } = {}) {
    if (!form) return;
    setSaving(true); setMsg(null); setErrors({}); setDups(null); setNeedAsk(null); setDelAsk(false);
    try {
      const { ok, j } = await post({ ...form, lead_id: editing?.lead_id, updated_at_seen: editing?.updated_at, ...opts });
      if (!ok) {
        if (j.code === "DUPLICATE_WARNING") { setDups(j.matches); return; }
        if (j.code === "NEED_CHANGE") { setNeedAsk({ msg: j.error, conflict: j.conflict }); return; }
        if (j.fields) setErrors(j.fields);
        throw new Error(j.error ?? "บันทึกไม่สำเร็จ");
      }
      setMsg({ type: "ok", text: j.created ? `สร้าง ${j.lead.lead_code} แล้ว` : `บันทึก ${j.lead.lead_code} แล้ว` });
      closeForm(); await load();
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!editing) return;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch("/api/leads", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: editing.lead_id, updated_at_seen: editing.updated_at }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "ลบไม่สำเร็จ");
      setMsg({ type: "ok", text: `ลบ ${j.lead_code} แล้ว` });
      closeForm(); await load();
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); setDelAsk(false); }
    finally { setSaving(false); }
  }

  /** เปลี่ยนสถานะ/Call Status จากตาราง (ส่งทั้งแถว พร้อมตรวจข้อมูลเก่า) */
  async function quick(row: Lead, field: string, value: string) {
    setRowBusy(row.lead_id); setMsg(null);
    try {
      const { ok, j } = await post({ ...Object.fromEntries(EDITABLE.map((k) => [k, row[k] ?? ""])), [field]: value, lead_id: row.lead_id, updated_at_seen: row.updated_at });
      if (!ok) throw new Error(j.code === "VALIDATION" && j.fields?.need ? `${row.lead_code}: ยังไม่มี Need กรุณากด ดู/แก้ไข แล้วเลือก Need ก่อน` : j.error ?? "บันทึกไม่สำเร็จ");
      await load();
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); await load(); }
    finally { setRowBusy(""); }
  }

  const inp = (k: string) => `w-full rounded-md border px-2 py-1.5 text-sm ${errors[k] ? "border-red-500" : "border-slate-300"}`;
  const err = (k: string) => errors[k] && <span role="alert" className="mt-0.5 block text-xs text-red-600">{errors[k]}</span>;
  const set = (k: string, v: string) => setForm((p) => ({ ...p!, [k]: v }));
  const field = (k: string, label: string, props: { type?: string; required?: boolean; area?: boolean; list?: string; placeholder?: string; mode?: "tel" | "text" } = {}) => (
    <label key={k} className="text-sm"><span className="mb-1 block text-xs text-slate-600">{label}{props.required && " *"}</span>
      {props.area ? <textarea rows={2} value={form![k]} placeholder={props.placeholder} onChange={(e) => set(k, e.target.value)} className={inp(k)} />
        : props.type === "date" ? <DateInput aria-label={label} value={form![k]} onChange={(e) => set(k, e.target.value)} className={inp(k)} />
        : <input type={props.type ?? "text"} list={props.list} value={form![k]} placeholder={props.placeholder} inputMode={props.mode} onChange={(e) => set(k, e.target.value)} className={inp(k)} />}{err(k)}</label>
  );
  /** เปลี่ยนสถานะในฟอร์ม → ถ้ายังไม่มีวันติดตามในอนาคต เสนอวันนี้ + 3 วัน (สถานะที่จบแล้ว = ไม่เสนอ) */
  const setStatus = (k: string, v: string) => setForm((p) => {
    const n = { ...p!, [k]: v };
    const today = todayBkk();
    if (v && !isClosedValue(k, v) && v !== (editing?.[k] ?? "") && !(p!.next_follow_up_at && p!.next_follow_up_at > today)) {
      n.next_follow_up_at = addDays(today, FOLLOW_DAYS); setAutoFollow(n.next_follow_up_at);
    }
    return n;
  });
  const select = (k: string, label: string, opts: [string, string][], o: { required?: boolean; onChange?: (v: string) => void } = {}) => (
    <label key={k} className="text-sm"><span className="mb-1 block text-xs text-slate-600">{label}{o.required && " *"}</span>
      <select value={form![k]} onChange={(e) => (o.onChange ? o.onChange(e.target.value) : set(k, e.target.value))} className={inp(k)}>
        <option value="">— เลือก —</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>{err(k)}</label>
  );
  const fsel = (k: keyof typeof f, label: string, opts: [string, string][]) => (
    <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">{label}</span>
      <select value={f[k]} onChange={(e) => { setF({ ...f, [k]: e.target.value, ...(k === "need" ? { status: "" } : {}) }); setPage(1); }} className="max-w-40 h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"><option value="">ทั้งหมด</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  );
  const fdate = (k: "from" | "to", label: string) => (
    <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">{label}</span>
      <DateInput value={f[k]} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setPage(1); }} className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm" /></label>
  );
  const pair = (a: string[]): [string, string][] => a.map((x) => [x, x]);

  // ฟอร์ม: เปลี่ยน Need → แสดงเฉพาะสถานะของกลุ่มนั้น และแจ้งเมื่อสถานะเดิมใช้ไม่ได้
  const sf = form ? statusFieldOf(form.need) : "";
  const prevOther = form && editing && sf ? (sf === "buy_status" ? editing.sell_status : editing.buy_status) : "";
  const changeNeed = (need: string) => setForm((p) => {
    const nf = statusFieldOf(need); const of = statusFieldOf(p!.need);
    return nf === of ? { ...p!, need } : { ...p!, need, buy_status: nf === "buy_status" ? (editing?.buy_status ?? "") : "", sell_status: nf === "sell_status" ? (editing?.sell_status ?? "") : "" };
  });
  const statusOptsFilter = f.need ? statusOptionsOf(f.need) : [...BUY_STATUS, ...SELL_STATUS];

  return (
    <div className="space-y-5">
      <Notice msg={msg} onClose={() => setMsg(null)} />

      {viewing && !form && (
        <section className="space-y-3 rounded-lg border border-slate-300 bg-white p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">{viewing.lead_code} · {viewing.customer_name}</h2>
            <span className="flex gap-4 text-sm"><button onClick={() => openForm(viewing)} className="underline">แก้ไข</button><button onClick={() => setViewing(null)} className="underline">ปิด</button></span></div>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {([
              ["วันที่รับ Lead", dmy(viewing.received_at)], ["ช่องทาง", viewing.source_channel], ["ชื่อลูกค้า", viewing.customer_name],
              ["เบอร์โทร", viewing.phone ? <a href={telHref(viewing.phone)} className="text-sky-700 underline">{viewing.phone}</a> : ""],
              ["Line", viewing.line_id ? <a href={lineHref(viewing.line_id)} target="_blank" rel="noreferrer" className="text-sky-700 underline">{viewing.line_id}</a> : ""],
              ["ความต้องการ", viewing.need], [statusLabel(viewing.need), leadStatusOf(viewing)], ["ประเภททรัพย์", viewing.property_type], ["สภาพทรัพย์", viewing.property_condition],
              ["ช่วงราคา", viewing.price_range], ["Call Status", viewing.call_status], ["Staff", viewing.staff], ["พื้นที่", areaLabel(viewing.area)],
              ["ความสนใจ", viewing.interest], ["Campaign", viewing.campaign_name],
              ["ติดต่อล่าสุด", dmy(viewing.last_contacted_at)], ["ติดตามครั้งถัดไป", dmy(viewing.next_follow_up_at)], ["ขั้น Pipeline (คำนวณ)", viewing.status], ["สร้างโดย", `${viewing.created_by} · ${dmy(viewing.created_at)}`], ["แก้ไขล่าสุด", `${viewing.updated_by} · ${dmy(viewing.updated_at)}`],
            ] as [string, React.ReactNode][]).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd>{v || <span className="text-slate-300">—</span>}</dd></div>)}
          </dl>
          {[["รายละเอียดเพิ่มเติม (Remark)", viewing.need_description], ["บันทึกภายใน (Note)", viewing.notes], ...(viewing.lost_reason ? [["เหตุผลที่ปิดไม่สำเร็จ", viewing.lost_reason]] : [])].map(([k, v]) => (
            <div key={k} className="text-sm"><div className="text-xs text-slate-500">{k}</div><p className="whitespace-pre-wrap">{v || <span className="text-slate-300">—</span>}</p></div>))}
          {!viewing.need && <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">Lead นี้บันทึกก่อนมีช่อง Need — กด แก้ไข เพื่อเลือก Need และสถานะ</p>}
        </section>
      )}

      {form && (
        <section className="space-y-4 rounded-lg border border-slate-300 bg-white p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold">{editing ? `แก้ไข ${editing.lead_code}` : "เพิ่ม Lead ใหม่"}</h2>
            <button onClick={closeForm} className="text-sm underline">ปิด</button></div>
          {(() => {
            const need = form.need; const isSell = SELL_NEEDS.includes(need); const isBuy = need && !isSell;
            const grp = (t: string, body: React.ReactNode, hint?: string) => (
              <fieldset className="space-y-2 border-t border-slate-100 pt-3 first:border-0 first:pt-0">
                <legend className="text-sm font-semibold text-slate-800">{t}{hint && <span className="ml-2 text-xs font-normal text-slate-500">{hint}</span>}</legend>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">{body}</div>
              </fieldset>);
            const closedNow = [["call_status", form.call_status], ["buy_status", form.buy_status], ["sell_status", form.sell_status]].some(([k, v]) => v && isClosedValue(k, v) && !["ซื้อสำเร็จ", "ขายแล้ว", "Close"].includes(v));
            return (<>
              {grp("1. ข้อมูลติดต่อ", <>
                {field("received_at", "วันที่รับ Lead", { type: "date", required: true })}
                {select("source_channel", "ช่องทาง", pair(CHANNELS), { required: true })}
                {field("customer_name", "ชื่อลูกค้า", { required: true })}
                {field("phone", "เบอร์โทร", { type: "tel", mode: "tel", placeholder: "08x-xxx-xxxx" })}
                {field("line_id", "Line", { placeholder: "@line หรือ LINE ID" })}
                {field("campaign_name", "Campaign (ถ้ามี)")}
              </>)}
              {grp("2. ความต้องการ", <>
                {select("need", "ความต้องการ", pair(NEEDS), { required: true, onChange: changeNeed })}
                {select("property_type", "ประเภททรัพย์", pair(PROPERTY_TYPES))}
                {select("price_range", "ช่วงราคา", pair(PRICE_RANGES))}
                {(isSell || !need || form.property_condition) && select("property_condition", "สภาพทรัพย์", pair(CONDITIONS))}
                {(isBuy || !need || form.interest) && field("interest", "ความสนใจ", { placeholder: "เช่น ทาวน์โฮมใกล้โรงเรียน" })}
                {field("area", "พื้นที่ (กรอกเองหรือเลือกจากรายการ)", { list: "area-list" })}
                <datalist id="area-list">{data.areas.map((o) => <option key={o} value={o} />)}</datalist>
              </>, !need ? "เลือกความต้องการก่อน ระบบจะแสดงช่องที่เกี่ยวข้อง" : isSell ? "ลูกค้าต้องการขาย" : "ลูกค้าต้องการ" + need)}
              {grp("3. สถานะการขาย", <>
                {sf ? select(sf, statusLabel(form.need), pair(statusOptionsOf(form.need)), { onChange: (v) => setStatus(sf, v) })
                  : <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">สถานะ</span><select disabled className={inp("x") + " bg-slate-50"}><option>เลือกความต้องการก่อน</option></select></label>}
                {select("call_status", "Call Status", pair(CALL_STATUS), { onChange: (v) => setStatus("call_status", v) })}
                {field("staff", "Staff", { list: "staff-list" })}
                <datalist id="staff-list">{data.staff.map((o) => <option key={o} value={o} />)}</datalist>
                {(closedNow || form.lost_reason) && field("lost_reason", "เหตุผลที่ปิดไม่สำเร็จ")}
              </>)}
              {grp("4. การติดตาม", <>
                {field("last_contacted_at", "ติดต่อล่าสุด", { type: "date" })}
                <div className="text-sm sm:col-span-1">
                  {field("next_follow_up_at", "ติดตามครั้งถัดไป", { type: "date" })}
                  <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="ตั้งวันติดตาม">
                    {[1, 3, 7].map((n) => <button key={n} type="button" onClick={() => { set("next_follow_up_at", addDays(todayBkk(), n)); setAutoFollow(""); }} className="rounded-full border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100">+{n} วัน</button>)}
                    {form.next_follow_up_at && <button type="button" onClick={() => { set("next_follow_up_at", ""); setAutoFollow(""); }} className="px-1 text-xs text-slate-500 underline">ล้าง</button>}
                  </div>
                </div>
                <div className="sm:col-span-2 md:col-span-2">{field("need_description", "รายละเอียดเพิ่มเติม (Remark)", { area: true })}</div>
                <div className="sm:col-span-2 md:col-span-4">{field("notes", "บันทึกภายใน (Note)", { area: true })}</div>
              </>, autoFollow && form.next_follow_up_at === autoFollow ? `เปลี่ยนสถานะแล้ว — ตั้งวันติดตามให้เป็น ${dmy(autoFollow)} (แก้ได้)` : undefined)}
            </>);
          })()}
          {prevOther && <p role="status" className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">{statusFieldOf(editing!.need) === "buy_status" ? "Buy Status" : "Sell Status"} เดิม &quot;{prevOther}&quot; ใช้กับความต้องการ &quot;{form.need}&quot; ไม่ได้ — ระบบจะถามยืนยันก่อนล้างค่าเดิมเมื่อกดบันทึก</p>}
          {needAsk && (
            <div role="alert" className="space-y-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <p>{needAsk.msg}</p>
              <div className="flex gap-3"><button onClick={() => save({ confirmNeedChange: true })} disabled={saving} className="rounded-md bg-amber-700 px-3 py-1.5 text-white">ยืนยันเปลี่ยน Need</button><button onClick={() => setNeedAsk(null)} className="underline">กลับไปแก้ไข</button></div>
            </div>
          )}
          {dups && (
            <div role="alert" className="space-y-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-medium">พบ Lead ที่เบอร์โทรหรืออีเมลซ้ำ (ระบบไม่รวมข้อมูลให้อัตโนมัติ)</p>
              <ul className="list-disc pl-5">{dups.map((d) => <li key={d.lead_code}>{d.lead_code} · {d.customer_name}{d.company_name && ` (${d.company_name})`} · รับ {dmy(d.received_at)} · ซ้ำที่ {d.matched.map((m) => m === "phone" ? "เบอร์โทร" : m === "line" ? "Line" : "อีเมล").join(" และ ")}</li>)}</ul>
              <div className="flex gap-3"><button onClick={() => save({ confirmDuplicate: true })} disabled={saving} className="rounded-md bg-amber-700 px-3 py-1.5 text-white">บันทึกต่อ (เป็นรายการแยก)</button><button onClick={() => setDups(null)} className="underline">กลับไปแก้ไข</button></div>
            </div>
          )}
          <button onClick={() => save()} disabled={saving} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40">{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
          {editing && (
            <div className="border-t pt-4">
              {!delAsk
                ? <button onClick={() => setDelAsk(true)} disabled={saving} className="text-sm text-red-700 underline">ลบ Lead นี้</button>
                : (
                  <div role="alert" className="space-y-2 rounded-md bg-red-50 p-3 text-sm text-red-900">
                    <p>ลบ <b>{editing.lead_code}</b> · {editing.customer_name} ถาวร? ข้อมูลจะหายจากระบบ (กู้คืนได้เฉพาะจาก Version history ของ Google Sheet) รหัส Lead นี้จะไม่ถูกนำกลับมาใช้อีก</p>
                    <div className="flex gap-3">
                      <button onClick={remove} disabled={saving} className="rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800 disabled:opacity-50">{saving ? "กำลังลบ..." : "ยืนยันลบถาวร"}</button>
                      <button onClick={() => setDelAsk(false)} disabled={saving} className="underline">ยกเลิก</button>
                    </div>
                  </div>
                )}
            </div>
          )}
        </section>
      )}

      {data.state === "ok" && (
        <nav aria-label="รายการติดตาม" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-slate-500">ติดตามลูกค้า:</span>
          {([["overdue", "เลยกำหนด", fu.overdue.length, "bg-red-600"], ["today", "วันนี้", fu.today.length, "bg-amber-500"], ["stale", `ค้างเกิน ${STALE_DAYS} วัน`, fu.stale.length, "bg-slate-600"]] as const).map(([k, l, n, c]) => (
            <button key={k} onClick={() => { setFollow(follow === k ? "" : k); setPage(1); }} aria-pressed={follow === k}
              className={`rounded-full px-3 py-1 text-xs ${follow === k ? "bg-brand-600 text-white" : "bg-white ring-1 ring-slate-200 hover:bg-slate-100"}`}>
              {l} <span className={`ml-1 rounded-full px-1.5 text-white ${n ? c : "bg-slate-300"}`}>{n}</span></button>))}
          {follow && <button onClick={() => setFollow("")} className="text-xs underline">แสดงทั้งหมด</button>}
          <span className="text-xs text-slate-400">ไม่นับ Lead ที่จบแล้ว (ซื้อสำเร็จ / กู้ไม่ผ่าน / ไม่สนใจ / ขายแล้ว / ยกเลิก / บ้านไม่พร้อมขาย / Archive / Close)</span>
        </nav>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ค้นหา</span>
          <input value={f.q} onChange={(e) => { setF({ ...f, q: e.target.value }); setPage(1); }} placeholder="ชื่อ / เบอร์ / Line / ความสนใจ / Remark" className="w-56 h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm" /></label>
        {fdate("from", "รับตั้งแต่")}{fdate("to", "ถึง")}
        {fsel("channel", "ช่องทาง", pair(CHANNELS))}{fsel("need", "ความต้องการ", pair(NEEDS))}{fsel("status", "สถานะ", pair(statusOptsFilter))}
        {fsel("callStatus", "Call Status", pair(CALL_STATUS))}{fsel("staff", "Staff", pair(data.staff))}
        {fsel("area", "พื้นที่", pair(data.areas))}
        {Object.values(f).some(Boolean) && <button onClick={() => { setF(EMPTY_F); setPage(1); }} className="py-1.5 text-sm underline">ล้าง</button>}
        <button onClick={() => openForm(null)} className="ml-auto hidden rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 md:block">+ เพิ่ม Lead</button>
      </div>

      {data.state === "loading" && <Skeleton kind={"rows"} />}
      {data.state === "error" && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">โหลดข้อมูลไม่ได้: {data.error}</p>}
      {data.state === "ok" && data.rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">ยังไม่มี Lead — กด &quot;+ เพิ่ม Lead&quot; เพื่อเริ่มบันทึก</p>}
      {data.state === "ok" && data.rows.length > 0 && shown.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">ไม่มี Lead ที่ตรงกับตัวกรอง</p>}
      {shown.length > 0 && (
        <div className="space-y-2">
          {/* มือถือ: การ์ด · จอใหญ่: ตาราง */}
          {mobile && <ul className="space-y-2" aria-label="รายการ Lead">{slice.map((r) => {
            const st = leadStatusOf(r); const overdue = r.next_follow_up_at && r.next_follow_up_at < today && !CLOSED.includes(st);
            return (
              <li key={r.lead_id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="font-medium">{r.customer_name}</div><div className="text-xs text-slate-500"><span className="font-mono">{r.lead_code}</span> · {dmy(r.received_at)} · {r.source_channel}</div></div>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r.need || "ยังไม่ระบุ"}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
                  {st && <span className={`rounded px-1.5 py-0.5 ${STATUS_COLOR[st] ?? "bg-slate-100"}`}>{st}</span>}
                  <span className={`rounded px-1.5 py-0.5 ${CALL_COLOR[normCall(r.call_status) || CALL_DEFAULT]}`}>{normCall(r.call_status) || CALL_DEFAULT}</span>
                  {r.staff && <span className="rounded bg-slate-50 px-1.5 py-0.5 text-slate-600">{r.staff}</span>}
                </div>
                {r.interest && <p className="mt-1 line-clamp-2 text-xs text-slate-600">สนใจ: {r.interest}</p>}
                {r.next_follow_up_at && <p className={`mt-1 text-xs ${overdue ? "font-semibold text-red-600" : "text-slate-600"}`}>ติดตาม {dmy(r.next_follow_up_at)}{overdue && " (เลยกำหนด)"}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.phone && <a href={telHref(r.phone)} className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white">โทร {r.phone}</a>}
                  {r.line_id && <a href={lineHref(r.line_id)} target="_blank" rel="noreferrer" className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800">LINE</a>}
                  <button onClick={() => { setViewing(r); setForm(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="inline-flex h-11 items-center rounded-lg border border-slate-300 px-3 text-sm">ดู</button>
                  <button onClick={() => openForm(r)} className="inline-flex h-11 items-center rounded-lg border border-slate-300 px-3 text-sm">แก้ไข</button>
                </div>
              </li>);
          })}</ul>}
          {!mobile && <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b bg-slate-50 text-xs text-slate-500">
                {(([["lead_code", "รหัส"], ["received_at", "วันที่รับ"], ["customer_name", "ชื่อ"], [null, "เบอร์"], ["source_channel", "ช่องทาง"], ["need", "ความต้องการ"], ["status", "สถานะ"], [null, "ประเภท / ราคา"], ["call_status", "Call Status"], ["staff", "Staff"], ["next_follow_up_at", "ติดตามถัดไป"]]) as [SortKey | null, string][]).map(([k, l], i) => {
                  const on = k && sortBy?.key === k;
                  return <th key={l} className={`whitespace-nowrap ${i === 0 ? "p-2" : "pr-2"}`} aria-sort={on ? (sortBy!.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {k ? <button type="button" title="กดเพื่อเรียง" onClick={() => { setSortBy(!on ? { key: k, dir: k === "received_at" || k === "next_follow_up_at" ? "desc" : "asc" } : sortBy!.dir === (k === "received_at" || k === "next_follow_up_at" ? "desc" : "asc") ? { key: k, dir: sortBy!.dir === "asc" ? "desc" : "asc" } : null); setPage(1); }} className="hover:text-slate-900">{l}<span className={on ? "ml-1" : "ml-1 opacity-30"}>{on ? (sortBy!.dir === "asc" ? "▲" : "▼") : "↕"}</span></button> : l}
                  </th>;
                })}<th /></tr></thead>
              <tbody>{slice.map((r) => {
                const st = leadStatusOf(r); const opts = statusOptionsOf(r.need); const k = statusFieldOf(r.need);
                const overdue = r.next_follow_up_at && r.next_follow_up_at < today && !CLOSED.includes(st);
                const busy = rowBusy === r.lead_id;
                return (
                  <tr key={r.lead_id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap p-2 font-mono text-xs">{r.lead_code}</td><td className="whitespace-nowrap">{dmy(r.received_at)}</td>
                    <td className="max-w-48 truncate" title={r.customer_name}>{r.customer_name}</td><td className="whitespace-nowrap">{r.phone && <a href={telHref(r.phone)} className="hover:underline">{r.phone}</a>}</td>
                    <td className="whitespace-nowrap">{r.source_channel}</td><td>{r.need || <span className="text-amber-600">ยังไม่ระบุ</span>}</td>
                    <td>{k ? <select aria-label={`${statusLabel(r.need)} ${r.lead_code}`} value={st} disabled={busy} onChange={(e) => quick(r, k, e.target.value)} className={`rounded px-1.5 py-1 text-xs ${STATUS_COLOR[st] ?? "bg-white"}`}><option value="">— ว่าง —</option>{opts.map((s) => <option key={s}>{s}</option>)}</select>
                      : <span className="text-xs text-slate-400">{r.status}</span>}</td>
                    <td className="whitespace-nowrap text-xs">{[r.property_type, r.price_range].filter(Boolean).join(" · ")}</td>
                    <td><select aria-label={`Call Status ${r.lead_code}`} value={normCall(r.call_status) || CALL_DEFAULT} disabled={busy || !r.need} onChange={(e) => quick(r, "call_status", e.target.value)} className={`rounded px-1.5 py-1 text-xs ${CALL_COLOR[normCall(r.call_status) || CALL_DEFAULT]}`}>{CALL_STATUS.map((s) => <option key={s}>{s}</option>)}</select></td>
                    <td className="max-w-32 truncate">{r.staff}</td>
                    <td className={`whitespace-nowrap ${overdue ? "font-semibold text-red-600" : ""}`}>{dmy(r.next_follow_up_at) || <span className="text-slate-300">ว่าง</span>}{overdue && " (เลยกำหนด)"}</td>
                    <td className="whitespace-nowrap p-2 text-right"><button onClick={() => { setViewing(r); setForm(null); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="underline">ดู</button> · <button onClick={() => openForm(r)} className="underline">แก้ไข</button></td>
                  </tr>);
              })}</tbody>
            </table>
          </div>}
          <div className="flex items-center justify-between text-xs text-slate-500"><span>{shown.length.toLocaleString("en-US")} รายการ · หน้า {cur}/{pages}</span>
            <span className="flex gap-3">{cur > 1 && <button className="underline" onClick={() => setPage(cur - 1)}>ก่อนหน้า</button>}{cur < pages && <button className="underline" onClick={() => setPage(cur + 1)}>ถัดไป</button>}</span></div>
          <p className="text-xs text-slate-500">• สถานะแสดงตามความต้องการ: ซื้อ / เช่า / สร้าง ใช้ Buy Status · ขาย ใช้ Sell Status · Dashboard นับ Qualified / Won / Lost จากสถานะเหล่านี้ · กดหัวคอลัมน์เพื่อเรียง</p>
        </div>
      )}
      {!form && <button onClick={() => openForm(null)} aria-label="เพิ่ม Lead (มือถือ)" className="fixed bottom-20 right-4 z-30 flex h-13 items-center gap-1 rounded-full bg-brand-600 px-5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 md:hidden">+ เพิ่ม Lead</button>}
    </div>
  );
}
