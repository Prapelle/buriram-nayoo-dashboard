"use client";
import { useState } from "react";

type Report = { createdTabs: string[]; addedHeaders: Record<string, string[]>; seeded: string[] };

export function InitButton() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  async function run() {
    setState("loading"); setError("");
    try {
      const res = await fetch("/api/init", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setReport(j); setState("ok");
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); setState("error"); }
  }

  return (
    <div className="space-y-3">
      <button onClick={run} disabled={state === "loading"}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
        {state === "loading" ? "กำลังตรวจสอบ..." : "เตรียม Google Sheet (รันซ้ำได้)"}
      </button>
      {state === "error" && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {state === "ok" && report && (
        <div role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          <p>สำเร็จ — สร้างแท็บใหม่ {report.createdTabs.length} แท็บ, เพิ่มคอลัมน์ใน {Object.keys(report.addedHeaders).length} แท็บ</p>
          {report.seeded.length > 0 && <p>ค่าเริ่มต้นที่เพิ่ม: {report.seeded.join("; ")}</p>}
          {!report.createdTabs.length && !Object.keys(report.addedHeaders).length && <p>โครงสร้างครบแล้ว ไม่มีอะไรเปลี่ยน</p>}
        </div>
      )}
    </div>
  );
}
