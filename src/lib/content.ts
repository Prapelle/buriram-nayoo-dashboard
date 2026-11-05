/**
 * บอร์ด Content (Production) — กติกาล้วน ๆ ไม่แตะฐานข้อมูล (ทดสอบง่าย)
 * บอร์ดเดียว 11 คอลัมน์: ช่วงผลิต (ทุก Content) ต่อด้วยช่วงรายงานลูกค้า (เฉพาะ Content ที่ติดแท็ก "งานขาย")
 */
import { PERF_DEFS } from "./perf";

export const PROD_STAGES = ["IDEA", "CONTENT PLANS", "ART WORK / VIDEO", "เสร็จ ART / VIDEO", "REVIEW", "SCHEDULED", "PUBLISHED"] as const;
export const REPORT_STAGES = ["รอครบเพื่อทำรายงาน", "กำลังทำรายงาน", "รายงานเสร็จแล้ว", "ส่งให้ลูกค้าแล้ว"] as const;
export const STAGES = [...PROD_STAGES, ...REPORT_STAGES] as const;
export type Stage = (typeof STAGES)[number];
export const S_FIRST: Stage = "IDEA", S_PUBLISHED: Stage = "PUBLISHED", S_WAIT: Stage = "รอครบเพื่อทำรายงาน", S_SENT: Stage = "ส่งให้ลูกค้าแล้ว";

export const CONTENT_TYPES = ["Pure Product", "Knowledge", "Promotion", "Branding", "CSR / Local", "Entertainment", "SEO Article"] as const;
export const SALES_GOALS = ["Lead Generation", "Sales", "Brand Awareness", "Traffic", "Engagement"] as const;
export const DUTIES = ["Writer", "Graphic Designer", "Video Creator", "Admin / Approver"] as const;

export const CARD_COLUMNS = ["card_id", "card_code", "title", "stage", "stage_at", "content_type", "sales_tag", "sales_goal", "developer_id", "customer_name", "product", "follow_days",
  "job_id", "job_code", "doc_id", "planned_date", "published_at", "report_due_date", "report_sent_at", "report_link", "drive_link", "post_id", "caption",
  "created_by", "created_at", "updated_by", "updated_at"];
export const MEMBER_COLUMNS = ["member_id", "card_id", "email", "display_name", "duty", "is_main", "created_at"];
export const HISTORY_COLUMNS = ["log_id", "card_id", "from_stage", "to_stage", "actor", "at", "note"];
/** ช่วงที่รอลูกค้า (รอบรีฟ / ตรวจบอร์ด / คอนเฟิร์มงาน) — ใครก็ได้ในการ์ดกดเริ่มรอ / ลูกค้าตอบแล้ว · ended_at ว่าง = ยังรออยู่ */
export const WAIT_KINDS = ["รอบรีฟ", "ตรวจบอร์ด", "คอนเฟิร์มงาน", "อื่น ๆ"] as const;
export const WAIT_COLUMNS = ["wait_id", "card_id", "kind", "started_at", "started_by", "ended_at", "ended_by"];
export const SETTING_COLUMNS = ["product", "content_count", "report_days", "updated_by", "updated_at"];

