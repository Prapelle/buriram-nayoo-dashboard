# DEVELOPMENT_STATUS — Buriram NAYOO Marketing Dashboard

อัปเดตล่าสุด: Phase 10 (27/10/2026) · **ครบทุก Phase ตาม Master Prompt** (Phase 5 ข้ามตามที่ผู้ใช้ตัดสินใจ) · เอกสารส่งมอบ: `HANDOVER.md`

## สถานะรวม
| Phase | งาน | สถานะ |
|---|---|---|
| 0 | Audit, Backup & Plan | เสร็จ |
| 1 | Facebook Page CSV: Metric Date + Business Key | เสร็จ · ผู้ใช้ยืนยันบนเว็บจริงแล้ว (27/10/2026) |
| 2 | Marketing Overview: Total Paid Media Spend / Total Leads / CPL | เสร็จ · ผู้ใช้ยืนยันบนเว็บจริงแล้ว (27/10/2026) |
| 3 | Facebook Ads Action Names | เสร็จ · ผู้ใช้ยืนยันบนเว็บจริงแล้ว (27/10/2026) |
| 4 | Lead Management (ฟิลด์ใหม่ + Need/Status Logic) | เสร็จ · ผู้ใช้ยืนยันบนเว็บจริงแล้ว (27/10/2026) |
| 5 | Website Analytics Import | **เสร็จ 28/10/2026** (ทดสอบอัตโนมัติ + เบราว์เซอร์จริงผ่าน · ยังไม่ทดสอบบนเว็บจริง) |
| 6 | Marketing Performance Dashboard (+ กราฟ Lead ตาม Buy/Sell Status) | เสร็จ · ผู้ใช้ยืนยันบนเว็บจริงแล้ว (27/10/2026) |
| 7 | YoY Comparison | เสร็จ · ผู้ใช้ยืนยันบนเว็บจริงแล้ว (27/10/2026) |
| 8 | Export (Looker Studio ถูกตัดออกจากขอบเขต) | เสร็จ (ทดสอบอัตโนมัติ + HTTP Integration ผ่าน · ผู้ใช้ยังไม่ได้รายงานผลบนเว็บจริง) |
| 9 | Integration Testing | เสร็จ (310/310 ผ่าน) |
| 10 | Final Audit & Handover | **เสร็จ** — ดู `HANDOVER.md` |

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

## 18) รายงาน Phase 7 — YoY Comparison

### สิ่งที่ทำแล้ว
- **ตัวเลือก "เปรียบเทียบ"** ในหน้า **ภาพรวมการตลาด** และ **Marketing Performance**: ไม่เปรียบเทียบ / **ปีก่อน (YoY)** / ช่วงก่อนหน้า (แทนช่องติ๊กเดิมของ Phase 6 — ลิงก์เดิม `compare=1` ยังใช้ได้)
- **ช่วงปีก่อน** = วันที่เดียวกันของปีก่อน (เช่น 1–31 ม.ค. 2027 → 1–31 ม.ค. 2026) · 29 ก.พ. → 28 ก.พ. และ **แจ้งเตือนเมื่อจำนวนวันไม่เท่ากัน** · แสดงช่วงที่ใช้เทียบบนหน้าเสมอ
- **สูตร** YoY Change (%) = (ปัจจุบัน − ปีก่อน) ÷ ปีก่อน × 100 (ทศนิยม 1 ตำแหน่ง) · การ์ดแสดง **ค่าปัจจุบัน, ค่าปีก่อน และ %**
  - ปีก่อน = 0 → **N/A (ปีก่อน = 0)**
  - ไม่มีข้อมูลปีก่อน → **Missing Data** (ไม่สร้างตัวเลขย้อนหลังเอง)
  - ปีก่อนข้อมูลไม่ครบ → แสดงค่าพร้อมป้าย **ปีก่อน ข้อมูลไม่ครบ: เหตุผล**
  - ค่าปัจจุบัน รอข้อมูล/N/A → ไม่แสดงการเทียบ
- **หลักการคำนวณของแต่ละ Metric:** ค่าปีก่อนคำนวณด้วยฟังก์ชันเดิมและตัวกรองเดิมทุกอย่าง (กฎแหล่งข้อมูล Google, distinct lead_id, CPL ช่วงเดียวกัน, ตัดเพจ Facebook ฯลฯ)
  - CPC ปีก่อน = Spend ÷ Clicks ของปีก่อน (Clicks ปีก่อน = 0 → แจ้งว่าคำนวณไม่ได้)
  - ยอดสะสม (Lifetime) ของ Facebook → **เทียบไม่ได้** พร้อมเหตุผล
  - อัตราส่วน % (Lead-to-Sale Rate) → ไม่คิด % ซ้อน (ดูค่าของแต่ละช่วงแทน)
- **ภาพรวมการตลาด** ต้องเลือกวันที่ ตั้งแต่/ถึง ก่อน (ไม่เลือก = ทุกช่วงเวลา เปรียบเทียบไม่ได้ → แจ้งให้เลือก) · ครอบคลุม Leads, Qualified, Spend, CPL, Facebook, LINE OA, Sales
- **Marketing Performance** ใช้ช่วงข้อมูลที่มีเป็นค่าเริ่มต้น จึงเทียบ YoY ได้ทันที

