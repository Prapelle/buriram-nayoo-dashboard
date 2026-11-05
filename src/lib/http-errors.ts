import { NextResponse } from "next/server";
import { MigratingError } from "./d1-state";

/** ระหว่างย้ายฐานข้อมูล (ล็อกการเขียนไม่กี่วินาที) ตอบ 503 พร้อมข้อความให้รอ — ไม่นับเป็นข้อผิดพลาดของระบบ (5/11/2026) */
export const migratingResponse = (e: unknown) => (e instanceof MigratingError ? NextResponse.json({ error: e.message, code: "MIGRATING" }, { status: 503 }) : null);
