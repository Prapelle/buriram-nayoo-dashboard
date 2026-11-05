"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { calcTotals, payableOf, DOC_LABEL, NEXT_TYPES, DOC_TYPES, PAY_METHODS, STATUS_LABEL, money, round2, thaiDate, validateDoc, addDays, DEFAULT_DUE_DAYS, MAX_FILE_BYTES, FILE_TYPES, type Customer, type DocStatus, type DocType, type Rec } from "@/lib/account";
import { Notice, type Msg } from "./Toast";
import { btn, PageHeader } from "./PageHeader";

type Line = { product: string; category: string; description: string; qty: string; unit_price: string; start_date: string; end_date: string };
type Detail = { receipt_payment: Rec | null; parent_no: string; doc: Rec; work_started_at: string; editable: boolean; lines: Rec[]; payments: Rec[]; files: Rec[]; jobs: Rec[]; chain: Rec[]; customer_status: string };
const blankLine = (cat = "Product"): Line => ({ product: "", category: cat, description: "", qty: "1", unit_price: "", start_date: "", end_date: "" });
const inp = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
const inpErr = "w-full rounded-md border border-red-500 bg-red-50 px-2 py-1.5 text-sm ring-1 ring-red-300";
const btnDanger = "inline-flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50";
async function api(url: string, init?: RequestInit) { const r = await fetch(url, { cache: "no-store", ...init }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error ?? "ผิดพลาด"), { fields: j.fields as Record<string, string> | undefined, code: j.code as string | undefined }); return j; }

