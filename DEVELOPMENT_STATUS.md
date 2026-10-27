# DEVELOPMENT_STATUS — Buriram NAYOO Marketing Dashboard

อัปเดตล่าสุด: Phase 6 (27/10/2026) · Phase ปัจจุบันเสร็จแล้ว รอคำสั่ง "ทำขั้นต่อไป" สำหรับ Phase 7

## สถานะรวม
| Phase | งาน | สถานะ |
|---|---|---|
| 0 | Audit, Backup & Plan | เสร็จ |
| 1 | Facebook Page CSV: Metric Date + Business Key | เสร็จ · ผู้ใช้ยืนยันบนเว็บจริงแล้ว (27/10/2026) |
| 2 | Marketing Overview: Total Paid Media Spend / Total Leads / CPL | เสร็จ · ผู้ใช้ยืนยันบนเว็บจริงแล้ว (27/10/2026) |
| 3 | Facebook Ads Action Names | เสร็จ · ผู้ใช้ยืนยันบนเว็บจริงแล้ว (27/10/2026) |
| 4 | Lead Management (ฟิลด์ใหม่ + Need/Status Logic) | เสร็จ (ทดสอบอัตโนมัติผ่าน · ผู้ใช้ยังไม่ได้รายงานผลบนเว็บจริง) |
| 5 | Website Analytics Import | **ข้ามไปก่อน (รอข้อมูลจากผู้ใช้)** |
| 6 | Marketing Performance Dashboard (+ กราฟ Lead ตาม Buy/Sell Status) | **เสร็จ (ทดสอบอัตโนมัติผ่าน · ยังไม่ทดสอบบนเว็บจริง) — รอคำสั่ง** |
| 7 | YoY Comparison | ยังไม่เริ่ม |
| 8 | Export (Looker Studio ถูกตัดออกจากขอบเขต) | ยังไม่เริ่ม |
| 9 | Integration Testing | ยังไม่เริ่ม |
| 10 | Final Audit & Handover | ยังไม่เริ่ม |

## ข้อจำกัดของ Audit รอบนี้ (ต้องอ่านก่อน)
- ตรวจจาก **Source Code, ตัวสร้างโครงสร้าง Sheet (schema.ts) และไฟล์ตัวอย่าง CSV/Excel** เท่านั้น
- **ไม่เห็น Google Sheet จริงของคุณ, Cloudflare จริง และรายงาน Looker Studio ของคุณ** จึงยังไม่รู้ว่าในระบบจริงมีข้อมูลกี่แถว, มี Lead จริงหรือไม่, Looker เชื่อมกับอะไร ข้อมูลส่วนนี้ต้องขอจากผู้ใช้ (ดูหัวข้อ "ข้อมูลที่ต้องการ")
- ห้ามสมมติว่า Schema ใน Sheet จริงตรงกับโค้ด: ใช้ ตั้งค่า → ตรวจสอบระบบ เพื่อยืนยัน

## 1) โครงสร้างโปรเจกต์ที่พบจริง
- **Framework:** Next.js 15 (App Router) + React 19 + TypeScript + Tailwind 4
- **Hosting:** Cloudflare Workers ผ่าน OpenNext (@opennextjs/cloudflare) Deploy จาก GitHub
- **ฐานข้อมูล:** Google Sheets ผ่าน REST API ฝั่ง Server (Service Account, JWT ด้วย `jose`) ไม่มี Supabase/ฐานข้อมูลอื่น
- **Login:** Auth.js (next-auth v5) + Google OAuth อนุญาตเฉพาะอีเมลใน `APP_USERS` (+ `INITIAL_ADMIN_EMAIL`) Role: admin / marketing / sales ตรวจฝั่ง Server ทุก Route (`requireRole`) ปฏิเสธคำขอข้ามเว็บ
- **ขนาดโค้ด:** 74 ไฟล์ .ts/.tsx ประมาณ 4,600 บรรทัด
- **หน้าจอ (13):** ภาพรวมการตลาด `/`, นำเข้า CSV, Facebook Page, Facebook Ads, Google Ads, LINE OA, Leads, Sales, Sales/นำเข้า, ส่งออกข้อมูล, ตั้งค่า, login, [slug] (placeholder)
- **API (13):** auth, init, health, import (plan/commit/history), line-oa, leads, sales (plan/commit/history), export ([dataset], sales-transactions)
- **ชุดเทสต์:** security / import / dashboard / sales / e2e (ใช้ Google Sheets จำลองในหน่วยความจำ) + `tests/run-all.sh`
- **เอกสาร:** README, docs/SETUP, docs/OPERATIONS, docs/ACCEPTANCE (ฉบับก่อน Master Prompt นี้)

## 2) Google Sheets Schema ที่พบ (จากโค้ด)
ตัวสร้างโครงสร้างสร้าง **30 แท็บ** และเพิ่มคอลัมน์ที่ขาดต่อท้ายเท่านั้น (ไม่ลบ/ไม่เปลี่ยนชื่อของเดิม)

| กลุ่ม | แท็บ |
|---|---|
| ระบบ | APP_USERS, APP_CONFIG, SERVICE_CATALOG, AREA_MAPPINGS, IMPORT_BATCHES, IMPORT_ERRORS, AUDIT_LOG, SALES_IMPORT_LOG |
| การตลาด | FB_PAGE_POSTS, META_ADS, GOOGLE_ADS_CAMPAIGNS + รายละเอียด Google Ads 15 แท็บ (SEARCH_TERMS, SEARCH_WORDS, KEYWORDS, NETWORK, AGE, GENDER, GENDER_AGE, SCHEDULE_DAY/HOUR/DAY_HOUR, OPT_SCORE, CAMPAIGN_CHANGES, DEVICES, TIME_SERIES, AUCTION_INSIGHTS) |
| กรอกมือ/ธุรกิจ | LINE_OA_MONTHLY, LEADS, SALES, SALES_TRANSACTIONS |
| **ไม่มี** | ตาราง Website Analytics (ยังไม่มีแท็บหรือไฟล์ที่ทำหน้าที่นี้) |

### แท็บที่เกี่ยวกับ Master Prompt โดยตรง
**FB_PAGE_POSTS (30 คอลัมน์):** `record_id, page_id, post_id, page_name, title, description, publish_time, permalink, post_type, metric_period_label, snapshot_date, views, reach, reactions_comments_shares, reactions, comments, shares, seconds_viewed, average_seconds_viewed, estimated_earnings_usd, ad_cpm_usd, ad_impressions, total_clicks, other_clicks, link_clicks, raw_json, row_key, source_batch_id, source_filename, imported_at`
- Business Key ปัจจุบัน: `page_id|post_id` (ไม่มี metric_date) · คอลัมน์ `Date` ของไฟล์ถูกเก็บเป็นข้อความใน `metric_period_label` · วันที่ตัวเลขสะสมใช้ `snapshot_date` (วันที่ผู้ใช้ยืนยันตอนนำเข้า)
- ถ้านำเข้าไฟล์ใหม่ที่ Post เดิม ระบบ **อัปเดตทับแถวเดิม** (ไม่เก็บเป็นอีกแถว)

**META_ADS (30 คอลัมน์):** `result_indicator` เก็บค่าต้นฉบับตรง ๆ เช่น `actions:post_engagement` · Key = ช่วงรายงาน + ad_set_name + ad_name (+ลำดับ ถ้าชื่อซ้ำ)

**LEADS (29 คอลัมน์):** `lead_id, lead_code, received_at, customer_name, company_name, phone, email, source_channel, campaign_name, utm_source, utm_medium, utm_campaign, area, service_category, service_interest, need_description, owner_email, status, contactable, last_contacted_at, next_follow_up_at, qualified_at, won_at, lost_reason, notes, created_by, created_at, updated_by, updated_at`

**GOOGLE_ADS_CAMPAIGNS:** `cost_thb, clicks, ctr_pct, area` ต่อแคมเปญต่อช่วงรายงาน · **GOOGLE_ADS_TIME_SERIES:** รายวัน (`date, clicks, impressions, avg_cpc_thb, cost_thb`)

## 3) ฟังก์ชันเดิมที่ทำงานอยู่
- **Import (CSV):** ตรวจประเภทไฟล์จาก header, Preview, ตรวจวันที่/ตัวเลข/ซ้ำ, ยืนยันก่อนเขียน, ประวัติ, Error Report, ป้องกันไฟล์ซ้ำ (SHA-256) · รองรับ Facebook Page, Facebook Ads และ Google Ads 16 ประเภท
- **Import (Excel .xlsx):** ตัวอ่าน xlsx ไม่พึ่งไลบรารี (ใช้กับรายงานยอดขาย) → **นำกลับมาใช้กับ Website Analytics ได้**
- **Dashboard ภาพรวม:** KPI, กราฟ, ตัวกรอง (วันที่ ช่องทาง Campaign พื้นที่ Service) · **Sales Dashboard** แยกต่างหาก
- **Leads:** เพิ่ม/แก้ไข/ค้นหา/กรอง/เปลี่ยนสถานะ/ลบ, Lead Code, เตือนซ้ำ · **LINE OA** รายเดือน
- **Export:** 23 ชุดข้อมูล, UTF-8 BOM, วันที่ ISO, ป้องกัน CSV Injection, จำกัดสิทธิ์ตาม Role
- **ความปลอดภัย/Ops:** ตรวจสอบระบบ, Audit Log, Security Headers

## 4) Gap Analysis เทียบ Master Prompt

