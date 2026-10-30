# HANDOVER — Buriram NAYOO Marketing Dashboard

ส่งมอบ: 27/10/2026 · เว็บ: https://buriram-nayoo-dashboard.jsuparkit.workers.dev · โค้ด: GitHub `Prapelle/buriram-nayoo-dashboard` (branch `main` → Cloudflare deploy อัตโนมัติ)
เอกสารที่เกี่ยวข้อง: `SETUP.md` (ติดตั้ง) · `OPERATIONS.md` (งานประจำ) · `ACCEPTANCE.md` (ผลรับงานรอบแรก) · `DEVELOPMENT_STATUS.md` (บันทึกรายเฟสแบบละเอียด)

---

## 1. สรุปสถานะ (Definition of Done)

สถานะ: ✅ ผ่าน · ⚠️ ผ่านบางส่วน/มีเงื่อนไข · ⛔ ไม่ได้ทำ (ระบุเหตุผล)
"เว็บจริง" = ผู้ใช้ตรวจบนเว็บที่ deploy แล้ว · "อัตโนมัติ" = ชุดทดสอบ 433 รายการ (รวม HTTP Integration กับ production build)

| ข้อกำหนด | สถานะ | หลักฐาน |
|---|---|---|
| ฟังก์ชันเดิมทั้ง 4 Tasks ยังทำงาน | ✅ | อัตโนมัติ (e2e/sales/security ไม่มี Regression) · เว็บจริง Phase 1–4 |
| Facebook Page CSV นำเข้าได้ และใช้ Metric Date ถูกต้อง | ✅ | Phase 1 · เว็บจริง (เพิ่ม 120 / ข้าม 270) |
| ไม่มี Facebook Post Metrics ซ้ำจากการ Import | ✅ | คีย์ page_id+post_id+metric_date · นำเข้าซ้ำ +0 (อัตโนมัติ + HTTP) |
| Facebook Ads Action Names สม่ำเสมอโดยไม่เปลี่ยนข้อมูลดิบ | ✅ | Phase 3 · เว็บจริง · ค่าดิบใน Sheet และ `result_indicator_raw` |
| Total Paid Media Spend รวมถูกต้องไม่ซ้ำ | ✅ | ฿66,372.36 = Meta + Google Campaign · เว็บจริง |
| Total Leads ใช้ lead_id และ Lead Date | ✅ | Phase 2 · Phase 8 แก้ไฟล์สรุปรายเดือนให้นับไม่ซ้ำด้วย |
| CPL คำนวณจากช่วงเวลาเดียวกัน | ✅ | CPL 2 ตัว (จาก Ads / ทั้งหมด) · N/A เมื่อหาร 0 |
| Lead Management ฟิลด์และ Status Logic ครบ | ✅ | Phase 4 · เว็บจริง |
| Website Analytics รองรับการนำเข้า | ✅ (มีเงื่อนไข) | Phase 5 (28/10/2026): GA4 หน้าและหน้าจอ + Search Console ทั้งชุด + กรอกเอง · **Website Users มาจากไฟล์ GA4 Reports snapshot** (ถ้าไม่มี snapshot ของช่วงนั้นจึงกรอกเอง) · ทดสอบกับไฟล์จริงและในเบราว์เซอร์จริง · ยังไม่ได้ทดสอบบนเว็บที่ deploy |
| Marketing Performance Dashboard ใช้ข้อมูลจริง | ✅ | Phase 6 · เว็บจริง · ส่วน Website/Search Console เพิ่มใน Phase 5 |
| Google Ads KPI ไม่ใช้ Total Paid Media Spend | ✅ | CPC = Google Spend ÷ Clicks แหล่งเดียวกัน (ทดสอบแล้ว) |
| Website Metrics ไม่ถูกอ้างว่าเกิดจาก Paid Ads | ✅ | หมายเหตุ Attribution บนหน้า · แยกกลุ่ม Website (GA4) / Google Search (Organic) / เทียบ Google Ads |
| YoY คำนวณและจัดการ Missing Data ถูกต้อง | ✅ | Phase 7 · เว็บจริง · ข้อมูลปีก่อนจริงยังไม่มี |
| Export ทำงานได้จริง | ⚠️ | อัตโนมัติ + ดาวน์โหลดผ่าน HTTP ผ่าน · **ผู้ใช้ยังไม่ได้ยืนยันบนเว็บจริงหลัง Phase 8** |
| Google Sheets ยังเป็นฐานข้อมูลหลัก | ✅ | ไม่มีฐานข้อมูลอื่น |
| Looker Studio Compatibility | ⛔ | **ตัดออกจากขอบเขต** ตามการตัดสินใจของผู้ใช้ (ข้อ G) — ไม่ได้ตรวจ |
| ไม่ลบ/เขียนทับข้อมูลเดิมโดยไม่ได้รับอนุญาต | ✅ | Schema เพิ่มคอลัมน์ต่อท้ายเท่านั้น · การลบมีเฉพาะ "ลบ Lead" ที่ผู้ใช้กดยืนยัน · ข้อมูลม็อกอัปผู้ใช้ลบเอง |
| ทดสอบการทำงานร่วมกันทุกโมดูล | ✅ | Phase 9 + Phase 5: 358/358 (Looker อยู่นอกขอบเขต) |
| รายงานสถานะการทดสอบตรงไปตรงมา | ✅ | ทุกเฟสแยก Passed / Failed / Not Tested |