/** ออก/แก้เอกสาร + ดูรายละเอียด: สร้างใบต่อไป · ยืนยันชำระ/มัดจำ · เริ่มงาน · แนบไฟล์ · งาน Production ที่สร้างให้ */
export function DocPage({ docType = "quotation", docId, canPay, isSuper = false }: { docType?: DocType; docId?: string; canPay: boolean; isSuper?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]); const [types, setTypes] = useState<string[]>([]); const [cats, setCats] = useState<string[]>(["Product", "Service", "Event"]); const [today, setToday] = useState(""); const [members, setMembers] = useState<string[]>([]);
  const [d, setD] = useState<Detail | null>(null); const [loaded, setLoaded] = useState(false);
  const [f, setF] = useState<Record<string, string>>({ doc_type: docType, doc_date: "", due_date: "", customer_id: "", job_title: "", contact_name: "", contact_phone: "", seller_name: "", customer_address: "", customer_tax_id: "", discount: "0", vat_rate: "0", wht_rate: "0", note: "" });
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [find, setFind] = useState(""); const [nc, setNc] = useState<{ kind: string; company_name: string; contact_name: string; phone: string } | null>(null);
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState({ amount: "", paid_at: "", method: PAY_METHODS[0], ref: "", note: "" }); const [slip, setSlip] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      const l = await api("/api/account"); setCustomers(l.customers); setTypes(l.types); setCats(l.categories); setToday(l.today); setMembers(l.members ?? []);
      if (docId) {
        const j: Detail = await api(`/api/account/${docId}`); setD(j);
        const x = j.doc; setF({ doc_type: x.doc_type, doc_date: x.doc_date, due_date: x.due_date, customer_id: x.customer_id, job_title: x.job_title, contact_name: x.contact_name, contact_phone: x.contact_phone, seller_name: x.seller_name, customer_address: x.customer_address, customer_tax_id: x.customer_tax_id, discount: x.discount || "0", vat_rate: x.vat_rate || "0", wht_rate: x.wht_rate || "0", note: x.note });
        setLines(j.lines.map((y) => ({ product: y.product, category: y.category || "Product", description: y.description, qty: y.qty, unit_price: y.unit_price, start_date: y.start_date, end_date: y.end_date })));
        setPay((p) => ({ ...p, amount: String(round2(payableOf(x) - Number(x.paid_amount))), paid_at: l.today }));
      } else setF((p) => { const d = p.doc_date || l.today; return { ...p, doc_date: d, due_date: p.due_date || addDays(d, DEFAULT_DUE_DAYS), seller_name: p.seller_name || l.me || "" }; });
    } catch (e) { setMsg({ type: "error", text: e instanceof Error ? e.message : "โหลดไม่สำเร็จ" }); } finally { setLoaded(true); }
  }, [docId]);
  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => calcTotals(lines.map((l) => ({ qty: Number(l.qty) || 0, unit_price: Number(l.unit_price) || 0 })), Number(f.discount) || 0, Number(f.vat_rate) || 0, Number(f.wht_rate) || 0), [lines, f.discount, f.vat_rate, f.wht_rate]);
  const doc = d?.doc, isNew = !docId, editable = !docId || !!d?.editable, canType = isNew || (editable && edit), cancelled = doc?.status === "cancelled";
  const paid = Number(doc?.paid_amount ?? 0), payable = doc ? payableOf(doc) : 0, remain = round2(payable - paid), started = !!d?.work_started_at;
  // เปลี่ยนวันที่เอกสาร: ถ้าครบกำหนดยังเป็นค่าอัตโนมัติ (ว่าง หรือ = วันที่เดิม + 7) ให้เลื่อนตามเป็นวันที่ใหม่ + 7
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v, ...(k === "doc_date" && /^\d{4}-\d{2}-\d{2}$/.test(v) && (!p.due_date || (/^\d{4}-\d{2}-\d{2}$/.test(p.doc_date) && p.due_date === addDays(p.doc_date, DEFAULT_DUE_DAYS))) ? { due_date: addDays(v, DEFAULT_DUE_DAYS) } : {}) })); const setL = (i: number, k: keyof Line, v: string) => setLines((p) => p.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const e = (k: string) => errs[k] ? <span role="alert" className="mt-0.5 block text-xs font-medium text-red-600">⚠ {errs[k]}</span> : null;
  const ic = (k: string) => (errs[k] ? inpErr : inp);
  const nErr = Object.keys(errs).length;
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErrs({}); try { await fn(); } catch (x) { const er = x as Error & { fields?: Record<string, string> }; setErrs(er.fields ?? {}); setMsg({ type: "error", text: er.message }); } finally { setBusy(false); } };
  const post = (b: Record<string, unknown>, url = "/api/account") => api(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

  const pickCustomer = (id: string) => { set("customer_id", id); const c = customers.find((x) => x.developer_id === id); if (c) setF((p) => ({ ...p, customer_id: id, contact_name: c.contact_name, contact_phone: c.phone, customer_address: c.address, customer_tax_id: c.tax_id })); };
  const addType = () => { const name = window.prompt("ชื่อ Product ใหม่ (จะไปอยู่ในรายการ Product ของ Developer / Home Builder ด้วย)"); if (name) void run(async () => { const r = await post({ action: "product_type", name }); setTypes(r.types); setMsg({ type: "ok", text: `เพิ่ม Product "${name.trim()}" แล้ว` }); }); };
  const addCustomer = () => nc && run(async () => {
    const r = await api("/api/developers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...nc, kind: nc.kind }) });
    await load(); pickCustomer(r.dev.developer_id); setNc(null); setMsg({ type: "ok", text: `เพิ่ม ${r.dev.company_name} (${r.dev.dev_code}) แล้ว` });
  });
  const save = () => run(async () => {
    const v = validateDoc({ ...f, lines }, types, cats);
    if (!v.ok) { setErrs(v.errors); setMsg({ type: "error", text: `กรอกไม่ครบหรือไม่ถูกต้อง ${Object.keys(v.errors).length} ช่อง — ดูช่องที่มีแถบสีแดง` }); setTimeout(() => document.querySelector('[role="alert"]')?.scrollIntoView({ block: "center", behavior: "smooth" }), 50); return; }
    const r = await post({ ...f, doc_id: docId, updated_at_seen: doc?.updated_at, lines });
    setMsg({ type: "ok", text: `บันทึก ${r.doc.doc_no} แล้ว` }); if (!docId) router.replace(`/account/${r.doc.doc_id}`); else { setEdit(false); await load(); }
  });
  const convert = (to: DocType) => run(async () => { const r = await post({ action: "convert", doc_id: docId, to }); router.push(`/account/${r.doc.doc_id}`); });
  const status = (s: string) => run(async () => { await post({ action: "status", doc_id: docId, status: s }); await load(); setMsg({ type: "ok", text: `เปลี่ยนสถานะเป็น ${STATUS_LABEL[s as DocStatus]} แล้ว` }); });
  const start = () => run(async () => { const r = await post({ action: "start", doc_id: docId }, "/api/account/pay"); await load(); setMsg({ type: "ok", text: `เริ่มงานแล้ว — เพิ่ม Product ${r.started.products} รายการ และสร้าง Job ${r.started.jobs.map((j: Rec) => j.job_code).join(", ")}` }); });
  const upload = async (file: File, paymentId = "") => { const fd = new FormData(); fd.set("doc_id", docId!); fd.set("payment_id", paymentId); fd.set("file", file); await api("/api/account/files", { method: "POST", body: fd }); };
  const confirm = () => run(async () => {
    const pe: Record<string, string> = {};
    if (!slip) pe.slip = "ต้องแนบสลิปหรือเอกสารยืนยันการชำระเงินทุกครั้ง";
    else if (!FILE_TYPES.includes(slip.type)) pe.slip = "ไฟล์ต้องเป็น PDF / PNG / JPG";
    else if (slip.size > MAX_FILE_BYTES) pe.slip = "ไฟล์ใหญ่เกิน 10 MB";
    if (!(Number(pay.amount) > 0)) pe.amount = "ใส่จำนวนเงินที่รับชำระ เช่น 5000";
    if (!pay.paid_at) pe.paid_at = "เลือกวันที่ชำระ";
    if (Object.keys(pe).length) { setErrs(pe); setMsg({ type: "error", text: "กรอกข้อมูลการชำระเงินไม่ครบ — ดูช่องที่มีแถบสีแดง" }); return; }
    const fd = new FormData(); fd.set("action", "payment"); fd.set("doc_id", docId!); fd.set("updated_at_seen", doc!.updated_at);
    for (const [k, v] of Object.entries(pay)) fd.set(k, v); fd.set("file", slip!);
    const r = await api("/api/account/pay", { method: "POST", body: fd });
    let note = r.fileError ? ` (แนบเอกสารไม่สำเร็จ: ${r.fileError} — แนบซ้ำที่ส่วนไฟล์แนบ)` : ""; setSlip(null);
    await load();
    const rcNote = r.receipt ? ` · ออกใบเสร็จ ${r.receipt.doc_no} แล้ว` : r.receiptError ? ` · ออกใบเสร็จไม่สำเร็จ: ${r.receiptError}` : "";
    setMsg({ type: r.startError || note || r.receiptError ? "warn" : "ok", text: (r.started ? `ยืนยันชำระแล้ว — เพิ่ม Product ให้ลูกค้า ${r.started.products} รายการ และสร้าง Job ${r.started.jobs.map((j: Rec) => j.job_code).join(", ")}${note}` : r.startError ? `บันทึกการชำระแล้ว แต่เริ่มงานไม่สำเร็จ: ${r.startError} — แก้แล้วกดปุ่ม เริ่มงาน${note}` : r.canStart ? `บันทึกมัดจำแล้ว — กดปุ่ม เริ่มงาน เมื่อพร้อม${note}` : `บันทึกการชำระแล้ว${note}`) + rcNote });
  });
  const issueRc = (paymentId: string) => run(async () => { const r = await post({ action: "receipt", payment_id: paymentId }, "/api/account/pay"); await load(); setMsg({ type: "ok", text: `ออกใบเสร็จ ${r.receipt.doc_no} แล้ว` }); });
  const removeFile = (x: Rec) => { if (window.confirm(`ลบไฟล์แนบ "${x.file_name}" ?\nลบแล้วกู้คืนไม่ได้`)) void run(async () => { await api(`/api/account/files?id=${x.file_id}`, { method: "DELETE" }); await load(); setMsg({ type: "ok", text: "ลบไฟล์แนบแล้ว" }); }); };
  const removeDoc = () => { if (doc && window.confirm(`ลบ ${label} ${doc.doc_no} ?\nจะลบรายการสินค้า รายการชำระ ไฟล์แนบ และใบเสร็จของใบนี้ด้วย กู้คืนไม่ได้`)) void run(async () => { await api(`/api/account/${docId}`, { method: "DELETE" }); router.push("/account"); }); };
  const attach = (file: File | undefined) => file && run(async () => { await upload(file); await load(); setMsg({ type: "ok", text: "แนบไฟล์แล้ว" }); });

  if (!loaded) return <p className="p-6 text-slate-500">กำลังโหลด…</p>;
  const shownCust = customers.filter((c) => !find || `${c.name} ${c.code} ${c.project}`.toLowerCase().includes(find.toLowerCase()));
  const cust = customers.find((c) => c.developer_id === f.customer_id);
  const label = DOC_LABEL[(doc?.doc_type ?? f.doc_type) as DocType];
  return (
    <section className="max-w-6xl space-y-4">
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <PageHeader crumb="บัญชี" title={doc ? `${label} ${doc.doc_no}` : `ออก${label}`}
        sub={doc ? <span>{thaiDate(doc.doc_date)} · {STATUS_LABEL[doc.status as DocStatus]}{started ? " · เริ่มงานแล้ว" : ""}{d?.customer_status ? ` · สถานะลูกค้า: ${d.customer_status}` : ""}</span> : "เลือกลูกค้าจากรายชื่อ Developer / Home Builder · รายการสินค้าคือ Product เดียวกับของลูกค้า"}>
        {doc && <a href={`/print/${doc.doc_id}`} target="_blank" rel="noreferrer" className={btn.secondary}>พิมพ์ / PDF</a>}
        {doc && !cancelled && editable && !edit && <button type="button" disabled={busy} onClick={() => setEdit(true)} className={btn.secondary}>✎ แก้ไข</button>}
        {doc && edit && <button type="button" disabled={busy} onClick={() => { setEdit(false); setErrs({}); void load(); }} className={btn.secondary}>ยกเลิกการแก้ไข</button>}
        {doc && isSuper && <button type="button" disabled={busy} onClick={removeDoc} className={btnDanger}>🗑 ลบเอกสาร</button>}
        {doc && !cancelled && doc.doc_type !== "receipt" && NEXT_TYPES[doc.doc_type as DocType].map((t) => <button key={t} type="button" disabled={busy} onClick={() => convert(t)} className={btn.secondary}>สร้าง{DOC_LABEL[t]}ต่อ</button>)}
        {doc && canPay && doc.doc_type !== "receipt" && paid > 0 && !started && !cancelled && <button type="button" disabled={busy} onClick={start} className={btn.primary}>▶ เริ่มงาน</button>}
      </PageHeader>
      {d && <Stepper chain={d.chain} cur={docId!} />}
      {d && d.chain.length > 1 && <p className="text-sm text-slate-600">สายเอกสาร: {d.chain.map((c, i) => <span key={c.doc_id}>{i > 0 && " → "}{c.doc_id === docId ? <b>{c.doc_no}</b> : <Link className="underline" href={`/account/${c.doc_id}`}>{c.doc_no}</Link>}</span>)}</p>}
      {!editable && docId && <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">🔒 {cancelled ? "เอกสารนี้ยกเลิกแล้ว" : doc?.doc_type === "receipt" ? "ใบเสร็จแก้ไขไม่ได้" : "เอกสารนี้มีการชำระเงินหรือถูกสร้างใบถัดไปแล้ว (เช่น ใบเสนอราคาที่ออกใบวางบิลแล้ว) จึงแก้ไขไม่ได้ — ถ้าต้องแก้ ให้ยกเลิกแล้วออกใบใหม่"}</p>}
      {nErr > 0 && <p role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-700">⚠ กรอกไม่ครบหรือไม่ถูกต้อง {nErr} ช่อง — ดูช่องที่มีแถบสีแดงและคำอธิบายใต้ช่อง</p>}

      <fieldset disabled={!canType || busy} className="space-y-4">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">ลูกค้า</h2>
          <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
            <input value={find} onChange={(e2) => setFind(e2.target.value)} placeholder="ค้นหาลูกค้า เช่น ซีเจ หรือ DEV-0001" className={inp} />
            <select value={f.customer_id} onChange={(e2) => pickCustomer(e2.target.value)} className={ic("customer_id")} aria-label="ลูกค้า"><option value="">— เลือกลูกค้า (จำเป็น) —</option>{shownCust.map((c) => <option key={c.developer_id} value={c.developer_id}>{c.code} · {c.name}{c.project && c.project !== c.name ? ` (${c.project})` : ""}</option>)}</select>
          </div>
          {e("customer_id")}
          {cust && <p className="text-xs text-slate-500">{cust.kind === "home_builder" ? "Home Builder" : "Developer"} {cust.code} — Product จะถูกเพิ่มให้ลูกค้ารายนี้เมื่อยืนยันชำระ · ผู้ติดต่อ เบอร์ ที่อยู่ เลขผู้เสียภาษี ระบบจำจากเอกสารล่าสุดและใส่ให้อัตโนมัติ</p>}
          {!nc ? <button type="button" onClick={() => setNc({ kind: "developer", company_name: "", contact_name: "", phone: "" })} className="text-sm text-brand-700 underline">＋ ไม่พบในรายชื่อ? เพิ่มลูกค้าใหม่</button> : (
            <div className="grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-5">
              <select value={nc.kind} onChange={(e2) => setNc({ ...nc, kind: e2.target.value })} className={inp}><option value="developer">Developer</option><option value="home_builder">Home Builder</option></select>
              <input value={nc.company_name} onChange={(e2) => setNc({ ...nc, company_name: e2.target.value })} placeholder="ชื่อบริษัท เช่น บริษัท ซีเจ เออเบิ้ล โฮม จำกัด" className={inp} />
              <input value={nc.contact_name} onChange={(e2) => setNc({ ...nc, contact_name: e2.target.value })} placeholder="ผู้ติดต่อ เช่น คุณสมชาย" className={inp} />
              <input value={nc.phone} onChange={(e2) => setNc({ ...nc, phone: e2.target.value })} placeholder="เบอร์ เช่น 0812345678" className={inp} />
              <div className="flex gap-2"><button type="button" onClick={addCustomer} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white">เพิ่ม</button><button type="button" onClick={() => setNc(null)} className="rounded-md border px-3 py-1.5 text-sm">ยกเลิก</button></div>
            </div>)}
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-sm">ชื่องาน<input value={f.job_title} onChange={(e2) => set("job_title", e2.target.value)} placeholder="เช่น บุรีรัมย์น่าอยู่ (แคมเปญ TopDeal)" className={ic("job_title")} />{e("job_title")}</label>
            <label className="text-sm">ผู้ติดต่อ<input value={f.contact_name} onChange={(e2) => set("contact_name", e2.target.value)} placeholder="เช่น คุณปริญญาพร บุญประสพ" className={ic("contact_name")} />{e("contact_name")}</label>
            <label className="text-sm">เบอร์โทร<input inputMode="tel" value={f.contact_phone} onChange={(e2) => set("contact_phone", e2.target.value)} placeholder="เช่น 0833651355" className={ic("contact_phone")} />{e("contact_phone")}</label>
            <label className="text-sm sm:col-span-2">ที่อยู่ลูกค้า (แสดงบนเอกสาร)<input value={f.customer_address} onChange={(e2) => set("customer_address", e2.target.value)} placeholder="เช่น 99 ถ.หลักเมือง ต.ในเมือง อ.เมือง จ.บุรีรัมย์ 31000" className={ic("customer_address")} />{e("customer_address")}</label>
            <label className="text-sm">เลขประจำตัวผู้เสียภาษี (13 หลัก)<input inputMode="numeric" value={f.customer_tax_id} onChange={(e2) => set("customer_tax_id", e2.target.value)} placeholder="เช่น 0325566000476" className={ic("customer_tax_id")} />{e("customer_tax_id")}</label>
            <label className="text-sm">วันที่ (จำเป็น)<input type="date" value={f.doc_date} onChange={(e2) => set("doc_date", e2.target.value)} className={ic("doc_date")} />{e("doc_date")}</label>
            <label className="text-sm">ครบกำหนด / ใช้ได้ถึง <span className="text-slate-400">(ไม่ใส่ = {DEFAULT_DUE_DAYS} วันหลังวันที่เอกสาร)</span><input type="date" value={f.due_date} onChange={(e2) => set("due_date", e2.target.value)} className={ic("due_date")} />{e("due_date")}</label>
            <label className="text-sm">ผู้ขาย (เลือกจากชื่อสมาชิก)<select value={f.seller_name} onChange={(e2) => set("seller_name", e2.target.value)} className={ic("seller_name")}><option value="">— เลือกผู้ขาย —</option>{[...new Set([...members, ...(f.seller_name ? [f.seller_name] : [])])].map((m) => <option key={m} value={m}>{m}</option>)}</select>{e("seller_name")}</label>
          </div>
        </div>

        <div className={`space-y-3 rounded-xl border bg-white p-4 ${errs.lines ? "border-red-500 ring-1 ring-red-300" : "border-slate-200"}`}>
          <div className="flex items-center gap-3"><h2 className="font-semibold">รายการสินค้า (Product)</h2><button type="button" onClick={addType} className="text-sm text-brand-700 underline">＋ เพิ่ม Product ใหม่ในรายการ</button></div>
          {e("lines")}
          {lines.map((l, i) => (
            <div key={i} className="space-y-2 rounded-lg bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-[2fr_1fr_.6fr_1fr_1fr]">
                <label className="text-xs">Product *<select value={l.product} onChange={(e2) => setL(i, "product", e2.target.value)} className={ic(`lines.${i}.product`)}><option value="">— เลือก Product (จำเป็น) —</option>{types.map((t) => <option key={t}>{t}</option>)}</select>{e(`lines.${i}.product`)}</label>
                <label className="text-xs">ประเภท<select value={l.category} onChange={(e2) => setL(i, "category", e2.target.value)} className={inp}>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className="text-xs">จำนวน<input inputMode="decimal" value={l.qty} onChange={(e2) => setL(i, "qty", e2.target.value)} placeholder="เช่น 1" className={ic(`lines.${i}.qty`)} />{e(`lines.${i}.qty`)}</label>
                <label className="text-xs">ราคาต่อหน่วย<input inputMode="decimal" value={l.unit_price} onChange={(e2) => setL(i, "unit_price", e2.target.value)} placeholder="เช่น 5000" className={ic(`lines.${i}.unit_price`)} />{e(`lines.${i}.unit_price`)}</label>
                <div className="text-xs">ยอดรวม<div className="px-2 py-1.5 text-sm font-semibold">{money(round2((Number(l.qty) || 0) * (Number(l.unit_price) || 0)))}</div></div>
              </div>
              <label className="block text-xs">รายละเอียด (บรรทัดที่ขึ้นต้นด้วย - จะกลายเป็นเช็กลิสต์ของงาน Production)
                <textarea value={l.description} onChange={(e2) => setL(i, "description", e2.target.value)} rows={5} placeholder={"เช่น\nสิ่งที่โครงการได้รับ\n- Content รวมโครงการที่เข้าแคมเปญ\n- Code Grab มูลค่า 100 บาท"} className={`${ic(`lines.${i}.description`)} font-mono text-[13px]`} />{e(`lines.${i}.description`)}</label>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <label className="text-xs">เริ่มใช้ Product<input type="date" value={l.start_date} onChange={(e2) => setL(i, "start_date", e2.target.value)} className={ic(`lines.${i}.start_date`)} />{e(`lines.${i}.start_date`)}</label>
                <label className="text-xs">สิ้นสุด<input type="date" value={l.end_date} onChange={(e2) => setL(i, "end_date", e2.target.value)} className={ic(`lines.${i}.end_date`)} />{e(`lines.${i}.end_date`)}</label>
                {lines.length > 1 && <button type="button" onClick={() => setLines((p) => p.filter((_, j) => j !== i))} className="self-end rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700">ลบรายการ</button>}
              </div>
            </div>))}
          <button type="button" onClick={() => setLines((p) => [...p, blankLine()])} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">＋ เพิ่มรายการ</button>
          <p className="text-xs text-slate-500">วันเริ่ม–สิ้นสุดใช้สร้าง Product ของลูกค้าตอนเริ่มงาน (ใส่ตอนออกใบหรือก่อนยืนยันชำระก็ได้)</p>
          <div className="ml-auto grid max-w-sm gap-1 text-sm">
            <div className="flex justify-between"><span>รวมเป็นเงิน</span><span>{money(totals.subtotal)}</span></div>
            <label className="flex items-center justify-between gap-2"><span>ส่วนลด</span><input inputMode="decimal" value={f.discount} onChange={(e2) => set("discount", e2.target.value)} placeholder="เช่น 500" className={`${ic("discount")} w-28 text-right`} /></label>{e("discount")}
            <label className="flex items-center justify-between gap-2"><span>VAT %</span><input inputMode="decimal" value={f.vat_rate} onChange={(e2) => set("vat_rate", e2.target.value)} placeholder="0 หรือ 7" className={`${ic("vat_rate")} w-28 text-right`} /></label>{e("vat_rate")}
            <label className="flex items-center justify-between gap-2"><span>หัก ณ ที่จ่าย %</span><select value={f.wht_rate} onChange={(e2) => set("wht_rate", e2.target.value)} className={`${inp} w-28 text-right`} aria-label="หัก ณ ที่จ่าย">{[...new Set(["0", "1", "2", "3", "5", f.wht_rate])].map((x) => <option key={x} value={x}>{x === "0" ? "ไม่หัก" : `${x}%`}</option>)}</select></label>{e("wht_rate")}
            {totals.vat > 0 && <div className="flex justify-between"><span>VAT</span><span>{money(totals.vat)}</span></div>}
            <div className="flex justify-between border-t pt-1 text-base font-bold"><span>รวมทั้งสิ้น</span><span>฿{money(totals.total)}</span></div>
            {totals.wht > 0 && <><div className="flex justify-between"><span>หัก ณ ที่จ่าย {totals.wht_rate}% (จากยอดก่อน VAT)</span><span>-{money(totals.wht)}</span></div><div className="flex justify-between text-base font-bold text-brand-700"><span>ยอดที่ต้องชำระ</span><span>฿{money(round2(totals.total - totals.wht))}</span></div></>}
          </div>
          <label className="block text-sm">หมายเหตุ<textarea value={f.note} onChange={(e2) => set("note", e2.target.value)} rows={2} placeholder="เช่น ชำระภายใน 7 วันหลังรับใบแจ้งหนี้" className={ic("note")} />{e("note")}</label>
        </div>
        {canType && <button type="button" onClick={save} disabled={busy} className={btn.primary}>{busy ? "กำลังบันทึก…" : docId ? "บันทึกการแก้ไข" : `บันทึก${label}`}</button>}
      </fieldset>

      {doc && !cancelled && paid === 0 && <div className="flex flex-wrap items-center gap-2 text-sm"><span className="text-slate-600">สถานะ:</span>
        {(["draft", "sent", "approved", "cancelled"] as const).map((s) => <button key={s} type="button" disabled={busy || doc.status === s} onClick={() => status(s)} className={`rounded-full border px-3 py-1 ${doc.status === s ? "border-brand-600 bg-brand-50 text-brand-800" : "border-slate-300 bg-white"}`}>{STATUS_LABEL[s]}</button>)}</div>}

      {doc && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">การชำระเงิน — ยอดที่ต้องชำระ ฿{money(payable)}{Number(doc.wht) > 0 ? ` (รวม ฿${money(doc.total)} หัก ณ ที่จ่าย ฿${money(doc.wht)})` : ""} · ชำระแล้ว ฿{money(paid)} · คงเหลือ ฿{money(remain)}</h2>
          {d!.payments.length > 0 && <ul className="space-y-1.5 text-sm text-slate-700">{d!.payments.map((p) => { const rc = d!.chain.find((c) => c.doc_id === p.receipt_doc_id); return <li key={p.payment_id}>{thaiDate(p.paid_at)} · ฿{money(p.amount)} · {p.method}{p.ref ? ` · ${p.ref}` : ""} <span className="text-xs text-slate-400">({p.confirmed_by})</span>{" "}
            {rc ? <Link className={`${btn.secondary} !h-8 !px-3`} href={`/account/${rc.doc_id}`}>🧾 ใบเสร็จ {rc.doc_no}</Link> : canPay && <button type="button" disabled={busy} onClick={() => issueRc(p.payment_id)} className={`${btn.primary} !h-8 !px-3`}>🧾 ออกใบเสร็จ</button>}</li>; })}</ul>}
          {canPay && !cancelled && remain > 0 ? (
            <div className="grid gap-2 rounded-md bg-slate-50 p-3 sm:grid-cols-5">
              <label className="text-xs">จำนวนเงิน<input inputMode="decimal" value={pay.amount} onChange={(e2) => setPay({ ...pay, amount: e2.target.value })} placeholder="เช่น 5000" className={ic("amount")} />{e("amount")}</label>
              <label className="text-xs">วันที่ชำระ<input type="date" max={today} value={pay.paid_at} onChange={(e2) => setPay({ ...pay, paid_at: e2.target.value })} className={ic("paid_at")} />{e("paid_at")}</label>
              <label className="text-xs">วิธีชำระ<select value={pay.method} onChange={(e2) => setPay({ ...pay, method: e2.target.value })} className={inp}>{PAY_METHODS.map((m) => <option key={m}>{m}</option>)}</select>{e("method")}</label>
              <label className="text-xs">อ้างอิง / เลขที่สลิป<input value={pay.ref} onChange={(e2) => setPay({ ...pay, ref: e2.target.value })} placeholder="เช่น เลขที่อ้างอิงในสลิป 0123456789" className={inp} /></label>
              <label className={`text-xs ${errs.slip ? "rounded-md border border-red-500 bg-red-50 p-1" : ""}`}>แนบสลิป / เอกสารยืนยันการชำระเงิน * (PDF/PNG/JPG ไม่เกิน 10 MB)<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e2) => { setSlip(e2.target.files?.[0] ?? null); setErrs((p) => { const { slip: _s, ...r } = p; return r; }); }} className="block w-full text-xs" />{e("slip")}</label>
              <div className="sm:col-span-5 flex flex-wrap items-center gap-3"><button type="button" disabled={busy || !slip} onClick={confirm} title={slip ? "" : "ต้องแนบสลิปก่อน"} className={`${btn.primary} disabled:cursor-not-allowed disabled:opacity-50`}>ยืนยันการชำระเงิน</button>{!slip && <span className="text-xs font-medium text-red-600">⚠ ต้องแนบสลิป / เอกสารยืนยันการชำระเงินก่อน จึงจะกดยืนยันได้</span>}
                <span className="text-xs text-slate-500">ชำระเต็มจำนวน = เพิ่ม Product ให้ลูกค้าและสร้าง Job Production ให้อัตโนมัติ · ชำระบางส่วน (มัดจำ) = กดปุ่ม ▶ เริ่มงาน ภายหลัง</span></div>
            </div>) : !canPay && remain > 0 && !cancelled ? <p className="text-sm text-slate-500">การยืนยันชำระเงินทำได้เฉพาะ Admin</p> : null}
        </div>)}

      {doc && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold">ไฟล์แนบ</h2>
          {d!.files.length ? <ul className="space-y-1.5 text-sm">{d!.files.map((x) => <li key={x.file_id} className="flex flex-wrap items-center gap-2"><a className={`${btn.secondary} !h-8 !px-3`} href={`/api/account/files?id=${x.file_id}`}>⬇ {x.file_name}</a><span className="text-xs text-slate-400">{Math.round(Number(x.size) / 1024)} KB · {x.uploaded_by}</span>{isSuper && <button type="button" disabled={busy} onClick={() => removeFile(x)} className={`${btnDanger} !h-8 !px-3`}>🗑 ลบไฟล์</button>}</li>)}</ul> : <p className="text-sm text-slate-500">ยังไม่มีไฟล์แนบ</p>}
          {canPay && <div><label className={`${btn.secondary} cursor-pointer`}>＋ แนบไฟล์เพิ่ม<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={(e2) => { void attach(e2.target.files?.[0]); e2.target.value = ""; }} className="sr-only" /></label><span className="ml-2 text-xs text-slate-500">ใบเสนอราคาที่ลูกค้าเซ็น / สลิป — PDF, PNG, JPG ไม่เกิน 10 MB</span></div>}
        </div>)}

      {d && d.jobs.length > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3"><h2 className="font-semibold">งาน Production ที่สร้างให้</h2><Link href="/production/content" className="text-sm text-brand-700 underline">ไปบอร์ด Content</Link></div>
          <ul className="text-sm">{d.jobs.map((j) => <li key={j.job_id}><b>{j.job_code}</b> · {j.product} · {j.status} · {j.checklist.split("|").length} หัวข้อ</li>)}</ul>
        </div>)}
    </section>
  );
}