### TASK 1 — Facebook Page CSV (ลำดับสำคัญ 2)
| ข้อกำหนด | สถานะปัจจุบัน | หมายเหตุ |
|---|---|---|
| นำเข้า CSV ตัวอย่างได้ | **ทำได้แล้ว** | ไฟล์ตัวอย่าง 55 แถว นำเข้าผ่านในระบบจริงแล้ว |
| header ตามรายการใน Master | **ตรงทุกคอลัมน์** | ไฟล์ตัวอย่างมีเพิ่ม: Views, Reach, Total clicks, Other Clicks, Link Clicks, Matched Audience… (รายการใน Master ไม่ได้ระบุ แต่ระบบรองรับและใช้อยู่) |
| `metric_date` จากคอลัมน์ `Date` | **ขาด** | ในไฟล์ตัวอย่าง `Date` = **"Lifetime" ทั้ง 55 แถว** ไม่ใช่วันที่ → ต้องการคำตัดสินของผู้ใช้ (ข้อ A) |
| Business Key `page_id+post_id+metric_date` | **ขาด** | ปัจจุบัน `page_id+post_id` และอัปเดตทับ |
| โพสต์เดิมวันใหม่ → เก็บเพิ่ม | **ทำไม่ได้ในตอนนี้** | ถูกอัปเดตทับ |
| แยก Metric Date จาก Publish Date ตอนกรอง | **ยังไม่แยก** | Dashboard/Export กรองด้วย publish_time |
| ห้ามรวม Reach หลายวันเรียก Unique Reach | **มีบางส่วน** | ป้ายเขียนว่า "ผลรวม Reach ของโพสต์ (Lifetime)" แต่เมื่อมีหลายแถวต่อโพสต์ การรวมจะนับซ้ำ → ต้องออกแบบใหม่ใน Phase 1/2 |
| นำเข้าซ้ำไม่ซ้ำ / ข้อมูลเดิมไม่หาย / Export ใช้ได้ | ทำได้ในรูปแบบปัจจุบัน | ต้องรักษาเมื่อเปลี่ยน Key |

### TASK 2 — Marketing Overview
| ข้อกำหนด | สถานะปัจจุบัน |
|---|---|
| Total Paid Media Spend = Meta + Google Campaign | **ทำแล้ว** (ใช้ Campaign Report เท่านั้น, เตือนช่วงรายงานทับกัน, ไม่รวม Facebook Page) · ผลตรวจกับข้อมูลตัวอย่าง ก.ย. 2026 = ฿66,372.36 |
| ข้อมูลไม่ครบ → Data Incomplete/Missing Data | **ทำบางส่วน** แสดง "รอข้อมูล" และหมายเหตุ "รวมเฉพาะแหล่งที่มีข้อมูล" แต่ยังไม่มีสถานะ Data Incomplete ชัดเจน |
| Total Leads นับ `lead_id` ไม่ซ้ำ ตาม Lead Date | **ทำเกือบครบ** นับแถว Leads ตาม `received_at` (lead_id เป็น UUID ต่อแถว) ควรเปลี่ยนเป็นนับ distinct `lead_id` ให้ชัดเจน |
| **CPL = Total Paid / Total Leads** | **นิยามต่างจากที่ระบบทำอยู่** ปัจจุบัน = ค่าโฆษณา ÷ Lead **เฉพาะช่องทางโฆษณา (Facebook Ads, Google Ads)** ไม่ใช่ Lead ทั้งหมด → ต้องยืนยันก่อนเปลี่ยน (ข้อ D) |
| Total Leads = 0 → N/A | ทำแล้ว (แสดง "รอข้อมูล") ควรเปลี่ยนข้อความเป็น N/A |
| ตัวกรองสอดคล้อง | มีตัวกรองวันที่/ช่องทาง/Campaign/พื้นที่/Service |

### TASK 3 — Facebook Ads Action Names
- ค่าจริงในไฟล์ตัวอย่างขึ้นต้นด้วย **`actions:`** (ตัวพิมพ์เล็ก, พหูพจน์) ไม่ใช่ `Action:` ตามตัวอย่างใน Master: `actions:post_engagement` (43 แถว), `actions:like` (16), `actions:link_click` (11), `actions:leadgen.other` (1), `reach` (3 ไม่มี prefix), ว่าง 29 แถว → ต้องยืนยัน (ข้อ C)
- ปัจจุบันแสดงค่าต้นฉบับตรง ๆ ใน UI, ตัวกรอง, สรุป, Export ยังไม่มี Normalization · ค่าดิบเก็บอยู่ใน `result_indicator` และ `raw_json`

### TASK 4 — Lead Management
| ฟิลด์ใน Master | คอลัมน์ที่มีอยู่ | สถานะ |
|---|---|---|
| Date / Lead Date | `received_at` | มีแล้ว |
| Channel (Dropdown ตัวเลือกเดิม) | `source_channel` (10 ตัวเลือก) | มีแล้ว ต้องคงไว้ |
| Name / Phone | `customer_name`, `phone` | มีแล้ว |
| **Need** (ซื้อ/ขาย/เช่า/สร้าง) | — (ใกล้เคียงสุด `service_category` = Product/Project/Event ซึ่งคนละความหมาย) | **ขาด** |
| **Buy Status / Sell Status** | — (ปัจจุบัน `status` = New/Contacted/Qualified/Proposal/Won/Lost) | **ขาด** |
| **Type / Condition / Price** | — | **ขาด** |
| Remark | `need_description` (ใกล้เคียง) | ต้องตัดสินใจการแมป |
| **Call Status** | — (มี `contactable`, `last_contacted_at`) | **ขาด** และ Master ยังไม่ระบุรายการตัวเลือก (ข้อ E) |
| Staff / Note | `owner_email` / `notes` | มีแล้ว (ต้องยืนยันการแมป) |
| Area | `area` | มีแล้ว |
| Lead ID / กันซ้ำ | `lead_id` (UUID) + `lead_code` + เตือนซ้ำเบอร์/อีเมล | มีแล้ว |
- **ผลกระทบสำคัญ:** `status` เดิมถูกใช้โดย Dashboard (Qualified Leads, Won, Lead-to-Sale, CPL ต่อ Qualified, กราฟ Pipeline), `service_category` เป็นฟิลด์บังคับและเป็นตัวกรอง, การลบ Lead/การเชื่อม Sales ผูกกับ `lead_id` → การเปลี่ยน Status Logic ต้องไม่ทำให้ส่วนเหล่านี้พัง (ข้อ E)

### Part 3 — Website Analytics: **ยังไม่มีเลย** (ไม่มีแท็บ/หน้าจอ/ตัวนำเข้า) · มีตัวอ่าน CSV และ xlsx ให้นำกลับมาใช้ · **ต้องมีไฟล์ตัวอย่างเพื่อกำหนด Business Key** (ข้อ F)
### Part 4 — Marketing Performance Dashboard: **ยังไม่มีหน้านี้** · ข้อมูลที่มีให้ใช้: Google Ads Spend/Clicks (รายแคมเปญต่อช่วงรายงาน และรายวันจาก Time series), Facebook Reactions/Comments/Shares/Views/Reach/Seconds viewed · **ไม่มี** Website Users/Page Views/Duration
### Part 5 — YoY: **ยังไม่มี** · ข้อมูลที่นำเข้ามีเฉพาะ **ก.ย. 2026** ไม่มีข้อมูลปี 2025 ทุก KPI จะขึ้น Missing Data/N/A จนกว่าจะนำเข้าข้อมูลปีก่อน (โครงสร้างคีย์รองรับช่วงเวลาหลายช่วงอยู่แล้ว)
### Part 6 — Export & Looker: มี Export 23 ชุด หัวคอลัมน์คงที่ ตามลำดับ schema · **ไม่ทราบว่า Looker เชื่อมกับอะไร** (ข้อ G)

## 5) ความเสี่ยงและแผนป้องกัน
| # | ความเสี่ยง | แผนป้องกัน |
|---|---|---|
| R1 | เปลี่ยน Key ของ FB_PAGE_POSTS อาจทำให้แถวเดิมซ้ำกับแถวใหม่ หรือข้อมูลเดิมถูกตีความผิด | เพิ่มคอลัมน์ `metric_date` ต่อท้าย (ไม่แก้ของเดิม) · แถวเดิมไม่ถูกแก้ไข (อ่านเป็น legacy: metric_date = snapshot_date ที่ฝั่งอ่าน) · ตรวจคีย์ทั้งแบบเก่า/ใหม่ตอนนำเข้า · ทดสอบกับข้อมูลเดิมก่อน |
| R2 | เมื่อมีหลายแถวต่อโพสต์ การรวม Reach/Views ใน Dashboard, สรุปรายเดือนและ Export จะนับซ้ำ | กำหนดนิยามก่อน (ใช้ค่า Snapshot ล่าสุดต่อโพสต์ หรือแยกชนิด Metric) และแก้ `dashboard.ts`, `export/service.ts`, หน้า Facebook Page พร้อมกันใน Phase 1 (เหตุผล: ต้องแก้ร่วมกันเพื่อไม่ให้ตัวเลขผิดระหว่างทาง) |
| R3 | Looker Studio อาจอ้างอิงคอลัมน์/ค่าเดิม | ไม่เปลี่ยนชื่อ/ลำดับคอลัมน์เดิม · เพิ่มคอลัมน์ต่อท้ายเท่านั้น · ถ้าต้องเปลี่ยนค่า (เช่น action name) ให้เก็บค่าเดิมไว้ในคอลัมน์เดิมและเพิ่มคอลัมน์ใหม่ · ตรวจกับวิธีเชื่อม Looker ของผู้ใช้ก่อน Phase 8 |
| R4 | เปลี่ยน Lead Status Logic แล้ว KPI เดิม (Qualified/Won/Lead-to-Sale) พัง | คงคอลัมน์เดิมทั้งหมด เพิ่มคอลัมน์ใหม่ · กำหนดวิธีแมปเก่า↔ใหม่กับผู้ใช้ก่อนเริ่ม Phase 4 |
| R5 | นิยาม CPL ที่เปลี่ยน ทำให้ตัวเลขเดิมที่ทีมเคยดูเปลี่ยน | แสดงสูตรบนหน้าจอ · (ถ้าผู้ใช้ต้องการ) เก็บ "CPL เฉพาะ Lead จากโฆษณา" เป็นตัวชี้วัดแยก |
| R6 | ข้อมูลจริงใน Sheet (โดยเฉพาะ Leads) อาจมีอยู่แล้ว | สำรองข้อมูลก่อนทุก Phase ที่เปลี่ยน Schema · ไม่ Migration ที่แก้ข้อมูลเดิมโดยไม่ขออนุญาต |
| R7 | ข้อจำกัดแพ็กเกจฟรี (Workers CPU 10 ms, Sheets API ~60 calls/นาที, ไม่มี lock) | Phase 6–7 อ่านข้อมูลหลายแท็บ/หลายช่วงเวลา → ใช้อ่านเฉพาะคอลัมน์และรวมการเรียก (ตามแนวทางเดิม) และทดสอบจำนวน API calls |
| R8 | Website Metrics ถูกตีความเป็นผลของ Paid Ads | แสดงป้ายชัดเจนว่าเป็น Metrics รวมทุกช่องทาง ไม่ใช่ Attribution (ตาม Master ข้อ 4.1) |
| R9 | ส่วนที่ทำไปก่อนหน้า (นอก Master) เช่น Sales, Export ถูกกระทบ | รัน `tests/run-all.sh` (153 รายการ) ทุก Phase เพื่อจับ Regression |