export type Rec = Record<string, string>;
export const isStage = (v: unknown): v is Stage => (STAGES as readonly string[]).includes(String(v));
export const stageIndex = (s: string) => (STAGES as readonly string[]).indexOf(s);
export const isReportStage = (s: string) => (REPORT_STAGES as readonly string[]).includes(s);
export const isTrue = (v: unknown) => String(v ?? "").toUpperCase() === "TRUE";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const validDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
export const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isUrl = (s: string) => { try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MemberInput = { email: string; duty: string; is_main: boolean };
export type CardInput = {
  title: string; content_type: string; sales_tag: boolean; sales_goal: string; developer_id: string; product: string; follow_days: string;
  planned_date: string; caption: string; drive_link: string; report_link: string; post_id: string; members: MemberInput[];
};
export type Validated = { ok: true; value: CardInput } | { ok: false; errors: Record<string, string> };

/** ตรวจข้อมูลการ์ด (ไม่ตรวจว่าลูกค้า/Product/สมาชิกมีอยู่จริง — service ตรวจกับฐานข้อมูลต่อ) */
export function validateCard(raw: Record<string, unknown>): Validated {
  const e: Record<string, string> = {};
  const s = (k: string) => String(raw[k] ?? "").trim();
  const title = s("title").replace(/\s+/g, " ");
  if (!title || title.length > 200) e.title = "ใส่ชื่อ Content 1–200 ตัวอักษร";
  const content_type = s("content_type");
  if (content_type && !(CONTENT_TYPES as readonly string[]).includes(content_type)) e.content_type = "ประเภท Content ไม่ถูกต้อง";
  const sales_goal = s("sales_goal");
  if (sales_goal && !(SALES_GOALS as readonly string[]).includes(sales_goal)) e.sales_goal = "เป้าหมายงานขายไม่ถูกต้อง";
  const sales_tag = raw.sales_tag === true || isTrue(raw.sales_tag);
  const fd = s("follow_days");
  if (fd && !(/^\d{1,3}$/.test(fd) && Number(fd) >= 1 && Number(fd) <= 365)) e.follow_days = "ระยะติดตามผลเป็นจำนวนวัน 1–365";
  const planned_date = s("planned_date");
  if (planned_date && !validDate(planned_date)) e.planned_date = "วันที่ไม่ถูกต้อง";
  for (const k of ["drive_link", "report_link"]) { const v = s(k); if (v && (v.length > 500 || !isUrl(v))) e[k] = "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://"; }
  const post_id = s("post_id");
  if (post_id && !/^[A-Za-z0-9_.\-]{1,100}$/.test(post_id)) e.post_id = "Post ID ใช้ได้เฉพาะตัวอักษร ตัวเลข _ . -";
  const caption = String(raw.caption ?? "").replace(/\r\n/g, "\n").trim();
  if (caption.length > 4000) e.caption = "รายละเอียดยาวเกิน 4,000 ตัวอักษร";

  const members: MemberInput[] = [];
  const mr = raw.members === undefined ? [] : raw.members;
  if (!Array.isArray(mr) || mr.length > 12) e.members = "ผู้ร่วมงานได้สูงสุด 12 คน";
  else {
    const seen = new Set<string>();
    for (const m of mr as Record<string, unknown>[]) {
      const email = String(m?.email ?? "").trim().toLowerCase(), duty = String(m?.duty ?? "").trim();
      if (!EMAIL.test(email)) { e.members = "อีเมลผู้ร่วมงานไม่ถูกต้อง"; break; }
      if (duty && !(DUTIES as readonly string[]).includes(duty)) { e.members = "หน้าที่ผู้ร่วมงานไม่ถูกต้อง"; break; }
      if (seen.has(email)) { e.members = "เลือกคนเดิมซ้ำไม่ได้"; break; }
      seen.add(email); members.push({ email, duty, is_main: m?.is_main === true || isTrue(m?.is_main) });
    }
    if (!e.members && members.filter((m) => m.is_main).length > 1) e.members = "มีผู้รับผิดชอบหลักได้คนเดียว";
  }
  if (Object.keys(e).length) return { ok: false, errors: e };
  return { ok: true, value: { title, content_type, sales_tag, sales_goal, developer_id: s("developer_id"), product: s("product"), follow_days: fd, planned_date, caption, drive_link: s("drive_link"), report_link: s("report_link"), post_id, members } };
}

export type MoveFail = { ok: false; status: number; code: string; message: string };
export type MovePlan = { ok: true; steps: Stage[]; patch: Rec; noop: boolean };

/**
 * วางแผนการย้ายการ์ด (ไม่เขียนข้อมูล)
 * - เข้าช่วงรายงานได้เฉพาะการ์ดที่ติดแท็กงานขาย และต้องเผยแพร่แล้ว (มีวันที่เผยแพร่)
 * - ย้ายเข้า PUBLISHED: บันทึกวันที่เผยแพร่ · ถ้าเป็นงานขาย (มาจากช่วงผลิต) ต้องมีระยะติดตามผล แล้วเลื่อนต่อไป "รอครบเพื่อทำรายงาน" ทันที พร้อมวันครบกำหนด
 * - ย้ายถอยกลับก่อน PUBLISHED: ล้างวันที่เผยแพร่/ครบกำหนด/ส่งรายงาน · ถอยออกจาก "ส่งให้ลูกค้าแล้ว": ล้างวันที่ส่ง
 */
export function planMove(card: Rec, to: string, today: string): MovePlan | MoveFail {
  const fail = (status: number, code: string, message: string): MoveFail => ({ ok: false, status, code, message });
  if (!isStage(to)) return fail(422, "VALIDATION", "สถานะปลายทางไม่ถูกต้อง");
  const from = card.stage, sales = isTrue(card.sales_tag), days = Number(card.follow_days || 0);
  if (!isStage(from)) return fail(409, "VALIDATION", "การ์ดนี้มีสถานะที่ไม่รู้จัก (แก้ในฐานข้อมูล)");
  if (from === to) return { ok: true, steps: [], patch: {}, noop: true };
  const patch: Rec = {};
  const toIdx = stageIndex(to), pubIdx = stageIndex(S_PUBLISHED), fromIdx = stageIndex(from);

  if (isReportStage(to)) {
    if (!sales) return fail(422, "NOT_SALES", "เฉพาะ Content ที่ติดแท็กงานขายเท่านั้นที่เข้าช่วงรายงานลูกค้าได้ — เปิดการ์ดแล้วติ๊กแท็กงานขายก่อน");
    if (!card.published_at) return fail(422, "NOT_PUBLISHED", "ต้องเผยแพร่ก่อน — ลากการ์ดไป PUBLISHED ก่อนเข้าช่วงรายงาน");
    if (!(days >= 1)) return fail(422, "NEED_FOLLOW_DAYS", "ใส่ระยะติดตามผล (วัน) ที่การ์ดก่อน เพื่อคำนวณวันครบกำหนดรายงาน");
    if (!card.report_due_date) patch.report_due_date = addDays(card.published_at, days);
    if (to === S_SENT) patch.report_sent_at = card.report_sent_at || today;
    else if (card.report_sent_at) patch.report_sent_at = "";
    return { ok: true, steps: [to], patch, noop: false };
  }

  // เข้า PUBLISHED
  if (to === S_PUBLISHED) {
    const published_at = card.published_at || today;
    patch.published_at = published_at;
    if (card.report_sent_at) patch.report_sent_at = "";
    if (sales && fromIdx < pubIdx) { // มาจากช่วงผลิต: เลื่อนต่อไปรอรายงานทันที
      if (!(days >= 1)) return fail(422, "NEED_FOLLOW_DAYS", "งานขายต้องมีระยะติดตามผล (วัน) ก่อนเผยแพร่ — ใส่ที่การ์ด (ดึงจาก Product ได้) เพื่อคำนวณวันครบกำหนดรายงาน");
      patch.report_due_date = addDays(published_at, days);
      return { ok: true, steps: [S_PUBLISHED, S_WAIT], patch, noop: false };
    }
    return { ok: true, steps: [S_PUBLISHED], patch, noop: false };
  }

  // ย้ายภายในช่วงผลิต (ก่อน PUBLISHED = ยังไม่เผยแพร่ ล้างวันที่ที่เกี่ยวข้อง)
  if (toIdx < pubIdx && (card.published_at || card.report_due_date || card.report_sent_at)) Object.assign(patch, { published_at: "", report_due_date: "", report_sent_at: "" });
  return { ok: true, steps: [to], patch, noop: false };
}

/** สถานะครบกำหนดรายงานของการ์ด: due = ครบกำหนดวันนี้ · overdue = เลยกำหนด · none = ไม่เกี่ยว/เสร็จแล้ว */
export function reportDue(card: Rec, today: string): "none" | "upcoming" | "due" | "overdue" {
  if (!card.report_due_date || !(card.stage === S_WAIT || card.stage === "กำลังทำรายงาน")) return "none";
  return card.report_due_date < today ? "overdue" : card.report_due_date === today ? "due" : "upcoming";
}

export const nextCardCode = (codes: string[]) => `CT-${String(codes.reduce((m, c) => { const x = /^CT-(\d+)$/.exec(c); return x ? Math.max(m, Number(x[1])) : m; }, 0) + 1).padStart(4, "0")}`;

/** ตารางที่เกิดบน D1 (สร้างอัตโนมัติ): Content + ประสิทธิภาพรายคน (perf.ts, 5/11/2026) */
export const NATIVE_DEFS = [
  { name: "CONTENT_CARDS", headers: CARD_COLUMNS }, { name: "CONTENT_MEMBERS", headers: MEMBER_COLUMNS },
  { name: "CONTENT_HISTORY", headers: HISTORY_COLUMNS }, { name: "PRODUCT_SETTINGS", headers: SETTING_COLUMNS }, { name: "CONTENT_WAITS", headers: WAIT_COLUMNS },
  ...PERF_DEFS,
];