---

## 2. Schema ปัจจุบัน (Google Sheets)

กฎ: ระบบสร้างแท็บ/คอลัมน์ที่ขาดผ่านปุ่ม **ตั้งค่า → เตรียม Google Sheet** เท่านั้น · เพิ่มคอลัมน์ต่อท้าย ไม่เปลี่ยนชื่อหรือลำดับคอลัมน์เดิม · ไม่ลบข้อมูล

| แท็บ | กลุ่ม | จำนวนคอลัมน์ | คอลัมน์ที่เพิ่มใน Master Prompt |
|---|---|---|---|
| `APP_USERS` | system | 8 | — |
| `APP_CONFIG` | system | 4 | — |
| `SERVICE_CATALOG` | system | 8 | — |
| `AREA_MAPPINGS` | system | 8 | — |
| `IMPORT_BATCHES` | system | 20 | — |
| `IMPORT_ERRORS` | system | 8 | — |
| `AUDIT_LOG` | system | 7 | — |
| `FB_PAGE_POSTS` | marketing | 40 | `metric_date`, `metric_scope`, `duration_sec`, `caption_type`, `is_crosspost`, `is_share`, `languages`, `custom_labels`, `funded_content_status`, `data_comment` |
| `META_ADS` | marketing | 30 | — |
| `GOOGLE_ADS_CAMPAIGNS` | marketing | 14 | — |
| `GOOGLE_ADS_SEARCH_TERMS` | marketing | 13 | — |
| `GOOGLE_ADS_SEARCH_WORDS` | marketing | 14 | — |
| `GOOGLE_ADS_KEYWORDS` | marketing | 16 | — |
| `GOOGLE_ADS_NETWORK` | marketing | 12 | — |
| `GOOGLE_ADS_AGE` | marketing | 11 | — |
| `GOOGLE_ADS_GENDER` | marketing | 11 | — |
| `GOOGLE_ADS_GENDER_AGE` | marketing | 12 | — |
| `GOOGLE_ADS_SCHEDULE_DAY` | marketing | 10 | — |
| `GOOGLE_ADS_SCHEDULE_HOUR` | marketing | 11 | — |
| `GOOGLE_ADS_SCHEDULE_DAY_HOUR` | marketing | 12 | — |
| `GOOGLE_ADS_OPT_SCORE` | marketing | 10 | — |
| `GOOGLE_ADS_CAMPAIGN_CHANGES` | marketing | 18 | — |
| `GOOGLE_ADS_DEVICES` | marketing | 12 | — |
| `GOOGLE_ADS_TIME_SERIES` | marketing | 13 | — |
| `GOOGLE_ADS_AUCTION_INSIGHTS` | marketing | 19 | — |
| `LINE_OA_MONTHLY` | manual | 20 | — |
| `LEADS` | manual | 37 | `need`, `buy_status`, `sell_status`, `property_type`, `property_condition`, `price_range`, `call_status`, `staff` |
| `SALES` | manual | 22 | — |
| `SALES_TRANSACTIONS` | manual | 37 | — |
| `SALES_IMPORT_LOG` | system | 20 | — |
| `WEBSITE_ANALYTICS` | marketing | 26 | **แท็บใหม่ (Phase 5)** · +new_users, sessions (28/10/2026) |
| `WEBSITE_DIMENSIONS` | marketing | 21 | **แท็บใหม่ (Phase 5)** · +users, sessions (28/10/2026) |
| `FB_PAGE_INSIGHTS` | marketing | 9 | **แท็บใหม่ (28/10/2026)** Viewers / Link clicks รายวันระดับเพจ (metric × วัน) |
| `MONTHLY_TARGETS` | manual | 6 | **แท็บใหม่ (30/10/2026)** งบโฆษณา + เป้า Lead หนึ่งแถวต่อเดือน |
| `DEVELOPERS` / `DEVELOPER_PRODUCTS` / `DEVELOPER_STATUS_LOG` | manual | — | **แท็บใหม่ (31/10/2026)** ลูกค้าโครงการหมู่บ้าน · Product ที่ขาย · ประวัติ Status สำหรับรายงาน |

