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

---

## ระบบบัญชี + Production (5/11/2026)

หลัง deploy ครั้งแรก **Super Admin กด ตั้งค่า → ตั้งค่าระบบ → เตรียม Google Sheet** เพื่อสร้างแท็บใหม่ 5 แท็บ (เพิ่มอย่างเดียว ไม่แตะแท็บเดิม): `ACC_DOCS`, `ACC_LINES`, `ACC_PAYMENTS`, `ACC_FILES`, `PRODUCTION_JOBS`

**สิทธิ์:** ดู/ออก/แก้เอกสาร = Admin + AE · ยืนยันชำระเงิน / เริ่มงาน / แนบไฟล์ / แก้สถานะ Job = Admin ขึ้นไป (ตรวจที่ API)

**ข้อมูลผู้ขายบนเอกสาร:** ค่าเริ่มต้นตามใบเสนอราคาต้นแบบ แก้ได้โดยเพิ่มแถวในแท็บ `APP_CONFIG`: `config_key = account_seller`, `config_value = {"name":"…","address":"…","tax_id":"…","phone":"…"}` (ใส่เฉพาะช่องที่ต้องการเปลี่ยน)

### ที่เก็บไฟล์แนบ (Cloudflare KV — แผนฟรี ไม่ต้องผูกบัตร)
ไฟล์แนบ (สลิป / ใบเสนอราคาที่ลูกค้าเซ็น) เก็บใน Cloudflare KV: ฟรี 1 GB · ไฟล์ละไม่เกิน 25 MiB (ระบบจำกัด 10 MB) · เขียนได้ 1,000 ครั้ง/วัน
- namespace `nayoo-account-files` ผูกไว้แล้วใน `wrangler.jsonc` (`kv_namespaces`, binding `ACC_FILES`) — ไม่ต้องตั้งค่าอะไรเพิ่ม
- ไฟล์ดาวน์โหลดผ่าน `/api/account/files?id=…` ต้องล็อกอินเสมอ (ไม่มีลิงก์สาธารณะ)
- ถ้าต้องการย้ายไป R2 ภายหลัง แก้ที่ `fileStore()` ใน `src/lib/account-service.ts` ที่เดียว

### ขั้นตอนการทำงาน
ใบเสนอราคา → ใบวางบิล → ใบแจ้งหนี้ (ข้ามใบได้) · ยืนยันชำระเงินได้ทุกใบ
- **ชำระเต็มจำนวน** → เพิ่ม Product ให้ลูกค้า (แถวใน DEVELOPERS ตาม `customer_id`) + สร้าง Job Production 1 Job ต่อ 1 รายการสินค้า อัตโนมัติ
- **ชำระมัดจำ** → บันทึกชำระ แล้วกดปุ่ม **▶ เริ่มงาน** เมื่อพร้อม (ทำได้ครั้งเดียวต่อสายเอกสาร)
- ต้องมีวันเริ่ม–สิ้นสุดของทุกรายการก่อนเริ่มงาน (ใช้เป็นช่วงของ Product) · ถ้าขาด ระบบปฏิเสธก่อนบันทึกชำระเต็มจำนวน
- เช็กลิสต์ของ Job = บรรทัดที่ขึ้นต้นด้วย `-` ในช่อง "รายละเอียด" ของรายการสินค้า
- ชื่อ Product ในเอกสาร = รายการ Product เดียวกับของ Developer / Home Builder (`APP_CONFIG: developer_products`) · เพิ่มชนิดใหม่ได้จากหน้าเอกสาร
- **หัก ณ ที่จ่าย:** เลือกอัตราได้ที่เอกสาร (0 / 1 / 2 / 3 / 5%) คิดจากยอดก่อน VAT หลังหักส่วนลด · ยอดที่ลูกค้าต้องโอน = ยอดรวม − หัก ณ ที่จ่าย · ชำระครบตามยอดสุทธิถือว่าชำระเต็ม · Product ของลูกค้าบันทึกราคาเต็ม (ก่อนหัก) · เพิ่มคอลัมน์ `wht_rate`, `wht` ต่อท้าย ACC_DOCS — กด เตรียม Google Sheet อีกครั้งหลัง deploy
- **ใบเสร็จรับเงิน (RC):** ออกอัตโนมัติทุกครั้งที่ยืนยันชำระเงิน (หนึ่งการชำระ = หนึ่งใบ รวมมัดจำ) · การชำระเก่าที่ยังไม่มีใบเสร็จมีปุ่ม "ออกใบเสร็จ" · เพิ่มคอลัมน์ `receipt_doc_id` ต่อท้าย ACC_PAYMENTS
- **จำข้อมูลลูกค้า:** แท็บใหม่ `ACC_CUSTOMERS` (ผู้ติดต่อ เบอร์ ที่อยู่ เลขผู้เสียภาษี ผูกกับลูกค้า) — บันทึกเอกสารครั้งไหน ระบบจำค่าล่าสุดและใส่ให้ในใบถัดไป
- หลัง deploy ให้ Super Admin กด **เตรียม Google Sheet** อีกครั้ง (เพิ่มแท็บ ACC_CUSTOMERS และคอลัมน์ receipt_doc_id)
- **แก้ไข / ลบ:** เอกสารมีปุ่ม ✎ แก้ไข (แก้ได้จนกว่าจะมีชำระเงินหรือสร้างใบถัดไป เช่น ใบเสนอราคาที่ออกใบวางบิลแล้วแก้ไม่ได้) · ลบเอกสาร และลบไฟล์แนบ ทำได้เฉพาะ Super Admin (ลบเอกสารพร้อมรายการ/ชำระ/ไฟล์/ใบเสร็จของใบนั้น · ลบไม่ได้ถ้ามีใบถัดไปหรือสร้างงาน Production ไปแล้ว)
- **ยืนยันชำระเงินต้องแนบสลิป/เอกสารทุกครั้ง** (PDF/PNG/JPG ไม่เกิน 10 MB) ต้องเปิด Cloudflare KV (ACC_FILES) ก่อน ไม่งั้นยืนยันชำระไม่ได้
- **Revenue ย้ายมาอยู่ในระบบบัญชี** ที่ `/account/revenue` (ลิงก์เดิม /work/sales เด้งมาให้) พร้อมยอดรับชำระจากใบเสร็จ · เมนู **สรุปบัญชี** (`/account/summary`) แสดงจำนวนเอกสารแต่ละชนิดและยอดรอเรียกเก็บ

