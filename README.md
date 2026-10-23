# Buriram NAYOO Marketing Dashboard

Next.js (App Router) + Google Sheets เป็นฐานข้อมูล + Google OAuth รันบน Cloudflare Workers (ฟรี) ผ่าน OpenNext

> สถานะ: **ขั้น 1** — Sheets Initializer, Login (ปิด signup), Role Guard, หน้าตั้งค่า
> ขั้นถัดไป: Import CSV → Dashboard → LINE OA → Leads → Sales → Export

## 1. ตั้งค่า Google Cloud (ฟรี)

1. https://console.cloud.google.com สร้างโปรเจกต์ใหม่
2. **APIs & Services → Library** → เปิดใช้ **Google Sheets API**
3. **OAuth consent screen** → External → ใส่ชื่อแอป → เพิ่มอีเมลของทีมใน **Test users** (โหมด Testing ใช้ได้ไม่ต้องรีวิว และจำกัดเฉพาะอีเมลที่เพิ่ม)
4. **Credentials → Create OAuth client ID** (Web application) เพิ่ม Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<ชื่อ-worker>.<subdomain>.workers.dev/api/auth/callback/google` (เพิ่มหลัง deploy)
5. **Credentials → Create Service Account** → แท็บ Keys → Add key → JSON (เก็บไฟล์ไว้ ห้าม commit)

## 2. สร้าง Google Spreadsheet

1. สร้าง Spreadsheet เปล่า (ส่วนตัว ห้ามตั้ง Public)
2. กด Share → ใส่อีเมล Service Account (`client_email` ในไฟล์ JSON) เป็น **Editor**
3. คัดลอก Sheet ID จากลิงก์ (`/d/<SHEET_ID>/edit`)

## 3. รันในเครื่อง

```bash
npm install
cp .env.example .env.local   # แล้วกรอกค่า
npm run dev
```

เปิด http://localhost:3000 → เข้าสู่ระบบด้วยอีเมลที่ตั้งใน `INITIAL_ADMIN_EMAIL` → **ตั้งค่า → เตรียม Google Sheet** (สร้างแท็บตามโครงสร้างทั้งหมด รันซ้ำได้ ไม่ลบข้อมูลเดิม)

ผู้ใช้เพิ่มเติม: เพิ่มแถวในแท็บ `APP_USERS` (email, role = admin/marketing/sales, active = TRUE) — หน้าจัดการผู้ใช้จะมาในขั้นถัดไป

## 4. Deploy ขึ้น Cloudflare (ฟรี)

```bash
npx wrangler login
npm run deploy                      # build + deploy เป็น Worker
npx wrangler secret put AUTH_SECRET
npx wrangler secret put AUTH_GOOGLE_ID
npx wrangler secret put AUTH_GOOGLE_SECRET
npx wrangler secret put INITIAL_ADMIN_EMAIL
npx wrangler secret put GOOGLE_SHEET_ID
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put GOOGLE_PRIVATE_KEY   # วางทั้งก้อน รวม -----BEGIN...
```

จากนั้นนำ URL `*.workers.dev` ไปเพิ่มใน OAuth redirect URI (ข้อ 1.4)

ทดสอบแบบ Workers จริงในเครื่อง: คัดลอกค่าไว้ใน `.dev.vars` แล้ว `npm run preview`

## ข้อควรรู้

- **Workers Free**: CPU 10 ms ต่อ request และ 50 subrequests ต่อ request หากเจอ Error 1102 (เกินเวลา CPU) ให้ดูคู่มือ troubleshooting ของ OpenNext หรือใช้ Workers Paid ($5/เดือน)
- **Single Writer**: Google Sheets ไม่มี transaction ใช้ Admin คนเดียวเขียนข้อมูลในช่วง MVP
- **Secrets**: ห้ามใช้ prefix `NEXT_PUBLIC_`; เรียก Sheets API จาก Server เท่านั้น
- **Backup**: ใน Sheets เลือก File → Version history และ File → Download → .xlsx เป็นระยะ; เก็บ CSV ต้นฉบับไว้ใน Drive
