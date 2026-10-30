import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CALL_STATUS, QUALIFIED_CALL, SELL_STATUS, SITE_VISIT_CALL } from "@/lib/lead-options";

// คำอธิบายที่มาและการใช้งานตัวเลขทั้งหมด (เมนูย่อยของ ตั้งค่า) — ทุก Role เปิดได้
// รายการสถานะ (Qualified / Site Visit) อ่านจาก lib/lead-options โดยตรง เพื่อให้คำอธิบายตรงกับสูตรที่ระบบใช้เสมอ
type M = { name: string; source: string; formula: string; use: string };
type Sec = { id: string; title: string; page?: string; intro?: string; items: M[] };

const list = (a: readonly string[]) => a.join(" / ");

const SECTIONS: Sec[] = [
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
    id: "sales", title: "4. Sales", page: "/sales",
    intro: "จากรายงานยอดขาย FlowAccount (.xlsx) · เฉพาะ Admin / Sales",
    items: [
      { name: "ยอดขายสุทธิ", source: "FlowAccount — ยอดรวมสุทธิ", formula: "ผลรวมทุกเอกสารในช่วง (เอกสารยกเลิกรวมตามรายงานบัญชี — มีคำเตือน)", use: "รายได้ตามเอกสารขาย" },
      { name: "ยอดขายก่อนส่วนลด / ส่วนลดรวม / ภาษีมูลค่าเพิ่ม", source: "FlowAccount — ขายแยกภาษี / ส่วนลด / ภาษีมูลค่าเพิ่ม", formula: "ผลรวมตามคอลัมน์ในรายงาน", use: "ดูโครงสร้างยอดขาย" },
      { name: "จำนวนเอกสารขาย / จำนวนลูกค้า", source: "FlowAccount", formula: "นับเลขที่เอกสารไม่ซ้ำ · ลูกค้านับไม่ซ้ำตามเลขผู้เสียภาษี (ไม่มีใช้ชื่อ)", use: "ปริมาณการขาย" },
      { name: "ยอดที่เก็บเงินแล้ว / ยังไม่เก็บเงิน", source: "FlowAccount — สถานะ", formula: "แยกตามสถานะการเก็บเงิน (เอกสารไม่มีสถานะไม่นับ)", use: "ติดตามการรับชำระ" },
    ],
  },
];

const STATES: [string, string][] = [
  ["รอข้อมูล", "ยังไม่มีข้อมูลของช่วงนี้ (ไม่ใช่ 0) — นำเข้าไฟล์ของช่วงนั้นก่อน"],
  ["N/A", "คำนวณไม่ได้เพราะตัวหารเป็น 0 เช่น CPL เมื่อยังไม่มี Lead"],
  ["ข้อมูลไม่ครบ", "มีตัวเลข แต่ข้อมูลไม่ครอบคลุมทุกวันในช่วง หรือรายงานครอบคลุมเกินช่วง — อ่านเหตุผลบนการ์ด"],
  ["Missing Data", "ไม่มีข้อมูลของช่วงที่ใช้เปรียบเทียบ"],
  ["% เปรียบเทียบ (YoY / ช่วงก่อน)", "(ช่วงปัจจุบัน − ช่วงเปรียบเทียบ) ÷ ช่วงเปรียบเทียบ × 100 · ช่วงเปรียบเทียบ = 0 → N/A · YoY = ช่วงวันที่เดียวกันของปีก่อน · ช่วงก่อน = ช่วงก่อนหน้าที่ยาวเท่ากัน"],
];

export default async function MetricsGuidePage() {
  const role = (await auth())?.user?.role;
  if (!role) redirect("/");
  return (
    <section className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">คำอธิบายตัวเลข</h1>
        <p className="text-sm text-slate-500">ที่มา สูตร และวิธีใช้ตัวเลขทุกตัวในระบบ · วิธีดาวน์โหลดไฟล์ดูที่ <Link href="/settings/import-guide" className="underline">คู่มือนำเข้าข้อมูล</Link></p>
      </div>

      <nav aria-label="สารบัญ" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <div className="mb-2 font-semibold">สารบัญ</div>
        <ol className="grid gap-1 sm:grid-cols-2">
          <li><a href="#states" className="underline">สถานะของตัวเลข</a></li>
          {SECTIONS.map((s) => <li key={s.id}><a href={`#${s.id}`} className="underline">{s.title}</a></li>)}
        </ol>
      </nav>

      <article id="states" className="scroll-mt-4 space-y-2 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">สถานะของตัวเลข</h2>
        <dl className="space-y-2 text-sm">{STATES.map(([k, v]) => <div key={k} className="grid gap-1 sm:grid-cols-[12rem_1fr]"><dt className="font-medium">{k}</dt><dd className="text-slate-700">{v}</dd></div>)}</dl>
        <p className="text-xs text-slate-500">หลักการ: ไม่มีข้อมูลจะไม่แสดงเป็น 0 · ทุกสูตรใช้ข้อมูลช่วงวันที่เดียวกัน · ผลรวม Reach / Viewers หลายวันนับคนซ้ำ ไม่ใช่จำนวนคนไม่ซ้ำ · นำเข้าไฟล์เดิมซ้ำไม่ทำให้ตัวเลขเพิ่ม</p>
      </article>

      {SECTIONS.map((s) => (
        <article key={s.id} id={s.id} className="scroll-mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-lg font-semibold">{s.title}{s.page && <Link href={s.page} className="ml-2 text-sm font-normal underline">เปิดหน้า</Link>}</h2>
            {s.intro && <p className="text-sm text-slate-500">{s.intro}</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead><tr className="border-b text-xs text-slate-500"><th className="py-1.5 pr-3">ตัวเลข</th><th className="pr-3">ที่มา</th><th className="pr-3">สูตร / วิธีคำนวณ</th><th>ใช้ทำอะไร</th></tr></thead>
              <tbody>{s.items.map((m) => (
                <tr key={m.name} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 font-medium">{m.name}</td><td className="py-2 pr-3 text-slate-600">{m.source}</td><td className="py-2 pr-3 text-slate-700">{m.formula}</td><td className="py-2 text-slate-600">{m.use}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </article>
      ))}
    </section>
  );
}
