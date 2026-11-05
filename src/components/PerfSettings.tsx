"use client";
import { Skeleton } from "@/components/Skeleton";
import { Notice, type Msg } from "@/components/Toast";
import { DateInput } from "@/components/DateInput";
import { useCallback, useEffect, useMemo, useState } from "react";
import { metricsOf, POSITIONS, positionLabel, type Metric } from "@/lib/perf";
import { thDate, thMonth } from "@/lib/thdate";

type User = { email: string; name: string; role: string; positions: string[] };
type Settings = {
  month: string; users: User[]; targets: { user_email: string; metric_key: string; value: number }[];
  holidays: { date: string; name: string }[]; duplicateNames: string[]; waitKinds: string[];
};
const UNIT: Record<Metric["unit"], string> = { count: "ครั้ง/งาน", baht: "บาท", percent: "%" };
const monthNow = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
const tkey = (email: string, key: string) => `${email}|${key}`;

async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/perf/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

/** ตั้งค่าประสิทธิภาพรายคน (Super Admin): ตำแหน่ง · เป้ารายเดือน · วันหยุดบริษัท */
export function PerfSettings() {
  const [month, setMonth] = useState(monthNow());
  const [data, setData] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState("");
  const [hol, setHol] = useState({ date: "", name: "" });
  const [kinds, setKinds] = useState<string[] | null>(null); // null = ยังไม่แก้ (ใช้ค่าจากเซิร์ฟเวอร์)

  const load = useCallback(async (m: string) => {
    try {
      const r = await fetch(`/api/perf/settings?month=${m}`); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j); setDraft(Object.fromEntries((j.targets as Settings["targets"]).map((t) => [tkey(t.user_email, t.metric_key), String(t.value)])));
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดไม่ได้" }); }
  }, []);
  useEffect(() => { load(month); }, [load, month]);

  const saved = useMemo(() => new Map((data?.targets ?? []).map((t) => [tkey(t.user_email, t.metric_key), String(t.value)])), [data]);
  /** รายการที่ค่าในช่องต่างจากที่บันทึกไว้ (ช่องว่างที่เดิมไม่เคยตั้ง = ไม่ต่าง) */
  const changes = useMemo(() => {
    const out: { user_email: string; metric_key: string; value: string }[] = [];
    for (const u of data?.users ?? []) for (const p of u.positions) for (const m of metricsOf(p)) {
      const k = tkey(u.email, m.key), now = (draft[k] ?? "").trim(), was = saved.get(k) ?? "";
      if (now !== was) out.push({ user_email: u.email, metric_key: m.key, value: now });
    }
    return out;
  }, [data, draft, saved]);

  async function run(id: string, fn: () => Promise<string>) {
    setBusy(id); setMsg(null);
    try { const text = await fn(); await load(month); setMsg({ type: "ok", text }); }
    catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "เกิดข้อผิดพลาด" }); } finally { setBusy(""); }
  }
  const togglePosition = (u: User, key: string) => run(`pos:${u.email}`, async () => {
    const next = u.positions.includes(key) ? u.positions.filter((x) => x !== key) : [...u.positions, key];
    await call({ action: "positions", email: u.email, positions: next });
    return `อัปเดตตำแหน่งของ ${u.name} แล้ว`;
  });
  const saveTargets = () => run("targets", async () => { const j = await call({ action: "targets", month, items: changes }); return `บันทึกเป้า ${thMonth(month)} แล้ว (เปลี่ยน ${j.changed} รายการ)`; });
  const saveKinds = () => run("kinds", async () => { await call({ action: "wait_kinds", kinds: shownKinds }); setKinds(null); return "บันทึกรายการสิ่งที่รอจากลูกค้าแล้ว"; });
  const addHoliday = () => run("hol", async () => { await call({ action: "holiday_add", date: hol.date, name: hol.name }); setHol({ date: "", name: "" }); return "เพิ่มวันหยุดแล้ว"; });
  const delHoliday = (h: { date: string; name: string }) => { if (confirm(`ลบวันหยุด ${thDate(h.date)} ${h.name} ?`)) run(`del:${h.date}`, async () => { await call({ action: "holiday_delete", date: h.date }); return "ลบวันหยุดแล้ว"; }); };

  if (!data) return <><Notice msg={msg} onClose={() => setMsg(null)} /><Skeleton kind={"rows"} /></>;
  const withPos = data.users.filter((u) => u.positions.length);
  const shownKinds = kinds ?? data.waitKinds;
  const kindsChanged = kinds !== null && kinds.map((k) => k.trim()).filter(Boolean).join("|") !== data.waitKinds.join("|");
  const card = "space-y-3 rounded-xl border border-slate-200 bg-white p-5";

  return (
    <div className="space-y-5">
      <Notice msg={msg} onClose={() => setMsg(null)} />

      <section className={card}>
        <h2 className="font-semibold">1. ตำแหน่งของแต่ละคน</h2>
        <p className="text-xs text-slate-500">หนึ่งคนมีได้หลายตำแหน่ง · ตำแหน่งกำหนดว่าคนนั้นถูกวัดด้วยตัวชี้วัดอะไร (ติ๊กแล้วบันทึกทันที)</p>
        {data.duplicateNames.length > 0 && (
          <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
            มีผู้ใช้ชื่อที่แสดงซ้ำกัน: {data.duplicateNames.join(", ")} — ช่อง Staff ของ Leads / Developer เก็บเป็นชื่อที่แสดง ตัวเลขของคนชื่อซ้ำจะปนกัน ให้แก้ชื่อที่แสดงในหน้า ตั้งค่าระบบ → ผู้ใช้ ให้ต่างกัน
          </p>
        )}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b text-xs text-slate-500"><th className="py-1.5">ผู้ใช้</th>{POSITIONS.map((p) => <th key={p.key} className="px-2 text-center font-medium">{p.label}</th>)}</tr></thead>
          <tbody>{data.users.map((u) => (
            <tr key={u.email} className="border-b border-slate-100">
              <td className="py-1.5 pr-3"><div className="font-medium">{u.name}</div><div className="text-xs text-slate-500">{u.email} · {u.role}</div></td>
              {POSITIONS.map((p) => (
                <td key={p.key} className="px-2 text-center">
                  <input type="checkbox" aria-label={`${u.name}: ${p.label}`} checked={u.positions.includes(p.key)} disabled={busy === `pos:${u.email}`} onChange={() => togglePosition(u, p.key)} className="h-4 w-4" />
                </td>
              ))}
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-semibold">2. เป้าหมายรายเดือน</h2><p className="text-xs text-slate-500">เว้นว่าง = ไม่ตั้งเป้า · แสดงเฉพาะตัวชี้วัดของตำแหน่งที่คนนั้นมี</p></div>
          <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">เดือน</span><DateInput month aria-label="เดือน" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
        </div>
        {withPos.length === 0 ? <p className="text-sm text-slate-500">ยังไม่ได้กำหนดตำแหน่งให้ใคร — ติ๊กตำแหน่งในหัวข้อ 1 ก่อน</p> : (
          <div className="space-y-4">{withPos.map((u) => (
            <div key={u.email} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 font-medium">{u.name} <span className="text-xs font-normal text-slate-500">{u.email}</span></div>
              {u.positions.map((p) => (
                <div key={p} className="mb-2 last:mb-0">
                  <div className="mb-1 text-xs font-semibold text-slate-600">{positionLabel(p)}</div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{metricsOf(p).map((m) => (
                    <label key={m.key} className="text-sm" title={m.how}>
                      <span className="mb-0.5 block text-xs text-slate-600">{m.label} <span className="text-slate-400">({UNIT[m.unit]})</span></span>
                      <input inputMode="decimal" aria-label={`${u.name}: ${m.label}`} value={draft[tkey(u.email, m.key)] ?? ""} onChange={(e) => setDraft({ ...draft, [tkey(u.email, m.key)]: e.target.value })}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums" />
                      <span className="block text-[11px] leading-tight text-slate-400">{m.how}</span>
                    </label>
                  ))}</div>
                </div>
              ))}
            </div>
          ))}</div>
        )}
        <button onClick={saveTargets} disabled={busy === "targets" || changes.length === 0} className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40">
          {busy === "targets" ? "กำลังบันทึก..." : changes.length ? `บันทึกเป้า ${thMonth(month)} (${changes.length} รายการที่เปลี่ยน)` : "ยังไม่มีการเปลี่ยนแปลง"}
        </button>
      </section>

      <section className={card}>
        <h2 className="font-semibold">3. วันหยุดบริษัท</h2>
        <p className="text-xs text-slate-500">วันทำการ = จันทร์–เสาร์ (ตัดวันอาทิตย์) และตัดวันในรายการนี้ · ใช้นับเวลาที่รอลูกค้าและความทันเวลาของงาน</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">วันที่</span><DateInput aria-label="วันที่หยุด" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-slate-600">ชื่อวันหยุด</span><input aria-label="ชื่อวันหยุด" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" /></label>
          <button onClick={addHoliday} disabled={busy === "hol" || !hol.date || !hol.name.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40">เพิ่ม</button>
        </div>
        {data.holidays.length === 0 ? <p className="text-sm text-slate-500">ยังไม่มีวันหยุดบริษัท</p> : (
          <ul className="divide-y divide-slate-100 text-sm">{data.holidays.map((h) => (
            <li key={h.date} className="flex items-center justify-between gap-3 py-1.5"><span><span className="tabular-nums">{thDate(h.date)}</span> · {h.name}</span>
              <button onClick={() => delHoliday(h)} disabled={busy === `del:${h.date}`} className="text-xs text-red-600 underline disabled:opacity-40">ลบ</button></li>
          ))}</ul>
        )}
      </section>

      <section className={card}>
        <h2 className="font-semibold">4. สิ่งที่รอจากลูกค้า (การ์ด Content งานขาย)</h2>
        <p className="text-xs text-slate-500">รายการที่ให้เลือกตอนกด “เริ่มรอลูกค้า” — เพิ่ม/แก้ชื่อ/ลบได้ 1–12 รายการ · ที่เคยบันทึกไปแล้วยังนับวันรอตามเดิม</p>
        <div className="space-y-1.5">{shownKinds.map((k, i) => (
          <div key={i} className="flex gap-1.5">
            <input aria-label={`รายการที่ ${i + 1}`} value={k} maxLength={40} onChange={(e) => setKinds(shownKinds.map((x, j) => (j === i ? e.target.value : x)))} className="w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            <button type="button" aria-label="ลบรายการ" disabled={shownKinds.length <= 1} onClick={() => setKinds(shownKinds.filter((_, j) => j !== i))} className="px-2 text-slate-500 disabled:opacity-30">✕</button>
          </div>))}
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={shownKinds.length >= 12} onClick={() => setKinds([...shownKinds, ""])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40">＋ เพิ่มรายการ</button>
          <button type="button" onClick={saveKinds} disabled={busy === "kinds" || !kindsChanged} className="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40">{busy === "kinds" ? "กำลังบันทึก..." : "บันทึกรายการ"}</button>
        </div>
      </section>
    </div>
  );
}
