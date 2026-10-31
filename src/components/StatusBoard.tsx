"use client";
import { Skeleton } from "@/components/Skeleton";
import { Notice } from "@/components/Toast";
import { thDate, thDateTime, thMonth, thDayMonth } from "@/lib/thdate";
import Link from "next/link";
import { BoardScroller, BoardTabs } from "@/components/Board";
import { telHref } from "@/lib/contact-links";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BUY_NEEDS, CALL_DEFAULT, CALL_STATUS, normCall, SELL_DEFAULT, SELL_NEEDS, SELL_STATUS } from "@/lib/lead-options";
import { filterLeads, leadStatusOf, todayBkk, type Lead } from "@/lib/leads";

/** บอร์ด Kanban ของ Lead: seller = คอลัมน์ตาม Sell Status (Need = ขาย) · buyer = คอลัมน์ตาม Call Status (Need = ซื้อ/เช่า/สร้าง) */
const CFG = {
  seller: {
    field: "sell_status", statuses: SELL_STATUS, def: SELL_DEFAULT, needs: SELL_NEEDS, label: "Sell Status",
    closed: ["ขายแล้ว", "ยกเลิก", "บ้านไม่พร้อมขาย"], none: "Lead ที่ Need = ขาย",
    note: `Lead ขายที่ยังไม่มี Sell Status จะอยู่ที่ "${SELL_DEFAULT}" · เมื่อเปลี่ยนสถานะ ขั้น Pipeline ใน Dashboard จะคำนวณใหม่อัตโนมัติ`,
  },
  buyer: {
    field: "call_status", statuses: CALL_STATUS, def: CALL_DEFAULT, needs: BUY_NEEDS, label: "Call Status",
    closed: ["ซื้อสำเร็จ", "กู้ไม่ผ่าน", "ไม่สนใจ"], none: "Lead ที่ Need = ซื้อ / เช่า / สร้าง",
    note: `Lead ที่ยังไม่มี Call Status จะอยู่ที่ "${CALL_DEFAULT}" · เมื่อเปลี่ยนสถานะ Qualified Leads และ contactable ใน Dashboard จะคำนวณใหม่อัตโนมัติ`,
  },
} as const;

const OTHER = "__other";
const HEAD: Record<string, string> = {
  รอติดต่อ: "bg-slate-200", สนใจขาย: "bg-sky-200", นัดทำสัญญา: "bg-amber-200", เซ็นสัญญา: "bg-indigo-200", สัญญาเปิด: "bg-violet-200",
  บ้านไม่พร้อมขาย: "bg-slate-300", ขายแล้ว: "bg-green-200", ยกเลิก: "bg-rose-200",
  ติดต่อได้แล้ว: "bg-green-100", รอเข้าชม: "bg-yellow-200", เข้าชมแล้ว: "bg-sky-200", จอง: "bg-violet-200", ซื้อสำเร็จ: "bg-emerald-200",
  กู้ไม่ผ่าน: "bg-orange-200", ติดต่อไม่ได้: "bg-red-200", ไม่สนใจ: "bg-slate-300", [OTHER]: "bg-amber-100",
};
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? thDate(iso) : "");