## 6) แผนสำรองข้อมูลและกู้คืน (ทำก่อน Phase 1)
**ทำโดยผู้ใช้ (ระบบไม่มีฟังก์ชันสำรองอัตโนมัติ):**
1. เปิด Google Spreadsheet → **File → Make a copy** ตั้งชื่อ `BACKUP_ก่อน-Phase1_YYYY-MM-DD` เก็บในโฟลเดอร์ Drive ส่วนตัว (ไม่แชร์)
2. **File → Download → Microsoft Excel (.xlsx)** เก็บไว้อีกชุด
3. ตั้งชื่อเวอร์ชันปัจจุบัน: File → Version history → Name current version → `ก่อน Phase 1`
4. เก็บไฟล์ CSV/Excel ต้นฉบับที่นำเข้าแล้วทั้งหมด
5. จดจำนวนแถวของแท็บสำคัญ (FB_PAGE_POSTS, META_ADS, GOOGLE_ADS_CAMPAIGNS, LEADS, LINE_OA_MONTHLY, SALES_TRANSACTIONS) เพื่อเทียบหลังพัฒนา
6. เปิดไฟล์สำเนาดูว่าเปิดได้และจำนวนแถวตรงกัน (ยืนยันว่ากู้คืนได้จริง)

**วิธีกู้คืน:** คัดลอกแท็บจากสำเนากลับ (คลิกขวาแท็บ → Copy to → Existing spreadsheet) หรือเปลี่ยน `GOOGLE_SHEET_ID` ใน Cloudflare ไปชี้สำเนาแล้วแชร์ให้ Service Account เป็น Editor · โค้ดย้อนกลับได้ด้วย Git (revert commit) เพราะ Deploy จาก GitHub
**หลักการของผม:** ทุก Migration เป็นแบบเพิ่มคอลัมน์ต่อท้าย ไม่ลบ/ไม่เขียนทับข้อมูลเดิม

## 7) ลำดับการพัฒนาและไฟล์ที่คาดว่าจะเปลี่ยน
| Phase | ไฟล์/ส่วนที่คาดว่าจะแก้ (ประมาณการจากโค้ดปัจจุบัน) | ผลกระทบ Schema |
|---|---|---|
| 1 | `lib/import/specs.ts`, `lib/import/plan.ts`, `lib/schema.ts`, `lib/dashboard.ts`, `lib/dashboard-data.ts`, `lib/export/datasets.ts` + `service.ts`, `app/(app)/facebook-page/page.tsx`, หน้าพรีวิวนำเข้า, เทสต์ | เพิ่ม `metric_date` ต่อท้าย FB_PAGE_POSTS (+ คอลัมน์ที่จำเป็น) |
| 2 | `lib/dashboard.ts`, `app/(app)/page.tsx`, เทสต์ | ไม่มี |
| 3 | ฟังก์ชัน normalize ใหม่ + `facebook-ads/page.tsx`, `lib/export/*`, เทสต์ | อาจเพิ่ม 1 คอลัมน์ต่อท้าย META_ADS (ตามที่ตกลง) |
| 4 | `lib/leads.ts`, `leads-service.ts`, `LeadsManager.tsx`, `lib/schema.ts`, `lib/dashboard.ts` (การแมปสถานะ), Export | เพิ่มคอลัมน์ใหม่ต่อท้าย LEADS |
| 5 | สเปกนำเข้าใหม่ + แท็บ `WEBSITE_ANALYTICS` + ฟอร์มกรอกเอง + หน้าจอ/Export | แท็บใหม่ |
| 6 | หน้าใหม่ `marketing-performance` + เมนู (เพิ่มรายการใหม่ ไม่แก้ของเดิม) | ไม่มี |
| 7 | โมดูลคำนวณ YoY + ใช้ในหน้า Overview/Performance | ไม่มี |
| 8 | `lib/export/*` | ไม่มี (หรือเพิ่มชุดข้อมูลใหม่) |
| 9–10 | เทสต์รวม, เอกสาร | ไม่มี |

## 8) ข้อมูลที่ต้องการจากผู้ใช้
**ต้องมีก่อนเริ่ม Phase 1**
- **A.** ไฟล์ Facebook Page ที่จะนำเข้าต่อไป: คอลัมน์ `Date` เป็นวันที่รายวันจริง ๆ หรือเป็น "Lifetime" เหมือนไฟล์ตัวอย่าง? ถ้าเป็น Lifetime ต้องการให้ `metric_date` = วันที่ส่งออก (snapshot) หรือแนวทางอื่น? (ถ้ามีไฟล์ตัวอย่างแบบรายวัน กรุณาส่งมา)
- **G.** Looker Studio เชื่อมกับอะไร (Google Sheets โดยตรง หรืออัปโหลด CSV ที่ Export) และใช้แท็บ/คอลัมน์ไหน
- **H.** สถานะ Sheet จริง: ผลจาก ตั้งค่า → ตรวจสอบระบบ และจำนวนแถวของ FB_PAGE_POSTS, LEADS (มีข้อมูล Lead จริงแล้วหรือไม่)
- **สำรองข้อมูลตามหัวข้อ 6 เรียบร้อยแล้ว**

**จะถามเมื่อถึง Phase ที่เกี่ยวข้อง**
- **C (Phase 3).** ค่าจริงขึ้นต้นด้วย `actions:` ไม่ใช่ `Action:` ให้ตัด `actions:` (และ `Action:`) หรือไม่ · ให้ Export แสดงชื่อที่ตัดแล้ว (พร้อมเก็บค่าเดิมไว้อีกคอลัมน์) ตกลงไหม
- **D (Phase 2).** CPL = Total Paid ÷ Total Leads ทั้งหมดตาม Master ให้เปลี่ยนแทนนิยามเดิม (เฉพาะ Lead จากช่องทางโฆษณา) หรือเก็บทั้งสองอย่างแยกกัน
- **E (Phase 4).** (1) ตัวเลือก Call Status มีอะไรบ้าง (2) `status` เดิม New/Contacted/Qualified/Proposal/Won/Lost จะไปทางไหนเมื่อมี Buy/Sell Status — Dashboard เดิมใช้ Qualified/Won/Lead-to-Sale ต้องการนิยามใหม่อย่างไร (3) Remark/Staff/Note แมปกับคอลัมน์เดิมตามหัวข้อ 4 หรือไม่
- **F (Phase 5).** ไฟล์ตัวอย่าง Website Analytics (CSV/Excel) เพื่อดูความละเอียดของข้อมูล (รายวัน/รายเดือน) และหน่วยของ Duration

## 9) Test Results (Phase 0)
**Passed (Baseline ก่อนแก้ไข รันวันนี้ ไม่มีการแก้โค้ด):** security 12 · import 32 (ไฟล์ CSV ตัวอย่างจริง) · dashboard 19 · sales 18 · e2e 72 (Google Sheets จำลอง) = **153 รายการผ่านทั้งหมด**
**Failed:** 0
**Not Tested (ยังไม่ได้ทดสอบจริง):**
- Google Sheet จริงและ Looker Studio ของผู้ใช้
- รายงานยอดขาย Excel กับไฟล์จริง, หน้า Sales/Export/ปุ่มลบ Lead/ตรวจสอบระบบ บนเว็บจริง
- การใช้งานบนมือถือ, การเปิดไฟล์ Export ใน Excel
- ข้อ 1–12 ของ Phase 0 ที่ต้องเห็นระบบจริง: โครงสร้างแท็บที่มีอยู่จริงใน Sheet ของผู้ใช้

## 10) Known Issues / งานค้างจากก่อน Master Prompt
- ฟอร์มกรอก Sales (ดีล) ด้วยมือ, หน้าจัดการผู้ใช้/Area mapping, การเก็บไฟล์ต้นฉบับใน Drive อัตโนมัติ ยังไม่ได้ทำ (ดู docs/ACCEPTANCE.md) — ไม่อยู่ในขอบเขต Master Prompt นี้
- Google Sheets ไม่มี lock (ใช้แบบ Single Writer)

## 11) Next Phase
**Phase 1 — Facebook Page CSV Schema & Import** เริ่มเมื่อผู้ใช้สั่ง "ทำขั้นต่อไป" (ข้อ A, G, H ได้รับคำตอบแล้ว ดูหัวข้อ 12)

