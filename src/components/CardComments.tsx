"use client";
/**
 * ความคิดเห็นในการ์ด Content (27/11/2026): ชื่อ · เวลา · ข้อความ · รูป/ไฟล์แนบ
 * รูปถูกย่อในเครื่องก่อนอัปโหลด (ด้านยาวไม่เกิน 1600 px) เพื่อประหยัดที่เก็บไฟล์
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { btn } from "@/components/PageHeader";
import { thDateTime } from "@/lib/thdate";
import { COMMENT_ACCEPT, MAX_COMMENT_CHARS, MAX_COMMENT_FILE_BYTES, MAX_COMMENT_FILES, mimeOfName } from "@/lib/content-comments-schema";

type CFile = { file_id: string; file_name: string; mime: string; size: number; is_image: boolean };
type Comment = { comment_id: string; author: string; author_name: string; body: string; created_at: string; edited_at: string; files: CFile[] };

const fileUrl = (id: string) => `/api/content/comments/file?id=${encodeURIComponent(id)}`;
const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ta = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { cache: "no-store", ...init }); const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

/** ย่อรูป JPG / PNG / WEBP ที่ใหญ่กว่า 600 KB หรือด้านยาวเกิน 1600 px → JPEG · ย่อไม่ได้ / ไม่เล็กลง = ใช้ไฟล์เดิม */
async function shrinkImage(f: File): Promise<File> {
  const mime = mimeOfName(f.name);
  if (!/^image\/(jpeg|png|webp)$/.test(mime) || typeof createImageBitmap !== "function") return f;
  try {
    const bmp = await createImageBitmap(f), max = 1600, scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && f.size <= 600 * 1024) { bmp.close?.(); return f; }
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const g = c.getContext("2d"); if (!g) return f;
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    if (!blob || blob.size >= f.size) return f;
    return new File([blob], f.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch { return f; }
}

/** ข้อความ + ลิงก์ที่กดได้ (http/https เท่านั้น) */
function Body({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return <p className="whitespace-pre-wrap break-words text-sm">{parts.map((p, i) => (i % 2 ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-sky-700 underline">{p}</a> : p))}</p>;
}

export function CardComments({ cardId, me, canPost, canModerate, onCount }: { cardId: string; me: string; canPost: boolean; canModerate: boolean; onCount?: (n: number) => void }) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [err, setErr] = useState("");
  const [text, setText] = useState(""); const [files, setFiles] = useState<File[]>([]); const [sending, setSending] = useState(false);
  const [editId, setEditId] = useState(""); const [editText, setEditText] = useState(""); const [busyId, setBusyId] = useState("");
  const pick = useRef<HTMLInputElement>(null); const endRef = useRef<HTMLDivElement>(null);
  const mine = (c: Comment) => !!me && c.author === me.toLowerCase();

  const load = useCallback(async () => {
    try { const j = await api(`/api/content/comments?card=${encodeURIComponent(cardId)}`); setList(j.comments); onCount?.(j.comments.length); setErr(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "โหลดความคิดเห็นไม่สำเร็จ"); setList((l) => l ?? []); }
  }, [cardId, onCount]);
  useEffect(() => { void load(); }, [load]);

  function addFiles(list: FileList | null) {
    if (!list) return; setErr("");
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!mimeOfName(f.name)) { setErr(`ไฟล์ "${f.name}" ไม่รองรับ — แนบได้เฉพาะรูป (JPG / PNG / WEBP), PDF, Word, Excel`); continue; }
      if (next.length >= MAX_COMMENT_FILES) { setErr(`แนบได้ไม่เกิน ${MAX_COMMENT_FILES} ไฟล์`); break; }
      next.push(f);
    }
    setFiles(next); if (pick.current) pick.current.value = "";
  }

  async function send() {
    if (sending || (!text.trim() && !files.length)) return;
    setSending(true); setErr("");
    try {
      const ready = await Promise.all(files.map(shrinkImage));
      const big = ready.find((f) => f.size > MAX_COMMENT_FILE_BYTES);
      if (big) throw new Error(`ไฟล์ "${big.name}" ใหญ่เกิน 10 MB — ไฟล์ใหญ่ให้แปะลิงก์ Google Drive แทน`);
      const fd = new FormData(); fd.set("card_id", cardId); fd.set("body", text);
      for (const f of ready) fd.append("files", f, f.name);
      const j = await api("/api/content/comments", { method: "POST", body: fd });
      setList((l) => { const n = [...(l ?? []), j.comment]; onCount?.(n.length); return n; }); setText(""); setFiles([]);
      setTimeout(() => endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    } catch (e) { setErr(e instanceof Error ? e.message : "ส่งไม่สำเร็จ"); } finally { setSending(false); }
  }
  async function saveEdit(c: Comment) {
    setBusyId(c.comment_id); setErr("");
    try { const j = await api("/api/content/comments", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ comment_id: c.comment_id, body: editText }) }); setList((l) => (l ?? []).map((x) => (x.comment_id === c.comment_id ? { ...x, body: j.body, edited_at: j.edited_at } : x))); setEditId(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "แก้ไม่สำเร็จ"); } finally { setBusyId(""); }
  }
  async function del(c: Comment) {
    if (!window.confirm(mine(c) ? "ลบความคิดเห็นนี้ (รวมไฟล์แนบ) ?" : `ลบความคิดเห็นของ ${c.author_name} (รวมไฟล์แนบ) ?`)) return;
    setBusyId(c.comment_id); setErr("");
    try { await api(`/api/content/comments?id=${encodeURIComponent(c.comment_id)}`, { method: "DELETE" }); setList((l) => { const n = (l ?? []).filter((x) => x.comment_id !== c.comment_id); onCount?.(n.length); return n; }); }
    catch (e) { setErr(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); } finally { setBusyId(""); }
  }

  return (
    <section aria-label="ความคิดเห็น" className="space-y-2 border-t border-slate-200 pt-3">
      <div className="text-sm font-semibold">💬 ความคิดเห็น{list ? ` (${list.length})` : ""}</div>
      {list === null ? <p className="text-xs text-slate-500">กำลังโหลด…</p> : list.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มีความคิดเห็น</p> : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.comment_id} className={`rounded-lg border p-2.5 ${mine(c) ? "border-brand-100 bg-brand-50/40" : "border-slate-200 bg-white"} ${busyId === c.comment_id ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-semibold text-slate-800">{c.author_name}</span>
                <time dateTime={c.created_at} className="text-slate-500">{thDateTime(c.created_at)}</time>
                {c.edited_at && <span className="text-slate-400" title={thDateTime(c.edited_at)}>(แก้ไขแล้ว)</span>}
                <span className="ml-auto flex gap-2">
                  {mine(c) && editId !== c.comment_id && <button type="button" onClick={() => { setEditId(c.comment_id); setEditText(c.body); }} className="text-slate-500 underline">แก้ไข</button>}
                  {(mine(c) || canModerate) && <button type="button" disabled={!!busyId} onClick={() => void del(c)} className="text-red-600 underline">ลบ</button>}
                </span>
              </div>
              {editId === c.comment_id ? (
                <div className="mt-1 space-y-1">
                  <textarea aria-label="แก้ความคิดเห็น" rows={3} maxLength={MAX_COMMENT_CHARS} value={editText} onChange={(e) => setEditText(e.target.value)} className={ta} autoFocus />
                  <div className="flex gap-2"><button type="button" disabled={!!busyId} onClick={() => void saveEdit(c)} className={btn.primary}>บันทึก</button><button type="button" onClick={() => setEditId("")} className={btn.secondary}>ยกเลิก</button></div>
                </div>
              ) : c.body && <div className="mt-1"><Body text={c.body} /></div>}
              {c.files.some((f) => f.is_image) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.files.filter((f) => f.is_image).map((f) => (
                    <a key={f.file_id} href={fileUrl(f.file_id)} target="_blank" rel="noopener noreferrer" title={f.file_name} className="block overflow-hidden rounded-md border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fileUrl(f.file_id)} alt={f.file_name} loading="lazy" className="h-24 w-24 object-cover sm:h-28 sm:w-28" />
                    </a>))}
                </div>)}
              {c.files.some((f) => !f.is_image) && (
                <ul className="mt-2 space-y-1 text-sm">
                  {c.files.filter((f) => !f.is_image).map((f) => <li key={f.file_id}><a href={fileUrl(f.file_id)} className="text-sky-700 underline">📎 {f.file_name}</a> <span className="text-xs text-slate-500">({kb(f.size)})</span></li>)}
                </ul>)}
            </li>))}
        </ul>)}
      <div ref={endRef} />
      {err && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
      {canPost ? (
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <textarea aria-label="เขียนความคิดเห็น" rows={2} maxLength={MAX_COMMENT_CHARS} value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }}
            placeholder="เขียนความคิดเห็น… (Ctrl + Enter เพื่อส่ง)" className={ta} />
          {files.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 text-xs">
              {files.map((f, i) => <li key={i} className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">📎 {f.name} <span className="text-slate-400">({kb(f.size)})</span><button type="button" aria-label={`เอา ${f.name} ออก`} onClick={() => setFiles((a) => a.filter((_, k) => k !== i))} className="px-0.5 text-slate-500">✕</button></li>)}
            </ul>)}
          <div className="flex flex-wrap items-center gap-2">
            <input ref={pick} type="file" multiple accept={`image/*,${COMMENT_ACCEPT}`} onChange={(e) => addFiles(e.target.files)} className="hidden" aria-label="แนบรูปหรือไฟล์" />
            <button type="button" disabled={sending || files.length >= MAX_COMMENT_FILES} onClick={() => pick.current?.click()} className={btn.secondary}>📎 แนบรูป / ไฟล์</button>
            <span className="text-[11px] text-slate-500">รูป, PDF, Word, Excel · ไม่เกิน {MAX_COMMENT_FILES} ไฟล์ · ไฟล์ละ 10 MB</span>
            <button type="button" disabled={sending || (!text.trim() && !files.length)} onClick={() => void send()} className={`${btn.primary} ml-auto`}>{sending ? "กำลังส่ง…" : "ส่ง"}</button>
          </div>
        </div>
      ) : <p className="text-xs text-slate-500">Observer ดูความคิดเห็นได้อย่างเดียว</p>}
    </section>
  );
}