export function StatusBoard({ kind }: { kind: "seller" | "buyer" }) {
  const cfg = CFG[kind];
  const statuses: readonly string[] = cfg.statuses;
  /** คอลัมน์ของ Lead: ไม่มีสถานะ = ขั้นแรก · ค่าที่ไม่อยู่ในรายการ ไปคอลัมน์ "ค่าเดิมที่ไม่รู้จัก" */
  const colOf = useCallback((r: Lead) => {
    const s = (kind === "seller" ? leadStatusOf(r) : normCall(r.call_status)) || cfg.def;
    return statuses.includes(s) ? s : OTHER;
  }, [kind, cfg.def, statuses]);

  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [tab, setTab] = useState(""); // มือถือ: คอลัมน์ที่แสดง
  const [all, setAll] = useState<Lead[]>([]);
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
      setAll(j.rows as Lead[]); setStaff(j.staff ?? []); setState("ok");
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดข้อมูลไม่ได้" }); setState("error"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => all.filter((x) => (cfg.needs as readonly string[]).includes(x.need)), [all, cfg.needs]);
  const noNeed = useMemo(() => all.filter((x) => !x.need).length, [all]);
  const shown = useMemo(() => filterLeads(rows, { q, staff: staffF }), [rows, q, staffF]);
  const cols = useMemo(() => {
    const m: Record<string, Lead[]> = Object.fromEntries([...statuses, OTHER].map((s) => [s, []]));
    for (const r of shown) m[colOf(r)].push(r);
    return m;
  }, [shown, statuses, colOf]);
  const today = todayBkk();

  async function move(id: string, to: string) {
    const row = all.find((r) => r.lead_id === id);
    if (!row || busy.has(id) || !statuses.includes(to) || colOf(row) === to) return;
    const before = row;
    setBusy((b) => new Set(b).add(id)); setMsg(null);
    setAll((rs) => rs.map((r) => (r.lead_id === id ? { ...r, [cfg.field]: to } : r))); // แสดงผลทันที
    try {
      const r = await fetch("/api/leads", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ lead_id: id, field: cfg.field, value: to, updated_at_seen: before.updated_at }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
      setAll((rs) => rs.map((x) => (x.lead_id === id ? (j.lead as Lead) : x)));
      setMsg({ type: "ok", text: `${before.customer_name}: ${colOf(before) === OTHER ? "ค่าเดิม" : colOf(before)} → ${to}` });
    } catch (e) {
      setAll((rs) => rs.map((x) => (x.lead_id === id ? before : x))); // คืนค่าเดิม
      setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" });
      load();
    } finally { setBusy((b) => { const n = new Set(b); n.delete(id); return n; }); }
  }

  const colKeys = [...statuses, ...(cols[OTHER].length ? [OTHER] : [])];

  return (
    <div className="space-y-3">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ค้นหา</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ / เบอร์ / รหัส / Remark" className="w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">Staff</span>
          <select value={staffF} onChange={(e) => setStaffF(e.target.value)} className="max-w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm"><option value="">ทั้งหมด</option>{staff.map((s) => <option key={s}>{s}</option>)}</select></label>
        {(q || staffF) && <button onClick={() => { setQ(""); setStaffF(""); }} className="py-1.5 text-sm underline">ล้าง</button>}
        <span className="ml-auto text-xs text-slate-500">{shown.length.toLocaleString("en-US")} รายการ · เพิ่ม/แก้ไขรายละเอียดที่หน้า <Link href="/leads" className="underline">Leads</Link></span>
      </div>

      {state === "loading" && <Skeleton kind={"board"} />}
      {state === "ok" && rows.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">ยังไม่มี {cfg.none} — เพิ่มได้ที่หน้า Leads</p>}

      {state === "ok" && rows.length > 0 && (
        <>
        <BoardTabs tabs={colKeys.map((k) => ({ key: k, label: k === OTHER ? "ค่าเดิมที่ไม่รู้จัก" : k, count: cols[k].length, cls: HEAD[k] }))} active={colKeys.includes(tab) ? tab : colKeys[0]} onPick={setTab} />
        <BoardScroller>
          {colKeys.map((k) => {
            const list = cols[k]; const isOther = k === OTHER;
            return (
              <div key={k} data-col={k}
                onDragOver={isOther ? undefined : (e) => { if (dragId) { e.preventDefault(); setOver(k); } }}
                onDragLeave={() => setOver((o) => (o === k ? "" : o))}
                onDrop={isOther ? undefined : (e) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/plain") || dragId; setDragId(""); if (id) move(id, k); }}
                className={`${(colKeys.includes(tab) ? tab : colKeys[0]) === k ? "flex" : "hidden"} max-h-[75vh] w-full shrink-0 flex-col rounded-lg border bg-slate-50 md:flex md:w-64 ${over === k ? "border-slate-900 ring-2 ring-slate-300" : "border-slate-200"}`}>
                <div className={`flex items-center justify-between rounded-t-lg px-3 py-2 text-sm font-semibold ${HEAD[k]}`}>
                  <span>{isOther ? "ค่าเดิมที่ไม่รู้จัก" : k}</span><span className="rounded-full bg-white/70 px-2 text-xs">{list.length}</span>
                </div>
                <ul className="flex-1 space-y-2 overflow-y-auto p-2">
                  {list.length === 0 && <li className="py-6 text-center text-xs text-slate-400">ยังไม่มี Lead ในสถานะนี้<span className="hidden md:inline"> · ลากการ์ดมาวางได้</span></li>}
                  {list.map((r) => {
                    const overdue = r.next_follow_up_at && r.next_follow_up_at < today && !(cfg.closed as readonly string[]).includes(colOf(r));
                    const b = busy.has(r.lead_id);
                    return (
                      <li key={r.lead_id} draggable={!b}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", r.lead_id); e.dataTransfer.effectAllowed = "move"; setDragId(r.lead_id); }}
                        onDragEnd={() => { setDragId(""); setOver(""); }}
                        className={`rounded-md border border-slate-200 bg-white p-2.5 text-sm shadow-sm ${b ? "opacity-50" : "cursor-grab active:cursor-grabbing"} ${dragId === r.lead_id ? "opacity-40" : ""}`}>
                        <div className="font-medium leading-snug">{r.customer_name}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{r.phone && <><a href={telHref(r.phone)} className="text-sky-700 hover:underline" draggable={false}>{r.phone}</a>{(r.property_type || r.price_range) && " · "}</>}{[r.property_type, r.price_range].filter(Boolean).join(" · ")}{!r.phone && !r.property_type && !r.price_range && <span className="text-slate-300">—</span>}</div>
                        {r.interest && <div className="mt-0.5 line-clamp-2 text-xs text-slate-600" title={r.interest}>สนใจ: {r.interest}</div>}
                        {kind === "buyer" && <div className="mt-1 flex gap-1 text-[11px]"><span className="rounded bg-slate-100 px-1.5 py-0.5">{r.need}</span>{r.buy_status && <span className="rounded bg-slate-100 px-1.5 py-0.5">{r.buy_status}</span>}</div>}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                          <span className="font-mono">{r.lead_code}</span>
                          {r.staff && <span>{r.staff}</span>}
                          {r.next_follow_up_at && <span className={overdue ? "font-semibold text-red-600" : ""}>ติดตาม {dmy(r.next_follow_up_at)}{overdue && " (เลยกำหนด)"}</span>}
                        </div>
                        <select aria-label={`เปลี่ยน ${cfg.label} ${r.customer_name}`} value={isOther ? "" : colOf(r)} disabled={b} onChange={(e) => move(r.lead_id, e.target.value)}
                          className="mt-2 w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs">
                          {isOther && <option value="">— เลือกสถานะ —</option>}
                          {statuses.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </li>);
                  })}
                </ul>
              </div>);
          })}
        </BoardScroller>
        </>
      )}
      <p className="text-xs text-slate-500">• {cfg.note} · ลากบนมือถือไม่สะดวก ใช้เมนูสถานะบนการ์ดแทน{noNeed > 0 && ` · มี ${noNeed} Lead ที่ยังไม่ระบุ Need ไม่แสดงบนบอร์ด (กำหนด Need ที่หน้า Leads)`}</p>
    </div>
  );
}