## 12) ผลการตัดสินใจของผู้ใช้ (หลัง Phase 0) — บันทึกแล้ว
| ข้อ | คำตอบของผู้ใช้ | ผลต่อแผน |
|---|---|---|
| G | **ตัด Looker Studio ออก** | ถอด "Looker Compatibility" ออกจากขอบเขตและ Definition of Done · Phase 8 เหลือเฉพาะ Export CSV (ยังคงหัวคอลัมน์คงที่เป็นแนวปฏิบัติที่ดี แต่ไม่ต้องรักษาความเข้ากันได้กับ Looker เดิม) |
| A | **ไฟล์ Facebook Page ต่อไปเป็นข้อมูลรายวัน** (`Date` เป็นวันที่) | `metric_date` มาจาก `Date` · ยังไม่มีไฟล์รายวันตัวอย่าง → Phase 1 จะทำตัวอ่านวันที่ที่ตรวจรูปแบบ (MM/DD/YYYY ตามรูปแบบของ Publish time ใน Facebook, หรือ YYYY-MM-DD) และแสดงในพรีวิวให้ยืนยัน ถ้าพบวันที่กำกวมจะไม่เดา · ไฟล์ที่ `Date` = "Lifetime" ยังรองรับ (metric_date = วันที่ส่งออกที่ผู้ใช้ยืนยัน และระบุว่าเป็นยอดสะสม) |
| H | **ไม่มีข้อมูลจริงใน Sheet** | ไม่ต้อง Migration ข้อมูลเดิม |
| 6 (สำรองข้อมูล) | **ข้อมูลทั้งหมดเป็นม็อกอัป ลบออกได้ทั้งหมด** | ยกเว้นขั้นตอนสำรองข้อมูลก่อน Phase 1 · ไม่ต้องรองรับแถวเดิมรูปแบบคีย์เก่า (ผู้ใช้ลบแถวข้อมูลของแท็บเอง โดยคงแถวหัวตาราง) · **ผมไม่มีสิทธิ์เข้าถึง Sheet จริงจึงลบให้ไม่ได้** และจะไม่เพิ่มเครื่องมือลบข้อมูลถ้าไม่ได้ขอ |
| C | **ตกลง** | Phase 3: ตัด prefix `actions:` / `Action:` (ไม่สนตัวพิมพ์) ใน UI ตัวกรอง สรุป และ Export · เก็บค่าเดิมไว้ในคอลัมน์เดิม + `raw_json` |
| D | **เก็บแยกกัน** | Phase 2: แสดง 2 ตัว — **CPL จาก Ads** (Total Paid ÷ Lead จากช่องทางโฆษณา: Facebook Ads, Google Ads) และ **CPL ทั้งหมด** (Total Paid ÷ Total Leads) พร้อมคำอธิบายสูตร · ตัวหารเป็น 0 → N/A |
| E 4.1 | Call Status = **ยังไม่ได้โทร / ติดต่อไม่ได้ / ติดต่อได้แล้ว** | Phase 4 |
| E 4.2 | เลือก **Need** ก่อน: **ซื้อ / เช่า / สร้าง → Buy Status** (Hot, Warm, Cold, Archive, Close) · **ขาย → Sell Status** (นัดทำสัญญา, ทำสัญญา, เซ็นสัญญา, ยกเลิก, เป็นนายหน้า, บ้านไม่พร้อมขาย, ขายแล้ว, สัญญาเปิด) | **คำตอบนี้แทนที่ข้อกำหนดเดิมใน Master** (เดิม ซื้อ/เช่า/สร้าง → Sell Status และ ขาย → Buy Status) และเปลี่ยนรายการ Sell Status ("นัดหมาย" → "นัดทำสัญญา", เพิ่ม "สัญญาเปิด") |
| F | **Website Analytics รอข้อมูล ข้ามไปก่อน** | Phase 5 ข้าม · Phase 6/7 จะทำเฉพาะส่วนที่มีข้อมูลจริง (Google Ads, Facebook) ส่วน Website จะไม่แสดงตัวเลขจนกว่าจะมีข้อมูล |

### ที่ยังไม่ได้ตัดสินใจ (ถามเมื่อถึงเฟสนั้น)
- **Phase 4:** (1) `status` เดิม New/Contacted/Qualified/Proposal/Won/Lost และ KPI Qualified/Won/Lead-to-Sale ใน Dashboard ให้เป็นอย่างไร (2) ใช้ป้ายตามเอกสารเดิม "Hot 1 m / Warm 1–3 m / Cold 3–6 m / Archive 6 m up / Close" หรือแบบสั้น Hot/Warm/Cold/Archive/Close (3) การแมป Remark → `need_description`, Staff → `owner_email`, Note → `notes`
- **Phase 1:** ถ้ามีไฟล์รายวันตัวอย่าง ส่งมาเพื่อทดสอบกับของจริง (ไม่บังคับ)

### ข้อควรทำก่อนทดสอบ Phase 1
ลบแถวข้อมูลของแท็บ `FB_PAGE_POSTS` (เลือกแถวที่ 2 ลงไป → คลิกขวา → Delete rows โดยเก็บแถวหัวตารางไว้) เพื่อไม่ให้ปนกับแถวรูปแบบคีย์เก่า

---

## 13) รายงาน Phase 1 — Facebook Page CSV Schema & Import

**ฐานโค้ด:** เริ่มจาก `buriram-nayoo-dashboard-final.zip` (เวอร์ชันที่ deploy อยู่ รวมปุ่มลบ Lead) · Baseline ก่อนแก้: 153/153 ผ่าน

### ไฟล์ตัวอย่างรายวันที่ใช้ตรวจ (`Sep-01-2026_Sep-30-2026_4677103402520791.csv`)
- 390 แถว, 26 คอลัมน์ ตรงกับรายการใน Master ทุกคอลัมน์ · **ไม่มี** Views, Reach, Total/Other/Link Clicks
- `Date` = MM/DD/YYYY (01/09–30/09/2026), 13 โพสต์ (12 ของเพจบุรีรัมย์น่าอยู่ + 1 ของ BAAN), ไม่มีคีย์ซ้ำ
- ตัวเลขเป็น **ยอดของแต่ละวัน** (14 ชุดข้อมูลมีขึ้นลง จึงไม่ใช่ยอดสะสม) → รวมข้ามวันได้
- Facebook ใส่แถวของทุกวันตั้งแต่ 01/09 แม้โพสต์ยังไม่เผยแพร่: 271 แถวก่อนวันเผยแพร่ โดย **270 แถวเป็น 0 ทั้งหมด และ 1 แถวมีค่า** (Seconds viewed 3.07)

### สิ่งที่ทำแล้ว
1. **Mapping จาก Header จริง:** รองรับ 26 คอลัมน์ของไฟล์รายวัน + คอลัมน์ของไฟล์เดิม (Views, Reach, Clicks) · คอลัมน์ที่ไม่มีในไฟล์ = เตือนและเว้นว่าง ไม่ทำให้ล้ม · ต้นฉบับทั้งแถวเก็บใน `raw_json`
2. **metric_date แยกจาก publish_time:** `metric_date` มาจาก `Date` เท่านั้น (ตรวจลำดับ วัน/เดือน จากค่าทั้งไฟล์: มีค่า >12 ตำแหน่งไหนก็รู้ลำดับ · ทุกค่า ≤12 = ใช้ เดือน/วัน ตาม Facebook และเตือน · ปนกันสองแบบ = ปฏิเสธ) · `publish_time` มาจาก `Publish time` · `Date` = Lifetime → `metric_date` = วันที่ส่งออกที่ผู้ใช้ยืนยัน, `metric_scope` = lifetime
3. **Business Key:** `page_id + post_id + metric_date` · โพสต์เดิมวันใหม่ = เพิ่มแถวใหม่ · คีย์เดิมค่าเหมือนเดิม = ข้าม · **คีย์เดิมค่าเปลี่ยน = อัปเดตเป็นค่าล่าสุด** (Facebook ปรับตัวเลขย้อนหลังได้; หลักเกณฑ์นี้แสดงในหน้าพรีวิว) · ไฟล์เดิมซ้ำทั้งไฟล์ = บล็อก (Admin ยืนยันได้ แต่ข้ามทุกแถว)
4. **แถวว่างก่อนวันเผยแพร่:** ข้ามเฉพาะแถวที่ "ก่อนวันเผยแพร่ และทุกสถิติเป็น 0/ว่าง" · แถวก่อนวันเผยแพร่ที่มีค่าถูกเก็บและเตือน → ยอดรวมหลังนำเข้าเท่ากับยอดรวมทั้งไฟล์
5. **กฎสรุปไม่นับซ้ำ (`lib/fbmetrics.ts` ใช้ร่วมกันทุกจุด):** รายวันรวมข้ามวันได้ · Lifetime ใช้เฉพาะ snapshot ล่าสุดต่อโพสต์ · ไม่บวก Lifetime กับรายวัน · ค่าเฉลี่ย (Average Seconds viewed, Ad CPM) ไม่รวม · ผลรวม Reach เรียกว่าผลรวม ไม่ใช่ Unique Reach · สถิติกรองตาม metric_date, จำนวนโพสต์กรองตามวันเผยแพร่
6. **หน้าพรีวิวการนำเข้า:** แสดงจำนวนแถวรายวัน/Lifetime, ช่วงวันที่ของสถิติ, รูปแบบวันที่ที่อ่านได้ และหลักเกณฑ์ อัปเดต/ข้าม · ช่องวันที่ส่งออกแสดงเฉพาะเมื่อไฟล์มีแถว Lifetime

