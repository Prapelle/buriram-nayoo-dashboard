// Cloudflare D1 จำลองด้วย SQLite ในหน่วยความจำ (node:sqlite) — พฤติกรรมเดียวกับที่โค้ดเรียกใช้: prepare/bind/all/run/batch
// batch ทำงานเป็นทรานแซกชัน (ผิดพลาดแล้วย้อนทั้งชุด เหมือน D1 จริง)
import { DatabaseSync } from "node:sqlite";

export function makeD1() {
  const raw = new DatabaseSync(":memory:");
  const stmt = (sql, params = []) => ({
    bind: (...v) => stmt(sql, v),
    all: async () => ({ results: raw.prepare(sql).all(...params).map((r) => ({ ...r })) }),
    run: async () => runSync(sql, params),
    _sync: () => runSync(sql, params),
  });
  const runSync = (sql, params) => { const r = raw.prepare(sql).run(...params); return { meta: { last_row_id: Number(r.lastInsertRowid), changes: Number(r.changes) } }; };
  return {
    raw,
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      raw.exec("BEGIN");
      // ทำทั้งชุดแบบไม่สลับคิว (D1 จริงทำ batch ทีละชุด) — คำขอที่มาพร้อมกันจึงไม่ซ้อนทรานแซกชันกัน
      try { const out = []; for (const s of stmts) out.push(s._sync()); raw.exec("COMMIT"); return out; }
      catch (e) { raw.exec("ROLLBACK"); throw e; }
    },
    /** อ่านตารางแบบ sync เป็น object ตามชื่อคอลัมน์ (ใช้ตรวจในเทสต์) */
    rows: (tab) => raw.prepare(`SELECT * FROM "${tab}" ORDER BY _id`).all().map(({ _id, ...r }) => ({ ...r })),
  };
}