## ย้ายฐานข้อมูลจาก Google Sheets ไป Cloudflare D1 (5/11/2026)

ฐานข้อมูล D1 ชื่อ `nayoo-db` ผูกกับแอปที่ binding `DB` (ตั้งใน `wrangler.jsonc`) ย้ายเป็นกลุ่ม กลุ่มแรก = `core` (ผู้ใช้ · Config · Audit · Developer/Home Builder · ระบบบัญชี · Production Job) ส่วน Leads, ข้อมูลนำเข้าการตลาด, Sales ยังใช้ Google Sheets จนกว่าจะย้ายรอบถัดไป

ขั้นตอน (หน้า ตั้งค่า → "ฐานข้อมูล D1" ต้องเป็น Super Admin):
1. สำรอง Google Sheet ก่อน: File → Make a copy
2. กด **เตรียมฐานข้อมูล D1** (สร้างตาราง รันซ้ำได้)
3. กด **ลองคัดลอกและตรวจเทียบ** ดูรายงาน: จำนวนแถว เนื้อหา และยอดเงินของเอกสารบัญชี/การชำระต้องตรงทุกแท็บ (ยังไม่สลับ ระบบยังใช้ Sheets)
4. ตอนไม่มีคนกรอกข้อมูล กด **ย้ายและสลับมาใช้ D1** ระบบล็อกการเขียนไม่กี่วินาที คัดลอกใหม่ ตรวจเทียบ แล้วสลับเฉพาะเมื่อตรงทุกแท็บ
5. Google Sheet เดิมไม่ถูกแก้หรือลบ เก็บเป็นสำรอง · ถ้ามีปัญหากด **กลับไปใช้ Google Sheets** (ข้อมูลที่แก้หลังสลับอยู่ใน D1 เท่านั้น)

เทสต์: `bash tests/run-all.sh` รัน `tests/d1.test.mts` (คัดลอก/ตรวจเทียบ/สลับ/ย้อนกลับ/ล็อก) และชุดระบบบัญชีซ้ำบน D1 จำลอง (`D1_MODE=1`)

## บอร์ด Content (Production) — เพิ่ม 5/11/2026

- หน้า `/production/content` = Kanban 11 คอลัมน์: ช่วงผลิต (IDEA → … → PUBLISHED) ต่อด้วยช่วงรายงานลูกค้า (รอครบเพื่อทำรายงาน → … → ส่งให้ลูกค้าแล้ว) — เฉพาะการ์ดที่ติดแท็ก "งานขาย" เข้าช่วงรายงานได้
- ตาราง `CONTENT_CARDS` / `CONTENT_MEMBERS` / `CONTENT_HISTORY` / `PRODUCT_SETTINGS` **เกิดบน D1 เท่านั้น** (ไม่มีใน Google Sheets) สร้างอัตโนมัติเมื่อใช้งานครั้งแรก — ไม่ต้องกดย้ายข้อมูล ไม่ต้องมี migration
- ตั้งจำนวนโพสต์ + ระยะติดตามผลต่อ Product ที่หน้า บัญชี → Product · เปิด Job (เริ่มงาน) แล้วระบบสร้างการ์ด IDEA ตามจำนวนโพสต์ให้อัตโนมัติ (ติดแท็กงานขาย)
- งานขายที่เผยแพร่ (ลากเข้า PUBLISHED) จะเลื่อนไป "รอครบเพื่อทำรายงาน" ทันที พร้อมวันครบกำหนด = วันเผยแพร่ + ระยะติดตามผล
- สิทธิ์: ดู/สร้าง/แก้/ย้ายการ์ด = Super Admin, Admin, AE, Production · ลบการ์ด = Super Admin, AE

### จับคู่โพสต์ Facebook กับการ์ด Content (Phase 2)
- หลังนำเข้า "Facebook Page — สถิติโพสต์" ระบบจับคู่การ์ดที่ยังไม่มี Post ID ให้เอง (หรือกดปุ่ม "🔗 จับคู่โพสต์ Facebook" ที่บอร์ด)
- เงื่อนไข (เน้นไม่จับผิด): วันเผยแพร่โพสต์ห่างจากวันเผยแพร่/กำหนดของการ์ดไม่เกิน 1 วัน · ชื่อ Content คล้ายข้อความโพสต์ ≥ 50% · เป็นโพสต์ที่ชัดเจนเพียงโพสต์เดียว · โพสต์ที่จับแล้วไม่ถูกใช้ซ้ำ — จับไม่ได้ก็ใส่ Post ID เองที่การ์ด
- การ์ดที่มี Post ID แสดง Views / Reach / Reactions / Comments / Shares / Link clicks (ใช้ยอดสะสมล่าสุดถ้ามี ไม่มีก็รวมรายวัน)