### เหตุผลที่แก้มากกว่า 1 โมดูล (Master 1.2 ข้อ 8)
เมื่อคีย์เปลี่ยนเป็นหลายแถวต่อโพสต์ โค้ดเดิมที่ **บวกทุกแถว** ใน Dashboard, หน้า Facebook Page และสรุปรายเดือนจะนับซ้ำทันที (ผิดข้อ 1.2.5 และ TASK 1 กฎการคำนวณ) จึงต้องเปลี่ยนจุดที่อ่าน FB_PAGE_POSTS ในรอบเดียวกัน โดยใช้กฎกลางไฟล์เดียว · ส่วน KPI อื่นของ Overview (Total Paid, Leads, CPL) **ไม่ได้แตะ** รอ Phase 2

### ไฟล์ที่เปลี่ยน (12 ไฟล์ในแอป + เทสต์)
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/fbmetrics.ts` (ใหม่) | กฎสรุปสถิติ Facebook ใช้ร่วมกัน |
| `src/lib/import/normalize.ts` | ตรวจลำดับวันที่ + แปลง metric_date |
| `src/lib/import/specs.ts` | สเปก Facebook Page: signature ใหม่ (ไม่บังคับ Views/Reach), คีย์ใหม่, ฟิลด์ใหม่ 8 ฟิลด์ |
| `src/lib/import/plan.ts` | metric_date/metric_scope, กฎแถวว่างก่อนเผยแพร่, ข้อมูลสรุปสำหรับพรีวิว |
| `src/lib/import/service.ts` | ส่งข้อมูลสรุป metric ไปหน้าพรีวิว |
| `src/lib/schema.ts` | FB_PAGE_POSTS เพิ่ม 10 คอลัมน์ต่อท้าย |
| `src/lib/dashboard.ts`, `src/lib/dashboard-data.ts` | การ์ด Facebook ใช้กฎกลาง + เพิ่มการ์ด Reactions+Comments+Shares |
| `src/lib/export/datasets.ts`, `src/lib/export/service.ts` | Export กรองตาม metric_date · สรุปรายเดือนนับโพสต์ไม่ซ้ำ + 4 คอลัมน์ใหม่ต่อท้าย |
| `src/components/ImportWizard.tsx` | ข้อมูล metric_date ในพรีวิว |
| `src/app/(app)/facebook-page/page.tsx` | กรองตามวันที่ของสถิติ, มุมมองสรุปรายโพสต์/รายวัน |
| `docs/OPERATIONS.md` | แก้คำอธิบาย Facebook Page ที่ล้าสมัย |
| `tests/fbpage.test.mts` (ใหม่), `tests/import.test.ts`, `tests/e2e.test.mts`, `tests/run-all.sh`, `tests/fixtures/README.md` | เทสต์ Phase 1 |

### Data / Schema Impact
- **FB_PAGE_POSTS:** เพิ่ม 10 คอลัมน์ **ต่อท้าย** `metric_date, metric_scope, duration_sec, caption_type, is_crosspost, is_share, languages, custom_labels, funded_content_status, data_comment` · 30 คอลัมน์เดิมไม่เปลี่ยนชื่อ/ลำดับ · ต้องกด **เตรียม Google Sheet** หลัง deploy
- `row_key` รูปแบบใหม่ `page_id|post_id|metric_date` — แท็บต้องว่างก่อน (ผู้ใช้ลบข้อมูลม็อกอัปแล้ว)
- `marketing_monthly_summary.csv`: เพิ่ม 4 คอลัมน์ต่อท้าย `fb_daily_engagement, fb_daily_seconds_viewed, fb_daily_reach_sum, fb_daily_link_clicks` · `fb_posts_published` นับโพสต์ไม่ซ้ำ (เดิมนับแถว ซึ่งจะผิดเมื่อมีหลายแถวต่อโพสต์)
- `facebook_page_posts.csv`: ตัวกรองวันที่เปลี่ยนจากวันเผยแพร่เป็น metric_date
- ไม่มีการลบหรือเขียนทับข้อมูลใน Sheet (ไม่มีโค้ด migration ที่แก้ข้อมูลเดิม)

### Test Results
**Passed (รันจริง):** 183/183
| ชุด | ผล |
|---|---|
| fbpage (ใหม่ · ไฟล์รายวันจริง + Page.csv) | 22/22 |
| e2e (Sheets จำลอง · รวมส่วนที่ 13 ใหม่ 7 ข้อ) | 79/79 |
| import (ไฟล์จริงทั้ง 20 ไฟล์ รวมไฟล์รายวัน) | 33/33 |
| dashboard | 19/19 |
| sales | 18/18 |
| security | 12/12 |
| Production build (`opennextjs-cloudflare build`) | ผ่าน |

ตัวเลขที่ยืนยันจากไฟล์รายวันจริง: 390 แถว → เพิ่ม 120 / ข้าม 270 · Reactions 605, Comments 50, Shares 30, Reactions+Comments+Shares 685, Seconds viewed 1,660,392.441 (เท่ากับทั้งไฟล์) · ไม่รวมเพจ BAAN: Reactions+Comments+Shares = 319 · นำเข้าซ้ำ: เพิ่ม 0 · ไฟล์ทับบางส่วน + วันใหม่ (01/10): เพิ่มเฉพาะ 13 แถวของวันใหม่ · ค่าวันเดิมเปลี่ยน: อัปเดต 1 แถว · Page.csv (Lifetime): 55 แถว, Reach 191,119 / Link Clicks 2,646 ในสรุปยังเท่าเดิม

**Failed:** 0

**Not Tested:**
- การนำเข้าบนเว็บจริงกับ Google Sheet จริงของผู้ใช้ (ทดสอบกับ Sheets จำลองเท่านั้น)
- หน้าจอ Facebook Page / พรีวิวการนำเข้า บนเบราว์เซอร์จริงและมือถือ
- ไฟล์รายวันที่มีคอลัมน์ Reach/Views (ยังไม่มีตัวอย่าง)

### Known Issues
- ไฟล์รายวันของ Facebook **ไม่มี Reach/Views/Link Clicks** → การ์ด Reach และ Link Clicks ใน Dashboard ขึ้น "รอข้อมูล" เมื่อใช้ข้อมูลรายวัน
- ไฟล์ที่ทุกวันที่ ≤ 12 (เช่น ส่งออกแค่ 1–12 ของเดือน) แยกวัน/เดือนไม่ได้ ระบบใช้ เดือน/วัน และเตือน ผู้ใช้ต้องตรวจช่วงวันที่ในพรีวิว
- ถ้าแท็บ FB_PAGE_POSTS ยังมีแถวคีย์รูปแบบเก่า (ก่อน Phase 1) แล้วนำเข้า Lifetime ซ้ำ จะได้แถวใหม่คนละคีย์ — ไม่เกิดในระบบนี้เพราะผู้ใช้ลบข้อมูลแล้ว
- เพิ่มการ์ด Reactions + Comments + Shares ใน Overview (เพื่อไม่ให้กลุ่ม Facebook ว่างเมื่อไฟล์รายวันไม่มี Reach) — ทบทวนได้ใน Phase 2

### Next Phase
**Phase 2 — Marketing Overview KPI:** Total Paid Media Spend (สถานะ Data Incomplete), Total Leads (นับ `lead_id` ไม่ซ้ำตามวันที่รับ Lead), CPL 2 ตัวตามที่ตกลง (จาก Ads / ทั้งหมด) และ N/A เมื่อหารด้วยศูนย์ — เริ่มเมื่อผู้ใช้สั่ง "ทำขั้นต่อไป"

## 14) รายงาน Phase 2 — Marketing Overview KPI

### สิ่งที่ทำแล้ว
- **Total Paid Media Spend** = Meta Ads Spend + Google Ads **Campaign Report** Spend เท่านั้น (ไม่รวมรายงานรายละเอียดของ Google และ Facebook Page Organic) — เหมือนเดิม แต่เพิ่มการตรวจความครบ:
  - ไม่มีข้อมูลของแพลตฟอร์มใดในช่วงที่เลือก → แสดงยอดที่มี + ป้ายสีเหลือง **"ข้อมูลไม่ครบ: ไม่มีข้อมูล Google Ads ในช่วงนี้"** (การ์ด Google ขึ้น รอข้อมูล ไม่ใช่ 0)
  - แพลตฟอร์มมีรายงานไม่เต็มช่วง → ระบุช่วงที่ขาด เช่น "Google Ads ไม่มีรายงานช่วง 16/09/2026–30/09/2026" (ช่วงรายงานที่ต่อกัน เช่น 1–15 + 16–30 นับว่าครบ)
  - ไม่มีรายงานโฆษณาเลยในช่วง → **รอข้อมูล** (ไม่แสดง 0 บาท)
  - กรองช่องทาง/แคมเปญ → ไม่นับแพลตฟอร์มที่ถูกกรองออกว่าขาดข้อมูล
- **Total Leads** = จำนวน `lead_id` **ไม่ซ้ำ** ตามวันที่รับ Lead (`received_at`) ในช่วงที่เลือก · แถวไม่มี lead_id ไม่นับ และขึ้นคำเตือน · มี Lead ในระบบแต่ไม่มีในช่วง = 0 · ยังไม่มี Lead เลย = รอข้อมูล
- **CPL 2 ตัวตามข้อ D** + Cost per Qualified Lead เดิม:
  - **CPL (Lead จากโฆษณา)** = Total Paid ÷ Lead จากช่องทาง Facebook Ads / Google Ads
  - **CPL (Lead ทั้งหมด)** = Total Paid ÷ Total Leads
  - **ใช้ช่วงเวลาเดียวกัน:** เลือกช่วงวันที่ → ใช้ช่วงนั้น · ไม่เลือก → ใช้ช่วงของรายงานโฆษณาที่มี (Lead นอกช่วงรายงานโฆษณาไม่นับ) · การ์ดแสดง "ฐาน N Lead ที่รับ dd/mm/yyyy–dd/mm/yyyy"
  - ตัวหาร = 0 → **N/A** พร้อมเหตุผล "หารด้วย 0 ไม่ได้" (เดิมแสดง รอข้อมูล)
  - กรอง Service → **N/A** (ค่าโฆษณาไม่ได้แยกตามบริการ เทียบกันไม่ได้) · กรองช่องทางที่ไม่มีโฆษณา (เช่น Referral) → N/A
  - ค่าโฆษณาไม่ครบ หรือรายงานโฆษณาครอบคลุมเกินช่วงที่เลือก (เช่น เลือก 10–20 ก.ย. แต่รายงานเป็นทั้งเดือน) → แสดงค่าพร้อมป้าย **ข้อมูลไม่ครบ**
- การ์ด KPI รองรับสถานะใหม่ **N/A** และป้าย **ข้อมูลไม่ครบ** (สถานะเดิม รอข้อมูล / ไม่ได้นำมาคิด / จำกัดสิทธิ์ ยังอยู่)

### ไฟล์ที่เปลี่ยน
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/dashboard.ts` | สถานะ `na` + ฟิลด์ `incomplete`, `mergeSpans`/`gapsIn` (ตรวจช่วงรายงาน), นับ lead_id ไม่ซ้ำ, CPL 2 ตัวแบบช่วงเวลาเดียวกัน |
| `src/lib/dashboard-data.ts` | อ่านคอลัมน์ `lead_id` จากแท็บ LEADS เพิ่ม |
| `src/app/(app)/page.tsx` | การ์ดแสดง N/A และป้าย ข้อมูลไม่ครบ |
| `tests/overview.test.ts` (ใหม่), `tests/dashboard.test.ts`, `tests/run-all.sh` | ชุดทดสอบ Phase 2 และปรับค่าคาดหวังเป็น N/A |