### ไฟล์ที่เปลี่ยน
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/compare.ts` (ใหม่) | ช่วงปีก่อน/ช่วงก่อนหน้า, จำนวนวัน, สูตร % |
| `src/lib/performance.ts` | โหมด yoy/prev, ป้ายปีก่อน, ปีก่อนข้อมูลไม่ครบ, Lifetime เทียบไม่ได้, CPC ปีก่อน Clicks 0 |
| `src/lib/dashboard.ts` | `computeDashboardCompared` + ฟิลด์ prev ใน Kpi |
| `src/components/KpiCard.tsx` | แสดงค่าเทียบ, %, N/A เมื่อ 0, Missing Data, เทียบไม่ได้ |
| `src/app/(app)/page.tsx`, `src/app/(app)/performance/page.tsx` | ตัวเลือกเปรียบเทียบ + ช่วงที่ใช้เทียบ + คำเตือน |
| `tests/yoy.test.ts`, `tests/kpicard.test.tsx`, `tests/tsconfig.jsx.json` (ใหม่), `tests/performance.test.ts`, `tests/run-all.sh` | ทดสอบ Phase 7 |

### Data / Schema Impact
- ไม่เปลี่ยน Schema ไม่เขียน/ลบข้อมูล (อ่านอย่างเดียว)

### Test Results
**Passed (รันจริง):** 277/277
| ชุด | ผล |
|---|---|
| yoy (ใหม่) | 15/15 |
| kpicard (ใหม่ · เรนเดอร์ HTML ของการ์ดจริง) | 8/8 |
| e2e / performance / overview / fbpage / import / dashboard / fbactions / sales / security | 98 / 23 / 20 / 22 / 33 / 19 / 9 / 18 / 12 |
| TypeScript และ Production build | ผ่าน |

ครอบคลุม: ช่วงปีก่อนและปีอธิกสุรทิน · สูตร +20% / −20% / 0% · **ปีก่อน = 0 → N/A** (Spend/Clicks/Leads) · **KPI ไม่มีข้อมูลย้อนหลัง → Missing** (ข้อมูลจริงมีแค่ ก.ย. 2026) · **KPI มีข้อมูลย้อนหลัง** (ข้อมูลทดสอบ ก.ย. 2025 ที่สร้างในเทสต์เท่านั้น): Google Spend/Clicks/CPC, Meta, Facebook Engagement, Leads (4 vs 2 = +100%) · ปีก่อนข้อมูลไม่ครบ · Lifetime/อัตราส่วนเทียบไม่ได้

**Failed:** 0

**Not Tested:**
- หน้าจริงบนเบราว์เซอร์/มือถือ (การ์ดตรวจด้วยการเรนเดอร์ HTML ในเทสต์)
- ข้อมูลปีก่อนจริง (ยังไม่มีในระบบ — บนเว็บจริงทุก KPI จะขึ้น ปีก่อน: Missing Data จนกว่าจะนำเข้าข้อมูลปี 2025)
- Phase 4 และ 6 บนเว็บจริง: ผู้ใช้ยังไม่ได้รายงานผล

### Known Issues
- การนำเข้าข้อมูลปีก่อน: ใช้หน้า นำเข้า CSV เดิมได้ (Business Key มีวันที่/ช่วงรายงานอยู่แล้ว ไม่ชนกับปีปัจจุบัน)
- ภาพรวมการตลาดต้องเลือกช่วงวันที่ก่อนจึงเปรียบเทียบได้

### Next Phase
**Phase 8 — Export** (Looker Studio ตัดออกจากขอบเขตแล้ว) เริ่มเมื่อผู้ใช้สั่ง "ทำขั้นต่อไป"

## 19) รายงาน Phase 8 — Export (Looker Studio ตัดออกจากขอบเขต)

### ผลตรวจ Export เดิม
- 23 ชุดข้อมูล ส่งออกได้ครบ · หัวคอลัมน์คงที่ตามลำดับ schema · UTF-8 BOM · ป้องกัน CSV Injection · เงินเป็นตัวเลขล้วน
- **พบและแก้:** `marketing_monthly_summary.leads_total` เดิมนับ "แถว" Lead (ถ้ามีแถวซ้ำใน Sheet จะนับเกิน) → เปลี่ยนเป็นนับ `lead_id` ไม่ซ้ำ ตรงกับ Dashboard (Phase 2)
- **พบ:** ไฟล์ยังไม่บอกระดับข้อมูล (grain) และชนิดของคอลัมน์แบบอ่านด้วยเครื่องได้ · Export Leads กรองตาม Need ไม่ได้ · ตัวเลขของหน้า Marketing Performance / YoY ส่งออกไม่ได้
- รูปแบบวันเวลาที่มีอยู่: วันที่ `YYYY-MM-DD`, เวลาโพสต์ Facebook `YYYY-MM-DD HH:mm` (ตามแพลตฟอร์ม), เวลาระบบ ISO 8601 UTC — คงไว้ (ไม่เปลี่ยนค่าในคอลัมน์เดิม) และระบุชนิดให้ชัดใน data_dictionary

### สิ่งที่ทำแล้ว
- **ระดับข้อมูล (grain)** ทุกชุดข้อมูล แสดงในหน้า ส่งออกข้อมูล (เช่น "หนึ่งแถวต่อ campaign_name × campaign_group_name ต่อช่วงรายงาน", "หนึ่งแถวต่อ Lead (lead_id)")
- **ไฟล์ใหม่ `data_dictionary.csv`** (ทุก Role ตามสิทธิ์ของตัวเอง): หนึ่งแถวต่อ คอลัมน์ × ไฟล์ — dataset_id, filename, grain, ลำดับคอลัมน์, ชื่อคอลัมน์, ชนิด (text/integer/number/money_thb/money_usd/percent/date/datetime_local/timestamp_utc/month/boolean/hour_label) และรูปแบบ · ชนิดมาจาก spec ตัวนำเข้าตัวเดียวกับที่ใช้แปลงค่า
- **ไฟล์ใหม่ `marketing_performance_kpis.csv`** (Admin/Marketing): หนึ่งแถวต่อ KPI ของหน้า Marketing Performance สำหรับช่วงที่เลือก พร้อมค่าปีก่อน — period_from/to, group, kind (Paid/Organic/Website/Compare), kpi_key, kpi_label, unit, value, state, incomplete_reason, source_note, yoy_period_from/to, yoy_value, yoy_change_pct, yoy_status (ok / previous_incomplete / missing / zero_base / not_comparable / current_unavailable) · ไม่มีข้อมูล = ช่องว่าง ไม่ใช่ 0
- **สรุปรายเดือน เพิ่ม 4 คอลัมน์ต่อท้าย:** `google_ads_campaign_clicks` (Campaign Report ชุดเดียวกับ Spend), `leads_from_ads`, `leads_need_buy_rent_build`, `leads_need_sell` · 22 คอลัมน์เดิมไม่เปลี่ยนชื่อ/ลำดับ
- **Export Leads กรองตาม Need** ได้ (ค่าไม่อยู่ในรายการ → ปฏิเสธ)
- **ปรับค่าให้สม่ำเสมอตอนส่งออก (ไม่แก้ข้อมูลใน Sheet):** วันที่ที่ถูกแก้มือใน Google Sheet จนกลายเป็นเลขลำดับวัน (เช่น 46266) → `YYYY-MM-DD` · `true/false` → `TRUE/FALSE`
- **กันนับซ้ำ:** ไฟล์กลุ่ม "สรุป" ระบุใน grain และหน้า ส่งออก ว่าเป็นตัวเลขสรุปแล้ว ห้ามนำไปบวกกับไฟล์ต้นฉบับ
- ข้อความหน้า ส่งออกข้อมูล ไม่อ้างถึง Looker Studio แล้ว (ใช้กับ Excel / Google Sheets)

### ไฟล์ที่เปลี่ยน
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/lib/export/dictionary.ts` (ใหม่) | ชนิดคอลัมน์, ตรวจค่า, ปรับค่าก่อนส่งออก |
| `src/lib/export/datasets.ts` | grain ทุกชุด, ชุดใหม่ 2 ชุด, คอลัมน์สรุปใหม่, ตัวกรอง Need |
| `src/lib/export/service.ts` | leads_total ไม่ซ้ำ, คอลัมน์สรุปใหม่, buildPerformanceRows, buildDictionary, ปรับค่าตามชนิด, ตัวกรอง Need |
| `src/components/ExportForm.tsx`, `src/app/(app)/export/page.tsx` | แสดง grain, ตัวเลือก Need, ข้อความใหม่ |
| `tests/e2e.test.mts` | ส่วนที่ 17 ใหม่ (8 ข้อ) + ปรับจำนวนชุดข้อมูล/ตำแหน่งคอลัมน์ Phase 1 + แก้แถวทดสอบที่มีช่องว่างแบบ null |

### Data / Schema Impact
- ไม่เปลี่ยน Schema ของ Google Sheets ไม่เขียน/ลบข้อมูล
- `marketing_monthly_summary.csv`: +4 คอลัมน์ต่อท้าย · `leads_total` อาจลดลงถ้าเคยมีแถว Lead ซ้ำ (ค่าที่ถูกต้องคือไม่ซ้ำ)
- ไฟล์ใหม่ 2 ไฟล์: `marketing_performance_kpis.csv`, `data_dictionary.csv`

### Test Results
**Passed (รันจริง):** 285/285
| ชุด | ผล |
|---|---|
| e2e (ส่วนที่ 17 ใหม่ 8 ข้อ) | 106/106 |
| performance / yoy / kpicard / overview / fbpage / import / dashboard / fbactions / sales / security | 23 / 15 / 8 / 20 / 22 / 33 / 19 / 9 / 18 / 12 |
| TypeScript และ Production build | ผ่าน |

ครอบคลุม: ส่งออกทุกชุด (24 ชุดผ่าน service) แล้ว **อ่านไฟล์กลับเข้ามาตรวจ 17,139 ช่อง** ว่าวันที่/ตัวเลข/TRUE-FALSE ตรงกับชนิดใน data_dictionary ทั้งหมด · ชื่อคอลัมน์ snake_case ไม่ซ้ำ ตรงกับ dictionary · คอลัมน์เดิมไม่เปลี่ยน · สรุปรายเดือน = ผลรวมจากไฟล์ต้นฉบับ (ไม่ซ้ำ) และนับ Lead ไม่ซ้ำแม้มีแถวซ้ำ · KPI Export = ตัวเลขหน้า Performance · สิทธิ์ตาม Role · ตัวกรอง Need · วันที่แบบเลขลำดับวัน → YYYY-MM-DD

**Failed:** 0

**Not Tested:**
- การดาวน์โหลดจริงบนเบราว์เซอร์ และเปิดไฟล์ใน Excel / Google Sheets จริง
- ไฟล์ `sales_transactions.csv` ตรวจชนิดผ่าน dictionary แต่ไม่ได้รวมในการอ่านกลับ (ใช้เส้นทางแยกของหน้า Sales — ตรวจไว้แล้วใน e2e ส่วนที่ 9)
- Looker Studio (ตัดออกจากขอบเขตตามที่ผู้ใช้ตัดสินใจ — ไม่ได้ทดสอบ)
- Phase 4, 6, 7 บนเว็บจริง: ผู้ใช้ยังไม่ได้รายงานผล

### Known Issues
- เวลาโพสต์ Facebook (`publish_time`) เป็นรูปแบบ `YYYY-MM-DD HH:mm` ต่างจากเวลาระบบ (ISO UTC) — คงไว้เพื่อไม่เปลี่ยนค่าในคอลัมน์เดิม ระบุใน data_dictionary แล้ว
- `marketing_performance_kpis.csv` เทียบ YoY เสมอ (ไม่มีโหมดช่วงก่อนหน้าในไฟล์)

### Next Phase
**Phase 9 — Integration Testing** เริ่มเมื่อผู้ใช้สั่ง "ทำขั้นต่อไป"

