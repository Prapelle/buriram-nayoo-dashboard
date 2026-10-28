import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DataTable } from "@/components/DataTable";
import { DEFAULT_EXCLUDED_PAGES } from "@/lib/dashboard";
import { excludePages, metricDateOf, pageMetric, perPost, summarizeFb, VIEWERS_REMARK } from "@/lib/fbmetrics";
import { getExcludedPages, readColumns } from "@/lib/tabdata";
import { applyView, fmtCell, href, one, type Col } from "@/lib/tableview";

export const dynamic = "force-dynamic";
const METRICS: Col[] = [
  { key: "reactions", label: "Reactions", kind: "int" }, { key: "comments", label: "Comments", kind: "int" }, { key: "shares", label: "Shares", kind: "int" },
  { key: "seconds_viewed", label: "Seconds viewed", kind: "num" }, { key: "reach", label: "Reach", kind: "int" }, { key: "link_clicks", label: "Link Clicks", kind: "int" },
];
const POST_COLS: Col[] = [
  { key: "publish_time", label: "เผยแพร่", kind: "datetime" }, { key: "page_name", label: "เพจ" }, { key: "title", label: "ข้อความโพสต์", kind: "clip" },
  { key: "basis", label: "ฐานข้อมูล" }, { key: "days", label: "จำนวนวัน", kind: "int" }, ...METRICS,
];
const DAILY_COLS: Col[] = [
  { key: "metric_date", label: "วันที่ของสถิติ", kind: "date" }, { key: "metric_scope", label: "ชนิด" }, { key: "publish_time", label: "เผยแพร่", kind: "datetime" },
  { key: "page_name", label: "เพจ" }, { key: "title", label: "ข้อความโพสต์", kind: "clip" }, ...METRICS,
  { key: "average_seconds_viewed", label: "Avg seconds (ค่าเฉลี่ย)", kind: "num" },
];
const PAGE_COLS: Col[] = [
  { key: "metric_date", label: "วันที่", kind: "date" }, { key: "viewers", label: "Viewers (ใช้เทียบเคียง Reach)", kind: "int" }, { key: "link_clicks", label: "Link clicks", kind: "int" },
];
const iso = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const fmtN = (v: number | null) => (v === null ? "รอข้อมูล" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));

