// โหลดก่อนเซิร์ฟเวอร์ Next: แทน Google API ด้วยตัวจำลอง + ช่องทางควบคุมสำหรับเทสต์ (/__fake/*) ผ่านพอร์ตแยก
import { createServer } from "node:http";
import { install, tabs, stats } from "./fake-sheets.mjs";
install(process.env.GOOGLE_SHEET_ID);
const port = Number(process.env.FAKE_CONTROL_PORT || 0);
if (port) createServer((req, res) => {
  const send = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  let body = ""; req.on("data", (c) => { body += c; }); req.on("end", () => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/tab") { const t = tabs.get(u.searchParams.get("name")); return send(t ? { rows: t.rows } : null); }
    if (u.pathname === "/tabs") return send([...tabs.keys()]);
    if (u.pathname === "/set" && req.method === "POST") { const { name, rows } = JSON.parse(body); tabs.get(name).rows = rows; return send({ ok: true }); }
    if (u.pathname === "/stats") return send(stats);
    res.statusCode = 404; send({});
  });
}).on("error", (e) => console.error("[fake-sheets] control port:", e.message)).listen(port, "127.0.0.1");
