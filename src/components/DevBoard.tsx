"use client";
import { Skeleton } from "@/components/Skeleton";
import { Notice } from "@/components/Toast";
import { thDate, thDateTime, thMonth, thDayMonth } from "@/lib/thdate";
import Link from "next/link";
import { BoardScroller, BoardTabs } from "@/components/Board";
import { useAsk } from "@/components/AskDialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AUTO_STATUS, CONTACT_METHODS, DEV_DEFAULT, DEV_STATUS, productState, TIERS, type Dev, type DevProduct } from "@/lib/developers";

/** บอร์ด Sale developer: คอลัมน์ตาม Status ของ Developer · กำลังใช้ Product / ใกล้หมดสัญญา ระบบตั้งเองจาก Product */
const HEAD: Record<string, string> = {
  ยังไม่เข้าร่วม: "bg-slate-200", เข้าร่วมแล้ว: "bg-sky-200", มีแผนเข้าพบ: "bg-amber-200", เข้าพบแล้ว: "bg-indigo-200", ปิดการขาย: "bg-emerald-200",
  "กำลังใช้ Product": "bg-green-300", ใกล้หมดสัญญา: "bg-orange-200", ไม่ให้เข้าพบ: "bg-rose-200",
};
const HINT: Record<string, string> = { มีแผนเข้าพบ: "สิ้นเดือนกลับไป เข้าร่วมแล้ว (นับเป็นไม่ให้เข้าพบ)", เข้าพบแล้ว: "สิ้นเดือนกลับไป เข้าร่วมแล้ว", "กำลังใช้ Product": "ระบบย้ายให้ตามวัน Product", ใกล้หมดสัญญา: "เหลือ ≤ 30 วันก่อนหมดอายุ" };
const dmy = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? thDate(s) : "");

