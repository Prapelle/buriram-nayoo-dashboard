"use client";
import { useAutoRefresh } from "@/lib/use-auto-refresh";
import { Skeleton } from "@/components/Skeleton";
import { Notice, type Msg } from "@/components/Toast";
import { BoardScroller, BoardTabs } from "@/components/Board";
import { btn } from "@/components/PageHeader";
import { thDate, thDateTime } from "@/lib/thdate";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CONTENT_TYPES, DUTIES, PROD_STAGES, REPORT_STAGES, SALES_GOALS, isReportStage } from "@/lib/content";

type Member = { email: string; name: string; duty: string; is_main: boolean };
type Card = Record<string, string> & { due: "none" | "upcoming" | "due" | "overdue"; members: Member[] };
type Board = { cards: Card[]; today: string; products: string[]; users: { email: string; name: string }[]; customers: { developer_id: string; name: string }[]; settings: { product: string; content_count: number; report_days: number }[] };
type Hist = { from_stage: string; to_stage: string; actor_name: string; at: string; note: string };

const HEAD: Record<string, string> = { IDEA: "bg-slate-200", "CONTENT PLANS": "bg-sky-200", "ART WORK / VIDEO": "bg-violet-200", "เสร็จ ART / VIDEO": "bg-indigo-200", REVIEW: "bg-amber-200", SCHEDULED: "bg-yellow-200", PUBLISHED: "bg-green-200",
  "รอครบเพื่อทำรายงาน": "bg-orange-200", "กำลังทำรายงาน": "bg-rose-200", "รายงานเสร็จแล้ว": "bg-teal-200", "ส่งให้ลูกค้าแล้ว": "bg-emerald-300" };