## 20) รายงาน Phase 9 — Integration Testing

### วิธีทดสอบ
1. **ชุดทดสอบเดิมทั้งหมด** (ระดับฟังก์ชันและ service + Google Sheets จำลอง) — 285 รายการ
2. **ใหม่: Integration ระดับ HTTP** (`tests/integration/run.mjs`) — เปิด **เซิร์ฟเวอร์ Next จริงจาก production build** แล้วเรียกหน้าเว็บและ API แบบที่เบราว์เซอร์เรียก
   - Google Sheets API และ OAuth token แทนด้วยตัวจำลองในหน่วยความจำ (`tests/integration/fake-sheets.mjs`, โหลดผ่าน `preload.mjs`)
   - ล็อกอินด้วย **คุกกี้เซสชันจริงของ Auth.js** (เข้ารหัสด้วย AUTH_SECRET) — Role อ่านจากแท็บ APP_USERS ทุกคำขอ เหมือนระบบจริง
   - เริ่มจาก Sheet ว่าง → เตรียม Sheet → เพิ่มผู้ใช้ → นำเข้าไฟล์จริง → Leads → Dashboard → Performance → YoY → Export → Health

### ผลรวมตามโมดูล
| # | โมดูล | ข้อมูลปกติ | ข้อมูลซ้ำ | ข้อมูลไม่ครบ | ตัวหารเป็นศูนย์ | กรองวันที่ | ไฟล์ผิด | ผล |
|---|---|---|---|---|---|---|---|---|
| 1 | Facebook Page Import | 120 แถว (ข้าม 270) | ไฟล์ซ้ำถูกบล็อก / Admin ยืนยัน +0 | ไฟล์รายวันไม่มี Reach → รอข้อมูล | — | ตาม metric_date | หัวไม่รู้จัก, ไฟล์ว่าง, วันที่ปน 2 รูปแบบ → 422 | ผ่าน |
| 2 | Facebook Ads | 103 แถว, Spend 37,557.54 | (e2e) นำเข้าซ้ำ +0 | (e2e) ไม่มีผลลัพธ์ 29 แถว | — | ช่วงรายงานทับ | (e2e) | ผ่าน |
| 3 | Google Ads | Campaign + Time series | (e2e) | ไม่มีช่วงวันที่ → 422 PERIOD_REQUIRED | CPC Clicks 0 → N/A (unit) | Time series ตัดช่วงได้ | (e2e) | ผ่าน |
| 4 | Marketing Overview | Total Paid 66,372.36 | Lead ซ้ำนับครั้งเดียว | ไม่มี Lead → รอข้อมูล · ช่วงย่อยของรายงาน → เตือน | ไม่มี Lead จากโฆษณา → CPL N/A | CPL ช่วงเดียวกัน (Lead ต.ค. ไม่นับ) | — | ผ่าน |
| 5 | Lead Management | สร้าง/แก้/ลบ, Staff | เบอร์ซ้ำ (+66) → 409 | Lead เก่าไม่มี Need | — | กรองวันที่รับ | สถานะไม่ตรง Need → 422 · เปลี่ยน Need ต้องยืนยัน | ผ่าน |
| 6 | Website Analytics | **ไม่มีโมดูล (Phase 5 ข้าม)** — ตรวจว่าแสดง รอข้อมูล ไม่ใช่ 0 | — | ✔ | — | — | — | ผ่าน (ตามขอบเขต) |
| 7 | Marketing Performance | 28,814.82 / 31,513 / CPC 0.91 · Meta · FB 319 | Time series ≠ Campaign → เตือน | ข้อมูลรายวันครึ่งเดือน → ไม่ครบ | Clicks 0 → N/A | 10–20 ก.ย. = 9,613.98 | — | ผ่าน |
| 8 | YoY | ปีก่อนมีข้อมูล (ข้อมูลทดสอบ) | — | ไม่มีปีก่อน → Missing Data | ปีก่อน 0 → N/A | ช่วงวันเดียวกันของปีก่อน / 29 ก.พ. | — | ผ่าน |
| 9 | Export | 24 ชุด, 17,139 ช่องตรงชนิด, ดาวน์โหลดจริง text/csv + BOM | สรุปไม่นับซ้ำ | ช่องว่าง = ไม่มีข้อมูล | yoy_status zero_base | from/to | Need ผิด → 400 | ผ่าน |
| 10 | Login และสิทธิ์ | Admin/Marketing/Sales | — | ผู้ใช้ปิดใช้งาน / ไม่อยู่ในรายชื่อ → 401 | — | — | cross-site → 403 · หน้าเว็บที่ไม่มีสิทธิ์ถูกพาออกโดยไม่แสดงเนื้อหา | ผ่าน |
| 11 | Looker Studio Compatibility | **ตัดออกจากขอบเขต (ข้อ G)** — ไม่ได้ทดสอบ | | | | | | ไม่ทดสอบ |

### สิ่งที่พบและแก้ (แก้ทีละจุด ระบุสาเหตุ)
| ปัญหา | สาเหตุ | แก้ |
|---|---|---|
| หน้า ภาพรวมการตลาด และ ส่งออกข้อมูล เกิด error ฝั่งเซิร์ฟเวอร์เมื่อไม่มีเซสชัน (ผู้ใช้ยังถูกพาไป /login ตามปกติ แต่เซิร์ฟเวอร์บันทึก error) | Next เรนเดอร์ layout และ page พร้อมกัน; page ใช้ `auth()!` โดยถือว่ามีเซสชันเสมอ | `src/app/(app)/page.tsx`, `src/app/(app)/export/page.tsx`: ตรวจเซสชันแล้ว redirect ไป /login (2 บรรทัดต่อไฟล์ ไม่เปลี่ยนการคำนวณ) |
| (เทสต์) แถวทดสอบในตัวจำลองมีช่องว่างแบบ null | ตัวจำลองเท่านั้น — Google API จริงคืนค่าว่าง "" | แก้ข้อมูลทดสอบ (Phase 8) |

ข้อสังเกต (ไม่ใช่ข้อผิดพลาด):
- หน้าที่มี loading.tsx ใช้ streaming: การพาออกจากหน้าที่ไม่มีสิทธิ์ส่งเป็นคำสั่ง redirect ในเนื้อหา (สถานะ 200) ไม่ใช่ HTTP 307 — เนื้อหาของหน้าไม่ถูกส่งออก (ตรวจแล้ว) และ API ทุกตัวตรวจสิทธิ์ด้วย 401/403 แยกอยู่แล้ว
- ภาพรวมการตลาด เมื่อเลือกช่วงย่อยของรายงานโฆษณา แสดงคำเตือนระดับหน้า (ไม่ใช่ป้ายบนการ์ด Total Paid) — ทำงานตามที่ออกแบบใน Phase 2

