# Buriram NAYOO Marketing Dashboard

ระบบภายในสำหรับรวมข้อมูลการตลาด (Facebook Page/Ads, Google Ads, LINE OA), จัดการ Leads, นำเข้ารายงานยอดขายจาก Excel และส่งออก CSV ไปใช้ใน Looker Studio

**เทคโนโลยี:** Next.js (App Router) + TypeScript + Tailwind · Google Sheets เป็นฐานข้อมูล · Google OAuth · Cloudflare Workers (ฟรี)

## เอกสาร
- [`docs/SETUP.md`](docs/SETUP.md) — ติดตั้ง ตั้งค่า Google Cloud / Sheets / OAuth / Cloudflare, ความปลอดภัย, แก้ปัญหา
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — ใช้งานประจำเดือน, จัดการผู้ใช้, Area, สำรองข้อมูล, ข้อจำกัด
- [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) — ผลตรวจรับตาม spec และสิ่งที่ยังไม่ได้ทำ

## เมนูหลัก
ภาพรวมการตลาด · นำเข้า CSV · Facebook Page · Facebook Ads · Google Ads · LINE OA · Leads · Sales (นำเข้ารายงานยอดขาย Excel) · ส่งออกข้อมูล · ตั้งค่า (เตรียม Google Sheet, ตรวจสอบระบบ)

## ตัวแปรลับ
ดู `.env.example` (ตั้งใน Cloudflare ชนิด Secret ห้าม commit และห้ามใช้คำนำหน้า `NEXT_PUBLIC_`)

## ทดสอบ
`bash tests/run-all.sh` — ดู `tests/fixtures/README.md` สำหรับไฟล์ตัวอย่างที่ต้องวาง (ไม่ได้ใส่ข้อมูลจริงไว้ใน repo)
