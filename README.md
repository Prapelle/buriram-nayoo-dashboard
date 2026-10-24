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

## 4. Deploy จาก GitHub ไป Cloudflare (ฟรี ไม่ต้องรันในเครื่อง)

1. Push โค้ดขึ้น GitHub repo (private ได้)
2. https://dash.cloudflare.com → **Workers & Pages → Create → Import a repository** → เลือก repo
3. ชื่อโปรเจกต์ต้องเป็น `buriram-nayoo-dashboard` (ตรงกับ `name` ใน `wrangler.jsonc`)
4. ตั้งค่า Build:
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
5. หลัง deploy ครั้งแรก ไปที่ Worker → **Settings → Variables and secrets** เพิ่มค่า (ชนิด Secret) ตาม `.env.example` ทั้ง 7 ตัว: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `INITIAL_ADMIN_EMAIL`, `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`
6. นำ URL `*.workers.dev` ไปเพิ่มใน OAuth redirect URI (ข้อ 1.4) แล้วเข้าเว็บ → ตั้งค่า → เตรียม Google Sheet

ทุกครั้งที่ commit ขึ้น GitHub Cloudflare จะ build และ deploy ใหม่อัตโนมัติ

## ขั้น 2: นำเข้า CSV (เมนู "นำเข้า CSV")

1. หลังอัปเดตโค้ด ไปที่ **ตั้งค่า → เตรียม Google Sheet** อีกครั้ง 1 ครั้ง (เพิ่มแท็บ/คอลัมน์ใหม่ ไม่ลบข้อมูลเดิม)
2. ที่หน้า **นำเข้า CSV** ลากไฟล์มาวาง ระบบตรวจประเภทอัตโนมัติ รองรับ Facebook Page, Facebook Ads และ Google Ads 16 ประเภท
3. ตรวจประเภท ช่วงวันที่ (Google Ads เดาจากชื่อไฟล์ ต้องตรวจเอง) และ Area แล้วดูพรีวิว/จำนวนเพิ่ม-อัปเดต-ข้าม-ผิด จากนั้นกดยืนยัน
4. นำเข้าไฟล์เดิมซ้ำได้ ตัวเลขไม่ซ้ำ เพราะระบบอัปเดตตามคีย์ของข้อมูล (Admin เท่านั้นที่ยืนยันนำเข้าไฟล์ที่เคยสำเร็จแล้วได้)
5. Area ของ Meta/Google ตั้งอัตโนมัติจากแท็บ `AREA_MAPPINGS` (source_platform = `meta_ads` + source_name = ชื่อ Ad set, หรือ `google_ads` + ชื่อแคมเปญ, confirmed = TRUE, area = buriram/surin/multi_province) ถ้าไม่มีจะใช้ Area ที่เลือกในหน้านำเข้า

ทดสอบ: ใส่ไฟล์ตัวอย่างใน `tests/fixtures/` แล้วรัน `npx tsx tests/import.test.ts` และ `npx tsx tests/e2e.test.mts`

## ข้อควรรู้

- **Workers Free**: CPU 10 ms ต่อ request และ 50 subrequests ต่อ request หากเจอ Error 1102 (เกินเวลา CPU) ให้ดูคู่มือ troubleshooting ของ OpenNext หรือใช้ Workers Paid ($5/เดือน)
- **Single Writer**: Google Sheets ไม่มี transaction ใช้ Admin คนเดียวเขียนข้อมูลในช่วง MVP
- **Secrets**: ห้ามใช้ prefix `NEXT_PUBLIC_`; เรียก Sheets API จาก Server เท่านั้น
- **Backup**: ใน Sheets เลือก File → Version history และ File → Download → .xlsx เป็นระยะ; เก็บ CSV ต้นฉบับไว้ใน Drive
