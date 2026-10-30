import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

// คู่มือนำเข้าข้อมูล (เมนูย่อยของ ตั้งค่า) — ทุก Role ที่ล็อกอินเปิดได้ เพราะ Marketing / Sales เป็นผู้นำเข้าข้อมูล
type Guide = {
  id: string; title: string; where: string; who: string; when: string;
  steps: React.ReactNode[]; files?: React.ReactNode[]; tips?: React.ReactNode[];
};

const B = ({ children }: { children: React.ReactNode }) => <b className="font-semibold text-slate-900">{children}</b>;

const GUIDES: Guide[] = [
  {
    id: "fb-posts", title: "1.1 Facebook Page — สถิติโพสต์รายวัน", where: "Meta Business Suite → เนื้อหา (Content)", who: "Admin / Marketing", when: "ต้นเดือน (ข้อมูลเดือนก่อนหน้า)",
    steps: [
      <>เปิด <B>Meta Business Suite</B> → เมนู <B>เนื้อหา (Content)</B></>,
      <>กด <B>ส่งออกข้อมูล (Export data)</B></>,
      <>เลือก <B>เพจ</B> ที่ต้องการ (บุรีรัมย์น่าอยู่)</>,
      <>ช่วงวันที่: <B>เดือนก่อนหน้า</B></>,
      <>ประเภทเนื้อหา: <B>เผยแพร่แล้ว (Published)</B></>,
      <>รูปแบบข้อมูล: <B>รายวัน (Daily)</B> · ระดับ <B>โพสต์ (Post)</B> · อ้างอิงวันที่ <B>วันที่สร้าง (Creation date)</B></>,
      <>กดส่งออก แล้วดาวน์โหลดไฟล์ CSV</>,
    ],
    files: [<>ไฟล์ CSV หนึ่งไฟล์ ที่มีคอลัมน์ Post ID, Page ID, Publish time, Permalink, Post type และ <B>Date</B> (วันที่ของสถิติแต่ละวัน)</>],
    tips: [
      <>ต้องเลือก <B>รายวัน (Daily)</B> — ไฟล์แบบ Lifetime ใช้ได้แต่เป็นยอดสะสม ระบบจะถามวันที่ส่งออก และไม่นำไปรวมกับยอดรายวัน</>,
      <>นำเข้าเดือนเดิมซ้ำได้ ระบบอัปเดตตาม Page ID + Post ID + วันที่ ไม่นับซ้ำ</>,
    ],
  },
  {
    id: "fb-results", title: "1.2 Facebook Page — Viewers และ Link clicks", where: "Meta Business Suite → ข้อมูลเชิงลึก (Insights) → ผลลัพธ์ (Results)", who: "Admin / Marketing", when: "ต้นเดือน (ช่วงเดียวกับข้อ 1.1)",
    steps: [
      <>เปิด <B>Meta Business Suite</B> → <B>ข้อมูลเชิงลึก (Insights)</B> → หน้า <B>ผลลัพธ์ (Results)</B></>,
      <><B>ตั้งช่วงวันที่ด้านบน</B> เป็นเดือนที่ต้องการ</>,
      <>ที่กราฟ <B>Viewers</B> กด ส่งออก (Export) → ได้ไฟล์ Viewers.csv</>,
      <>ที่กราฟ <B>Link clicks</B> กด ส่งออก (Export) → ได้ไฟล์ Link_clicks.csv</>,
    ],
    files: [<>2 ไฟล์ (Viewers, Link clicks) — ไม่ต้องเปิดแก้ใน Excel ระบบอ่านไฟล์ของ Meta ได้โดยตรง (รวมบรรทัด sep= และไฟล์ UTF-16)</>],
    tips: [
      <>Dashboard ใช้ <B>Viewers แทน Reach</B> ของ Facebook Page (หมายเหตุ &quot;ใช้ Viewers เทียบเคียง Reach&quot;) — ผลรวมรายวันนับคนซ้ำข้ามวัน ไม่ใช่ Unique</>,
      <>ไฟล์ไม่ระบุชื่อเพจ — ตอนส่งออกให้เลือกเฉพาะเพจบุรีรัมย์น่าอยู่</>,
    ],
  },
  {
    id: "fb-ads", title: "2. Facebook Ads (Meta Ads)", where: "Ads Manager → Ads Reporting", who: "Admin / Marketing", when: "ต้นเดือน",
    steps: [
      <>เปิด <B>Ads Manager</B> → เมนู <B>Ads Reporting</B> (รายงานโฆษณา)</>,
      <>ตั้งช่วงวันที่เป็นเดือนที่ต้องการ</>,
      <>สร้าง/เปิดรายงานแบบตาราง ระดับ <B>โฆษณา (Ad)</B> ให้มีคอลัมน์ <B>Ad set name, Ad name, Amount spent (THB), Results, Result indicator, Impressions, Reach</B> (และ Reporting starts / Reporting ends)</>,
      <>Export → <B>CSV</B></>,
    ],
    files: [<>ไฟล์ CSV หนึ่งไฟล์ต่อช่วงวันที่ — ระบบอ่านช่วงวันที่จากคอลัมน์ Reporting starts / ends</>],
    tips: [
      <>ตั้งภาษา Ads Manager เป็น <B>English</B> ก่อน Export — ระบบตรวจประเภทไฟล์จากชื่อคอลัมน์ภาษาอังกฤษ</>,
      <>ใช้ช่วงวันที่ไม่ทับกัน (เช่น ทีละเดือน) เพื่อไม่ให้ค่าโฆษณาซ้อนกัน</>,
    ],
  },
  {
    id: "google-ads", title: "3. Google Ads", where: "Google Ads → ภาพรวม (Overview) / แคมเปญ (Campaigns)", who: "Admin / Marketing", when: "ต้นเดือน",
    steps: [
      <>เปิด <B>Google Ads</B> แล้วตั้งช่วงวันที่มุมขวาบนเป็นเดือนที่ต้องการ</>,
      <><B>สำคัญที่สุด:</B> หน้า <B>แคมเปญ (Campaigns)</B> → ดาวน์โหลด (Download) → <B>CSV</B> = Campaign Report (ยอดใช้จ่ายหลักของ Dashboard)</>,
      <>หน้า <B>ภาพรวม (Overview)</B> → กราฟหลัก (Time series) → ดาวน์โหลด CSV = ยอดรายวัน (ใช้เลือกช่วงวันที่ย่อยและกราฟแนวโน้ม)</>,
      <>ไม่บังคับ: การ์ดอื่นในหน้าภาพรวม (Devices, Networks, Searches, Search keywords, Day &amp; hour, Demographics, Optimization score, Biggest changes, Auction insights) กด ⋮ → ดาวน์โหลด CSV</>,
    ],
    files: [<>ใช้ <B>ชื่อไฟล์ตามที่ Google Ads ตั้งให้</B> เช่น Campaigns_2026_09_01-2026_09_30_.csv — ระบบอ่านช่วงวันที่จากชื่อไฟล์ (ถ้าเปลี่ยนชื่อไฟล์ ต้องกรอกช่วงวันที่เองตอนนำเข้า)</>],
    tips: [<>ตั้งภาษา Google Ads เป็น <B>English</B> ก่อนดาวน์โหลด (ระบบอ่านชื่อคอลัมน์ภาษาอังกฤษ)</>],
  },
  {
    id: "website", title: "4. Website — Google Analytics 4 และ Google Search Console", where: "GA4 และ Search Console", who: "Admin / Marketing", when: "ต้นเดือน",
    steps: [
      <><B>GA4 (แนะนำ):</B> Reports → <B>Reports snapshot</B> → ตั้งช่วงวันที่ → Share this report → Download file → <B>CSV</B> (มียอดผู้ใช้จริง Users, Sessions, เวลามีส่วนร่วม)</>,
      <>GA4 (ไม่บังคับ): Reports → Engagement → <B>Pages and screens</B> → ช่วงวันที่เดียวกัน → Download CSV (รายละเอียดรายหน้า)</>,
      <><B>Search Console:</B> Performance → Search results → ตั้งช่วงวันที่ (ใส่ตัวกรอง Page: buriram แบบเดิมทุกครั้ง) → <B>Export → Download CSV</B> → แตกไฟล์ zip ได้ 7 ไฟล์</>,
    ],
    files: [<>นำเข้าได้หลายไฟล์พร้อมกัน — ไฟล์ Search Console ต้องเลือก <B>ทั้ง 7 ไฟล์</B> (รวม Filters.csv ที่บอกช่วงวันที่)</>],
    tips: [
      <>เลือกช่วงวันที่ของ GA4 ให้ตรงกับเดือนที่จะดูในหน้า Marketing Performance — ยอดผู้ใช้รวมข้ามหลายรายงานไม่ได้</>,
      <>ตั้งภาษา Search Console เป็น <B>English</B> ก่อน Export</>,
    ],
  },
  {
    id: "sales", title: "5. Sales — FlowAccount", where: "FlowAccount → รายงาน → รายงานยอดขาย", who: "Admin / Sales (มีข้อมูลลูกค้า)", when: "ต้นเดือน หรือเมื่อต้องการอัปเดต",
    steps: [
      <>เข้า <B>FlowAccount</B> → เมนู <B>รายงาน</B> → <B>รายงานยอดขาย</B></>,
      <>เลือกช่วงวันที่ (เช่น เดือนก่อนหน้า)</>,
      <>ดาวน์โหลดเป็น <B>Excel (.xlsx)</B></>,
    ],
    files: [<>ไฟล์ .xlsx ที่หัวรายงานมี ชื่อบริษัท, เลขประจำตัวผู้เสียภาษี, &quot;รายงานยอดขาย&quot;, ช่วงวันที่ และตารางคอลัมน์ วัน/เดือน/ปี, เลขที่เอกสาร, ชื่อลูกค้า, ชื่อโปรเจ็ค, มูลค่า, ภาษีมูลค่าเพิ่ม, ยอดรวมสุทธิ, สถานะ</>],
    tips: [
      <>ชื่อเมนูใน FlowAccount อาจต่างเล็กน้อยตามเวอร์ชัน — ให้ใช้รายงานที่มีคอลัมน์ตามด้านบน</>,
      <>นำเข้าที่หน้า <B>Sales → นำเข้า</B> หรือหน้า นำเข้า CSV (เฉพาะ Admin) · เอกสารเลขเดิมจะไม่ถูกนับซ้ำ</>,
    ],
  },
];

