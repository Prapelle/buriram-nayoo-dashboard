import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DataTable } from "@/components/DataTable";
import { DEFAULT_EXCLUDED_PAGES, num } from "@/lib/dashboard";
import { getExcludedPages, readColumns } from "@/lib/tabdata";
import { applyView, fmtCell, href, one, type Col } from "@/lib/tableview";

export const dynamic = "force-dynamic";
const COLS: Col[] = [
  { key: "publish_time", label: "เผยแพร่", kind: "datetime" }, { key: "page_name", label: "เพจ" }, { key: "post_type", label: "ประเภท" },
  { key: "title", label: "ข้อความโพสต์", kind: "clip" }, { key: "views", label: "Views", kind: "int" }, { key: "reach", label: "Reach", kind: "int" },
  { key: "reactions_comments_shares", label: "Reactions+Comments+Shares", kind: "int" }, { key: "link_clicks", label: "Link Clicks", kind: "int" },
];

export default async function FacebookPagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const role = (await auth())?.user?.role;
  if (role !== "admin" && role !== "marketing") redirect("/");
  const sp = await searchParams;
  const q = one(sp.q), type = one(sp.post_type), sort = one(sp.sort) || "publish_time", dir = (one(sp.dir) || "desc") as "asc" | "desc", showAll = one(sp.all) === "1";

  let rows: Record<string, string>[], excluded: string[];
  try {
    const [data, ex] = await Promise.all([
      readColumns("FB_PAGE_POSTS", { only: [...COLS.map((c) => c.key), "page_id", "metric_period_label", "snapshot_date"] }),
      getExcludedPages(DEFAULT_EXCLUDED_PAGES),
    ]);
    rows = data.rows; excluded = ex;
  } catch (e) {
    return <section><h1 className="mb-4 text-2xl font-bold">Facebook Page</h1><p role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ: {e instanceof Error ? e.message.slice(0, 200) : "ไม่ทราบสาเหตุ"} — ลอง ตั้งค่า → เตรียม Google Sheet</p></section>;
  }
  const ex = new Set(excluded);
  const kept = rows.filter((r) => !ex.has(r.page_name) && !ex.has(r.page_id));
  const base = showAll ? rows : kept;
  const v = applyView(base, { q, searchKeys: ["title", "page_name"], filters: { post_type: type }, sort, dir, page: Number(one(sp.page)) || 1 });
  const reach = v.all.reduce((s, r) => s + (num(r.reach) ?? 0), 0);
  const clicks = v.all.filter((r) => num(r.link_clicks) !== null);
  const snap = rows.map((r) => r.snapshot_date).filter(Boolean).sort().pop();
  const types = [...new Set(base.map((r) => r.post_type).filter(Boolean))].sort();
  const params = { q, post_type: type, all: showAll ? "1" : undefined };
  const inp = "rounded-md border border-slate-300 px-2 py-1.5 text-sm";

  return (
    <section className="max-w-7xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Facebook Page</h1>
        <p className="text-sm text-slate-500">{rows.length ? <>ข้อมูล ณ วันที่ส่งออก {fmtCell("date", snap ?? "")} · นำเข้าได้ที่ <Link href="/import" className="underline">นำเข้า CSV</Link></> : "อัปเดตล่าสุด: ยังไม่มีข้อมูล"}</p>
      </div>
      <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">ตัวเลขโพสต์เป็นยอด <b>สะสม (Lifetime) ณ วันส่งออก</b> ไม่ใช่ยอดเฉพาะเดือนที่เผยแพร่โพสต์ และ Reach รวมด้านล่างคือผลรวม Reach ของโพสต์ ไม่ใช่ Unique Page Reach</p>
      <form method="get" className="flex flex-wrap items-end gap-3 text-sm">
        <label><span className="mb-1 block text-xs text-slate-500">ค้นหา</span><input name="q" defaultValue={q} placeholder="ข้อความโพสต์ / ชื่อเพจ" className={inp} /></label>
        <label><span className="mb-1 block text-xs text-slate-500">ประเภทโพสต์</span><select name="post_type" defaultValue={type} className={inp}><option value="">ทั้งหมด</option>{types.map((t) => <option key={t}>{t}</option>)}</select></label>
        {showAll && <input type="hidden" name="all" value="1" />}
        <button className="rounded-md bg-slate-900 px-4 py-1.5 font-medium text-white">ใช้ตัวกรอง</button>
        {(q || type) && <Link href={href("/facebook-page", { all: showAll ? "1" : undefined })} className="py-1.5 underline">ล้าง</Link>}
      </form>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["โพสต์", v.total.toLocaleString("en-US")], ["ผลรวม Reach ของโพสต์", v.total ? reach.toLocaleString("en-US") : "รอข้อมูล"],
          ["Link Clicks", clicks.length ? clicks.reduce((s, r) => s + (num(r.link_clicks) ?? 0), 0).toLocaleString("en-US") : "รอข้อมูล"], ["มี Link Clicks", `${clicks.length} จาก ${v.total} โพสต์`]].map(([l, x]) => (
          <div key={l} className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-xs text-slate-500">{l}</div><div className="text-xl font-bold tabular-nums">{x}</div></div>
        ))}
      </div>
      {excluded.length > 0 && rows.length !== kept.length && (
        <p className="text-xs text-slate-500">{showAll ? "แสดงเพจที่ตัดออกด้วย" : `ไม่รวม ${rows.length - kept.length} โพสต์จากเพจที่ตัดออก`} · <Link className="underline" href={href("/facebook-page", { ...params, all: showAll ? undefined : "1" })}>{showAll ? "ซ่อนเพจที่ตัดออก" : "แสดงด้วย"}</Link></p>
      )}
      {rows.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-slate-500">ยังไม่มีข้อมูล — นำเข้า Page.csv ที่หน้า นำเข้า CSV</p>
        : <DataTable cols={COLS} rows={v.rows} base="/facebook-page" params={params} sort={sort} dir={dir} page={v.page} pages={v.pages} total={v.total} />}
    </section>
  );
}