แก้เฉพาะโมดูล Dashboard (ไม่แตะการนำเข้า/Export/Leads)

### Data / Schema Impact
- **ไม่มีการเปลี่ยน Schema ของ Google Sheets** และไม่มีการเขียน/ลบข้อมูล (Phase นี้อ่านอย่างเดียว)
- ตัวเลขเปลี่ยนเมื่อเทียบก่อน Phase 2: CPL ทั้งสองตัวไม่นับ Lead ที่รับนอกช่วงรายงานโฆษณาเมื่อไม่ได้เลือกช่วงวันที่ · การ์ดที่หารด้วย 0 เปลี่ยนจาก "รอข้อมูล" เป็น "N/A"

### Test Results
**Passed (รันจริง):** 203/203
| ชุด | ผล |
|---|---|
| overview (ใหม่ · ค่าโฆษณาจริง ก.ย. 2026 + Lead จำลอง 7 ราย) | 20/20 |
| e2e | 79/79 |
| import | 33/33 |
| fbpage | 22/22 |
| dashboard | 19/19 |
| sales | 18/18 |
| security | 12/12 |
| TypeScript (`tsc --noEmit`) และ Production build (`opennextjs-cloudflare build`) | ผ่าน |

ตัวเลขที่ยืนยัน: Total Paid = 37,557.54 + 28,814.82 = **฿66,372.36** · ไม่มี Google → 37,557.54 + ข้อมูลไม่ครบ · Lead ก.ย. 6 ราย (จาก Ads 4) + ต.ค. 1 ราย → CPL จาก Ads = 66,372.36 ÷ 4 = 16,593.09 · CPL ทั้งหมด = 66,372.36 ÷ 6 = 11,062.06 · แถวซ้ำ lead_id นับครั้งเดียว

**Failed:** 0

**Not Tested:**
- หน้า Overview บนเว็บจริงกับ Google Sheet จริง (ยังไม่มี Lead จริงในระบบ ทดสอบด้วย Lead จำลอง)
- การแสดงผลป้าย N/A / ข้อมูลไม่ครบ บนมือถือ
- Phase 1 บนเว็บจริง: ผู้ใช้ยังไม่ได้รายงานผล (พรีวิวไฟล์รายวันควรขึ้น เพิ่ม 120 / ข้าม 270)

### Known Issues
- ค่าโฆษณาเก็บเป็นยอดรวมต่อช่วงรายงาน (ไม่ใช่รายวัน) จึงตัดตามช่วงวันที่ย่อยไม่ได้ — ถ้าเลือกช่วงสั้นกว่ารายงาน ระบบใช้ทั้งรายงานและติดป้าย ข้อมูลไม่ครบ
- Lead ที่สร้างจากฟอร์ม LINE OA ใช้ช่องทางตามที่กรอก ถ้าเลือกช่องทางผิดจะเข้าผิดฐาน CPL จาก Ads (จะทบทวนใน Phase 4)

### Next Phase
**Phase 3 — Facebook Ads Action Names:** ตัด prefix `actions:` / `Action:` ออก (ข้อ C) แสดงชื่อ Action ที่อ่านง่าย — เริ่มเมื่อผู้ใช้สั่ง "ทำขั้นต่อไป"

## 15) รายงาน Phase 3 — Facebook Ads Action Names

### สิ่งที่ทำแล้ว
- ตัด prefix **`actions:`** (รูปแบบจริงในไฟล์) และ **`Action:`** (ตามตัวอย่างใน Master) ที่อยู่ **หน้าสุด** ของชื่อ Action เท่านั้น ไม่สนตัวพิมพ์เล็ก/ใหญ่ เช่น `actions:post_engagement` → `post_engagement`
- ไม่แตะคำว่า action ตำแหน่งอื่น (เช่น `offsite_conversion.custom_action`) · ค่าที่ไม่มี prefix (`reach`) และค่าว่างคงเดิม
- **ไม่รวม Action ต่างประเภท:** ถ้าค่าดิบ 2 ค่าตัดแล้วชื่อชนกัน (เช่น `actions:like` กับ `like`) จะแสดงชื่อเต็มของต้นฉบับทั้งคู่ และขึ้นคำเตือนในหน้า Facebook Ads
- **ใช้รูปแบบเดียวกันทุกที่:**
  - หน้า Facebook Ads: คอลัมน์ตาราง, ตัวกรอง (ป้ายชื่อตัดแล้ว แต่ค่าที่ใช้กรองยังเป็นค่าดิบ) และกล่อง Results แยกตาม Action
  - Export `facebook_ads.csv`: `result_indicator` และ `results_initial_indicator` เป็นชื่อที่ตัดแล้ว และเพิ่มคอลัมน์ `result_indicator_raw`, `results_initial_indicator_raw` **ต่อท้าย** เก็บค่าต้นฉบับ
- **เก็บค่าต้นฉบับ:** การนำเข้าไม่เปลี่ยน ค่าใน Google Sheet (`result_indicator`, `raw_json`) ยังเป็นต้นฉบับ การตัด prefix ทำตอนแสดงผลและส่งออก จึงใช้กับข้อมูลที่นำเข้าไว้ก่อนหน้า (ข้อมูลย้อนหลัง) ได้ทันทีโดยไม่ต้องนำเข้าใหม่

