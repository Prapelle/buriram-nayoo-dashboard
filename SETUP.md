# คู่มือติดตั้งและ Deploy — Buriram NAYOO Marketing Dashboard

ระบบนี้ใช้ **Next.js บน Cloudflare Workers (ฟรี)** + **Google Sheets เป็นฐานข้อมูล** + **Google OAuth** ไม่ต้องรันอะไรในเครื่อง ทุกอย่างทำผ่านเว็บ (GitHub, Google Cloud, Cloudflare)

> หมายเหตุ: spec เดิมระบุ Vercel แต่เปลี่ยนเป็น Cloudflare ตามที่ตกลงกัน (Vercel Hobby จำกัดการใช้งานเชิงพาณิชย์)

## 1) เตรียมบัญชี
- บัญชี Google (เจ้าของ Spreadsheet และโปรเจกต์ Google Cloud)
- บัญชี GitHub (เก็บโค้ด จะเป็น Private repo ก็ได้)
- บัญชี Cloudflare (ฟรี)

## 2) Google Cloud (ฟรี)
1. https://console.cloud.google.com → สร้างโปรเจกต์ใหม่
2. **APIs & Services → Library** → เปิดใช้ **Google Sheets API**
3. **OAuth consent screen** → External → ใส่ชื่อแอป → เพิ่มอีเมลของทีมใน **Test users** (โหมด Testing ใช้ได้ ไม่ต้องรีวิว และจำกัดเฉพาะอีเมลที่เพิ่ม)
4. **Credentials → Create credentials → OAuth client ID** (Web application) เพิ่ม **Authorized redirect URIs**
   - `https://<ชื่อ-worker>.<subdomain>.workers.dev/api/auth/callback/google` (ได้ URL หลัง deploy ครั้งแรก ข้อ 6)
   - เก็บ **Client ID** และ **Client Secret**
5. **Credentials → Create credentials → Service account** → เข้า Service account → แท็บ **Keys → Add key → JSON** ไฟล์จะถูกดาวน์โหลด เก็บให้ปลอดภัย **ห้ามอัปโหลดขึ้น GitHub**
   - ในไฟล์ JSON ใช้ `client_email` และ `private_key`

## 3) Google Spreadsheet
1. สร้าง Spreadsheet เปล่า (ส่วนตัว **ห้ามตั้งเป็น Public** — General access ต้องเป็น Restricted)
2. กด Share → ใส่อีเมล `client_email` ของ Service Account เป็น **Editor** (เท่านั้น อย่าแชร์ให้ผู้ใช้ทั่วไป)
3. คัดลอก Sheet ID จากลิงก์: `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`

## 4) GitHub
อัปโหลดโค้ดทั้งโปรเจกต์ไว้ที่ชั้นนอกสุดของ repo (ไฟล์ `package.json` ต้องอยู่ชั้นแรก ไม่ซ้อนในโฟลเดอร์) ตรวจว่ามีไฟล์/โฟลเดอร์หลักเหล่านี้ครบ

```
package.json  package-lock.json  tsconfig.json  next.config.ts  open-next.config.ts
wrangler.jsonc  postcss.config.mjs  .gitignore  .env.example
src/auth.ts
src/lib/…          (sheets.ts, env.ts, guard.ts, schema.ts, import/, sales/, export/ ฯลฯ)
src/components/…
src/app/layout.tsx  src/app/globals.css  src/app/login/page.tsx
src/app/api/…      (auth/[...nextauth], init, health, import, line-oa, leads, sales, export)
src/app/(app)/…    (layout, page, import, facebook-page, facebook-ads, google-ads, line-oa, leads, sales, export, settings, [slug])
```

ข้อควรระวังตอนอัปโหลดผ่านเว็บ GitHub: โฟลเดอร์ที่ซ้อนลึกอาจหายหรือไปอยู่ผิดตำแหน่ง ถ้า build ขึ้น `Module not found` ให้ดูชื่อไฟล์ใน log แล้วเช็ก path ให้ตรงเป๊ะ (ชื่อโฟลเดอร์ `(app)` และ `[slug]` ต้องมีวงเล็บครบ)