/** แถบสถานะสายเอกสาร: ใบเสนอราคา → ใบวางบิล → ใบแจ้งหนี้ → ใบเสร็จ (ขั้นที่ข้ามแสดงจาง ๆ · ขั้นที่ยังไม่ถึงแสดงเทา) */
function Stepper({ chain, cur }: { chain: Rec[]; cur: string }) {
  const steps = DOC_TYPES.map((t) => ({ t, docs: chain.filter((c) => c.doc_type === t) }));
  const last = Math.max(...steps.map((s, i) => (s.docs.length ? i : -1)));
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="ขั้นตอนเอกสาร">
      {steps.map(({ t, docs }, i) => {
        const has = docs.length > 0, here = docs.some((x) => x.doc_id === cur), skipped = !has && i < last;
        return (
          <li key={t} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-300">→</span>}
            <span className={`rounded-full border px-3 py-1 ${here ? "border-brand-600 bg-brand-50 font-semibold text-brand-800" : has ? "border-green-300 bg-green-50 text-green-800" : skipped ? "border-dashed border-slate-300 text-slate-400 line-through" : "border-dashed border-slate-300 text-slate-400"}`}>
              {DOC_LABEL[t]}{skipped ? " (ข้าม)" : ""}
              {docs.map((x) => <span key={x.doc_id}> {x.doc_id === cur ? <b>{x.doc_no}</b> : <Link className="underline" href={`/account/${x.doc_id}`}>{x.doc_no}</Link>}</span>)}
            </span>
          </li>);
      })}
    </ol>);
}