### ไฟล์ที่เปลี่ยน
| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/app/(app)/page.tsx`, `src/app/(app)/export/page.tsx` | กันเซสชันว่าง (redirect /login) |
| `tests/integration/fake-sheets.mjs`, `preload.mjs`, `run.mjs` (ใหม่), `tests/run-all.sh` | Integration ระดับ HTTP |

### Data / Schema Impact
- ไม่เปลี่ยน Schema ไม่เขียน/ลบข้อมูลจริง (ทดสอบกับ Sheet จำลองเท่านั้น)

### Test Results
**Passed (รันจริง):** 310/310
| ชุด | ผล |
|---|---|
| http-integration (ใหม่ · เซิร์ฟเวอร์ Next จริง) | 25/25 |
| e2e | 106/106 |
| import / performance / fbpage / overview / dashboard / sales / yoy / security / fbactions / kpicard | 33 / 23 / 22 / 20 / 19 / 18 / 15 / 12 / 9 / 8 |
| TypeScript และ Production build (Cloudflare) | ผ่าน |

**Failed:** 0

**Not Tested:**
- Google Sheets จริงและ Google Login จริง (ใช้ตัวจำลองและคุกกี้เซสชันที่สร้างเอง) — ผู้ใช้ยืนยัน Phase 1–4, 6, 7 บนเว็บจริงแล้ว
- Integration รันบน Node (next start) ไม่ใช่ Cloudflare Workers runtime — build สำหรับ Workers ผ่าน แต่ไม่ได้รันทดสอบใน workerd
- Website Analytics (ไม่มีโมดูล) และ Looker Studio (ตัดออก)
- เบราว์เซอร์จริง/มือถือ (ทดสอบผ่าน HTTP และ HTML ที่เซิร์ฟเวอร์ส่ง ไม่ได้รัน JavaScript ฝั่งหน้าเว็บ)
- Phase 8 (Export) บนเว็บจริง: ผู้ใช้ยังไม่ได้รายงานผล

### Known Issues
- ไม่มีปัญหาค้างที่ทำให้ตัวเลขผิด · ข้อจำกัดเดิม: Meta Ads เป็นยอดรวมทั้งช่วง (ตัดรายวันไม่ได้), Website รอข้อมูล, ข้อมูลปีก่อนยังไม่มี

### Next Phase
**Phase 10 — Final Audit & Handover** เริ่มเมื่อผู้ใช้สั่ง "ทำขั้นต่อไป"

## 21) รายงาน Phase 10 — Final Audit & Handover

### สิ่งที่ทำแล้ว
- **ตรวจ Regression:** ล้าง build แล้ว build ใหม่ทั้งหมด (`opennextjs-cloudflare build`) + TypeScript + ชุดทดสอบครบ 310/310 · ตรวจสำเนา repo ตามที่ push จริง: TypeScript และ `next build` ผ่าน
- **ตรวจความปลอดภัย:** ไม่มี Secret/คีย์ใน repo (มีเฉพาะตัวอย่างใน `.env.example`) · ไม่มีตัวแปร `NEXT_PUBLIC_` ที่เป็นความลับ · `.gitignore` กันไฟล์ลับ · npm audit: 9 รายการ (3 moderate, 6 high) อยู่ในเครื่องมือ build/dev (wrangler/miniflare/undici, glob CLI, postcss ระหว่าง build) ไม่ได้อัปเกรดในเฟสนี้ (เสี่ยงทำให้ deploy พัง) — ระบุวิธีในคู่มือ
- **เอกสารส่งมอบ `HANDOVER.md`:** Definition of Done แบบตรงไปตรงมา, Schema ปัจจุบัน (สร้างจากโค้ด), ไฟล์ที่แก้ไขรายเฟส, วิธี Import / Leads / Dashboard / Export, ข้อจำกัด, สิ่งที่ยังไม่ได้ทดสอบจริง, การสำรองข้อมูลและดูแลระบบ (รวมโควตา Cloudflare และ Google Sheets API)
- `OPERATIONS.md`: ขั้นตอนประจำเดือนไม่อ้าง Looker แล้ว + เพิ่มขั้นสำรอง Sheet
- **ชุดทดสอบทั้งหมดอยู่ใน repo แล้ว** (`tests/` + `tests/integration/`) — ไม่รวมไฟล์ข้อมูลจริง (มีตัวเลขธุรกิจ) ดู `tests/fixtures/README.md`
- ลบไฟล์ทดสอบเก่า 2 ไฟล์ที่ถูกอัปโหลดผิดโฟลเดอร์ (`tests/fixtures/import.test.ts`, `tests/fixtures/e2e.test.mts` — สำเนาเก่าจากช่วงแรก เวอร์ชันปัจจุบันอยู่ใน `tests/`) เพราะทำให้ตรวจ TypeScript ทั้งโปรเจกต์ไม่ผ่าน

### Definition of Done (สรุป — รายละเอียดใน HANDOVER.md หัวข้อ 1)
- ✅ 16 ข้อ · ⚠️ 1 ข้อ (Export: ผู้ใช้ยังไม่ได้ยืนยันบนเว็บจริงหลัง Phase 8) · ⛔ 2 ข้อตามการตัดสินใจของผู้ใช้ (Website Analytics — Phase 5 ข้าม, Looker Studio — ตัดออก)

### Data / Schema Impact
- ไม่มีการเปลี่ยนแปลงในเฟสนี้

### Test Results
**Passed (รันจริงหลัง build ใหม่):** 310/310 · TypeScript ผ่าน · Production build (Cloudflare) ผ่าน
**Failed:** 0
**Not Tested:** ดู HANDOVER.md หัวข้อ 6 (Export หลัง Phase 8 บนเว็บจริง, Workers runtime ในการทดสอบอัตโนมัติ, มือถือ/เบราว์เซอร์จริง, ข้อมูลปริมาณมาก, ข้อมูลปีก่อนจริง, รายงานยอดขายจริง, Website, Looker)

### งานถัดไปที่แนะนำ (ถ้าต้องการ)
1. ยืนยัน Export บนเว็บจริง
2. ส่งไฟล์ตัวอย่าง Website Analytics เพื่อทำ Phase 5
3. นำเข้าข้อมูลปี 2025 เพื่อใช้ YoY
4. อัปเดต dependency ตามขั้นตอนใน HANDOVER.md หัวข้อ 7

## 22) คำขอเพิ่มเติมหลังส่งมอบ (28/10/2026)

| คำขอ | สิ่งที่ทำ |
|---|---|
| 1. ตัด Won Deals, Deal Value, Company Revenue, Direct Cost, Gross Profit | ลบการ์ดทั้ง 5 ออกจาก **หน้า ภาพรวมการตลาด** (กลุ่มเปลี่ยนชื่อเป็น "Leads") · **ไม่ได้แตะ** หน้า Sales, ไฟล์ Export `marketing_monthly_summary.csv` (คอลัมน์ won_deals / deal_value_thb / company_revenue_thb / direct_cost_thb / gross_profit_thb ยังอยู่) และข้อมูลใน Sheet |
| 2. Lead-to-Sale Rate → Lead Qualification | การ์ดใหม่ **Lead Qualification** = จำนวน Lead (lead_id ไม่ซ้ำ ตามตัวกรองเดียวกับ Total Leads) ที่ Call Status = **ติดต่อได้แล้ว** · กราฟ **Lead Qualification แยกตามช่องทาง** (ช่องทางที่มี Lead แต่ยังไม่มีคนติดต่อได้แสดง 0) · เทียบปีก่อน/ช่วงก่อนได้ |
| 3. เพิ่ม Call Status "ไม่สนใจ" | ตัวเลือกที่ 4 ในฟอร์ม/ตาราง/ตัวกรอง · ตั้ง contactable = TRUE (ติดต่อถึงลูกค้าแล้ว) · **ไม่นับ** ใน Lead Qualification · ขั้น Pipeline ยังคำนวณจาก Buy/Sell Status ตามเดิม |

ไฟล์: `src/lib/dashboard.ts`, `src/lib/dashboard-data.ts` (อ่าน call_status — ไม่ใช่ข้อมูลส่วนบุคคล), `src/lib/lead-options.ts`, `src/lib/leads-service.ts`, `src/components/LeadsManager.tsx`, `src/app/(app)/page.tsx`, `HANDOVER.md`, ชุดทดสอบ
Schema: ไม่เปลี่ยน (ใช้คอลัมน์ call_status เดิม)
Test: **312/312 ผ่าน** (เพิ่ม e2e 15b และ HTTP Integration ตรวจหน้า ภาพรวม จริง) · TypeScript และ Cloudflare build ผ่าน
Not Tested: หน้าเว็บจริงหลังการเปลี่ยนแปลงนี้

## 23) เพิ่มระบบจัดการสมาชิกในหน้า ตั้งค่า (28/10/2026)
- ส่วนใหม่ **สมาชิกและสิทธิ์** (Admin เท่านั้น): รายชื่อผู้ใช้, **เพิ่มสมาชิก** (อีเมล Google, ชื่อ, Role, ใช้งานได้), **แก้ไข**, **ระงับ / เปิดใช้งาน**
- เก็บในแท็บ APP_USERS เดิม (ไม่เปลี่ยน Schema) · อีเมลเก็บเป็นตัวพิมพ์เล็ก · อีเมลซ้ำไม่ได้ · ไม่มีการลบแถว (ระงับแทน)
- กันล็อกตัวเองออก: แก้ Role / อีเมล / ระงับบัญชีตัวเองไม่ได้ · ต้องมี Admin ที่ใช้งานได้อย่างน้อย 1 คน · แสดงป้าย "Admin เริ่มต้น" สำหรับ INITIAL_ADMIN_EMAIL
- ตรวจข้อมูลเก่า (updated_at) · บันทึก Audit Log (user_create / user_update) · มีผลกับผู้ที่ล็อกอินอยู่ภายใน 5 นาที
- หมายเหตุบนหน้า: ระหว่าง Google OAuth โหมด Testing ต้องเพิ่มอีเมลใน Test users ของ Google Cloud ด้วย
- ไฟล์: `src/lib/users-service.ts`, `src/app/api/users/route.ts`, `src/components/UsersManager.tsx` (ใหม่), `src/app/(app)/settings/page.tsx`
- Test: **318/318 ผ่าน** (security ตรวจว่า /api/users เป็น Admin เท่านั้น, e2e 15c 4 ข้อ, HTTP Integration 2 ข้อ — สมาชิกในการทดสอบ HTTP ถูกเพิ่มผ่าน API นี้จริง) · Cloudflare build ผ่าน
- Not Tested: หน้า ตั้งค่า บนเว็บจริง / Google Login จริงของสมาชิกที่เพิ่มใหม่

## 24) Qualified Leads นับจาก Call Status = ติดต่อได้แล้ว (28/10/2026)
- **Qualified Leads** (ภาพรวมการตลาด) = จำนวน Lead (lead_id ไม่ซ้ำ ตามตัวกรอง) ที่ Call Status = **ติดต่อได้แล้ว** (เดิมนับจากสถานะ Qualified/Proposal/Won หรือ qualified_at)
- การ์ด **Lead Qualification** (คำขอ 22) มีนิยามเดียวกันแล้ว จึง **รวมเป็นการ์ด Qualified Leads ใบเดียว** · กราฟเปลี่ยนชื่อเป็น "Qualified Leads แยกตามช่องทาง"
- ใช้นิยามเดียวกันใน **Cost per Qualified Lead** (Lead จากโฆษณาที่ติดต่อได้แล้ว) และคอลัมน์ `leads_qualified` ของ `marketing_monthly_summary.csv`
- **ไม่เปลี่ยน:** ขั้น Pipeline / กราฟ Pipeline / `qualified_at` ยังคำนวณจาก Buy/Sell Status ตามเดิม · ไม่เปลี่ยน Schema
- ไฟล์: `src/lib/dashboard.ts`, `src/app/(app)/page.tsx`, `src/lib/export/service.ts`, `src/lib/export/datasets.ts`, ชุดทดสอบ
- Test: **318/318 ผ่าน** · Cloudflare build ผ่าน · Not Tested: บนเว็บจริง

## 25) รายงาน Phase 5 — Website Analytics (28/10/2026)

### ข้อมูลที่ผู้ใช้ส่งมา (ตรวจแล้ว)
| ไฟล์ | ระดับข้อมูล | สิ่งที่พบ |
|---|---|---|
| GA4 "หน้าและหน้าจอ" (ภาษาไทย, property buriram, 01–27/10/2026) | เส้นทางหน้า × หน้า Landing · ยอดรวมทั้งช่วง | 9,685 แถว / 2,539 หน้า · Page Views 35,820 · User engagement 992,565 วินาที · **ผู้ใช้เป็นรายหน้า รวมได้ 27,361 ซึ่งนับซ้ำ → ไม่มี Website Users ที่ถูกต้องในไฟล์นี้** · ไม่มีแถวซ้ำ · รายได้ 0 ทุกแถว |
| Search Console Chart | รายวัน 27 วัน | Clicks 4,744 · Impressions 203,839 · ตำแหน่งเฉลี่ยถ่วงน้ำหนัก 6.79 |
| Search Console Pages / Queries / Countries / Devices / Search appearance | ยอดรวมทั้งช่วง (สูงสุด 1,000 แถว) | Pages = 4,744 Clicks (รวมตามหน้า) · Queries/Countries/Devices = 1,293 (Google รวมตามเว็บไซต์ + ตัดคำค้นที่ระบุตัวตนได้) → **ห้ามรวมข้ามตาราง** |
| Search Console Filters | — | ช่วงวันที่ Oct 1–27, 2026 · ตัวกรอง Page: +buriram |

### การออกแบบ
- **แท็บใหม่ 2 แท็บ** (ไม่มีแท็บเดิมที่ทำหน้าที่นี้): `WEBSITE_ANALYTICS` (สรุปต่อช่วง/วัน) และ `WEBSITE_DIMENSIONS` (รายละเอียด) แยกจาก Social/Ads
- **เบราว์เซอร์อ่านไฟล์:** แปลงไฟล์ GA4 2 MB ใช้ CPU ~0.4–0.6 วินาที เกิน 10 ms ของ Cloudflare Workers แผนฟรี → อ่าน/สรุปในเบราว์เซอร์ (0.3–0.9 วินาทีในการทดสอบ) ส่งเฉพาะสรุป + 300 อันดับแรก + แถว (อื่น ๆ) · Server ตรวจทุกช่องซ้ำ (ยอดรวมต้องเท่ากับรายหน้า, ห้ามมียอดผู้ใช้ในไฟล์รายหน้า, วันที่/ตัวเลข/ซ้ำ)
- **กันซ้ำ:** row_key + SHA-256 ของไฟล์ (นำเข้าซ้ำต้อง Admin ยืนยัน แล้วข้าม/อัปเดตตามคีย์)
- **Website Users กรอกเอง** (Master 3.1 รองรับการกรอกด้วยตนเอง) ต่อช่วงวันที่ · ใช้ได้เมื่อช่วงตรงกับรายงาน GA4 พอดี
- **การคำนวณ:** Page Views / เวลารวม รวมข้ามช่วงที่ไม่ทับกันได้ · Users ไม่รวมข้ามช่วง · PV per User = Page Views ÷ Users (0 → N/A) · Duration = User engagement ÷ Users (วินาที) · Search CTR = Clicks ÷ Impressions (คำนวณใหม่ ไม่เฉลี่ย CTR รายวัน) · ตำแหน่งเฉลี่ยถ่วงน้ำหนักด้วย Impressions · รายงานช่วงทับกัน → ใช้ช่วงที่ตรงพอดี/ไม่รวมซ้ำ + ข้อมูลไม่ครบ
- **Marketing Performance:** กลุ่ม Website (GA4) 4 KPI + เวลามีส่วนร่วมรวม, กลุ่มใหม่ Google Search (Organic), Ads Cost per Page View / Spend per User คำนวณจริง (Google Ads Spend ช่วงเดียวกัน + หมายเหตุ Attribution), กราฟ Search Clicks, ตาราง/สถานะแหล่งข้อมูล, YoY
- **หน้าใหม่ Website:** นำเข้าหลายไฟล์พร้อมกัน, ตรวจสอบก่อนนำเข้า, กรอกยอดผู้ใช้, ตารางหน้า GA4 / หน้า / คำค้น / อุปกรณ์ / ประเทศ · **Export:** website_analytics.csv, website_dimensions.csv (+ data_dictionary)

### ไฟล์ที่เปลี่ยน
`src/lib/website/parse.ts`, `src/lib/website/service.ts`, `src/app/api/website/route.ts`, `src/components/WebsiteManager.tsx`, `src/app/(app)/website/page.tsx` (ใหม่) · `src/lib/schema.ts`, `src/lib/performance.ts`, `src/lib/dashboard.ts` (Kpi fmt "sec", DashData.web), `src/lib/dashboard-data.ts` (อ่าน WEBSITE_ANALYTICS — ถ้ายังไม่มีแท็บ Dashboard อื่นยังทำงาน), `src/components/KpiCard.tsx`, `src/app/(app)/performance/page.tsx`, `src/lib/roles.ts`, `src/lib/export/{datasets,service,dictionary}.ts`

### Data / Schema Impact
- **แท็บใหม่ WEBSITE_ANALYTICS, WEBSITE_DIMENSIONS → ต้องกด ตั้งค่า → เตรียม Google Sheet** · ไม่แตะแท็บเดิม · ไฟล์ส่งออกใหม่ 2 ไฟล์

### Test Results
**Passed:** 358/358 — website (ใหม่ 23: ไฟล์จริง, ไฟล์ผิด, ตรวจข้อมูลฝั่ง Server, KPI), e2e 15d (7: นำเข้า/ซ้ำ/อัปเดต/กรอกเอง/Performance/Audit), Export 26 ชุดตรวจชนิด 34,076 ช่อง, HTTP Integration (+1), **เบราว์เซอร์จริง 9** (อัปโหลดไฟล์จริง 8 ไฟล์ → นำเข้า 1,026 แถว → กรอก Users 21,000 → Performance: PV/User 1.71, Duration 47 วินาที, Search Clicks 4,744, CTR 2.33% · มือถือ 390px ไม่ล้น · ไม่มี JS error) · TypeScript + Cloudflare build ผ่าน
**พบและแก้ระหว่างทดสอบ:** วันที่รูปแบบผิด (เช่น 2026-13-01) ทำให้ตัวตรวจฝั่ง Server error แทนที่จะปฏิเสธ — แก้แล้ว
**Failed:** 0
**Not Tested:** บนเว็บที่ deploy จริง/Google Sheet จริง · ไฟล์ GA4 ภาษาอังกฤษ · ไฟล์ Search Console ภาษาไทย (ยังไม่รองรับ) · ข้อมูล Google Ads ช่วงเดียวกับ GA4 (ยังไม่มีจริง — ทดสอบด้วยข้อมูลสมมติ)

## 26) รองรับ GA4 Reports snapshot (28/10/2026)

### ข้อมูลที่ผู้ใช้ส่งมา (ตรวจแล้ว)
`Reports_snapshot.csv` — หน้าแรกของ GA4 Reports ช่วง 01–30/09/2026 · หลายตารางในไฟล์เดียว (ยอดรวม, รายวัน, แหล่งที่มาผู้ใช้ใหม่, แหล่งที่มาเซสชัน, ชื่อหน้า, เมือง, แพลตฟอร์ม ฯลฯ) ทุกตารางช่วงวันที่เดียวกัน
- Active users **17,443** · New users 16,604 · เวลามีส่วนร่วมเฉลี่ยต่อผู้ใช้ 60.04 วินาที · Page views (รวมตามชื่อหน้า) **42,450** · Sessions (รวมตามแหล่งที่มาเซสชัน) **22,409** · Key events 86,085
- ชื่อหน้า: Users เป็นรายหน้า (รวมกันไม่ได้) — เก็บเป็นรายละเอียด ไม่ใช้เป็นยอดรวม

### การออกแบบ
- ไฟล์ประเภทใหม่ `ga4_snapshot` (ตรวจจับอัตโนมัติ) → แถวสรุป 1 แถวใน WEBSITE_ANALYTICS (มี Users จริง) + รายละเอียด ชื่อหน้า / แหล่งที่มาผู้ใช้ใหม่ / แหล่งที่มาเซสชัน / เมือง ใน WEBSITE_DIMENSIONS
- Server ตรวจซ้ำ: Users ต้องเป็นจำนวนเต็ม · Page views รวม = ผลรวมตารางชื่อหน้า · Sessions รวม = ผลรวมแหล่งที่มาเซสชัน · ช่วงวันที่ทุกตารางต้องตรงกัน
- **ช่วงเดียวกันมีหลายแหล่ง → รวมแบบเลือก ไม่บวก:** snapshot > ไฟล์รายหน้า > กรอกเอง (Users, Page Views, Duration) · เวลามีส่วนร่วมรวมยังมาจากไฟล์รายหน้า
- Performance: KPI ใหม่ **Sessions** (แสดงเมื่อมีข้อมูล) · ข้อความ "รอข้อมูล" ของ Users แนะนำให้นำเข้า snapshot

### ผลกับข้อมูลจริง ก.ย. 2026
Users 17,443 · Page Views 42,450 · PV/User 2.43 · Duration 1 นาที 0 วินาที · Sessions 22,409 · Ads Cost per Page View ฿0.68 · Spend per User ฿1.65 (Google Ads ก.ย. ฿28,814.82)

### ไฟล์ที่เปลี่ยน
`src/lib/website/parse.ts`, `src/lib/website/service.ts`, `src/components/WebsiteManager.tsx`, `src/lib/performance.ts`, `src/lib/dashboard-data.ts`, `src/lib/schema.ts`, `src/lib/export/dictionary.ts` · tests: `website.test.ts`, `e2e.test.mts`, `integration/browser-website.mjs`, `run-all.sh`

### Data / Schema Impact
- **เพิ่มคอลัมน์ต่อท้าย** WEBSITE_ANALYTICS: new_users, sessions · WEBSITE_DIMENSIONS: users, sessions → **ต้องกด ตั้งค่า → เตรียม Google Sheet อีกครั้ง** · ไม่เปลี่ยนชื่อ/ลำดับคอลัมน์เดิม ข้อมูลเดิมไม่ถูกแตะ

### Test Results
**Passed:** 367/367 (รันทั้งชุด 2 รอบติดกัน) — website 30 (+7 snapshot: ไฟล์จริง, ช่วงวันที่ไม่ตรงกัน, ยอดไม่ตรง, Users ไม่ใช่จำนวนเต็ม), e2e 119 (นำเข้า snapshot → KPI ก.ย. ตรงตามด้านบน, Export ก.ย.), HTTP Integration 29, **เบราว์เซอร์จริง 10** (อัปโหลด 9 ไฟล์ → นำเข้า 1,732 แถว → Performance ก.ย. Users 17,443 / PV/User 2.43 / 1 นาที / Sessions 22,409) · TypeScript + Cloudflare build ผ่าน
**แก้ระหว่างทดสอบ:** ทดสอบเบราว์เซอร์อ่านหน้า Performance ก่อนโหลดเสร็จ (ไม่สม่ำเสมอ) → รอให้การ์ดแสดงก่อน · run-all รอพอร์ตว่างก่อนเปิดเบราว์เซอร์
**Failed:** 0
**Not Tested:** บนเว็บที่ deploy จริง/Google Sheet จริง · snapshot ภาษาไทย หรือที่ผู้ใช้ปรับแต่งการ์ดหน้า Reports เอง (ทดสอบเฉพาะไฟล์ภาษาอังกฤษที่ส่งมา)

## 27) คำขอเพิ่มเติม: ปุ่มเลือกไฟล์, Call Status ใหม่, Customer Funnel, CPL แยกช่องทาง, Cost per Site Visit (28/10/2026)

### สิ่งที่ทำ
1. **หน้า Website:** แทนช่อง "Choose files / No file chosen" ด้วยปุ่ม **เลือกไฟล์** + พื้นที่ลากไฟล์มาวาง (หลายไฟล์ได้)
2. **Call Status:** เพิ่ม **เข้าชมโครงการแล้ว** และ **ซื้อสำเร็จ** · **Qualified Leads = ติดต่อได้แล้ว + เข้าชมโครงการแล้ว + ซื้อสำเร็จ** (กำหนดไว้ที่เดียวใน `lead-options.ts` ใช้ทั้ง ภาพรวม, Performance, Export) · ทั้งสองค่าตั้ง contactable = TRUE
3. **Marketing Performance → Customer Funnel:** Reach (Meta Ads Reach + Facebook Page Reach) → เข้าเว็บไซต์ (GA4 Sessions, ถ้าไม่มีใช้ Users) → Leads → Qualified Leads → ขายได้ (ซื้อสำเร็จ) · % ของขั้นก่อนหน้า · เทียบปีก่อน/ช่วงก่อนได้ · ไม่มีข้อมูล = รอข้อมูล (ไม่ใช่ 0)
4. **Marketing Performance → ประสิทธิภาพแต่ละช่องทาง:** ค่าโฆษณา / Leads / ฿ ต่อ Lead / Qualified / ฿ ต่อ Qualified / ซื้อสำเร็จ / แนวโน้ม ฿ ต่อ Lead (เมื่อเปรียบเทียบ) · Meta Ads ↔ Lead ช่องทาง Facebook Ads, Google Ads ↔ Google Ads · ช่องทาง Organic (LINE OA, Website/SEO ฯลฯ) แสดงจำนวน Lead แต่ไม่มีค่าใช้จ่าย · ป้าย "ถูกที่สุด"
5. **ภาพรวมการตลาด → Cost per Site Visit** = Total Paid Media Spend ÷ Lead ทุกช่องทางที่ Call Status = เข้าชมโครงการแล้ว (ช่วงเดียวกับค่าโฆษณา) · 0 ราย → N/A

### ข้อควรรู้
- Call Status เก็บได้ค่าเดียวต่อ Lead: Lead ที่เข้าชมแล้วและเปลี่ยนเป็น ซื้อสำเร็จ จะไม่ถูกนับใน Cost per Site Visit (นับตามที่ผู้ใช้กำหนด) — ถ้าต้องการนับรวม แก้ได้จุดเดียว
- Reach รวมเป็นผลรวมจากหลายแหล่ง คนเดียวกันอาจนับซ้ำ · แต่ละขั้นของ Funnel มาจากคนละระบบ (Social / GA4 / Leads) ไม่ได้ติดตามรายคน
- ไม่มีข้อมูลค่าใช้จ่ายของ LINE OA ในระบบ จึงคำนวณ ฿/Lead ให้ LINE OA ไม่ได้

### ไฟล์ที่เปลี่ยน
`src/lib/lead-options.ts`, `src/lib/leads.ts`, `src/lib/leads-service.ts`, `src/lib/dashboard.ts`, `src/lib/performance.ts`, `src/lib/export/{service,datasets}.ts`, `src/components/{LeadsManager,WebsiteManager}.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/performance/page.tsx` · tests: performance, overview, e2e, browser-website

### Data / Schema Impact
- **ไม่มีการเปลี่ยน Schema** (call_status เป็นข้อความเดิม เพิ่มเฉพาะตัวเลือก) · ไม่ต้องกดเตรียม Google Sheet สำหรับข้อนี้
- Export `leads_qualified` นับตามนิยามใหม่ (ติดต่อได้แล้ว + เข้าชม + ซื้อสำเร็จ)

### Test Results
**Passed:** 377/377 — performance +4 (Funnel ครบ 5 ขั้น, ฿/Lead ต่อช่องทาง, ไม่มีข้อมูล = รอข้อมูล, เทียบปีก่อน), overview +3 (Qualified ใหม่, Cost per Site Visit, N/A), e2e +1 (บันทึก Call Status ใหม่ลง Sheet), เบราว์เซอร์จริง +2 (ปุ่มเลือกไฟล์, Funnel + ตารางช่องทางด้วยข้อมูลตัวอย่าง: Reach 500,000 → 22,409 → 23 → 7 → 2 · Meta ฿3,129.80/Lead ถูกที่สุด · ตารางไม่ล้นที่ 1280px) · TypeScript + Cloudflare build ผ่าน
**Failed:** 0
**Not Tested:** บนเว็บที่ deploy จริง/Google Sheet จริง · ข้อมูล Lead จริง (ข้อมูลในระบบยังเป็นม็อกอัป)

## 28) Facebook Page: Viewers / Link clicks ระดับเพจ + ใช้ Viewers เทียบเคียง Reach (28/10/2026)

### ข้อมูลที่ผู้ใช้ส่งมา (ตรวจแล้ว)
- `Viewers.csv`, `Link_clicks.csv` จาก Meta Business Suite: **UTF-16 LE**, บรรทัดแรก `sep=,`, บรรทัดที่สองเป็นชื่อตัวชี้วัด, แล้ว `Date, Primary` · รายวัน 01–30/09/2026 (30 วัน ครบ ไม่ซ้ำ) · ไม่ระบุชื่อเพจ
- Viewers รวม ก.ย. **806,272** (สูงสุด 10/09 = 93,295) · Link clicks รวม **6,443**

### การออกแบบ
- **อ่านไฟล์:** ถอดรหัสตาม BOM (UTF-16/UTF-8) ทั้งหน้า นำเข้า CSV และหน้า Website · ตัดบรรทัด `sep=` · ใช้ชื่อตัวชี้วัดเป็นหัวคอลัมน์ → ตรวจประเภทอัตโนมัติ
- **ประเภทไฟล์ใหม่ 2 ประเภท** (fb_page_viewers, fb_page_link_clicks) → **แท็บใหม่ FB_PAGE_INSIGHTS** แบบยาว (metric × วัน) · คีย์กันซ้ำ = ตัวชี้วัด + วันที่ · ช่วงวันที่อ่านจากไฟล์ · ไฟล์เดิมซ้ำถูกบล็อก (Admin ยืนยันได้ และไม่บวกซ้ำ)
- **ใช้ Viewers เทียบเคียง Reach** ทุกจุดที่เป็น Reach ของ Facebook Page เมื่อมีข้อมูล Viewers ในช่วง: ภาพรวมการตลาด (การ์ด Facebook Viewers (แทน Reach)), Marketing Performance (f_reach), Customer Funnel (Meta Ads Reach + Viewers), Export marketing_performance_kpis — ทุกจุดมีหมายเหตุ **"ใช้ Viewers เทียบเคียง Reach"** · ถ้าช่วงนั้นไม่มี Viewers ใช้ Reach รายโพสต์แบบเดิม
- **Link clicks ระดับเพจ** ใช้แทน Link clicks รายโพสต์ (ไฟล์รายโพสต์รายวันไม่มีคอลัมน์นี้)
- ช่วงที่เลือกมีวันที่ไม่มีข้อมูล → แสดงค่าพร้อม **ข้อมูลไม่ครบ** ระบุวันที่ขาด · ไม่มีข้อมูลเลย = รอข้อมูล (ไม่ใช่ 0) · วันเดียวกันนำเข้าซ้ำใช้ค่าล่าสุด
- **หน้า Facebook Page:** การ์ด Viewers (แทน Reach) / Link clicks (ระดับเพจ) + แท็บ "Viewers / Link clicks รายวัน (ระดับเพจ)"
- **Export:** ไฟล์ใหม่ facebook_page_insights.csv · สรุปรายเดือนเพิ่มคอลัมน์ต่อท้าย fb_page_viewers_sum, fb_page_link_clicks

### ข้อควรรู้
- Viewers ≠ Reach เดิมพอดี (Meta เปลี่ยนนิยาม) จึงใช้ "เทียบเคียง" · ผลรวมรายวันนับคนเดียวกันซ้ำข้ามวัน ไม่ใช่ Unique Viewers ของเดือน
- ไฟล์ไม่ระบุเพจ จึงใช้การตั้งค่า "ตัดเพจ" ไม่ได้ — ให้ส่งออกเฉพาะเพจ บุรีรัมย์น่าอยู่
- เลขแถวในข้อความแจ้งเตือนนับแบบที่ Excel แสดง (Excel ซ่อนบรรทัด sep=)

### ไฟล์ที่เปลี่ยน
`src/lib/csv.ts` (decodeText/readTextFile), `src/lib/import/{normalize,specs,plan}.ts`, `src/lib/schema.ts`, `src/lib/fbmetrics.ts` (pageMetric), `src/lib/dashboard.ts`, `src/lib/dashboard-data.ts`, `src/lib/performance.ts`, `src/lib/export/{datasets,service,dictionary}.ts`, `src/components/{ImportWizard,WebsiteManager}.tsx`, `src/app/(app)/facebook-page/page.tsx` · tests: fbpage, e2e, browser-website

### Data / Schema Impact
- **แท็บใหม่ FB_PAGE_INSIGHTS → ต้องกด ตั้งค่า → เตรียม Google Sheet** (ก่อนกด หน้าอื่นยังทำงานได้ตามเดิม) · ไม่แตะแท็บ/คอลัมน์เดิม · สรุปรายเดือนเพิ่มคอลัมน์ต่อท้าย 2 คอลัมน์

### Test Results
**Passed:** 388/388 (รันทั้งชุด 2 รอบติดกัน) — fbpage +4 (ไฟล์จริง UTF-16: 30 วัน, ยอดรวมตรงกับไฟล์, นำเข้าซ้ำ/อัปเดต, วันที่/ตัวเลขผิด, รวมตามช่วง/ข้อมูลไม่ครบ), e2e +5 (นำเข้าผ่าน service โดย Marketing → Performance/Funnel/ภาพรวม/Export ใช้ Viewers 806,272 + หมายเหตุ, ช่วงข้ามเดือนแจ้งไม่ครบ 5 วัน), เบราว์เซอร์จริง +2 (อัปโหลดไฟล์ UTF-16 ที่หน้า นำเข้า CSV, หน้า Facebook Page แสดง 806,272 / 6,443 + ตารางรายวัน) · TypeScript + Cloudflare build ผ่าน
**Failed:** 0
**Not Tested:** บนเว็บที่ deploy จริง/Google Sheet จริง · ไฟล์ Insights ตัวชี้วัดอื่นของ Meta Business Suite (รองรับเฉพาะ Viewers และ Facebook link clicks)

## 29) หน้า นำเข้า CSV รับไฟล์ที่หน้าอื่นรับได้ด้วย (28/10/2026)

### ปัญหาที่พบ (ตรวจไฟล์ทุกไฟล์ที่ได้รับ)
- หน้า นำเข้า CSV รับเฉพาะ Facebook / Google Ads ทีละไฟล์ · ไฟล์ GA4 + Search Console (8 ประเภท) นำเข้าได้แค่หน้า Website · รายงานยอดขาย .xlsx ได้แค่หน้า Sales
- พบเพิ่ม: ตัวอ่านไฟล์ Website จับไฟล์ **Google Ads Devices** เป็น Search Console Devices ได้ → แก้ให้ Search Console ต้องมีคอลัมน์ Position

### สิ่งที่ทำ
- หน้า นำเข้า CSV เลือก/ลากได้หลายไฟล์พร้อมกัน (.csv และ .xlsx) แล้วแยกให้อัตโนมัติ:
  - Facebook Page / Viewers / Link clicks / Facebook Ads / Google Ads → ขั้นตอนเดิม ทีละไฟล์ + ปุ่ม **ไฟล์ถัดไป**
  - GA4 / Search Console → ส่วน **ไฟล์เว็บไซต์** (ตัวเดียวกับหน้า Website: ตรวจสอบก่อนนำเข้า → ยืนยัน)
  - รายงานยอดขาย .xlsx → ส่วน **ไฟล์รายงานยอดขาย** (ตัวเดียวกับหน้า Sales) — **เฉพาะ Admin**; Marketing ได้ข้อความแจ้งเหตุผล (ข้อมูลลูกค้า)
  - ไฟล์ชนิดอื่น → แจ้งว่าไม่รองรับ
- สิทธิ์และการตรวจฝั่ง Server ใช้ API เดิมของแต่ละโมดูล (ไม่มี API ใหม่)

### ไฟล์ที่เปลี่ยน
`src/components/ImportWizard.tsx`, `src/components/WebsiteManager.tsx` (importOnly, incoming), `src/components/SalesImport.tsx` (incoming), `src/app/(app)/import/page.tsx`, `src/lib/website/parse.ts` (Search Console ต้องมี Position) · tests: website, `integration/browser-import.mjs` (ใหม่), run-all.sh

### Data / Schema Impact
- ไม่มี (ไม่ต้องกดเตรียม Google Sheet สำหรับข้อนี้)

### Test Results
**Passed:** 394/394 (รันทั้งชุด 2 รอบติดกัน) — website +1 (Google Ads Devices/Time series ไม่ถูกจับเป็น Search Console), เบราว์เซอร์จริงใหม่ 5 (Admin เลือก 6 ไฟล์พร้อมกัน: Google Ads 24 แถว → ไฟล์ถัดไป Viewers 30 วัน → Search Console 27 วัน → รายงานยอดขาย 12 รายการ → .txt ถูกปฏิเสธ · Marketing: .xlsx ถูกปฏิเสธพร้อมเหตุผล, Devices สองแบบแยกถูกส่วน, ไม่มี JS error) · TypeScript + Cloudflare build ผ่าน
**Failed:** 0
**Not Tested:** บนเว็บที่ deploy จริง/Google Sheet จริง


## 30) หน้า Seller Leads / Buyer Leads (Kanban) + ชุด Sell Status / Call Status ใหม่ (30/10/2026)

### สิ่งที่ทำ
- **Seller Leads** (`/seller-leads`, Admin + Sales): Lead ที่ Need = ขาย แยกคอลัมน์ตาม **Sell Status** — รอติดต่อ → สนใจขาย → นัดทำสัญญา → เซ็นสัญญา → สัญญาเปิด → บ้านไม่พร้อมขาย → ขายแล้ว → ยกเลิก
- **Buyer Leads** (`/buyer-leads`, Admin + Sales): Lead ที่ Need = ซื้อ / เช่า / สร้าง แยกคอลัมน์ตาม **Call Status** — รอติดต่อ → ติดต่อได้แล้ว → รอเข้าชม → เข้าชมแล้ว → จอง → ซื้อสำเร็จ → กู้ไม่ผ่าน → ติดต่อไม่ได้ → ไม่สนใจ
- การ์ด = ชื่อลูกค้า (+ เบอร์ / Type / Price / รหัส / Staff / วันติดตาม) · **ลากวาง** ไปคอลัมน์ใหม่เพื่อเปลี่ยนสถานะ (บันทึกลง Sheet ทันที, ล้มเหลวแล้วการ์ดเด้งกลับ) · มี dropdown บนการ์ดสำหรับมือถือ · ค้นหา + กรอง Staff
- API ใหม่ `PATCH /api/leads` `{lead_id, field: sell_status|call_status, value, updated_at_seen}` — ตรวจข้อมูลเก่า (409), ตรวจค่า (422), คำนวณขั้น Pipeline และ contactable ใหม่, บันทึก Audit Log

### การเปลี่ยนแปลงนิยาม
| เรื่อง | ก่อน | หลัง |
|---|---|---|
| Sell Status | นัดทำสัญญา, ทำสัญญา, เซ็นสัญญา, ยกเลิก, เป็นนายหน้า, บ้านไม่พร้อมขาย, ขายแล้ว, สัญญาเปิด | **รอติดต่อ, สนใจขาย**, นัดทำสัญญา, เซ็นสัญญา, สัญญาเปิด, บ้านไม่พร้อมขาย, ขายแล้ว, ยกเลิก (ตัด ทำสัญญา / เป็นนายหน้า) |
| Sell Status ว่าง (Need = ขาย) | ว่าง | เริ่มที่ **รอติดต่อ** |
| Pipeline | — | สนใจขาย = Qualified · รอติดต่อ ไม่นับ Qualified |
| Call Status | ยังไม่ได้โทร, ติดต่อไม่ได้, ติดต่อได้แล้ว, เข้าชมโครงการแล้ว, ซื้อสำเร็จ, ไม่สนใจ | **รอติดต่อ** (แทน ยังไม่ได้โทร), ติดต่อได้แล้ว, **รอเข้าชม**, **เข้าชมแล้ว** (แทน เข้าชมโครงการแล้ว), **จอง**, ซื้อสำเร็จ, **กู้ไม่ผ่าน**, ติดต่อไม่ได้, ไม่สนใจ |
| Qualified Leads | ติดต่อได้แล้ว / เข้าชมโครงการแล้ว / ซื้อสำเร็จ | **รอเข้าชม / เข้าชมแล้ว / จอง / ซื้อสำเร็จ / กู้ไม่ผ่าน** — "ติดต่อได้แล้ว" ยังไม่นับ (ผู้ใช้ยืนยัน 30/10/2026) |
| Cost per Site Visit | นับเฉพาะ เข้าชมโครงการแล้ว | **เข้าชมแล้ว / จอง / ซื้อสำเร็จ / กู้ไม่ผ่าน** (ผู้ใช้ยืนยัน 30/10/2026) · รอเข้าชมยังไม่ใช่การเข้าชม |
| Pipeline "Contacted" และ contactable | = Qualified | = **ติดต่อได้แล้ว + Qualified** (ติดต่อได้แล้วยังเป็น Contacted / contactable TRUE แต่ไม่นับเป็น Qualified Lead) |

- **Lead เก่า** ที่ยังเป็นชื่อเดิมใน Sheet (ยังไม่ได้โทร / เข้าชมโครงการแล้ว) ถูกแปลงเป็นชื่อใหม่ตอนอ่าน (Dashboard, ตัวกรอง, บอร์ด) และเขียนเป็นชื่อใหม่เมื่อมีการบันทึก — ไม่ต้อง migrate ข้อมูล · ไฟล์ Export ของแถวที่ยังไม่ถูกบันทึกจะยังแสดงชื่อเดิม
- Buyer Leads ไม่แสดง Lead เก่าที่ยังไม่ระบุ Need (บอร์ดแจ้งจำนวน) — ไปกำหนด Need ที่หน้า Leads

### ไฟล์ที่เปลี่ยน
`src/lib/lead-options.ts` (QUALIFIED_CALL / CONTACTED_CALL / SITE_VISIT_CALL), `src/lib/leads.ts`, `src/lib/leads-service.ts`, `src/app/api/leads/route.ts`, `src/lib/dashboard.ts`, `src/lib/performance.ts`, `src/lib/export/*` (ข้อความนิยาม), `src/lib/roles.ts`, `src/components/StatusBoard.tsx` (ใหม่), `src/components/LeadsManager.tsx`, `src/app/(app)/seller-leads/page.tsx`, `src/app/(app)/buyer-leads/page.tsx` (ใหม่), `src/app/(app)/page.tsx` (ข้อความ), `tests/sellerleads.test.ts`, `tests/sellerleads-service.test.mts`, `tests/callstatus-kpi.test.ts` (ใหม่), `tests/run-all.sh`

### Data / Schema Impact
- ไม่มี (ใช้คอลัมน์ `sell_status`, `call_status` เดิม · ไม่ต้องกดเตรียม Google Sheet)

### Test Results
**Passed:** เทสต์ใหม่ sellerleads 16 + sellerleads-service 15 + callstatus-kpi 5 (KPI Qualified / Cost per Site Visit ด้วยข้อมูลจำลอง) · security 12 · sales 18 · kpicard 8 · `tsc --noEmit` · `next build`
**Not Tested:** การลากวางในเบราว์เซอร์จริง · เทสต์ที่ต้องใช้ไฟล์ CSV ตัวอย่าง (dashboard / overview / yoy / fbactions / website / performance / fbpage / e2e / http-integration) — ปรับข้อมูลและค่าคาดหวังให้ตรงนิยามใหม่แล้ว (เช่น Cost per Site Visit ใน overview = ค่าโฆษณา ÷ 3) แต่ยังไม่ได้รัน