## 5) Cloudflare (Deploy จาก GitHub)
1. https://dash.cloudflare.com → **Workers & Pages → Create → Import a repository** (เลือกฝั่ง **Workers** ไม่ใช่ Pages) → เลือก repo
2. ชื่อโปรเจกต์ต้องเป็น `buriram-nayoo-dashboard` (ตรงกับ `name` ใน `wrangler.jsonc`)
3. ตั้งค่า Build
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npx opennextjs-cloudflare deploy`
4. กด Deploy → ได้ URL `https://buriram-nayoo-dashboard.<subdomain>.workers.dev`
5. นำ URL ไปเพิ่มเป็น Authorized redirect URI ใน Google Cloud (ข้อ 2.4) โดยต่อท้ายด้วย `/api/auth/callback/google`

## 6) ตัวแปรลับ (Secrets)
Worker → **Settings → Variables and secrets → Add** (ชนิด **Secret**) 7 ตัว

| ชื่อ | ค่า |
|---|---|
| `AUTH_SECRET` | สุ่มข้อความยาว ≥ 32 ตัวอักษร (เช่น `openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` | OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | OAuth Client Secret |
| `INITIAL_ADMIN_EMAIL` | อีเมล Google ของ Admin คนแรก |
| `GOOGLE_SHEET_ID` | จากลิงก์ Spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` จากไฟล์ JSON |
| `GOOGLE_PRIVATE_KEY` | `private_key` จากไฟล์ JSON วางทั้งก้อน (ระบบรับได้ทั้งแบบมี `\n` และแบบเว้นวรรค) |

ห้ามใช้คำนำหน้า `NEXT_PUBLIC_` กับค่าเหล่านี้ (จะถูกส่งไปที่ Browser) และห้ามใส่เครื่องหมายคำพูดครอบ `AUTH_GOOGLE_ID`

## 7) เปิดใช้งานครั้งแรก
1. เปิด URL ของเว็บ → เข้าสู่ระบบด้วยอีเมลที่ตั้งเป็น `INITIAL_ADMIN_EMAIL`
2. **ตั้งค่า → เตรียม Google Sheet** (สร้างแท็บทั้งหมด รันซ้ำได้ ไม่ลบข้อมูลเดิม)
3. **ตั้งค่า → ตรวจสอบระบบ** ทุกข้อควรเป็น ✓ (ข้อที่เป็น ! อ่านคำอธิบายแล้วแก้ตาม)
4. ทดสอบความปลอดภัยแบบง่าย: เปิดเว็บใน **หน้าต่างไม่ระบุตัวตน (Incognito)** ต้องถูกส่งไปหน้า login และเข้า `/sales`, `/leads`, `/export` ไม่ได้
5. เพิ่มผู้ใช้อื่นตาม `docs/OPERATIONS.md` หัวข้อ "จัดการผู้ใช้"

## 8) อัปเดตระบบภายหลัง
Commit โค้ดใหม่ขึ้น GitHub → Cloudflare build และ deploy ให้เอง (2–5 นาที) หากหมายเหตุการอัปเดตระบุว่ามีแท็บ/คอลัมน์ใหม่ ให้กด **เตรียม Google Sheet** อีกครั้งหลัง deploy เสร็จ

## 9) เช็กลิสต์ความปลอดภัย (ตรวจด้วยตนเอง)
- [ ] Spreadsheet เป็น Restricted (กด Share ดู ต้องไม่มี "Anyone with the link") และแชร์เฉพาะ Service Account (Editor) กับเจ้าของ
- [ ] ไฟล์ JSON ของ Service Account ไม่อยู่ใน GitHub (ลบถ้าเคยอัปโหลดพลาด แล้วสร้างคีย์ใหม่)
- [ ] OAuth consent screen เป็น Testing และมีเฉพาะอีเมลของทีมใน Test users
- [ ] Secrets ทั้งหมดตั้งใน Cloudflare (ชนิด Secret) ไม่อยู่ในโค้ด
- [ ] ตรวจสอบระบบ (ตั้งค่า → ตรวจสอบระบบ) ไม่มีรายการ ✕
- [ ] ผู้ใช้ที่ลาออก/ไม่ใช้แล้วถูกตั้ง `active = FALSE` ใน `APP_USERS`

## 10) แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุและวิธีแก้ |
|---|---|
| Build: `Module not found: Can't resolve '@/…'` | ไฟล์นั้นไม่อยู่ใน repo หรืออยู่ผิดโฟลเดอร์ (เช่น อยู่ใน `src/` แทน `src/lib/`) ตรวจ path จากชื่อใน log |
| Build: `Type error: Cannot find name 'tsx'` | ก็อบชื่อภาษาของกล่องโค้ด (บรรทัดแรก) ติดมาในไฟล์ ลบบรรทัดนั้น |
| Google: `Error 401: invalid_client` | `AUTH_GOOGLE_ID` ผิด/วางผิดช่อง/มีช่องว่างหรือเครื่องหมายคำพูด |
| Google: `redirect_uri_mismatch` | URI ใน Google Cloud ต้องเป็น `https://<URL เว็บ>/api/auth/callback/google` เป๊ะ (https, ไม่มี `/` ท้าย) และกด Save แล้ว |
| Google: `access_denied` | อีเมลยังไม่อยู่ใน Test users ของ OAuth consent screen |
| ล็อกอินกลับมาเป็น 404/405 | ไฟล์ `src/app/api/auth/[...nextauth]/route.ts` หายหรืออยู่ผิดที่ (ต้องมี 2 บรรทัด: import handlers และ `export const { GET, POST } = handlers`) |
| หน้า login ขึ้น "ยังไม่ได้รับสิทธิ์" | อีเมลไม่ตรงกับ `INITIAL_ADMIN_EMAIL` หรือไม่อยู่ใน `APP_USERS` (active = TRUE, role ถูกต้อง) |
| เตรียม Sheet: `"pkcs8" must be PKCS#8 formatted string` | `GOOGLE_PRIVATE_KEY` วางไม่ครบ/ผิดช่อง (ต้องขึ้นต้น `-----BEGIN PRIVATE KEY-----`) |
| `Sheets API 403` | ยังไม่ได้แชร์ Spreadsheet ให้ Service Account (Editor) หรือยังไม่เปิด Sheets API |
| `Sheets API 404` | `GOOGLE_SHEET_ID` ผิด |
| Error 1102 / Worker exceeded CPU | เกินโควตา CPU 10 ms ของแพ็กเกจ Workers ฟรี (หน้าที่อ่านข้อมูลมาก) ลองลดข้อมูลต่อหน้า หรืออัปเกรด Workers Paid ($5/เดือน) |
| นำเข้าแล้วไม่เห็นข้อมูล | ลืมกด เตรียม Google Sheet หลังอัปเดตระบบ → ตรวจสอบระบบ จะระบุแท็บ/คอลัมน์ที่ขาด |

## 11) ข้อจำกัดของแพ็กเกจฟรี
- **Workers Free:** CPU 10 ms ต่อ request, 50 subrequests ต่อ request (ระบบออกแบบให้ใช้ API call น้อย แต่ถ้าข้อมูลโตมากอาจชนขีดจำกัด)
- **Google Sheets API:** ประมาณ 60 requests/นาที/ผู้ใช้ — Dashboard แต่ละครั้งใช้ราว 3–6 calls
- **ไม่มี transaction/lock:** ใช้เขียนข้อมูลทีละคน (Single Writer) ถ้าทีมโตจนหลายคนบันทึก Leads/Sales พร้อมกันบ่อย ควรย้ายไปฐานข้อมูลจริง
