// ข้อมูลคู่มือนำเข้าข้อมูล (ใช้ในหน้าสารบัญและหน้าย่อยของแต่ละแพลตฟอร์ม)
// คู่มือนำเข้าข้อมูล (เมนูย่อยของ ตั้งค่า) — ทุก Role ที่ล็อกอินเปิดได้ เพราะ Marketing / Sales เป็นผู้นำเข้าข้อมูล
export type Guide = {
  id: string; title: string; where: string; who: string; when: string;
  steps: React.ReactNode[]; files?: React.ReactNode[]; tips?: React.ReactNode[];
};

const B = ({ children }: { children: React.ReactNode }) => <b className="font-semibold text-slate-900">{children}</b>;

export const GUIDES: Guide[] = [
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
