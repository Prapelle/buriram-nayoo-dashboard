"use client";
import { useEffect } from "react";
import { TH_MONTHS } from "@/lib/thdate";

/**
 * กดชื่อหัวคอลัมน์ของตารางเพื่อเรียงข้อมูล (31/10/2026) — ใช้กับทุกตารางในระบบ (ติดตั้งครั้งเดียวใน AppShell)
 * - ตัวเลข / เงิน / %: กดครั้งแรก = มากไปน้อย · ข้อความ: ก → ฮ · กดซ้ำ = กลับด้าน · ครั้งที่ 3 = ลำดับเดิม
 * - ค่าว่าง / — / N/A / รอข้อมูล อยู่ท้ายเสมอ · แถวที่มี data-pin (เช่น แถวรวม) อยู่ท้ายเสมอ
 * - ค่าที่ใช้เรียง: data-sort ของช่อง (ถ้ามี) ไม่อย่างนั้นอ่านจากข้อความ (รองรับ ฿ , % และวันที่ "31 ต.ค. 69")
 * - ไม่ทำกับ: ตาราง data-nosort, หัวคอลัมน์ที่เป็นลิงก์ (ตารางที่เรียงฝั่ง Server อยู่แล้ว), ตารางที่ไม่มี thead
 * - ตารางที่ React วาดใหม่ (เช่น รายการ Lead) จะถูกเรียงซ้ำตามคอลัมน์ที่เลือกไว้
 */
type State = { col: number; dir: "asc" | "desc"; orig: Element[] };
const states = new WeakMap<HTMLTableSectionElement, State>();
const busy = new WeakSet<HTMLTableSectionElement>();
const EMPTY = /^(|—|-|–|n\/a|ว่าง|รอข้อมูล|ไม่มีค่าโฆษณา|ไม่มีข้อมูล)$/i;

function valueOf(cell: Element | undefined): number | string | null {
  if (!cell) return null;
  const ds = (cell as HTMLElement).dataset?.sort;
  const t = (ds ?? cell.textContent ?? "").replace(/\s+/g, " ").trim();
  if (EMPTY.test(t)) return null;
  const n = t.replace(/[฿,%+\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (/^-?\d+(\.\d+)?$/.test(n)) return Number(n);
  const m = /^(\d{1,2}) (\S+) (\d{2})(?: (\d{2}):(\d{2}))?/.exec(t);
  if (m && TH_MONTHS.includes(m[2])) return Number(m[3]) * 1e8 + (TH_MONTHS.indexOf(m[2]) + 1) * 1e6 + Number(m[1]) * 1e4 + Number(m[4] ?? 0) * 100 + Number(m[5] ?? 0);
  const lead = /^-?\d[\d,]*(\.\d+)?/.exec(t.replace(/^฿/, "")); // "12 (40%)" → 12
  if (lead && /^\d/.test(t.replace(/^[฿-]/, ""))) return Number(lead[0].replace(/,/g, ""));
  return t.toLocaleLowerCase("th");
}
const colIndex = (th: HTMLTableCellElement) => { let i = 0; for (const c of Array.from(th.parentElement!.children)) { if (c === th) return i; i += (c as HTMLTableCellElement).colSpan || 1; } return i; };
function cellAt(tr: Element, idx: number) { let i = 0; for (const c of Array.from(tr.children)) { const span = (c as HTMLTableCellElement).colSpan || 1; if (idx < i + span) return c; i += span; } return undefined; }

function apply(tbody: HTMLTableSectionElement) {
  const st = states.get(tbody); if (!st) return;
  const rows = Array.from(tbody.children).filter((r) => r.tagName === "TR");
  const pinned = rows.filter((r) => (r as HTMLElement).dataset.pin !== undefined);
  const body = rows.filter((r) => !pinned.includes(r));
  const keyed = body.map((r, i) => ({ r, v: valueOf(cellAt(r, st.col)), i }));
  keyed.sort((a, b) => {
    if (a.v === null && b.v === null) return a.i - b.i; if (a.v === null) return 1; if (b.v === null) return -1;
    const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v), "th");
    return (st.dir === "asc" ? c : -c) || a.i - b.i;
  });
  const order = [...keyed.map((k) => k.r), ...pinned];
  if (order.every((r, i) => rows[i] === r)) return;
  busy.add(tbody);
  for (const r of order) tbody.appendChild(r);
  queueMicrotask(() => busy.delete(tbody));
}

function headerCells(table: HTMLTableElement) {
  if (table.dataset.nosort !== undefined || !table.tHead) return [];
  const row = table.tHead.rows[table.tHead.rows.length - 1]; if (!row) return [];
  return Array.from(row.cells).filter((th) => th.tagName === "TH" && th.textContent?.trim() && !th.querySelector("a,button,input,select"));
}
function mark(root: ParentNode) {
  root.querySelectorAll?.("table").forEach((t) => {
    for (const th of headerCells(t as HTMLTableElement)) {
      if (th.dataset.sortable !== undefined) continue;
      th.dataset.sortable = ""; th.tabIndex = 0; th.title = th.title || "กดเพื่อเรียงข้อมูล";
    }
  });
}
function clickHeader(th: HTMLTableCellElement) {
  const table = th.closest("table") as HTMLTableElement; const tbody = table?.tBodies[0]; if (!tbody) return;
  const idx = colIndex(th); const cur = states.get(tbody);
  const sample = Array.from(tbody.rows).map((r) => valueOf(cellAt(r, idx))).find((v) => v !== null);
  const first: "asc" | "desc" = typeof sample === "number" ? "desc" : "asc";
  for (const h of headerCells(table)) h.removeAttribute("aria-sort");
  if (cur && cur.col === idx && cur.dir !== first) { // ครั้งที่ 3: กลับลำดับเดิม
    states.delete(tbody); busy.add(tbody);
    for (const r of cur.orig) if (r.parentElement === tbody) tbody.appendChild(r);
    queueMicrotask(() => busy.delete(tbody)); return;
  }
  const dir = cur && cur.col === idx ? (cur.dir === "asc" ? "desc" : "asc") : first;
  states.set(tbody, { col: idx, dir, orig: cur?.orig ?? Array.from(tbody.rows) });
  th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
  apply(tbody);
}

export function TableSort() {
  useEffect(() => {
    mark(document);
    const onClick = (e: Event) => {
      const th = (e.target as Element).closest?.("th[data-sortable]") as HTMLTableCellElement | null;
      if (!th) return;
      if (e instanceof KeyboardEvent) { if (e.key !== "Enter" && e.key !== " ") return; e.preventDefault(); }
      clickHeader(th);
    };
    document.addEventListener("click", onClick); document.addEventListener("keydown", onClick);
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        m.addedNodes.forEach((n) => { if (n.nodeType === 1) mark(n as Element); });
        const tb = (m.target as Element).closest?.("tbody") as HTMLTableSectionElement | null;
        if (tb && !busy.has(tb) && states.has(tb)) { const st = states.get(tb)!; st.orig = Array.from(tb.rows); apply(tb); } // React วาดแถวใหม่ → เรียงซ้ำ
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onClick); mo.disconnect(); };
  }, []);
  return null;
}