| ไฟล์ส่งออก | กลุ่ม | ระดับข้อมูล (grain) | สิทธิ์ |
|---|---|---|---|
| `facebook_page_posts.csv` | การตลาด | หนึ่งแถวต่อ โพสต์ (page_id × post_id) × วันที่ของสถิติ (metric_date) | admin, marketing |
| `facebook_ads.csv` | การตลาด | หนึ่งแถวต่อ ad_set_name × ad_name ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_campaigns.csv` | การตลาด | หนึ่งแถวต่อ campaign_name × campaign_group_name ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_search_terms.csv` | การตลาด | หนึ่งแถวต่อ search_term ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_search_words.csv` | การตลาด | หนึ่งแถวต่อ word ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_keywords.csv` | การตลาด | หนึ่งแถวต่อ keyword × match_type ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_network.csv` | การตลาด | หนึ่งแถวต่อ network ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_age.csv` | การตลาด | หนึ่งแถวต่อ age_range ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_gender.csv` | การตลาด | หนึ่งแถวต่อ gender ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_gender_age.csv` | การตลาด | หนึ่งแถวต่อ gender × age_range ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_schedule_day.csv` | การตลาด | หนึ่งแถวต่อ day ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_schedule_hour.csv` | การตลาด | หนึ่งแถวต่อ start_hour ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_schedule_day_hour.csv` | การตลาด | หนึ่งแถวต่อ day × start_hour ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_opt_score.csv` | การตลาด | หนึ่งแถวต่อ campaign_name ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_campaign_changes.csv` | การตลาด | หนึ่งแถวต่อ campaign_name × ad_group_name ต่อช่วงรายงาน (report_start–report_end) พร้อมช่วงเปรียบเทียบ | admin, marketing |
| `google_ads_devices.csv` | การตลาด | หนึ่งแถวต่อ device ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `google_ads_time_series.csv` | การตลาด | หนึ่งแถวต่อ date (รายวัน) | admin, marketing |
| `google_ads_auction_insights.csv` | การตลาด | หนึ่งแถวต่อ advertiser_name ต่อช่วงรายงาน (report_start–report_end) | admin, marketing |
| `line_oa_monthly.csv` | การตลาด | หนึ่งแถวต่อเดือน (report_month) | admin, marketing |
| `website_analytics.csv` | การตลาด | หนึ่งแถวต่อ แหล่ง (source) × ช่วงรายงาน — GA4 และกรอกเอง = ยอดรวมทั้งช่วง (granularity = period), Search Console = รายวัน (granularity = day) | admin, marketing |
| `website_dimensions.csv` | การตลาด | หนึ่งแถวต่อ แหล่ง × ช่วงรายงาน × dimension_type × dimension_value (300 อันดับแรก + แถว (อื่น ๆ)) | admin, marketing |
| `leads.csv` | Leads / Sales | หนึ่งแถวต่อ Lead (lead_id) | admin, sales |
| `sales.csv` | Leads / Sales | หนึ่งแถวต่อดีล (sale_id) | admin, sales |
| `sales_transactions.csv` | Leads / Sales | หนึ่งแถวต่อเอกสารขาย (invoice_no) | admin, sales |
| `marketing_monthly_summary.csv` | สรุป | หนึ่งแถวต่อเดือน (ตัวเลขสรุปจากไฟล์ต้นฉบับ — ห้ามนำไปรวมกับไฟล์ต้นฉบับ จะนับซ้ำ) | admin, marketing, sales |
| `marketing_performance_kpis.csv` | สรุป | หนึ่งแถวต่อ KPI ของช่วงวันที่ที่เลือก พร้อมค่าปีก่อน (YoY) — ตัวเลขสรุป ห้ามนำไปรวมกับไฟล์ต้นฉบับ | admin, marketing |
| `data_dictionary.csv` | สรุป | หนึ่งแถวต่อ คอลัมน์ × ไฟล์ส่งออก | admin, marketing, sales |

คีย์กันข้อมูลซ้ำ (`row_key`): Facebook Page = page_id + post_id + metric_date · Meta Ads = ช่วงรายงาน + ad set + ad · Google Ads = ช่วงรายงาน + มิติของรายงาน · Time series = วันที่ · Leads = `lead_id` (UUID) + `lead_code` (LD-ปี-ลำดับ) · รายการขาย = เลขที่เอกสาร · Website สรุป = แหล่ง + property + ระดับ + ช่วงวันที่ (Search Console รายวัน = วันที่) · Website รายละเอียด = แหล่ง + ช่วง + ประเภทมิติ + ค่า · Facebook ระดับเพจ = ตัวชี้วัด + วันที่

---

## 3. ไฟล์ที่แก้ไข (Master Prompt Phase 1–9)

| Phase | ไฟล์หลัก |
|---|---|
| 1 Facebook Page metric_date | `src/lib/fbmetrics.ts` (ใหม่), `src/lib/import/{normalize,specs,plan,service}.ts`, `src/lib/schema.ts`, `src/lib/dashboard.ts`, `src/lib/dashboard-data.ts`, `src/lib/export/{datasets,service}.ts`, `src/components/ImportWizard.tsx`, `src/app/(app)/facebook-page/page.tsx` |
| 2 Overview KPI | `src/lib/dashboard.ts`, `src/lib/dashboard-data.ts`, `src/app/(app)/page.tsx` |
| 3 Action Names | `src/lib/fbactions.ts` (ใหม่), `src/app/(app)/facebook-ads/page.tsx`, `src/lib/export/{datasets,service}.ts` |
| 4 Lead Management | `src/lib/schema.ts`, `src/lib/leads.ts`, `src/lib/leads-service.ts`, `src/components/LeadsManager.tsx`, `src/app/(app)/leads/page.tsx` |
| 6 Performance + กราฟสถานะ Lead | `src/lib/performance.ts`, `src/lib/lead-options.ts`, `src/components/KpiCard.tsx`, `src/app/(app)/performance/page.tsx` (ใหม่ทั้งหมด), `src/lib/dashboard.ts`, `src/lib/dashboard-data.ts`, `src/lib/leads.ts`, `src/app/(app)/page.tsx`, `src/lib/roles.ts` |
| 7 YoY | `src/lib/compare.ts` (ใหม่), `src/lib/performance.ts`, `src/lib/dashboard.ts`, `src/components/KpiCard.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/performance/page.tsx` |
| 8 Export | `src/lib/export/dictionary.ts` (ใหม่), `src/lib/export/{datasets,service}.ts`, `src/components/ExportForm.tsx`, `src/app/(app)/export/page.tsx` |
| 9 Integration | `src/app/(app)/page.tsx`, `src/app/(app)/export/page.tsx` (กันเซสชันว่าง) |
| 10 Handover | `HANDOVER.md` (ใหม่), `OPERATIONS.md`, `DEVELOPMENT_STATUS.md`, ชุดทดสอบใน `tests/` |

---

## 4. วิธีใช้งาน

### 4.1 นำเข้าข้อมูล (เมนู นำเข้า CSV — Admin / Marketing)
- วิธีดาวน์โหลดไฟล์จากทุกแพลตฟอร์ม: เมนู **ตั้งค่า → คู่มือนำเข้าข้อมูล** · ที่มาและสูตรของตัวเลข: **ตั้งค่า → คำอธิบายตัวเลข** (ทุก Role เปิดได้)
- **นำเข้าทุกไฟล์ได้จากหน้านี้หน้าเดียว** และเลือกหลายไฟล์พร้อมกันได้: ไฟล์โฆษณา/Facebook ทำทีละไฟล์ (กด **ไฟล์ถัดไป**), ไฟล์ GA4/Search Console แสดงในส่วน **ไฟล์เว็บไซต์**, รายงานยอดขาย .xlsx แสดงในส่วน **ไฟล์รายงานยอดขาย** (เฉพาะ Admin — Marketing ไม่มีสิทธิ์ข้อมูลลูกค้า) · หน้า Website / Sales ยังนำเข้าได้ตามเดิม
1. เลือกไฟล์ทีละไฟล์ ระบบตรวจประเภทรายงานจากหัวคอลัมน์เอง
2. ตรวจ **พรีวิว**: จำนวน เพิ่ม / อัปเดต / ข้าม / ผิด, ช่วงวันที่, Area แล้วกดยืนยัน
   - **Facebook Page:** ส่งออกจาก Meta Business Suite แบบ **รายวัน** (คอลัมน์ Date เป็นวันที่) · แถวก่อนโพสต์เผยแพร่ที่เป็น 0 ทั้งหมดจะถูกข้าม · ไฟล์ที่มีทั้ง วัน/เดือน และ เดือน/วัน ถูกปฏิเสธ · ไฟล์ Lifetime ยังใช้ได้ (ต้องกรอกวันที่ส่งออก)
   - **Facebook Page ระดับเพจ (Viewers / Link clicks):** Meta Business Suite → Insights → กราฟ Viewers หรือ Facebook link clicks → ส่งออก CSV (ไฟล์ UTF-16 ที่มีบรรทัด sep= ใช้ได้เลย ไม่ต้องแก้) · ระบบตรวจประเภทและช่วงวันที่จากไฟล์เอง · หนึ่งแถวต่อวัน นำเข้าซ้ำไม่นับซ้ำ
   - **Facebook Ads:** ไฟล์ Ads Manager (ช่วงรายงานอ่านจากไฟล์)
   - **Google Ads:** ช่วงวันที่อ่านจากชื่อไฟล์ (`..._2026_09_01-2026_09_30_.csv`) ถ้าไม่มีต้องกรอกเอง · **ควรนำเข้า Time series ทุกครั้ง** เพื่อให้กรองช่วงวันที่ย่อยได้ตรง
3. ไฟล์ซ้ำถูกบล็อก (Admin ยืนยันนำเข้าซ้ำได้ ยอดไม่ถูกบวกซ้ำ) · แก้ไฟล์แล้วนำเข้าใหม่ = อัปเดตตามคีย์
4. รายงานยอดขาย Excel: เมนู Sales → นำเข้ารายงานยอดขาย · LINE OA: เมนู LINE OA (เดือนละแถว)

### 4.2 Leads (Admin / Sales)
- **+ เพิ่ม Lead:** Date, Channel, Name, Phone, **Line**, **ความสนใจ**, **พื้นที่ (กรอกเอง)**, **Need** → Status ตาม Need (ซื้อ/เช่า/สร้าง = Buy Status: Hot/Warm/Cold/Archive/Close · ขาย = Sell Status), Type, Condition, Price, Call Status (ยังไม่ได้โทร / ติดต่อไม่ได้ / ติดต่อได้แล้ว / เข้าชมโครงการแล้ว / ซื้อสำเร็จ / ไม่สนใจ), Staff, Remark, Note
- เปลี่ยน Status / Call Status จากตารางได้ทันที · **ดู** = รายละเอียด · **แก้ไข** · ลบ (ยืนยัน 2 ขั้น)
- เปลี่ยน Need ข้ามกลุ่ม (เช่น ขาย → ซื้อ) ระบบถามยืนยันก่อนล้างสถานะเดิม และบันทึกค่าเดิมใน Audit Log
- ระบบคำนวณขั้น Pipeline ให้เอง: Qualified = Hot, Warm, Close, นัดทำสัญญา, ทำสัญญา, เซ็นสัญญา, สัญญาเปิด, เป็นนายหน้า, ขายแล้ว · Won = Close, ขายแล้ว · Lost = Archive, ยกเลิก, บ้านไม่พร้อมขาย

### 4.2b Developer / Sale developer (Admin / Sales)
- หน้า **Developer**: เพิ่ม/แก้ไขบริษัท–โครงการ, Product ที่ใช้อยู่ (วันเริ่ม–หมดอายุ–ราคา), นำเข้ารายชื่อจากไฟล์, สรุปรายเดือนต่อ Staff · หน้า **Sale developer**: Kanban ลากเปลี่ยน Status — สิ้นเดือน มีแผนเข้าพบ/เข้าพบแล้ว กลับไป เข้าร่วมแล้ว เอง · กำลังใช้ Product / ใกล้หมดสัญญา ระบบตั้งเองจาก Product

### 4.3 Dashboard
- **ภาพรวม:** การ์ด ติดตามลูกค้า (Admin/Sales) · เป้าหมายเดือนนี้ (ตั้งที่ ตั้งค่า → เป้าหมายรายเดือน) · Checklist ข้อมูลเดือนก่อน/เดือนนี้ (Admin/Marketing)
- **รายงาน Lead:** ผลงานรายพนักงาน + เหตุผลที่ไม่สำเร็จ แยกช่องทาง
- **ภาพรวมการตลาด:** Total Paid Media Spend, Total Leads (lead_id ไม่ซ้ำ), **Qualified Leads** (Call Status = ติดต่อได้แล้ว / เข้าชมโครงการแล้ว / ซื้อสำเร็จ + กราฟแยกตามช่องทาง), CPL จาก Ads / ทั้งหมด, Cost per Qualified Lead, **Cost per Site Visit** (ค่าโฆษณาทั้งหมด ÷ Lead ที่ Call Status = เข้าชมโครงการแล้ว), Facebook, LINE OA, กราฟ Lead ตาม Buy/Sell Status (ไม่มีการ์ดยอดขาย/การเงินแล้ว — ดูที่หน้า Sales) · ตัวกรอง วันที่/ช่องทาง/Campaign/พื้นที่/Service · **เปรียบเทียบ ปีก่อน/ช่วงก่อน** (ต้องเลือกวันที่ก่อน)
- **Marketing Performance:** Google Ads Spend/Clicks/CPC, Meta Ads, Facebook Page (Organic), Website (รอข้อมูล) แยก Paid/Organic/Website · กราฟรายวัน/รายเดือน · ตารางตามแพลตฟอร์ม · สถานะความครบของข้อมูล · เปรียบเทียบ YoY
- อ่านสถานะ: **รอข้อมูล** = ไม่มีข้อมูล (ไม่ใช่ 0) · **N/A** = หารด้วย 0 · **ข้อมูลไม่ครบ** = มีค่าแต่ช่วงข้อมูลไม่ครบ (อ่านเหตุผลบนการ์ด) · **Missing Data** = ไม่มีข้อมูลช่วงเปรียบเทียบ

- **Marketing Performance → Customer Funnel:** Reach (Meta Ads Reach + Facebook Page Viewers ซึ่ง **ใช้ Viewers เทียบเคียง Reach** — ผลรวม ไม่ใช่ Unique) → เข้าเว็บไซต์ (GA4 Sessions หรือ Users) → Leads → Qualified Leads → ขายได้ (Call Status = ซื้อสำเร็จ) พร้อม % ของขั้นก่อนหน้า และลูกศรเทียบช่วงเมื่อเลือกเปรียบเทียบ
- **Marketing Performance → ประสิทธิภาพแต่ละช่องทาง:** ค่าโฆษณา, Leads, ฿/Lead, Qualified, ฿/Qualified, ซื้อสำเร็จ — Meta Ads จับคู่กับ Lead ช่องทาง Facebook Ads, Google Ads กับ Google Ads · ช่องทาง Organic แสดงจำนวน Lead แต่ไม่มีค่าใช้จ่าย · ป้าย "ถูกที่สุด" = ฿/Lead ต่ำสุดในช่องทางที่มีค่าโฆษณา

### 4.5 Website (เมนู Website — Admin / Marketing)
1. **GA4:** Reports → Engagement → **Pages and screens** → ตั้งช่วงวันที่ → Share → Download CSV (ไม่ต้องแก้ไฟล์ — ระบบอ่านช่วงวันที่จากหัวไฟล์)
2. **Search Console:** Performance → Search results → ตั้งช่วงวันที่ → Export → CSV แล้วแตกไฟล์ zip
3. หน้า Website → กดปุ่ม **เลือกไฟล์** (หรือลากไฟล์มาวาง) เลือก**ทุกไฟล์พร้อมกัน** (รวม Filters.csv ที่บอกช่วงวันที่) → **ตรวจสอบก่อนนำเข้า** → **ยืนยันนำเข้า**
4. **Users:** แนะนำนำเข้า **GA4 Reports snapshot** (หน้าแรกของ Reports → Share → Download CSV) ของช่วงเดียวกัน — มี Active users, New users, เวลามีส่วนร่วมเฉลี่ย, Sessions, Page views ในไฟล์เดียว จึงไม่ต้องกรอกเอง · ถ้าไม่มี snapshot ให้กรอก Users ที่ช่วงนั้น (กดชื่อช่วงเพื่อเติมวันที่)
   - ช่วงเดียวกันมีหลายแหล่ง → ใช้ snapshot ก่อน แล้วจึงไฟล์รายหน้า แล้วจึงที่กรอกเอง (ไม่บวกซ้ำ)
5. ดูตัวเลขที่หน้า **Marketing Performance** โดยเลือกช่วงวันที่ให้ตรงกับรายงาน GA4 (ไม่ตรง = ข้อมูลไม่ครบ) · Search Console เป็นรายวัน เลือกช่วงไหนก็ได้
- เบราว์เซอร์เป็นผู้อ่านไฟล์และสรุปยอด (ไฟล์ GA4 รายหน้ามีหลายพันแถว เกินเวลาประมวลผลของ Cloudflare แผนฟรี) แล้วส่งเฉพาะยอดสรุป + 300 หน้า/คำค้นแรก + แถว (อื่น ๆ) ขึ้นระบบ — Server ตรวจทุกช่องซ้ำ
- Duration = ค่า "เวลามีส่วนร่วมเฉลี่ยต่อผู้ใช้ที่ใช้งานอยู่" จาก snapshot · ถ้าไม่มี snapshot = เวลามีส่วนร่วมรวม (GA4 User engagement) ÷ Users

### 4.4 ส่งออกข้อมูล (เมนู ส่งออกข้อมูล)
- เลือกชุดข้อมูล → ดู **ระดับข้อมูล** → กรอง → ดูจำนวนแถว → ดาวน์โหลด CSV (UTF-8 BOM เปิดใน Excel ได้)
- `data_dictionary.csv` อธิบายชนิดและรูปแบบของทุกคอลัมน์ · ไฟล์กลุ่ม **สรุป** (`marketing_monthly_summary`, `marketing_performance_kpis`) เป็นตัวเลขที่สรุปแล้ว **ห้ามนำไปบวกกับไฟล์ต้นฉบับ**
- การส่งออกข้อมูลลูกค้า/การเงินถูกบันทึกใน Audit Log

---

## 5. ข้อจำกัดที่ยังเหลือ
1. **Website Users มาจาก GA4 Reports snapshot หรือกรอกเอง** — ไฟล์ GA4 "หน้าและหน้าจอ" นับผู้ใช้รายหน้า (รวมกันไม่ได้) · snapshot ต้องมีทุกตารางเป็นช่วงวันที่เดียวกัน · ไฟล์ GA4 เป็นยอดรวมทั้งช่วง ตัดรายวันไม่ได้ · ยอดผู้ใช้รวมข้ามหลายช่วงรายงานไม่ได้ · เก็บรายละเอียด 300 อันดับแรก + (อื่น ๆ) · Search Console รองรับเฉพาะไฟล์หัวคอลัมน์ภาษาอังกฤษ (GA4 รองรับไทย/อังกฤษ แต่ทดสอบเฉพาะไฟล์ภาษาไทย) · Ads Cost per Page View ต้องมี Google Ads ช่วงเดียวกับรายงาน GA4
2. **Meta Ads และ Google Campaign Report เป็นยอดรวมทั้งช่วง** ตัดรายวันไม่ได้ เลือกช่วงย่อยจะได้ยอดทั้งรายงาน + คำเตือน (Google แก้ได้ด้วย Time series · Meta ต้องส่งออกแบบแยกวัน ซึ่งยังไม่รองรับ)
3. **ไฟล์ Facebook Page รายวัน (รายโพสต์) ไม่มี Reach/Views/Link Clicks** → นำเข้าไฟล์ Viewers / Link clicks ระดับเพจแทน · **Reach ของ Facebook Page ทุกจุดใช้ Viewers เทียบเคียง** (Facebook เปลี่ยน Reach ของเพจเป็น Viewers) ผลรวมรายวันนับคนซ้ำ ไม่ใช่ Unique · ไฟล์ระดับเพจไม่ระบุเพจ จึงตัดเพจตามการตั้งค่าไม่ได้ — ส่งออกเฉพาะเพจที่ต้องการ
4. **ยังไม่มีข้อมูลปีก่อน** → YoY เป็น Missing Data จนกว่าจะนำเข้าข้อมูลปี 2025
5. **Google Sheets ไม่มี transaction** — ควรให้มีผู้บันทึกข้อมูลพร้อมกันไม่มาก (ระบบมีการตรวจข้อมูลเก่า/ซ้ำแล้ว แต่ไม่ใช่ฐานข้อมูลจริง) · ขนาดข้อมูลที่เหมาะสมประมาณหลักหมื่นแถวต่อแท็บ
6. Staff เป็นข้อความอิสระ (สะกดต่างกัน = คนละคน)
7. Export ไฟล์ KPI เทียบ YoY เท่านั้น · Export Leads ยังไม่กรองตาม Status
8. Dependency มีคำเตือนความปลอดภัย 9 รายการ (npm audit) ในเครื่องมือ build/dev (wrangler/miniflare, glob CLI, postcss ระหว่าง build) — ไม่อยู่ในโค้ดที่ให้บริการผู้ใช้ แนะนำอัปเดตตามหัวข้อ 7

## 6. สิ่งที่ยังไม่ได้ทดสอบจริง
- **Export หลัง Phase 8** บนเว็บจริง (ดาวน์โหลด, เปิดใน Excel/Google Sheets) — ทดสอบผ่าน HTTP กับ production build แล้ว แต่ผู้ใช้ยังไม่ได้ยืนยัน
- **Phase 9 Integration รันบน Node (next start)** ไม่ใช่ Cloudflare Workers runtime · Google Sheets/Login เป็นตัวจำลอง (Phase 1–4, 6, 7 ผู้ใช้ยืนยันบนเว็บจริงแล้ว)
- เบราว์เซอร์จริงหลายรุ่นและมือถือ (ทดสอบ HTML ที่เซิร์ฟเวอร์ส่ง ไม่ได้รัน JavaScript ฝั่งหน้าเว็บอัตโนมัติ)
- ข้อมูลปริมาณมาก (หลายเดือน/หลายหมื่นแถว) — ทดสอบด้วยข้อมูล ก.ย. 2026 เท่านั้น
- ข้อมูลปีก่อนจริง (YoY ทดสอบด้วยข้อมูลสมมติในชุดทดสอบ)
- รายงานยอดขาย Excel จากระบบบัญชีจริง (ทดสอบด้วยไฟล์จำลองตามโครงสร้างในสเปก)
- Website Analytics บนเว็บที่ deploy จริง (ทดสอบในเบราว์เซอร์จริงกับ production build + Sheet จำลองแล้ว) · Looker Studio (นอกขอบเขต)

## 7. สำรองข้อมูลและการดูแลระบบ
- **สำรอง Google Sheet อัตโนมัติ:** ตั้งค่า → ตั้งค่าระบบ → สำรองข้อมูล — คัดลอกสคริปต์ไปวางใน Apps Script ของ Sheet (บัญชีเจ้าของ) แล้วรัน installWeeklyBackup ครั้งเดียว

**สำรองข้อมูล**
- ทุกเดือน (หลังนำเข้าข้อมูลครบ): Google Sheet → File → **Make a copy** ตั้งชื่อ `NAYOO_backup_YYYY-MM` เก็บในโฟลเดอร์ที่จำกัดสิทธิ์
- ก่อนงานใหญ่ (อัปเดตระบบ, นำเข้าข้อมูลย้อนหลังจำนวนมาก, ลบแถวด้วยมือ): File → Version history → **Name current version**
- เก็บ **ไฟล์ต้นฉบับ** ทุกไฟล์ที่นำเข้าไว้ใน Google Drive (`YYYY-MM_แหล่ง_ชื่อรายงาน`) — ระบบไม่ได้เก็บไฟล์ให้ ใช้นำเข้าใหม่ได้ถ้าข้อมูลเสียหาย
- กู้คืน: Version history ของ Google Sheet หรือคัดลอกแท็บจากไฟล์สำรอง แล้วกด ตั้งค่า → ตรวจสอบระบบ

**ดูแลระบบ**
- เปิด **ตั้งค่า → ตรวจสอบระบบ** สัปดาห์ละครั้ง (แท็บ/คอลัมน์ครบ, การนำเข้าค้าง, Secret รั่ว)
- ผู้ใช้: เพิ่ม / เปลี่ยน Role / ระงับ ที่หน้า **ตั้งค่า → สมาชิกและสิทธิ์** (Admin เท่านั้น ไม่มีการลบ ใช้ระงับแทน) · ทบทวนรายชื่อทุกไตรมาส · ระหว่าง Google OAuth อยู่โหมด Testing ผู้ใช้ต้องอยู่ใน Test users (จำกัด 100 คน) — ถ้าจะเปิดใช้กว้าง ให้ Publish app
- Secret (`AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `GOOGLE_PRIVATE_KEY`) อยู่ใน Cloudflare เท่านั้น · ถ้าสงสัยว่ารั่ว: สร้างคีย์ Service Account ใหม่ ลบคีย์เก่า แล้วอัปเดต Secret · หมุน `AUTH_SECRET` = ทุกคนต้องล็อกอินใหม่
- ตรวจ **Audit Log** (แท็บ `AUDIT_LOG`) เมื่อพบตัวเลขผิดปกติ: ใครนำเข้า/แก้/ลบ/ส่งออกอะไรเมื่อไร
- **Cloudflare Workers แผนฟรี:** 100,000 requests/วัน (รีเซ็ตเที่ยงคืน UTC) และ CPU 10 ms ต่อคำขอ (ไม่นับเวลารอ Google) — ใช้งานจริงผ่านแล้วกับไฟล์ ก.ย. 2026 · ถ้าวันหนึ่งนำเข้าไฟล์ใหญ่มากแล้วเจอ Error 1102 (เกิน CPU) ให้แบ่งไฟล์เป็นช่วงสั้นลง หรืออัปเกรดแผน Workers Paid
- **Google Sheets API:** อ่าน/เขียนอย่างละ 300 ครั้ง/นาที/โปรเจกต์ และ 60 ครั้ง/นาที/ผู้ใช้ — ระบบเรียกผ่าน Service Account เดียว จึงนับเป็นผู้ใช้เดียว (~60 ครั้ง/นาที) · หน้า Dashboard หนึ่งครั้งใช้ราว 2–3 คำขอ ถ้าหลายคนเปิดพร้อมกันบ่อย ๆ อาจเจอ 429 ระบบลองใหม่ให้อัตโนมัติ ถ้ายังไม่ได้ให้รอ 1 นาที
- **อัปเดต dependency** ทุก 3–6 เดือน หรือเมื่อมีช่องโหว่ร้ายแรง: บนเครื่องที่มี Node 20+ รัน `npm audit fix` → `bash tests/run-all.sh` → ถ้าผ่านค่อย commit (อย่าใช้ `--force` โดยไม่ทดสอบ เพราะจะอัปเกรด Next เป็นเวอร์ชันใหญ่)
- **ก่อน deploy ทุกครั้ง:** `npx opennextjs-cloudflare build` แล้ว `bash tests/run-all.sh` (วางไฟล์ตัวอย่างใน `tests/fixtures` ตาม README ในโฟลเดอร์นั้น)

## 8. ชุดทดสอบ
`bash tests/run-all.sh` — 433 รายการ (security, sales, import, dashboard, overview, fbactions, performance, yoy, kpicard, website, fbpage, e2e, http-integration, browser-website)
- `tests/e2e.test.mts`: ทุกโมดูลผ่าน service + Google Sheets จำลอง
- `tests/integration/run.mjs`: เปิด production build จริง ล็อกอินด้วยคุกกี้เซสชันจริงตาม Role แล้วเรียกหน้าเว็บ/API (ต้อง build ก่อน)
- `tests/integration/browser-website.mjs`: เปิดหน้า Website ใน Chromium จริง อัปโหลดไฟล์จริง 9 ไฟล์ (รวม Reports snapshot) นำเข้า กรอกยอดผู้ใช้ แล้วตรวจหน้า Performance ต.ค. และ ก.ย. (ต้องมี Playwright)
- ไฟล์ข้อมูลจริงไม่อยู่ใน repo (มีตัวเลขธุรกิจ) — ดู `tests/fixtures/README.md`
