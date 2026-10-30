"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SELL_DEFAULT, SELL_STATUS } from "@/lib/lead-options";
import { filterLeads, leadStatusOf, todayBkk, type Lead } from "@/lib/leads";

const OTHER = "__other";
const HEAD: Record<string, string> = {
  รอติดต่อ: "bg-slate-200", สนใจขาย: "bg-sky-200", นัดทำสัญญา: "bg-amber-200", เซ็นสัญญา: "bg-indigo-200", สัญญาเปิด: "bg-violet-200",
  บ้านไม่พร้อมขาย: "bg-slate-300", ขายแล้ว: "bg-green-200", ยกเลิก: "bg-rose-200", [OTHER]: "bg-amber-100",
};
const CLOSED = ["ขายแล้ว", "ยกเลิก", "บ้านไม่พร้อมขาย"];
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
/** คอลัมน์ของ Lead: ไม่มี Sell Status = รอติดต่อ · ค่าที่ไม่อยู่ในรายการ (เช่นค่าเก่า) ไปคอลัมน์ "ค่าเดิมที่ไม่รู้จัก" */
const colOf = (r: Lead) => { const s = leadStatusOf(r) || SELL_DEFAULT; return SELL_STATUS.includes(s) ? s : OTHER; };

export function SellerBoard() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [rows, setRows] = useState<Lead[]>([]);
  const [staff, setStaff] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [staffF, setStaffF] = useState("");
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState("");
  const [over, setOver] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/leads"); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setRows((j.rows as Lead[]).filter((x) => x.need === "ขาย")); setStaff(j.staff ?? []); setState("ok");
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดข้อมูลไม่ได้" }); setState("error"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => filterLeads(rows, { q, staff: staffF }), [rows, q, staffF]);
  const cols = useMemo(() => {
    const m: Record<string, Lead[]> = Object.fromEntries([...SELL_STATUS, OTHER].map((s) => [s, []]));
    for (const r of shown) m[colOf(r)].push(r);
    return m;
  }, [shown]);
  const today = todayBkk();

  async function move(id: string, to: string) {
    const row = rows.find((r) => r.lead_id === id);
    if (!row || busy.has(id) || !SELL_STATUS.includes(to) || colOf(row) === to) return;
    const before = row;
    setBusy((b) => new Set(b).add(id)); setMsg(null);
    setRows((rs) => rs.map((r) => (r.lead_id === id ? { ...r, sell_status: to } : r))); // แสดงผลทันที
    try {
      const r = await fetch("/api/leads", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: id, sell_status: to, updated_at_seen: before.updated_at }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
      setRows((rs) => rs.map((x) => (x.lead_id === id ? (j.lead as Lead) : x)));
      setMsg({ type: "ok", text: `${before.customer_name}: ${colOf(before) === OTHER ? "ค่าเดิม" : colOf(before)} → ${to}` });
    } catch (e) {
      setRows((rs) => rs.map((x) => (x.lead_id === id ? before : x))); // คืนค่าเดิม
      setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" });
      load();
    } finally { setBusy((b) => { const n = new Set(b); n.delete(id); return n; }); }
  }

  const colKeys = [...SELL_STATUS, ...(cols[OTHER].length ? [OTHER] : [])];

  return (
    <div className="space-y-3">
      {msg && <p role={msg.type === "error" ? "alert" : "status"} className={`rounded-md p-3 text-sm ${msg.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{msg.text}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ค้นหา</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ / เบอร์ / รหัส / Remark" className="w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">Staff</span>
          <select value={staffF} onChange={(e) => setStaffF(e.target.value)} className="max-w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm"><option value="">ทั้งหมด</option>{staff.map((s) => <option key={s}>{s}</option>)}</select></label>
        {(q || staffF) && <button onClick={() => { setQ(""); setStaffF(""); }} className="py-1.5 text-sm underline">ล้าง</button>}
        <span className="ml-auto text-xs text-slate-500">{shown.length.toLocaleString("en-US")} รายการ · เพิ่ม/แก้ไขรายละเอียดที่หน้า <Link href="/leads" className="underline">Leads</Link></span>
      </div>

      {state === "loading" && <p className="text-sm text-slate-500">กำลังโหลด...</p>}
      {state === "ok" && rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">ยังไม่มี Lead ที่ Need = ขาย — เพิ่มได้ที่หน้า Leads</p>}

      {state === "ok" && rows.length > 0 && (
        <div className="flex items-start gap-3 overflow-x-auto pb-3">
          {colKeys.map((k) => {
            const list = cols[k]; const isOther = k === OTHER;
            return (
              <div key={k}
                onDragOver={isOther ? undefined : (e) => { if (dragId) { e.preventDefault(); setOver(k); } }}
                onDragLeave={() => setOver((o) => (o === k ? "" : o))}
                onDrop={isOther ? undefined : (e) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/plain") || dragId; setDragId(""); if (id) move(id, k); }}
                className={`flex max-h-[75vh] w-64 shrink-0 flex-col rounded-lg border bg-slate-50 ${over === k ? "border-slate-900 ring-2 ring-slate-300" : "border-slate-200"}`}>
                <div className={`flex items-center justify-between rounded-t-lg px-3 py-2 text-sm font-semibold ${HEAD[k]}`}>
                  <span>{isOther ? "ค่าเดิมที่ไม่รู้จัก" : k}</span><span className="rounded-full bg-white/70 px-2 text-xs">{list.length}</span>
                </div>
                <ul className="flex-1 space-y-2 overflow-y-auto p-2">
                  {list.length === 0 && <li className="py-6 text-center text-xs text-slate-400">ว่าง</li>}
                  {list.map((r) => {
                    const overdue = r.next_follow_up_at && r.next_follow_up_at < today && !CLOSED.includes(colOf(r));
                    const b = busy.has(r.lead_id);
                    return (
                      <li key={r.lead_id} draggable={!b}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", r.lead_id); e.dataTransfer.effectAllowed = "move"; setDragId(r.lead_id); }}
                        onDragEnd={() => { setDragId(""); setOver(""); }}
                        className={`rounded-md border border-slate-200 bg-white p-2.5 text-sm shadow-sm ${b ? "opacity-50" : "cursor-grab active:cursor-grabbing"} ${dragId === r.lead_id ? "opacity-40" : ""}`}>
                        <div className="font-medium leading-snug">{r.customer_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{[r.phone, r.property_type, r.price_range].filter(Boolean).join(" · ") || <span className="text-slate-300">—</span>}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                          <span className="font-mono">{r.lead_code}</span>
                          {r.staff && <span>{r.staff}</span>}
                          {r.next_follow_up_at && <span className={overdue ? "font-semibold text-red-600" : ""}>ติดตาม {dmy(r.next_follow_up_at)}{overdue && " (เลยกำหนด)"}</span>}
                        </div>
                        <select aria-label={`เปลี่ยนสถานะ ${r.customer_name}`} value={isOther ? "" : colOf(r)} disabled={b} onChange={(e) => move(r.lead_id, e.target.value)}
                          className="mt-2 w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs">
                          {isOther && <option value="">— เลือกสถานะ —</option>}
                          {SELL_STATUS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </li>);
                  })}
                </ul>
              </div>);
          })}
        </div>
      )}
      <p className="text-xs text-slate-500">• Lead ขายที่ยังไม่มี Sell Status จะอยู่ที่ &quot;{SELL_DEFAULT}&quot; · ลากบนมือถือไม่สะดวก ใช้เมนูสถานะบนการ์ดแทน · เมื่อเปลี่ยนสถานะ ขั้น Pipeline ใน Dashboard จะคำนวณใหม่อัตโนมัติ</p>
    </div>
  );
}