### ไฟล์ที่เปลี่ยน
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/fbactions.ts` (ใหม่) | `stripActionPrefix`, `actionLabels` (กันชื่อชน), `actionCollisions`, `normalizeActionRows` |
| `src/app/(app)/facebook-ads/page.tsx` | แสดงชื่อ Action ที่ตัดแล้วในตาราง/ตัวกรอง/สรุป + คำเตือนชื่อชน + หมายเหตุ |
| `src/lib/export/datasets.ts` | Dataset รองรับ `derive` (คอลัมน์คำนวณต่อท้าย) · facebook_ads ใช้ `normalizeActionRows` |
| `src/lib/export/service.ts` | ใช้ `derive` หลังกรองแถว |
| `tests/fbactions.test.ts` (ใหม่), `tests/e2e.test.mts` (ส่วนที่ 14), `tests/run-all.sh` | ทดสอบ Phase 3 |

### Data / Schema Impact
- **ไม่เปลี่ยน Schema ของ Google Sheets** ไม่เขียน/ลบข้อมูล
- `facebook_ads.csv`: ค่าในคอลัมน์ `result_indicator` / `results_initial_indicator` เปลี่ยนเป็นชื่อที่ตัด prefix · เพิ่ม 2 คอลัมน์ต่อท้าย · คอลัมน์เดิมลำดับเดิม

### Test Results
**Passed (รันจริง):** 216/216
| ชุด | ผล |
|---|---|
| fbactions (ใหม่ · Facebookads.csv จริง) | 9/9 |
| e2e (รวมส่วนที่ 14 ใหม่ 4 ข้อ) | 83/83 |
| overview | 20/20 |
| import | 33/33 |
| fbpage | 22/22 |
| dashboard | 19/19 |
| sales | 18/18 |
| security | 12/12 |
| TypeScript และ Production build | ผ่าน |

ตัวเลขที่ยืนยันจากไฟล์จริง (103 แถว): หลังตัด post_engagement 43, (ว่าง) 29, like 16, link_click 11, reach 3, leadgen.other 1 — จำนวนแถว, Results, Spend, Impressions, Reach ต่อ Action เท่ากับก่อนตัดทุกกลุ่ม · Spend รวม ฿37,557.54 · KPI Meta Ads Spend ใน Dashboard ไม่เปลี่ยน

**Failed:** 0

**Not Tested:**
- หน้า Facebook Ads บนเว็บจริงและมือถือ (ตรวจด้วย TypeScript/build เท่านั้น ไม่ได้เปิดหน้าจริง)
- กรณีชื่อชนกันกับข้อมูลจริง (ไฟล์ตัวอย่างไม่มี ทดสอบด้วยข้อมูลสมมติ)
- Phase 1 และ Phase 2 บนเว็บจริง: ผู้ใช้ยังไม่ได้รายงานผล

### Known Issues
- หน้าพรีวิวการนำเข้ายังแสดง Result indicator ตามไฟล์ต้นฉบับ (`actions:...`) โดยตั้งใจ เพื่อให้ตรวจกับไฟล์ได้ตรง ๆ
- ลิงก์ตัวกรองเดิมที่บันทึกไว้ยังใช้ได้ เพราะตัวกรองใช้ค่าดิบ

### Next Phase
**Phase 4 — Lead Management & Migration:** ฟิลด์ใหม่ (Need, Buy/Sell Status, Type, Condition, Price, Remark, Call Status, Staff, Note) + Logic แสดงสถานะตาม Need (ข้อ E) — เริ่มเมื่อผู้ใช้สั่ง "ทำขั้นต่อไป"

## 16) รายงาน Phase 4 — Lead Management & Migration

### การตัดสินใจของผู้ใช้ (ก่อนเริ่ม Phase 4)
| ข้อ | คำตอบ |
|---|---|
| สถานะเดิม (New/Contacted/Qualified/Proposal/Won/Lost) | **แปลงจาก Buy/Sell Status** — Qualified: Hot, Warm, Close, นัดทำสัญญา, ทำสัญญา, เซ็นสัญญา, สัญญาเปิด, เป็นนายหน้า, ขายแล้ว · Won: Close, ขายแล้ว · Lost: Archive, ยกเลิก, บ้านไม่พร้อมขาย · ที่เหลือ = กำลังติดตาม |
| Staff | **พิมพ์ชื่อเอง** (ช่องข้อความ พร้อมรายชื่อที่เคยใช้ให้เลือก) |
| หมวดบริการเดิม (Product/Project/Event) | **ไม่บังคับ แต่ยังเก็บไว้** (ยังกรองใน Dashboard ได้) |
| Need → Status | ซื้อ / เช่า / สร้าง → Buy Status · ขาย → Sell Status (ข้อ E แทนที่ข้อความใน Master) |

### สิ่งที่ทำแล้ว
- **ฟิลด์ตาม Master** (ใช้คอลัมน์เดิมเมื่อมี):
  | ฟิลด์ | คอลัมน์ |
  |---|---|
  | Date / Channel / Name / Phone / Area | `received_at` / `source_channel` (10 ตัวเลือกเดิม) / `customer_name` / `phone` / `area` — เดิม |
  | Remark | `need_description` — เดิม (เปลี่ยนป้ายเป็น Remark) |
  | Note | `notes` — เดิม |
  | Need, Buy Status, Sell Status, Type, Condition, Price, Call Status, Staff | **ใหม่** `need, buy_status, sell_status, property_type, property_condition, price_range, call_status, staff` |
- **Need/Status Logic:** ฟอร์มแสดงเฉพาะสถานะของกลุ่มตาม Need · เซิร์ฟเวอร์ตรวจซ้ำ (สถานะไม่ตรงกลุ่ม/ไม่อยู่ในรายการ → ปฏิเสธ) · เก็บเฉพาะช่องของ Need ปัจจุบัน
- **เปลี่ยน Need ข้ามกลุ่ม:** ถ้าสถานะของกลุ่มเดิมมีค่าใน Sheet → ไม่ล้างเงียบ ๆ แจ้งเตือนในฟอร์มทันที และต้องกด "ยืนยันเปลี่ยน Need" ก่อนบันทึก · Audit Log บันทึกค่าเดิมที่ถูกล้าง · เปลี่ยนภายในกลุ่มเดียวกัน (ซื้อ ↔ เช่า ↔ สร้าง) สถานะคงเดิม
- **Pipeline สำหรับ Dashboard:** คอลัมน์ `status` คำนวณอัตโนมัติจาก Buy/Sell Status (ไม่ต้องกรอก 2 สถานะ) · ติดต่อได้แล้ว + ยังไม่มีสถานะ = Contacted · qualified_at / won_at ตั้งอัตโนมัติเหมือนเดิม → Qualified Leads, Won, Lead-to-Sale, Cost per Qualified Lead ใช้งานต่อได้ ไม่ต้องแก้ Dashboard
- **Call Status** (ยังไม่ได้โทร / ติดต่อไม่ได้ / ติดต่อได้แล้ว) ค่าเริ่มต้น ยังไม่ได้โทร · ซิงก์ช่อง `contactable` เดิม (ได้ = TRUE, ไม่ได้ = FALSE)
- **หน้า Leads:** ฟอร์มเรียงตาม Master · ข้อมูลรองพับไว้ใน "ข้อมูลเพิ่มเติม" (บริษัท อีเมล Campaign หมวดบริการ วันติดตาม UTM) · **ดูรายละเอียด** (หน้าดูอย่างเดียว) · แก้ไข · ลบ (เดิม) · เปลี่ยน Status และ Call Status จากตารางได้ทันที
- **ค้นหาและกรอง:** ช่วงวันที่รับ Lead, Channel, Need, Status (ตาม Need ที่เลือก), Call Status, Staff, พื้นที่, หมวดบริการ · ค้นหาชื่อ/เบอร์/รหัส/Staff/Remark/Note
- **กันข้อมูลซ้ำ:** lead_id/lead_code เดิม + เตือนเบอร์/อีเมลซ้ำ (เดิม)
- **Export:** `leads.csv` มีคอลัมน์ใหม่ต่อท้ายอัตโนมัติ (ตัวกรองเดิม: วันที่/พื้นที่/ช่องทาง/Campaign)

### Migration และข้อมูลเดิม
- เพิ่ม 8 คอลัมน์ **ต่อท้าย** แท็บ LEADS ผ่านปุ่ม **เตรียม Google Sheet** (ไม่เปลี่ยนชื่อ/ลำดับคอลัมน์เดิม ไม่แก้ข้อมูลเดิม) · ถ้ายังไม่กด ระบบปฏิเสธการบันทึก Lead (กันเขียนผิดคอลัมน์)
- Lead เก่าที่ยังไม่มี Need: แสดงได้ นับใน Dashboard ตามสถานะเดิม · ตอนแก้ไขต้องเลือก Need · ใส่ Need อย่างเดียวไม่ลดขั้น Pipeline เดิม (เช่น Proposal ยังเป็น Proposal) จนกว่าจะเลือก Buy/Sell Status
- `owner_email` เดิมไม่แสดงในฟอร์มแล้ว แต่ค่าเดิมยังเก็บไว้ (ไม่ถูกลบ)

### ไฟล์ที่เปลี่ยน
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/schema.ts` | LEADS เพิ่ม 8 คอลัมน์ต่อท้าย |
| `src/lib/leads.ts` | รายการตัวเลือก, Need → Status, `pipelineOf`, `resolveNeedStatus`, Validation, ตัวกรองใหม่ |
| `src/lib/leads-service.ts` | ยืนยันการเปลี่ยน Need, คำนวณ status/contactable, รายชื่อ Staff, Audit ละเอียดขึ้น |
| `src/components/LeadsManager.tsx` | ฟอร์ม/ตาราง/ตัวกรอง/หน้าดูรายละเอียดใหม่ |
| `src/app/(app)/leads/page.tsx` | ปรับการเรียก Component |
| `tests/e2e.test.mts` | ปรับส่วนที่ 8, 11, 12 ให้ใช้ Need/Buy Status + ส่วนที่ 15 ใหม่ (13 ข้อ) |

### Data / Schema Impact
- **LEADS:** +8 คอลัมน์ต่อท้าย `need, buy_status, sell_status, property_type, property_condition, price_range, call_status, staff` → **ต้องกด ตั้งค่า → เตรียม Google Sheet หลัง deploy**
- คอลัมน์ `status` ยังอยู่ แต่ค่าถูกคำนวณจาก Buy/Sell Status เมื่อบันทึก (Lead ใหม่จะไม่มีค่า Proposal)
- `leads.csv`: +8 คอลัมน์ต่อท้าย

### Test Results
**Passed (รันจริง):** 229/229
| ชุด | ผล |
|---|---|
| e2e (ส่วนที่ 15 ใหม่ 13 ข้อ + ปรับส่วน Lead เดิม) | 96/96 |
| overview / fbactions / fbpage / import / dashboard / sales / security | 20 / 9 / 22 / 33 / 19 / 18 / 12 |
| TypeScript และ Production build | ผ่าน |

ครอบคลุม: Migration แท็บเดิม (คอลัมน์และข้อมูลเดิมไม่เปลี่ยน), Lead เก่าไม่มี Need, Need → Buy/Sell Status, ค่าไม่ถูกต้อง, เปลี่ยน Need ต้องยืนยัน + Audit, Won/Lost/Qualified จากสถานะใหม่, Call Status → contactable, ตัวกรองใหม่, Dashboard Qualified = 4 จากข้อมูลทดสอบ, Export คอลัมน์ใหม่

**Failed:** 0

**Not Tested:**
- หน้า Leads บนเบราว์เซอร์จริงและมือถือ (ฟอร์ม, การสลับ Need, ปุ่มยืนยัน) — ตรวจด้วย TypeScript/build และทดสอบ Logic ฝั่งเซิร์ฟเวอร์เท่านั้น
- Google Sheet จริง (ทดสอบกับ Sheets จำลอง)

### Known Issues
- กราฟ Pipeline ใน Dashboard ยังใช้ขั้นเดิม (New/Contacted/Qualified/Proposal/Won/Lost) ซึ่ง Lead ใหม่จะไม่มี Proposal — ถ้าต้องการกราฟตาม Hot/Warm/Cold หรือ Sell Status ทำได้ใน Phase 6
- ตัวกรองของ Export leads.csv ยังเป็นชุดเดิม (วันที่/พื้นที่/ช่องทาง/Campaign) ยังไม่มีตัวกรอง Need/Status
- Staff เป็นข้อความอิสระ พิมพ์ต่างกันเล็กน้อย (เช่นเว้นวรรค) จะถือเป็นคนละคน — มีรายชื่อเดิมให้เลือกเพื่อลดปัญหานี้