const inp = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? thDate(iso) : "");
const STAGES = [...PROD_STAGES, ...REPORT_STAGES] as string[];

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init }); const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? `HTTP ${r.status}`), { fields: j.fields as Record<string, string> | undefined, code: j.code as string | undefined });
  return j;
}
const send = (method: string, body: unknown): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export function ContentBoard({ canDelete }: { canDelete: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [b, setB] = useState<Board | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [q, setQ] = useState(""); const [who, setWho] = useState(""); const [cust, setCust] = useState(""); const [salesOnly, setSalesOnly] = useState(false);
  const [tab, setTab] = useState(""); const [dragId, setDragId] = useState(""); const [over, setOver] = useState("");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Card | "new" | null>(null);

  const load = useCallback(async (silent = false) => {
    try { setB(await api("/api/content")); setState("ok"); }
    catch (e) { if (silent) return; setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }); setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useAutoRefresh(() => load(true), busy.size > 0 || !!dragId || edit !== null);

  const shown = useMemo(() => (b?.cards ?? []).filter((c) =>
    (!salesOnly || c.sales_tag === "TRUE") && (!cust || c.developer_id === cust) && (!who || c.members.some((m) => m.email === who)) &&
    (!q || `${c.title} ${c.card_code} ${c.customer_name} ${c.product}`.toLowerCase().includes(q.toLowerCase()))), [b, q, who, cust, salesOnly]);
  const cols = useMemo(() => { const m: Record<string, Card[]> = Object.fromEntries(STAGES.map((s) => [s, []])); for (const c of shown) (m[c.stage] ?? (m[c.stage] = [])).push(c); return m; }, [shown]);
  const active = STAGES.includes(tab) ? tab : STAGES[0];

  async function move(id: string, to: string) {
    const c = b?.cards.find((x) => x.card_id === id);
    if (!c || busy.has(id) || c.stage === to) return;
    setBusy((s) => new Set(s).add(id)); setMsg(null);
    try {
      const r = await api("/api/content", send("PATCH", { card_id: id, stage: to, updated_at_seen: c.updated_at }));
      setMsg({ type: "ok", text: r.auto ? `${c.card_code}: เผยแพร่แล้ว → ${r.stage}` : `${c.card_code}: ${c.stage} → ${r.stage}` });
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "ย้ายไม่สำเร็จ" }); }
    finally { setBusy((s) => { const n = new Set(s); n.delete(id); return n; }); await load(true); }
  }

  const chip = (c: Card) => {
    const main = c.members.find((m) => m.is_main);
    return (
      <>
        <div className="font-medium leading-snug">{c.title}</div>
        <div className="mt-0.5 text-xs text-slate-500">{[c.customer_name, c.product].filter(Boolean).join(" · ") || <span className="text-slate-300">—</span>}</div>
        <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
          {c.sales_tag === "TRUE" && <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">งานขาย</span>}
          {c.content_type && <span className="rounded bg-slate-100 px-1.5 py-0.5">{c.content_type}</span>}
          {c.sales_tag === "TRUE" && c.sales_goal && <span className="rounded bg-slate-100 px-1.5 py-0.5">{c.sales_goal}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span className="font-mono">{c.card_code}</span>
          {main ? <span>👤 {main.name}</span> : c.members[0] && <span>👤 {c.members[0].name}</span>}{c.members.length > 1 && <span>+{c.members.length - 1}</span>}
          {c.planned_date && !c.published_at && <span>กำหนด {dmy(c.planned_date)}</span>}
          {c.published_at && <span>เผยแพร่ {dmy(c.published_at)}</span>}
        </div>
        {c.report_due_date && c.stage !== "ส่งให้ลูกค้าแล้ว" && c.stage !== "รายงานเสร็จแล้ว" && (
          <div className={`mt-1 text-xs ${c.due === "overdue" ? "font-semibold text-red-600" : c.due === "due" ? "font-semibold text-amber-700" : "text-slate-500"}`}>
            รายงานครบกำหนด {dmy(c.report_due_date)}{c.due === "overdue" && " (เลยกำหนด)"}{c.due === "due" && " (วันนี้)"}
          </div>)}
        {c.report_sent_at && <div className="mt-1 text-xs text-emerald-700">ส่งแล้ว {dmy(c.report_sent_at)}</div>}
      </>);
  };

  return (
    <div className="space-y-3">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ค้นหา</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ชื่อ / รหัส / ลูกค้า" className="h-9 w-48 rounded-lg border border-slate-300 bg-white px-2.5 text-sm" /></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ผู้รับผิดชอบ</span><select value={who} onChange={(e) => setWho(e.target.value)} className="h-9 max-w-40 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"><option value="">ทั้งหมด</option>{b?.users.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}</select></label>
        <label className="text-sm"><span className="mb-1 block text-xs text-slate-500">ลูกค้า</span><select value={cust} onChange={(e) => setCust(e.target.value)} className="h-9 max-w-44 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"><option value="">ทั้งหมด</option>{b?.customers.map((u) => <option key={u.developer_id} value={u.developer_id}>{u.name}</option>)}</select></label>
        <label className="flex h-9 items-center gap-1.5 text-sm"><input type="checkbox" checked={salesOnly} onChange={(e) => setSalesOnly(e.target.checked)} />เฉพาะงานขาย</label>
        <button type="button" onClick={() => setEdit("new")} className={`${btn.primary} ml-auto`}>＋ เพิ่ม Content</button>
      </div>

      {state === "loading" && <Skeleton kind="board" />}
      {state === "ok" && b && (
        <>
          <BoardTabs tabs={STAGES.map((k) => ({ key: k, label: k, count: cols[k]?.length ?? 0, cls: HEAD[k] }))} active={active} onPick={setTab} />
          <BoardScroller>
            {STAGES.map((k, idx) => (
              <div key={k} data-col={k}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(k); } }} onDragLeave={() => setOver((o) => (o === k ? "" : o))}
                onDrop={(e) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/plain") || dragId; setDragId(""); if (id) void move(id, k); }}
                className={`${active === k ? "flex" : "hidden"} max-h-[75vh] w-full shrink-0 flex-col rounded-lg border bg-slate-50 md:flex md:w-64 ${idx === PROD_STAGES.length ? "md:ml-3" : ""} ${over === k ? "border-brand-600 ring-2 ring-slate-300" : "border-slate-200"}`}>
                <div className={`flex items-center justify-between rounded-t-lg px-3 py-2 text-sm font-semibold ${HEAD[k]}`}>
                  <span>{k}</span><span className="rounded-full bg-white/70 px-2 text-xs">{cols[k]?.length ?? 0}</span>
                </div>
                {isReportStage(k) && <div className="px-3 pt-1 text-[11px] text-slate-400">เฉพาะงานขาย</div>}
                <ul className="flex-1 space-y-2 overflow-y-auto p-2">
                  {(cols[k] ?? []).length === 0 && <li className="py-6 text-center text-xs text-slate-400">ยังไม่มีการ์ด<span className="hidden md:inline"> · ลากมาวางได้</span></li>}
                  {(cols[k] ?? []).map((c) => (
                    <li key={c.card_id} draggable={!busy.has(c.card_id)}
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", c.card_id); e.dataTransfer.effectAllowed = "move"; setDragId(c.card_id); }} onDragEnd={() => { setDragId(""); setOver(""); }}
                      className={`rounded-md border border-slate-200 bg-white p-2.5 text-sm shadow-sm ${busy.has(c.card_id) ? "opacity-50" : "cursor-grab active:cursor-grabbing"} ${dragId === c.card_id ? "opacity-40" : ""}`}>
                      <button type="button" onClick={() => setEdit(c)} className="block w-full text-left">{chip(c)}</button>
                      <select aria-label={`ย้ายสถานะ ${c.card_code}`} value={c.stage} disabled={busy.has(c.card_id)} onChange={(e) => void move(c.card_id, e.target.value)} className="mt-2 w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-xs">
                        {STAGES.map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </li>))}
                </ul>
              </div>))}
          </BoardScroller>
          <p className="text-xs text-slate-500">• 7 คอลัมน์แรก = ช่วงผลิต · 4 คอลัมน์หลัง = ช่วงรายงานลูกค้า (เฉพาะ Content ที่ติดแท็กงานขาย) · งานขายที่เผยแพร่แล้วจะเลื่อนไป "รอครบเพื่อทำรายงาน" อัตโนมัติ พร้อมวันครบกำหนดจากระยะติดตามผล · ลากบนมือถือไม่สะดวก ใช้เมนูสถานะบนการ์ดแทน</p>
        </>)}
      {edit && b && <CardDialog board={b} card={edit === "new" ? null : edit} canDelete={canDelete} onClose={() => setEdit(null)} onDone={(t) => { setEdit(null); setMsg({ type: "ok", text: t }); void load(true); }} />}
    </div>
  );
}

function CardDialog({ board, card, canDelete, onClose, onDone }: { board: Board; card: Card | null; canDelete: boolean; onClose: () => void; onDone: (t: string) => void }) {
  const [f, setF] = useState({ title: card?.title ?? "", content_type: card?.content_type ?? "", sales_tag: card ? card.sales_tag === "TRUE" : false, sales_goal: card?.sales_goal ?? "", developer_id: card?.developer_id ?? "", product: card?.product ?? "",
    follow_days: card?.follow_days ?? "", planned_date: card?.planned_date ?? "", caption: card?.caption ?? "", drive_link: card?.drive_link ?? "", report_link: card?.report_link ?? "", post_id: card?.post_id ?? "" });
  const [members, setMembers] = useState<{ email: string; duty: string; is_main: boolean }[]>((card?.members ?? []).map((m) => ({ email: m.email, duty: m.duty, is_main: m.is_main })));
  const [err, setErr] = useState<Record<string, string>>({}); const [top, setTop] = useState(""); const [saving, setSaving] = useState(false);
  const [hist, setHist] = useState<Hist[] | null>(null);
  useEffect(() => { if (card) api(`/api/content/history?id=${card.card_id}`).then((j) => setHist(j.history)).catch(() => setHist([])); }, [card]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF((p) => ({ ...p, [k]: v })); setErr((e) => ({ ...e, [k]: "" })); };
  const inReport = !!card && isReportStage(card.stage);
  const field = (k: string, label: string, el: React.ReactNode) => <label className="block text-sm"><span className="mb-0.5 block text-xs text-slate-600">{label}</span>{el}{err[k] && <span role="alert" className="mt-0.5 block text-xs font-medium text-red-600">⚠ {err[k]}</span>}</label>;
  const cls = (k: string) => `${inp} ${err[k] ? "border-red-500 bg-red-50" : ""}`;
  const pickProduct = (p: string) => { set("product", p); const s = board.settings.find((x) => x.product === p); if (s?.report_days && !f.follow_days) set("follow_days", String(s.report_days)); };

  async function save() {
    setSaving(true); setTop(""); setErr({});
    try { await api("/api/content", send("POST", { ...f, members, card_id: card?.card_id, updated_at_seen: card?.updated_at })); onDone(card ? `บันทึก ${card.card_code} แล้ว` : "เพิ่ม Content แล้ว (อยู่คอลัมน์ IDEA)"); }
    catch (e) { const x = e as Error & { fields?: Record<string, string> }; setErr(x.fields ?? {}); setTop(x.message); } finally { setSaving(false); }
  }
  async function del() {
    if (!card || !window.confirm(`ลบ ${card.card_code} "${card.title}" ?`)) return;
    setSaving(true);
    try { await api("/api/content", send("DELETE", { card_id: card.card_id })); onDone(`ลบ ${card.card_code} แล้ว`); } catch (e) { setTop(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); setSaving(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 md:p-8" role="dialog" aria-modal="true" aria-label={card ? card.card_code : "เพิ่ม Content"}>
      <div className="w-full max-w-2xl space-y-3 rounded-xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between"><h2 className="text-base font-semibold">{card ? `${card.card_code} · ${card.stage}` : "เพิ่ม Content"}</h2><button type="button" onClick={onClose} aria-label="ปิด" className="px-2 text-xl leading-none">×</button></div>
        {top && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{top}</p>}
        {field("title", "ชื่อ Content *", <input value={f.title} onChange={(e) => set("title", e.target.value)} className={cls("title")} autoFocus />)}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("content_type", "ประเภท Content", <select value={f.content_type} onChange={(e) => set("content_type", e.target.value)} className={cls("content_type")}><option value="">—</option>{CONTENT_TYPES.map((x) => <option key={x}>{x}</option>)}</select>)}
          {field("planned_date", "กำหนดเผยแพร่", <input type="date" value={f.planned_date} onChange={(e) => set("planned_date", e.target.value)} className={cls("planned_date")} />)}
          {field("developer_id", "ลูกค้า", <select value={f.developer_id} onChange={(e) => set("developer_id", e.target.value)} className={cls("developer_id")}><option value="">—</option>{board.customers.map((c) => <option key={c.developer_id} value={c.developer_id}>{c.name}</option>)}</select>)}
          {field("product", "Product", <select value={f.product} onChange={(e) => pickProduct(e.target.value)} className={cls("product")}><option value="">—</option>{board.products.map((p) => <option key={p}>{p}</option>)}</select>)}
        </div>
        <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.sales_tag} disabled={inReport} onChange={(e) => set("sales_tag", e.target.checked)} />แท็ก “งานขาย” (เข้าช่วงรายงานลูกค้าได้){inReport && <span className="text-xs font-normal text-slate-500"> — ล็อกขณะอยู่ช่วงรายงาน</span>}</label>
          {f.sales_tag && <div className="grid gap-3 sm:grid-cols-2">
            {field("sales_goal", "เป้าหมายงานขาย", <select value={f.sales_goal} onChange={(e) => set("sales_goal", e.target.value)} className={cls("sales_goal")}><option value="">—</option>{SALES_GOALS.map((x) => <option key={x}>{x}</option>)}</select>)}
            {field("follow_days", "ระยะติดตามผล (วันหลังเผยแพร่)", <input inputMode="numeric" value={f.follow_days} onChange={(e) => set("follow_days", e.target.value)} placeholder="เช่น 30" className={cls("follow_days")} />)}
          </div>}
          {card?.report_due_date && <p className="text-xs text-slate-600">เผยแพร่ {dmy(card.published_at)} · รายงานครบกำหนด {dmy(card.report_due_date)}{card.report_sent_at && ` · ส่งแล้ว ${dmy(card.report_sent_at)}`}</p>}
        </fieldset>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-600"><span>ผู้ร่วมงาน (เลือกผู้รับผิดชอบหลักได้ 1 คน)</span><button type="button" onClick={() => setMembers((m) => [...m, { email: "", duty: "", is_main: m.length === 0 }])} className="underline">＋ เพิ่มคน</button></div>
          {members.map((m, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5">
              <select aria-label="ผู้ร่วมงาน" value={m.email} onChange={(e) => setMembers((a) => a.map((x, k) => (k === i ? { ...x, email: e.target.value } : x)))} className={`${inp} !w-auto min-w-40 flex-1`}><option value="">— เลือกคน —</option>{board.users.map((u) => <option key={u.email} value={u.email}>{u.name}</option>)}</select>
              <select aria-label="หน้าที่" value={m.duty} onChange={(e) => setMembers((a) => a.map((x, k) => (k === i ? { ...x, duty: e.target.value } : x)))} className={`${inp} !w-auto`}><option value="">หน้าที่</option>{DUTIES.map((d) => <option key={d}>{d}</option>)}</select>
              <label className="flex items-center gap-1 text-xs"><input type="radio" name="main" checked={m.is_main} onChange={() => setMembers((a) => a.map((x, k) => ({ ...x, is_main: k === i })))} />หลัก</label>
              <button type="button" aria-label="เอาออก" onClick={() => setMembers((a) => a.filter((_, k) => k !== i))} className="px-1.5 text-slate-500">✕</button>
            </div>))}
          {err.members && <span role="alert" className="block text-xs font-medium text-red-600">⚠ {err.members}</span>}
        </div>
        {field("caption", "แคปชัน / รายละเอียด", <textarea rows={3} value={f.caption} onChange={(e) => set("caption", e.target.value)} className={cls("caption")} />)}
        <div className="grid gap-3 sm:grid-cols-2">
          {field("drive_link", "ลิงก์ไฟล์งาน (Drive)", <input value={f.drive_link} onChange={(e) => set("drive_link", e.target.value)} placeholder="https://" className={cls("drive_link")} />)}
          {f.sales_tag && field("report_link", "ลิงก์ไฟล์รายงาน (Drive)", <input value={f.report_link} onChange={(e) => set("report_link", e.target.value)} placeholder="https://" className={cls("report_link")} />)}
          {field("post_id", "Facebook Post ID (ถ้ามี)", <input value={f.post_id} onChange={(e) => set("post_id", e.target.value)} className={cls("post_id")} />)}
        </div>
        {card && <details className="text-xs text-slate-600"><summary className="cursor-pointer">ประวัติสถานะ{hist ? ` (${hist.length})` : ""}</summary>
          <ul className="mt-1 space-y-0.5">{(hist ?? []).map((h, i) => <li key={i}>{thDateTime(h.at)} · {h.actor_name} · {h.from_stage || "สร้าง"} → {h.to_stage}{h.note && ` · ${h.note}`}</li>)}</ul></details>}
        <div className="flex items-center gap-2 pt-1">
          <button type="button" disabled={saving} onClick={save} className={btn.primary}>บันทึก</button>
          <button type="button" disabled={saving} onClick={onClose} className={btn.secondary}>ยกเลิก</button>
          {card && canDelete && <button type="button" disabled={saving} onClick={del} className="ml-auto text-sm text-red-700 underline">🗑 ลบ</button>}
        </div>
      </div>
    </div>
  );
}