export default async function ImportGuidePage() {
  const role = (await auth())?.user?.role;
  if (!role) redirect("/");
  return (
    <section className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">คู่มือนำเข้าข้อมูล</h1>
        <p className="text-sm text-slate-500">วิธีดาวน์โหลดไฟล์จากแต่ละแพลตฟอร์ม แล้วนำเข้าที่หน้า <Link href="/import" className="underline">นำเข้า CSV</Link> (เลือกหลายไฟล์พร้อมกันได้ ระบบตรวจประเภทไฟล์และกันข้อมูลซ้ำให้อัตโนมัติ)</p>
      </div>

      <nav aria-label="สารบัญ" className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <div className="mb-2 font-semibold">สารบัญ</div>
        <ol className="grid gap-1 sm:grid-cols-2">{GUIDES.map((g) => <li key={g.id}><a href={`#${g.id}`} className="underline">{g.title}</a></li>)}</ol>
      </nav>

      <div className="rounded-lg bg-sky-50 p-4 text-sm text-sky-900">
        <div className="mb-1 font-semibold">ขั้นตอนหลังดาวน์โหลดไฟล์ (ทุกแพลตฟอร์ม)</div>
        <ol className="list-decimal space-y-1 pl-5">
          <li>ไปที่ <Link href="/import" className="underline">นำเข้า CSV</Link> → ลากไฟล์มาวาง หรือกด เลือกไฟล์ (หลายไฟล์พร้อมกันได้)</li>
          <li>ตรวจประเภทรายงานและช่วงวันที่ที่ระบบอ่านได้ → กด <b>ยืนยันนำเข้า</b> (ไฟล์ถัดไปกด <b>ไฟล์ถัดไป</b>)</li>
          <li>ถ้าระบบแจ้งให้ <b>เตรียม Google Sheet</b> ให้ Admin ไปที่ ตั้งค่า → ตั้งค่าระบบ → เตรียม Google Sheet แล้วนำเข้าใหม่</li>
          <li>ดูผลที่หน้า ภาพรวมการตลาด / Marketing Performance — ไม่ต้องแก้ไฟล์ก่อนนำเข้า (ไม่ต้องเปิดแล้วบันทึกใน Excel)</li>
        </ol>
      </div>

      {GUIDES.map((g) => (
        <article key={g.id} id={g.id} className="scroll-mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">{g.title}</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-slate-500">ดาวน์โหลดจาก</dt><dd>{g.where}</dd></div>
            <div><dt className="text-xs text-slate-500">ผู้นำเข้า</dt><dd>{g.who}</dd></div>
            <div><dt className="text-xs text-slate-500">ความถี่</dt><dd>{g.when}</dd></div>
          </dl>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          {g.files && <div className="text-sm"><div className="text-xs font-semibold text-slate-500">ไฟล์ที่ได้</div><ul className="list-disc pl-5 text-slate-700">{g.files.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
          {g.tips && <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900"><div className="text-xs font-semibold">ข้อควรระวัง</div><ul className="list-disc pl-5">{g.tips.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
        </article>
      ))}

      <p className="text-xs text-slate-500">LINE OA ไม่มีไฟล์นำเข้า — กรอกยอดรายเดือนที่หน้า LINE OA · Leads กรอกที่หน้า Leads</p>
    </section>
  );
}