### Next Phase
**Phase 5 — Website Analytics:** ข้ามไว้ตามที่ผู้ใช้แจ้ง (รอข้อมูล) → ขั้นต่อไปคือ **Phase 6 — Marketing Performance Dashboard** เริ่มเมื่อผู้ใช้สั่ง "ทำขั้นต่อไป"

## 17) รายงาน Phase 6 — Marketing Performance Dashboard

คำสั่งผู้ใช้: "กราฟแยกตาม Hot/Warm/Cold แล้วไปต่อ Phase 6" → ทำกราฟ Lead ตาม Buy/Sell Status (ต่อจาก Known Issue ของ Phase 4) รวมใน Phase นี้

### สิ่งที่ทำแล้ว
- **กราฟ Lead ตาม Buy Status** (Hot / Warm / Cold / Archive / Close + ยังไม่ระบุสถานะ) สำหรับ Need ซื้อ/เช่า/สร้าง และ **กราฟ Lead ตาม Sell Status** สำหรับ Need ขาย ในหน้า ภาพรวมการตลาด (ใช้ตัวกรองเดิม) · แสดงทุกสถานะแม้เป็น 0 · Lead ไม่มี Need ไม่ปน · กราฟ Pipeline เดิมยังอยู่ (เปลี่ยนชื่อเป็น "คำนวณจาก Buy/Sell Status")
- **หน้าใหม่ Marketing Performance** (`/performance`, Admin/Marketing, อยู่ในเมนู) แยกเป็น 5 กลุ่มพร้อมป้าย Paid / Organic / Website:
  | กลุ่ม | KPI | แหล่ง/สูตร |
  |---|---|---|
  | Google Ads (Paid) | Spend, Clicks, CPC, Impressions (เมื่อมี) | ใช้ **Time series รายวัน** ถ้าครบทุกวันในช่วง (ตัดช่วงได้ตรง) → มิฉะนั้น Campaign Report ที่อยู่ในช่วงพอดี → มิฉะนั้นใช้ที่มีพร้อม ข้อมูลไม่ครบ · **CPC = Spend ÷ Clicks จากแหล่งและช่วงเดียวกัน** ไม่ใช้ Total Paid Media Spend · Clicks = 0 → N/A |
  | Meta Ads (Paid) | Spend, Impressions, ผลรวม Reach ระดับโฆษณา (ระบุว่าไม่ใช่ Unique) + Results แยกตาม Action | Meta Ads Report (ยอดรวมทั้งช่วง) |
  | Facebook Page (Organic) | Reach, Reactions + Comments + Shares, Reactions, Comments, Shares, Seconds viewed (+ Views / Link Clicks เฉพาะเมื่อไฟล์มี) | กฎเดียวกับ Phase 1 · ไฟล์รายวันไม่มี Reach → รอข้อมูลพร้อมเหตุผล · ไม่รวมเพจที่ตั้งให้ตัดออก |
  | Website | Users, Page Views, Page Views per User, Duration | **รอข้อมูล** (Phase 5 ข้ามไว้) — ไม่แสดง 0 |
  | Google Ads Spend เทียบ Website | Ads Cost per Website Page View, Ads Spend per Website User | **รอข้อมูล** พร้อมหมายเหตุว่าเป็นการเทียบกับยอด Website รวมทุกช่องทาง ไม่ใช่ต้นทุนที่พิสูจน์ Attribution |
- **ตัวกรองวันที่** (ไม่เลือก = ช่วงของข้อมูลทั้งหมดที่มี และแสดงช่วงที่ใช้คำนวณบนหัวหน้า)
- **เปรียบเทียบช่วงก่อนหน้า** (ยาวเท่ากัน) ใช้กฎความครบถ้วนเดียวกัน · แสดงค่าและ % เปลี่ยนแปลง · ช่วงก่อนไม่มีข้อมูล → "ช่วงก่อน: รอข้อมูล"
- **กราฟแนวโน้มรายวัน/รายเดือน:** Google Ads Spend, Google Ads Clicks (จาก Time series เท่านั้น — ไม่แบ่ง Campaign Report เป็นรายวันเอง), Facebook Engagement (รายวัน)
- **ตารางสรุปตามแพลตฟอร์ม:** Spend / Clicks / Engagement / Impressions / ช่วงข้อมูล / แหล่งข้อมูล / สถานะ (ครบ · ไม่ครบ · รอข้อมูล) · ช่องที่ไม่มีข้อมูลแสดง — ไม่ใช่ 0
- **ความครบถ้วนและแหล่งข้อมูล:** แต่ละแหล่งแสดงสถานะ, ช่วงที่มีข้อมูล และเหตุผล
- **ตรวจไขว้:** Time series กับ Campaign Report ช่วงเดียวกันยอดไม่ตรงกัน (> ฿1) → เตือน
- การ์ด KPI ย้ายเป็น Component กลาง (`KpiCard`) ใช้ทั้งหน้า ภาพรวม และ Performance

### ไฟล์ที่เปลี่ยน
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/performance.ts` (ใหม่) | คำนวณ Google/Meta/Facebook/Website, ช่วงเริ่มต้น, ช่วงเปรียบเทียบ, แนวโน้ม, สถานะความครบ |
| `src/app/(app)/performance/page.tsx` (ใหม่) | หน้า Marketing Performance |
| `src/components/KpiCard.tsx` (ใหม่) | การ์ด KPI กลาง + การเปรียบเทียบช่วงก่อน |
| `src/lib/lead-options.ts` (ใหม่) | ย้ายรายการตัวเลือก Lead มาจาก `leads.ts` (กันการ import วนกับ dashboard) — `leads.ts` ยัง export ชื่อเดิม |
| `src/lib/leads.ts` | import ตัวเลือกจาก `lead-options.ts` |
| `src/lib/dashboard.ts` | `statusChart` + กราฟ buyStatus/sellStatus · export ตัวช่วยช่วงวันที่ |
| `src/lib/dashboard-data.ts` | อ่านคอลัมน์เพิ่ม: clicks/impressions (Google), impressions/reach/results/result_indicator (Meta), views (Facebook), need/buy_status/sell_status (Leads — ไม่มีข้อมูลส่วนบุคคล) |
| `src/app/(app)/page.tsx` | กราฟ Buy/Sell Status + ใช้ KpiCard กลาง |
| `src/lib/roles.ts` | เมนู Marketing Performance (Admin/Marketing) |
| `tests/performance.test.ts` (ใหม่), `tests/e2e.test.mts` (ส่วนที่ 16), `tests/run-all.sh` | ทดสอบ Phase 6 |

### Data / Schema Impact
- **ไม่เปลี่ยน Schema ของ Google Sheets** ไม่เขียน/ลบข้อมูล (อ่านอย่างเดียว) · อ่านคอลัมน์ที่มีอยู่แล้วเพิ่มขึ้นเท่านั้น

### Test Results
**Passed (รันจริง):** 254/254
| ชุด | ผล |
|---|---|
| performance (ใหม่ · ไฟล์จริง Google/Meta/Facebook) | 23/23 |
| e2e (ส่วนที่ 16 ใหม่ 2 ข้อ) | 98/98 |
| overview / fbactions / fbpage / import / dashboard / sales / security | 20 / 9 / 22 / 33 / 19 / 18 / 12 |
| TypeScript และ Production build (มี route `/performance`) | ผ่าน |

ตัวเลขที่ยืนยัน (ก.ย. 2026): Google Spend ฿28,814.82 · Clicks 31,513 · CPC ฿0.91 (Time series = Campaign Report) · 10–20 ก.ย. Spend ฿9,613.98 / Clicks 9,360 จาก Time series · Meta Spend ฿37,557.54 · Facebook Engagement 319 (24–30 ก.ย. = 129 เท่ากับ Dashboard) · 16–30 เทียบ 1–15 ก.ย. สองช่วงรวมกัน = ฿28,814.82 · ไม่มี Time series + เลือกช่วงย่อย → ข้อมูลไม่ครบ · Clicks 0 → N/A · Website ทุกตัว รอข้อมูล

**Failed:** 0

**Not Tested:**
- หน้า Marketing Performance และกราฟ Buy/Sell Status บนเบราว์เซอร์จริงและมือถือ (ตรวจด้วย TypeScript/build และทดสอบการคำนวณเท่านั้น)
- Google Sheet จริง
- Website Metrics ทั้งหมด (ยังไม่มีข้อมูล)
- Phase 4 บนเว็บจริง: ผู้ใช้ยังไม่ได้รายงานผล

### Known Issues
- Meta Ads มีแต่รายงานยอดรวมทั้งช่วง เลือกช่วงย่อยจะได้ยอดทั้งรายงานพร้อมป้าย ข้อมูลไม่ครบ (ถ้าต้องการรายวัน ต้องส่งออกรายงาน Meta แบบแยกวัน)
- ถ้าเลือกช่วงยาวมาก ตัวนับวันจำกัดไว้ 1,200 วันต่อการคำนวณ
- Website และอัตราส่วนเทียบ Website จะใช้งานได้หลังทำ Phase 5

### Next Phase
**Phase 7 — YoY Comparison** เริ่มเมื่อผู้ใช้สั่ง "ทำขั้นต่อไป" (ข้อมูลปัจจุบันมีเฉพาะ ก.ย. 2026 → ทุก KPI ปีก่อนจะเป็น รอข้อมูล จนกว่าจะนำเข้าข้อมูลปี 2025)
