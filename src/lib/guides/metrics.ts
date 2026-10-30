import { CALL_STATUS, QUALIFIED_CALL, SELL_STATUS, SITE_VISIT_CALL } from "../lead-options";
import { STALE_DAYS } from "../lead-insights";

// คำอธิบายที่มาและการใช้งานตัวเลขทั้งหมด (เมนูย่อยของ ตั้งค่า) — ทุก Role เปิดได้
// รายการสถานะ (Qualified / Site Visit) อ่านจาก lib/lead-options โดยตรง เพื่อให้คำอธิบายตรงกับสูตรที่ระบบใช้เสมอ
export type M = { name: string; source: string; formula: string; use: string };
export type Sec = { id: string; title: string; page?: string; intro?: string; items: M[] };

const list = (a: readonly string[]) => a.join(" / ");

export const SECTIONS: Sec[] = [
  {
    id: "overview", title: "1. ภาพรวมการตลาด", page: "/",
    intro: "สรุปค่าโฆษณา โซเชียล และ Lead ของช่วงที่เลือก · ตัวกรอง วันที่ / ช่องทาง / Campaign / พื้นที่ / Service ใช้กับทุกการ์ด",
    items: [
      { name: "Meta Ads Spend", source: "Facebook Ads (Ads Reporting) — คอลัมน์ Amount spent (THB)", formula: "ผลรวมค่าใช้จ่ายของทุกโฆษณาในรายงานที่อยู่ในช่วง", use: "งบโฆษณา Facebook / Instagram ที่ใช้จริง" },
      { name: "Google Ads Campaign Spend", source: "Google Ads Campaign Report — คอลัมน์ Cost", formula: "ผลรวม Cost ทุกแคมเปญ (ไม่ใช้รายงานรายละเอียดอื่นเพื่อไม่ให้นับซ้ำ)", use: "งบโฆษณา Google ที่ใช้จริง" },
      { name: "Total Paid Media Spend", source: "Meta Ads Spend + Google Ads Campaign Spend", formula: "บวกสองแพลตฟอร์ม (ไม่รวม Facebook Page ซึ่งเป็น Organic)", use: "งบโฆษณารวม ใช้เป็นตัวตั้งของ CPL ทุกตัว" },
      { name: "จำนวน Facebook Posts", source: "Facebook Page — สถิติโพสต์", formula: "นับโพสต์ไม่ซ้ำตามวันเผยแพร่ในช่วง (ไม่รวมเพจที่ตั้งให้ตัดออก)", use: "ความถี่ในการโพสต์" },
      { name: "Reactions + Comments + Shares", source: "Facebook Page — สถิติโพสต์รายวัน", formula: "ผลรวมรายวันตามวันที่ของสถิติ (ไฟล์ Lifetime = ยอดสะสมล่าสุดของแต่ละโพสต์)", use: "การมีส่วนร่วมกับโพสต์" },
      { name: "Facebook Viewers (แทน Reach)", source: "Meta Business Suite → Results → Viewers (ระดับเพจ รายวัน)", formula: "ผลรวม Viewers รายวันในช่วง — ใช้ Viewers เทียบเคียง Reach (ถ้าไม่มีไฟล์ Viewers ใช้ผลรวม Reach รายโพสต์แทน)", use: "จำนวนการเข้าถึงของเพจ · คนเดียวกันต่างวันนับซ้ำ ไม่ใช่จำนวนคนไม่ซ้ำ" },
      { name: "Facebook Link Clicks", source: "Meta Business Suite → Results → Link clicks (ระดับเพจ รายวัน)", formula: "ผลรวมรายวันในช่วง (ถ้าไม่มีไฟล์ระดับเพจ ใช้ Link Clicks รายโพสต์)", use: "คนที่คลิกลิงก์จากเพจ" },
      { name: "LINE OA New Friends / Inquiries / Leads", source: "หน้า LINE OA (กรอกเองรายเดือน)", formula: "ผลรวมของเดือนในช่วง", use: "ผลของช่องทาง LINE" },
      { name: "Total Leads", source: "หน้า Leads", formula: "นับ lead_id ไม่ซ้ำ ตามวันที่รับ Lead ในช่วง", use: "จำนวนผู้สนใจทั้งหมด" },
      { name: "Qualified Leads", source: "หน้า Leads / Buyer Leads — Call Status", formula: `นับ Lead ที่ Call Status = ${list(QUALIFIED_CALL)} (\"ติดต่อได้แล้ว\" ยังไม่นับ)`, use: "Lead ที่มีโอกาสซื้อจริง · กราฟแยกตามช่องทางของ Lead" },
      { name: "CPL (Lead จากโฆษณา)", source: "Total Paid Media Spend + Leads ช่องทาง Facebook Ads / Google Ads", formula: "ค่าโฆษณา ÷ Lead จากโฆษณา (ช่วงวันที่เดียวกับรายงานโฆษณา)", use: "ต้นทุนต่อ Lead ที่มาจากโฆษณาโดยตรง" },
      { name: "CPL (Lead ทั้งหมด)", source: "Total Paid Media Spend + Leads ทุกช่องทาง", formula: "ค่าโฆษณา ÷ Lead ทุกช่องทาง", use: "ต้นทุนเฉลี่ยต่อ Lead ภาพรวม" },
      { name: "Cost per Qualified Lead", source: "Total Paid Media Spend + Qualified Lead จากโฆษณา", formula: `ค่าโฆษณา ÷ Lead จากโฆษณาที่ Call Status = ${list(QUALIFIED_CALL)}`, use: "ต้นทุนต่อ Lead คุณภาพ" },
      { name: "Cost per Site Visit", source: "Total Paid Media Spend + Leads ทุกช่องทาง", formula: `ค่าโฆษณา ÷ Lead ที่ Call Status = ${list(SITE_VISIT_CALL)}`, use: "ต้นทุนต่อการพาลูกค้าเข้าชมโครงการ" },
    ],
  },
  {
    id: "performance", title: "2. Marketing Performance", page: "/performance",
    intro: "ประสิทธิภาพแยก Paid / Organic / Website ตามช่วงวันที่ · ทุกสูตรใช้ตัวตั้งและตัวหารจากแหล่งเดียวกัน ช่วงวันที่เดียวกัน",
    items: [
      { name: "Google Ads Spend / Clicks", source: "Google Ads Time series (รายวัน) ถ้าครบทุกวันในช่วง มิฉะนั้น Campaign Report", formula: "ผลรวมในช่วง (Time series ตัดช่วงวันได้ตรง · Campaign Report เป็นยอดทั้งช่วงรายงาน)", use: "ค่าใช้จ่ายและคลิกของ Google Ads" },
      { name: "CPC", source: "Google Ads", formula: "Spend ÷ Clicks ของรายงานเดียวกัน (Clicks = 0 → N/A)", use: "ต้นทุนต่อคลิก ยิ่งต่ำยิ่งดี" },
      { name: "Meta Ads Spend / Impressions", source: "Facebook Ads (Ads Reporting)", formula: "ผลรวมทุกโฆษณาในช่วง", use: "ค่าใช้จ่ายและการแสดงผลของ Meta" },
      { name: "ผลรวม Reach ระดับโฆษณา (Meta)", source: "Facebook Ads — คอลัมน์ Reach", formula: "ผลรวม Reach ของแต่ละโฆษณา (คนเดียวกันอาจนับซ้ำข้ามโฆษณา)", use: "ประมาณการเข้าถึงของโฆษณา" },
      { name: "Meta Ads Results แยกตาม Action", source: "Facebook Ads — Results + Result indicator", formula: "รวมผลลัพธ์แยกตามประเภท Action (ไม่รวมต่างประเภทกัน)", use: "ดูว่างบไปได้ผลลัพธ์แบบไหน" },
      { name: "Facebook Page (Organic)", source: "สถิติโพสต์ + Viewers / Link clicks ระดับเพจ", formula: "Viewers (แทน Reach), Reactions/Comments/Shares, Seconds viewed, Views, Link Clicks — ผลรวมรายวันในช่วง", use: "ผลของคอนเทนต์ที่ไม่ใช่โฆษณา" },
      { name: "Website Users", source: "GA4 Reports snapshot (Active users) หรือกรอกเองที่หน้า Website", formula: "ใช้ได้เมื่อช่วงที่เลือกตรงกับช่วงของรายงาน GA4 พอดี (รวมข้ามหลายรายงานไม่ได้)", use: "จำนวนผู้ใช้เว็บไซต์" },
      { name: "Website Page Views / Sessions", source: "GA4 Reports snapshot หรือ Pages and screens", formula: "ผลรวมของรายงานที่อยู่ในช่วง", use: "ปริมาณการเข้าชมเว็บ" },
      { name: "Page Views per User", source: "GA4", formula: "Page Views ÷ Users ช่วงเดียวกัน", use: "ความลึกของการเข้าชม" },
      { name: "Duration", source: "GA4 — เวลามีส่วนร่วมเฉลี่ยต่อผู้ใช้", formula: "ค่าจาก snapshot หรือ เวลามีส่วนร่วมรวม ÷ Users", use: "ผู้ใช้อยู่บนเว็บนานแค่ไหน" },
      { name: "Search Clicks / Impressions / CTR / ตำแหน่งเฉลี่ย", source: "Google Search Console (Chart รายวัน)", formula: "CTR = Clicks ÷ Impressions · ตำแหน่งเฉลี่ยถ่วงน้ำหนักด้วย Impressions", use: "การค้นหาแบบ Organic บน Google (ตำแหน่งยิ่งน้อยยิ่งดี)" },
      { name: "Ads Cost per Website Page View / Ads Spend per Website User", source: "Google Ads Spend + GA4", formula: "Google Ads Spend ÷ Page Views หรือ ÷ Users ช่วงเดียวกัน", use: "เทียบงบ Google Ads กับปริมาณเว็บ (ไม่ใช่ Attribution ที่พิสูจน์แล้ว)" },
      { name: "Customer Funnel", source: "Social + GA4 + Leads", formula: `Reach (Meta Ads Reach + Facebook Viewers) → เข้าเว็บ (GA4 Sessions หรือ Users) → Leads → Qualified Leads → ขายได้ (Call Status = ซื้อสำเร็จ) · % = ขั้นนี้ ÷ ขั้นก่อนหน้า`, use: "ดูว่าลูกค้าหลุดที่ขั้นไหน · แต่ละขั้นมาจากคนละระบบ ไม่ได้ติดตามรายคน" },
      { name: "ประสิทธิภาพแต่ละช่องทาง (฿ / Lead)", source: "ค่าโฆษณาของแพลตฟอร์ม + Lead ช่องทางที่ตรงกัน", formula: "Meta Ads Spend ÷ Lead ช่องทาง Facebook Ads · Google Ads Spend ÷ Lead ช่องทาง Google Ads · ฿ / Qualified = ค่าโฆษณา ÷ Qualified Lead ของช่องทางนั้น", use: "เลือกช่องทางที่ควรลงงบเพิ่ม — ดู ฿/Qualified และ ซื้อสำเร็จ ประกอบ" },
    ],
  },
  {
    id: "leads", title: "3. Leads / Seller Leads / Buyer Leads", page: "/leads",
    intro: "สถานะของ Lead ที่ใช้คำนวณตัวเลขในหน้าอื่น",
    items: [
      { name: "Call Status (Buyer Leads)", source: "กรอกที่หน้า Leads หรือลากการ์ดที่หน้า Buyer Leads", formula: list(CALL_STATUS), use: "ขั้นการติดตามลูกค้าที่ต้องการ ซื้อ / เช่า / สร้าง" },
      { name: "Sell Status (Seller Leads)", source: "กรอกที่หน้า Leads หรือลากการ์ดที่หน้า Seller Leads", formula: list(SELL_STATUS), use: "ขั้นของลูกค้าที่ต้องการขายบ้าน" },
      { name: "Qualified Lead", source: "Call Status", formula: list(QUALIFIED_CALL), use: "ใช้ใน Qualified Leads, Cost per Qualified Lead, Funnel และตารางช่องทาง" },
      { name: "Site Visit", source: "Call Status", formula: list(SITE_VISIT_CALL), use: "ใช้ใน Cost per Site Visit" },
      { name: "ขายได้", source: "Call Status", formula: "ซื้อสำเร็จ", use: "ขั้นสุดท้ายของ Funnel และคอลัมน์ ซื้อสำเร็จ ในตารางช่องทาง" },
      { name: "ขั้น Pipeline (คำนวณ)", source: "Buy / Sell Status + Call Status", formula: "Won = Close / ขายแล้ว · Lost = Archive / ยกเลิก / บ้านไม่พร้อมขาย · Qualified = Hot / Warm / สนใจขาย / นัดทำสัญญา / เซ็นสัญญา / สัญญาเปิด · Contacted = ติดต่อได้แล้วขึ้นไป · อื่น ๆ = New", use: "ใช้ในกราฟ Pipeline และไฟล์ส่งออก (ไม่ต้องกรอกเอง)" },
    ],
  },
  {
    id: "lead-report", title: "4. รายงาน Lead · ติดตาม · เป้าหมาย", page: "/lead-report",
    intro: "ผลงานรายพนักงาน เหตุผลที่ไม่สำเร็จ รายการติดตาม และยอดจริงเทียบเป้ารายเดือน",
    items: [
      { name: "Lead ที่รับ (รายพนักงาน)", source: "หน้า Leads — ช่อง Staff", formula: "นับ Lead ตามวันที่รับในช่วง แยกตาม Staff (ว่าง = ไม่ระบุ Staff)", use: "ปริมาณงานของแต่ละคน" },
      { name: "% Qualified", source: "Call Status", formula: `Qualified (${list(QUALIFIED_CALL)}) ÷ Lead ที่รับ × 100`, use: "คุณภาพการติดตาม" },
      { name: "Lead ต่อ 1 Site Visit", source: "Call Status", formula: `Lead ที่รับ ÷ จำนวน Site Visit (${list(SITE_VISIT_CALL)}) · ไม่มี Site Visit = —`, use: "ต้องได้ Lead กี่รายถึงพาเข้าชม 1 ราย (ยิ่งน้อยยิ่งดี)" },
      { name: "Lead ต่อ 1 สัญญา / ขาย", source: "Sell Status", formula: "Lead ที่รับ ÷ จำนวน Lead ที่ Sell Status = เซ็นสัญญา / สัญญาเปิด / ขายแล้ว", use: "ต้องได้ Lead กี่รายถึงได้สัญญา 1 ราย (ยิ่งน้อยยิ่งดี)" },
      { name: "เหตุผลที่ไม่สำเร็จ", source: "Call / Sell / Buy Status + ช่อง เหตุผลที่ปิดไม่สำเร็จ", formula: "กู้ไม่ผ่าน / ไม่สนใจ / ติดต่อไม่ได้ / ยกเลิก (ขาย) / บ้านไม่พร้อมขาย / Archive — Lead หนึ่งรายนับเหตุผลเดียว · % ไม่สำเร็จ = ไม่สำเร็จ ÷ Lead ของช่องทาง", use: "ดูว่าช่องทางไหนได้ Lead ไม่ตรงกลุ่ม" },
      { name: `เลยกำหนด / วันนี้ / ค้างเกิน ${STALE_DAYS} วัน`, source: "ช่อง ติดตามครั้งถัดไป + แก้ไขล่าสุด", formula: `เลยกำหนด = วันติดตาม < วันนี้ · วันนี้ = วันติดตามคือวันนี้ · ค้าง = ไม่มีวันติดตามและไม่ได้แก้ไขเกิน ${STALE_DAYS} วัน · ไม่นับ Lead ที่จบแล้ว`, use: "รายการที่ฝ่ายขายต้องโทรต่อ" },
      { name: "ค่าโฆษณา vs งบ / Leads vs เป้า", source: "ตั้งค่า → เป้าหมายรายเดือน + Total Paid Media Spend / Total Leads", formula: "ยอดจริงของเดือน ÷ เป้า × 100 · เส้นสีฟ้า = สัดส่วนวันที่ผ่านไปของเดือน (ถ้าแถบสั้นกว่าเส้น = ช้ากว่าแผน)", use: "ติดตามงบและเป้าระหว่างเดือน" },
      { name: "Checklist ข้อมูลประจำเดือน", source: "ข้อมูลที่นำเข้าแล้วทุกแหล่ง", formula: "ครบ = มีข้อมูลทุกวันของเดือน (เดือนปัจจุบันถึงเมื่อวาน) · บางส่วน = มีบางช่วง · ยังไม่มี = ยังไม่ได้นำเข้า", use: "รู้ว่าเดือนนี้ยังขาดไฟล์อะไร ก่อนอ่านตัวเลข" },
    ],
  },
  {
    id: "sales", title: "5. Sales", page: "/sales",
    intro: "จากรายงานยอดขาย FlowAccount (.xlsx) · เฉพาะ Admin / Sales",
    items: [
      { name: "ยอดขายสุทธิ", source: "FlowAccount — ยอดรวมสุทธิ", formula: "ผลรวมทุกเอกสารในช่วง (เอกสารยกเลิกรวมตามรายงานบัญชี — มีคำเตือน)", use: "รายได้ตามเอกสารขาย" },
      { name: "ยอดขายก่อนส่วนลด / ส่วนลดรวม / ภาษีมูลค่าเพิ่ม", source: "FlowAccount — ขายแยกภาษี / ส่วนลด / ภาษีมูลค่าเพิ่ม", formula: "ผลรวมตามคอลัมน์ในรายงาน", use: "ดูโครงสร้างยอดขาย" },
      { name: "จำนวนเอกสารขาย / จำนวนลูกค้า", source: "FlowAccount", formula: "นับเลขที่เอกสารไม่ซ้ำ · ลูกค้านับไม่ซ้ำตามเลขผู้เสียภาษี (ไม่มีใช้ชื่อ)", use: "ปริมาณการขาย" },
      { name: "ยอดที่เก็บเงินแล้ว / ยังไม่เก็บเงิน", source: "FlowAccount — สถานะ", formula: "แยกตามสถานะการเก็บเงิน (เอกสารไม่มีสถานะไม่นับ)", use: "ติดตามการรับชำระ" },
    ],
  },
];

export const STATES: [string, string][] = [
  ["รอข้อมูล", "ยังไม่มีข้อมูลของช่วงนี้ (ไม่ใช่ 0) — นำเข้าไฟล์ของช่วงนั้นก่อน"],
  ["N/A", "คำนวณไม่ได้เพราะตัวหารเป็น 0 เช่น CPL เมื่อยังไม่มี Lead"],
  ["ข้อมูลไม่ครบ", "มีตัวเลข แต่ข้อมูลไม่ครอบคลุมทุกวันในช่วง หรือรายงานครอบคลุมเกินช่วง — อ่านเหตุผลบนการ์ด"],
  ["Missing Data", "ไม่มีข้อมูลของช่วงที่ใช้เปรียบเทียบ"],
  ["% เปรียบเทียบ (YoY / ช่วงก่อน)", "(ช่วงปัจจุบัน − ช่วงเปรียบเทียบ) ÷ ช่วงเปรียบเทียบ × 100 · ช่วงเปรียบเทียบ = 0 → N/A · YoY = ช่วงวันที่เดียวกันของปีก่อน · ช่วงก่อน = ช่วงก่อนหน้าที่ยาวเท่ากัน"],
];