export function DevBoard() {
  const [all, setAll] = useState<Dev[]>([]); const [products, setProducts] = useState<DevProduct[]>([]); const [staff, setStaff] = useState<string[]>([]); const [today, setToday] = useState("");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [tab, setTab] = useState(""); // มือถือ: คอลัมน์ที่แสดง
  const [ask, askEl] = useAsk();
  const [msg, setMsg] = useState<{ type: "ok" | "error"; text: string; link?: string } | null>(null);
  const [q, setQ] = useState(""); const [staffF, setStaffF] = useState(""); const [tierF, setTierF] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set()); const [dragId, setDragId] = useState(""); const [over, setOver] = useState("");

  const load = useCallback(async () => {
    try { const r = await fetch("/api/developers"); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); setAll(j.devs); setProducts(j.products); setStaff(j.staff); setToday(j.today); setState("ok"); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดข้อมูลไม่ได้" }); setState("error"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const activeOf = useMemo(() => { const m = new Map<string, DevProduct[]>(); for (const p of products) if (productState(p, today) !== "expired") { if (!m.has(p.developer_id)) m.set(p.developer_id, []); m.get(p.developer_id)!.push(p); } return m; }, [products, today]);
  const locked = (d: Dev) => AUTO_STATUS.includes(d.status) || (activeOf.get(d.developer_id) ?? []).some((p) => productState(p, today) === "active");
  const shown = useMemo(() => { const s = q.trim().toLowerCase(); return all.filter((d) => (!staffF || d.staff === staffF) && (!tierF || d.tier === tierF) && (!s || [d.dev_code, d.company_name, d.project_main, d.project_sub1, d.project_sub2, d.contact_name, d.phone].some((x) => (x ?? "").toLowerCase().includes(s)))); }, [all, q, staffF, tierF]);
  const cols = useMemo(() => { const m: Record<string, Dev[]> = Object.fromEntries(DEV_STATUS.map((s) => [s, []])); for (const d of shown) (m[d.status || DEV_DEFAULT] ?? m[DEV_DEFAULT]).push(d); return m; }, [shown]);

  async function move(id: string, to: string) {
    const d = all.find((x) => x.developer_id === id);
    if (!d || busy.has(id) || (d.status || DEV_DEFAULT) === to || AUTO_STATUS.includes(to)) return;
    if (locked(d)) { setMsg({ type: "error", text: `${d.company_name || d.project_main}: มี Product ที่ใช้อยู่ — Status เปลี่ยนเองตามวันหมดอายุ` }); return; }
    // เข้าพบแล้ว → ถามวิธี (โทร / Line / เจอหน้า) · ยกเลิก = ไม่ย้าย
    let method: string | undefined;
    if (to === "เข้าพบแล้ว") { const m = await ask({ title: `${d.company_name || d.project_main}: เข้าพบแล้ว`, label: "สถานะการเข้าพบ", options: CONTACT_METHODS, initial: d.last_contact_method || CONTACT_METHODS[0] }); if (m === null) return; method = m; }
    setBusy((b) => new Set(b).add(id)); setMsg(null);
    setAll((rs) => rs.map((x) => (x.developer_id === id ? { ...x, status: to } : x)));
    try {
      const r = await fetch("/api/developers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ developer_id: id, status: to, updated_at_seen: d.updated_at, method }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "เปลี่ยนสถานะไม่สำเร็จ");
      setAll((rs) => rs.map((x) => (x.developer_id === id ? j.dev : x)));
      const name = d.company_name || d.project_main;
      setMsg(to === "ปิดการขาย" ? { type: "ok", text: `${name}: ปิดการขายแล้ว (นับเป็น Win) — เพิ่ม Product และวันหมดอายุได้เมื่อพร้อม การ์ดจะย้ายไป กำลังใช้ Product เองเมื่อถึงวันเริ่ม`, link: `/developers?view=${id}` }
        : { type: "ok", text: `${name}: ${d.status || DEV_DEFAULT} → ${to}${to === "เข้าพบแล้ว" ? ` (${method}) · ติดต่อล่าสุด = วันนี้` : ""}` });
    } catch (e) { setAll((rs) => rs.map((x) => (x.developer_id === id ? d : x))); setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); load(); }
    finally { setBusy((b) => { const n = new Set(b); n.delete(id); return n; }); }
  }

  return (
    <div className="space-y-3">
      <Notice msg={msg && { ...msg, linkText: "เพิ่ม Product" }} onClose={() => setMsg(null)} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ค้นหา</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="บริษัท / โครงการ / ผู้ติดต่อ" className="w-56 h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm" /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">Staff</span><select aria-label="กรอง Staff" value={staffF} onChange={(e) => setStaffF(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"><option value="">ทั้งหมด</option>{staff.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">Tier</span><select aria-label="กรอง Tier" value={tierF} onChange={(e) => setTierF(e.target.value)} className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"><option value="">ทั้งหมด</option>{TIERS.map((s) => <option key={s}>{s}</option>)}</select></label>
        <span className="ml-auto text-xs text-slate-500">{shown.length.toLocaleString("en-US")} รายการ · เพิ่ม/แก้ไขรายละเอียดและ Product ที่หน้า <Link href="/developers" className="underline">Developer</Link></span>
      </div>
      {state === "loading" && <Skeleton kind={"board"} />}
      {state === "ok" && all.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">ยังไม่มี Developer — เพิ่มได้ที่หน้า Developer</p>}
      {state === "ok" && all.length > 0 && (
        <>
        <BoardTabs tabs={DEV_STATUS.map((k) => ({ key: k, label: k, count: cols[k].length, cls: HEAD[k] }))} active={tab || DEV_STATUS[0]} onPick={setTab} />
        <BoardScroller>
          {DEV_STATUS.map((k) => {
            const auto = AUTO_STATUS.includes(k);
            return (
              <div key={k} data-col={k}
                onDragOver={auto ? undefined : (e) => { if (dragId) { e.preventDefault(); setOver(k); } }} onDragLeave={() => setOver((o) => (o === k ? "" : o))}
                onDrop={auto ? undefined : (e) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/plain") || dragId; setDragId(""); if (id) move(id, k); }}
                className={`${(tab || DEV_STATUS[0]) === k ? "flex" : "hidden"} max-h-[75vh] w-full shrink-0 flex-col rounded-lg border bg-slate-50 md:flex md:w-60 ${over === k ? "border-brand-600 ring-2 ring-slate-300" : "border-slate-200"}`}>
                <div className={`rounded-t-lg px-3 py-2 ${HEAD[k]}`}>
                  <div className="flex items-center justify-between text-sm font-semibold"><span>{k}{auto && " 🔒"}</span><span className="rounded-full bg-white/70 px-2 text-xs">{cols[k].length}</span></div>
                  {HINT[k] && <div className="text-[11px] text-slate-700">{HINT[k]}</div>}
                </div>
                <ul className="flex-1 space-y-2 overflow-y-auto p-2">
                  {cols[k].length === 0 && <li className="py-6 text-center text-xs text-slate-400">ยังไม่มีบริษัทในสถานะนี้<span className="hidden md:inline"> · ลากการ์ดมาวางได้</span></li>}
                  {cols[k].map((d) => {
                    const lock = locked(d), b = busy.has(d.developer_id), act = (activeOf.get(d.developer_id) ?? []).sort((x, y) => x.end_date.localeCompare(y.end_date));
                    const overdue = d.next_follow_up_at && d.next_follow_up_at < today;
                    return (
                      <li key={d.developer_id} draggable={!b && !lock}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", d.developer_id); e.dataTransfer.effectAllowed = "move"; setDragId(d.developer_id); }}
                        onDragEnd={() => { setDragId(""); setOver(""); }}
                        className={`rounded-md border border-slate-200 bg-white p-2.5 text-sm shadow-sm ${b ? "opacity-50" : lock ? "" : "cursor-grab active:cursor-grabbing"} ${dragId === d.developer_id ? "opacity-40" : ""}`}>
                        <div className="flex items-start justify-between gap-2"><div className="font-medium leading-snug">{d.company_name || d.project_main}</div>{d.tier && <span className="rounded bg-slate-800 px-1.5 text-[11px] font-semibold text-white">{d.tier}</span>}</div>
                        {d.company_name && d.project_main && <div className="text-xs text-slate-500">{d.project_main}</div>}
                        {act.map((p) => <div key={p.product_id} className="mt-1 text-[11px]"><span className="rounded bg-green-100 px-1">{p.product}</span> {productState(p, today) === "future" ? `เริ่ม ${dmy(p.start_date)}` : `หมด ${dmy(p.end_date)}`}</div>)}
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500"><span className="font-mono">{d.dev_code}</span>{d.staff && <span>{d.staff}</span>}{d.next_follow_up_at && <span className={overdue ? "font-semibold text-red-600" : ""}>ติดต่อ {dmy(d.next_follow_up_at)}</span>}</div>
                        {lock ? <p className="mt-2 text-[11px] text-slate-500">Status ตามวันของ Product</p> : (
                          <select aria-label={`เปลี่ยน Status ${d.company_name || d.project_main}`} value={d.status || DEV_DEFAULT} disabled={b} onChange={(e) => move(d.developer_id, e.target.value)} className="mt-2 w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs">
                            {DEV_STATUS.filter((s) => !AUTO_STATUS.includes(s)).map((s) => <option key={s}>{s}</option>)}
                          </select>)}
                      </li>);
                  })}
                </ul>
              </div>);
          })}
        </BoardScroller>
        </>
      )}
      <p className="text-xs text-slate-500">• ลากการ์ดเพื่อเปลี่ยน Status (มือถือใช้เมนูบนการ์ด) · 🔒 = ระบบย้ายให้เองตามวันของ Product · ปิดการขาย = Win ของเดือนนั้น · ย้ายไป เข้าพบแล้ว → ติดต่อล่าสุด = วันนี้</p>
      {askEl}
    </div>
  );
}
