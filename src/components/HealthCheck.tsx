"use client";
import { useState } from "react";

type Check = { id: string; label: string; status: "ok" | "warn" | "fail"; detail: string };
const ICON = { ok: ["✓", "text-green-700", "bg-green-50"], warn: ["!", "text-amber-800", "bg-amber-50"], fail: ["✕", "text-red-700", "bg-red-50"] } as const;

export function HealthCheck() {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState("");

  async function run() {
    setState("loading"); setError("");
    try {
      const r = await fetch("/api/health"); const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setChecks(j.checks); setState("ok");
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด"); setState("error"); }
  }
  return (
    <div className="space-y-3">
      <button onClick={run} disabled={state === "loading"} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">{state === "loading" ? "กำลังตรวจสอบ..." : "ตรวจสอบระบบ"}</button>
      {state === "error" && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {state === "ok" && (
        <ul className="space-y-1.5" aria-label="ผลตรวจสอบระบบ">
          {checks.map((c) => (
            <li key={c.id} className={`flex gap-2 rounded-md p-2 text-sm ${ICON[c.status][2]}`}>
              <span aria-label={c.status} className={`w-4 shrink-0 text-center font-bold ${ICON[c.status][1]}`}>{ICON[c.status][0]}</span>
              <span><b>{c.label}</b><span className="block text-slate-600">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