export default async function FacebookPagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  const sp = await searchParams;
  const view = one(sp.view) === "daily" ? "daily" : one(sp.view) === "page" ? "page" : "posts";
  const from = iso(one(sp.from)), to = iso(one(sp.to));
  const q = one(sp.q), type = one(sp.post_type), showAll = one(sp.all) === "1";
  const sort = one(sp.sort) || (view === "posts" ? "publish_time" : "metric_date"), dir = (one(sp.dir) || "desc") as "asc" | "desc";

  let rows: Record<string, string>[], excluded: string[], pageRows: Record<string, string>[] = [], pageTabMissing = false;
  try {
    const [data, ex, pg] = await Promise.all([
      readColumns("FB_PAGE_POSTS", { only: [...new Set([...DAILY_COLS.map((c) => c.key), "page_id", "post_id", "post_type", "snapshot_date", "reactions_comments_shares", "imported_at"])] }),
      getExcludedPages(DEFAULT_EXCLUDED_PAGES),
      readColumns("FB_PAGE_INSIGHTS", { only: ["metric", "metric_date", "value", "imported_at"] }).catch(() => null), // แท็บใหม่ ยังไม่เตรียม Sheet → แสดงส่วนอื่นได้
    ]);
    rows = data.rows; excluded = ex; if (pg) pageRows = pg.rows; else pageTabMissing = true;
  } catch (e) {
    return <section><h1 className="mb-4 text-2xl font-bold">Facebook Page</h1><p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {e instanceof Error ? e.message.slice(0, 200) : "ไม่ทราบสาเหตุ"} — ลอง ตั้งค่า → เตรียม Google Sheet</p></section>;
  }
  const { kept, excludedPosts } = excludePages(rows, excluded);
  const base = (showAll ? rows : kept).filter((r) => (!type || r.post_type === type) && (!q || [r.title, r.page_name].some((x) => (x ?? "").toLowerCase().includes(q.toLowerCase()))));
  const s = summarizeFb(base, { from, to });
  const t = s.basis === "lifetime" ? s.lifetime : s.daily;
  const pv = pageMetric(pageRows, "viewers", { from, to }), pc = pageMetric(pageRows, "link_clicks", { from, to });
  const byDay = new Map<string, Record<string, string>>();
  for (const r of [...pageRows].sort((a, b) => String(a.imported_at).localeCompare(String(b.imported_at)))) { // วันซ้ำ → ใช้ที่นำเข้าล่าสุด
    const d = String(r.metric_date).slice(0, 10); if ((from && d < from) || (to && d > to)) continue;
    const o = byDay.get(d) ?? { metric_date: d }; if (r.metric === "viewers" || r.metric === "link_clicks") o[r.metric] = r.value; byDay.set(d, o);
  }
  const tableRows = view === "page" ? [...byDay.values()] : view === "daily"
    ? base.filter((r) => (!from || metricDateOf(r) >= from) && (!to || metricDateOf(r) <= to)).map((r) => ({ ...r, metric_date: metricDateOf(r), metric_scope: r.metric_scope || "lifetime" }))
    : perPost(base, { from, to });
  const v = applyView(tableRows, { sort, dir, page: Number(one(sp.page)) || 1 });
  const last = [...rows, ...pageRows].map((r) => r.imported_at).filter(Boolean).sort().pop();
  const allDates = [...rows.map(metricDateOf), ...pageRows.map((r) => String(r.metric_date ?? "").slice(0, 10))].filter(Boolean).sort();
  const types = [...new Set(rows.map((r) => r.post_type).filter(Boolean))].sort();
  const params = { view: view === "posts" ? undefined : view, from, to, q, post_type: type, all: showAll ? "1" : undefined };
  const inp = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";
  const tab = (id: "posts" | "daily" | "page", label: string) => (
    <Link href={href("/facebook-page", { ...params, view: id === "posts" ? undefined : id, sort: undefined, dir: undefined, page: undefined })} aria-current={view === id ? "page" : undefined}
      className={`rounded-full px-3 py-1 text-xs ${view === id ? "bg-slate-900 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"}`}>{label}</Link>
  );

  return (
    <section className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Facebook Page</h1>
        <p className="text-sm text-slate-500">
          {rows.length || pageRows.length ? <>อัปเดตล่าสุด: {last ? new Date(last).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short" }) : "-"} · ข้อมูลสถิติ {fmtCell("date", allDates[0] ?? "")} – {fmtCell("date", allDates[allDates.length - 1] ?? "")}</> : "อัปเดตล่าสุด: ยังไม่มีข้อมูล"}
          {" · "}นำเข้าได้ที่ <Link href="/import" className="underline">นำเข้า CSV</Link>
        </p>
      </div>
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
        ตัวเลขกรองตาม <b>วันที่ของสถิติ</b> (ไม่ใช่วันเผยแพร่) · ข้อมูลรายวันรวมข้ามวันได้ · ข้อมูล <b>Lifetime</b> เป็นยอดสะสม ณ วันส่งออก ใช้เฉพาะครั้งล่าสุดของแต่ละโพสต์และไม่รวมกับยอดรายวัน · ผลรวม Reach ไม่ใช่ Unique Reach
      </p>
      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        {view !== "posts" && <input type="hidden" name="view" value={view} />}
        <label><span className="mb-1 block text-xs text-slate-500">วันที่ของสถิติ ตั้งแต่</span><input type="date" name="from" defaultValue={from} className={inp} /></label>
        <label><span className="mb-1 block text-xs text-slate-500">ถึง</span><input type="date" name="to" defaultValue={to} className={inp} /></label>
        <label><span className="mb-1 block text-xs text-slate-500">ค้นหา</span><input name="q" defaultValue={q} placeholder="ข้อความโพสต์ / ชื่อเพจ" className={inp} /></label>
        <label><span className="mb-1 block text-xs text-slate-500">ประเภทโพสต์</span><select name="post_type" defaultValue={type} className={inp}><option value="">ทั้งหมด</option>{types.map((x) => <option key={x}>{x}</option>)}</select></label>
        {showAll && <input type="hidden" name="all" value="1" />}
        <button className="rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white">ใช้ตัวกรอง</button>
        {(q || type || from || to) && <Link href={href("/facebook-page", { view: params.view, all: params.all })} className="py-1.5 underline">ล้าง</Link>}
      </form>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {([["Viewers (แทน Reach)", pv, `${VIEWERS_REMARK} · ผลรวม Viewers รายวันระดับเพจ (คนเดียวกันต่างวันนับซ้ำ ไม่ใช่ Unique)`], ["Link clicks (ระดับเพจ)", pc, "Link clicks รายวันระดับเพจ"]] as const).map(([l, m, note]) => (
          <div key={l} className="rounded-lg border border-sky-200 bg-sky-50/40 p-3">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="text-2xl font-bold tabular-nums">{m ? m.sum.toLocaleString("en-US") : <span className="text-base font-normal text-slate-400">รอข้อมูล</span>}</div>
            <div className="text-xs text-slate-500">{m ? <>{note} · {m.cover} ({m.days} วัน)</> : pageTabMissing ? "ยังไม่ได้สร้างแท็บ — ไปที่ ตั้งค่า → เตรียม Google Sheet" : <>ยังไม่มีข้อมูลในช่วงนี้ — นำเข้าไฟล์จาก Meta Business Suite ที่ <Link href="/import" className="underline">นำเข้า CSV</Link></>}</div>
            {m?.incomplete && <div className="text-xs text-amber-700">⚠ ข้อมูลไม่ครบ: {m.incomplete}</div>}
          </div>))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["โพสต์ที่มีสถิติ", t.posts ? t.posts.toLocaleString("en-US") : "รอข้อมูล"],
          ["Reactions + Comments + Shares", fmtN(t.reactions_comments_shares)],
          ["Reactions", fmtN(t.reactions)], ["Comments", fmtN(t.comments)], ["Shares", fmtN(t.shares)],
          ["Seconds viewed", fmtN(t.seconds_viewed)],
        ].map(([l, x]) => <div key={l} className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">{l}</div><div className="text-xl font-bold tabular-nums">{x}</div></div>)}
      </div>
      <p className="text-xs text-slate-500">
        {s.basis === "daily" && <>ฐาน: ผลรวมรายวัน {fmtCell("date", s.daily.from)} – {fmtCell("date", s.daily.to)} ({s.daily.rows} แถว){s.lifetimeOnlyPosts ? ` · ไม่รวม ${s.lifetimeOnlyPosts} โพสต์ที่มีแต่ยอดสะสม (Lifetime)` : ""}</>}
        {s.basis === "lifetime" && <>ฐาน: ยอดสะสม (Lifetime) ณ วันส่งออก {fmtCell("date", s.lifetime.snapshot)}</>}
        {s.basis !== "none" && <> · Reach รายโพสต์ {t.reach === null ? "ไม่มีในไฟล์" : `${fmtN(t.reach)} (ผลรวม ไม่ใช่ Unique)`}{pv ? " — Dashboard ใช้ Viewers ระดับเพจแทน" : ""} · Link Clicks รายโพสต์ {t.link_clicks === null ? "ไม่มีในไฟล์" : fmtN(t.link_clicks)}</>}
        {excludedPosts > 0 && <> · {showAll ? "แสดงเพจที่ตัดออกด้วย" : `ไม่รวม ${excludedPosts} โพสต์จากเพจที่ตัดออก`} <Link className="underline" href={href("/facebook-page", { ...params, all: showAll ? undefined : "1" })}>{showAll ? "ซ่อน" : "แสดงด้วย"}</Link></>}
      </p>
      <nav aria-label="มุมมอง" className="flex flex-wrap gap-1.5">{tab("posts", "สรุปรายโพสต์")}{tab("daily", "รายวัน (ข้อมูลดิบ)")}{tab("page", "Viewers / Link clicks รายวัน (ระดับเพจ)")}</nav>
      {view === "page" ? (byDay.size === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">ยังไม่มีข้อมูล Viewers / Link clicks — ใน Meta Business Suite → Insights ส่งออกกราฟ Viewers และ Link clicks เป็น CSV แล้วนำเข้าที่หน้า นำเข้า CSV</p>
        : <DataTable cols={PAGE_COLS} rows={v.rows} base="/facebook-page" params={params} sort={sort} dir={dir} page={v.page} pages={v.pages} total={v.total} />)
      : rows.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">ยังไม่มีข้อมูล — นำเข้าไฟล์ Facebook Page ที่หน้า นำเข้า CSV</p>
        : <DataTable cols={view === "daily" ? DAILY_COLS : POST_COLS} rows={v.rows} base="/facebook-page" params={params} sort={sort} dir={dir} page={v.page} pages={v.pages} total={v.total} />}
    </section>
  );
}
