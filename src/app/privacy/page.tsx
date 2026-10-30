import Link from "next/link";

// นโยบายความเป็นส่วนตัว — หน้าสาธารณะ (ไม่ต้องล็อกอิน) ใช้เป็น Privacy policy URL ของ Google OAuth consent screen
export const metadata = { title: "นโยบายความเป็นส่วนตัว — Buriram NAYOO Dashboard" };
export const dynamic = "force-static";

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mt-6 text-lg font-semibold">{children}</h2>;

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-3 p-6 text-sm leading-relaxed text-slate-700">
      <h1 className="text-2xl font-bold text-slate-900">นโยบายความเป็นส่วนตัว (Privacy Policy)</h1>
      <p className="text-slate-500">Buriram NAYOO Marketing Dashboard · ปรับปรุงล่าสุด 30 ตุลาคม 2026</p>
      <p>Buriram NAYOO Marketing Dashboard (&quot;ระบบ&quot;) เป็นเครื่องมือภายในสำหรับทีมการตลาดและฝ่ายขายของบุรีรัมย์น่าอยู่ ใช้ได้เฉพาะผู้ที่ผู้ดูแลระบบเพิ่มสิทธิ์ไว้แล้วเท่านั้น</p>

      <H>1. ข้อมูลที่เราได้รับจากบัญชี Google</H>
      <p>เมื่อเข้าสู่ระบบด้วย Google ระบบขอเฉพาะสิทธิ์พื้นฐาน (openid, email, profile) และใช้เฉพาะ <b>อีเมล</b> และ <b>ชื่อ</b> ของบัญชี เพื่อยืนยันตัวตนและตรวจว่าอีเมลนั้นได้รับสิทธิ์ใช้งานหรือไม่ · ระบบไม่เข้าถึง Gmail, Google Drive, รายชื่อติดต่อ หรือข้อมูลอื่นในบัญชี Google ของผู้ใช้</p>

      <H>2. การใช้และการเก็บข้อมูล</H>
      <ul className="list-disc space-y-1 pl-5">
        <li>อีเมลของผู้ใช้ใช้เพื่อเข้าสู่ระบบ กำหนดสิทธิ์ (Admin / Marketing / Sales) และบันทึกประวัติการแก้ไขข้อมูล (Audit Log)</li>
        <li>ข้อมูลธุรกิจ (สถิติโฆษณา ข้อมูลเว็บไซต์ Lead และยอดขาย) จัดเก็บใน Google Sheet ของบุรีรัมย์น่าอยู่ เข้าถึงได้เฉพาะผู้มีสิทธิ์ตามบทบาท</li>
        <li>ระบบใช้คุกกี้เซสชันที่จำเป็นต่อการเข้าสู่ระบบเท่านั้น ไม่ใช้คุกกี้โฆษณาหรือติดตามผู้ใช้</li>
      </ul>

      <H>3. การเปิดเผยข้อมูล</H>
      <p>เราไม่ขาย ไม่ให้เช่า และไม่ส่งต่อข้อมูลจากบัญชี Google ของผู้ใช้ให้บุคคลภายนอก · ระบบทำงานบน Cloudflare และจัดเก็บข้อมูลใน Google Sheets ในฐานะผู้ให้บริการโครงสร้างพื้นฐานเท่านั้น</p>
      <p>การใช้ข้อมูลที่ได้รับจาก Google APIs เป็นไปตาม <a className="underline" href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer" target="_blank">Google API Services User Data Policy</a> รวมถึงข้อกำหนด Limited Use</p>

      <H>4. การลบข้อมูลและการติดต่อ</H>
      <p>ผู้ใช้ขอยกเลิกสิทธิ์หรือขอลบข้อมูลบัญชีของตนได้โดยติดต่อผู้ดูแลระบบ (อีเมลที่แสดงในหน้าขอสิทธิ์ของ Google ขณะเข้าสู่ระบบ) · ยกเลิกการเชื่อมต่อได้เองที่ <a className="underline" href="https://myaccount.google.com/permissions" rel="noopener noreferrer" target="_blank">myaccount.google.com/permissions</a></p>

      <hr className="my-6" />
      <div lang="en" className="space-y-2 text-slate-600">
        <h2 className="text-base font-semibold text-slate-800">Summary (English)</h2>
        <p>Buriram NAYOO Marketing Dashboard is an internal tool for authorized staff only. Google Sign-In requests only the basic openid, email and profile scopes; we use the account email and name solely to authenticate users and check their access role. We do not access other Google account data, and we do not sell or share user data. Business data is stored in the organization&apos;s Google Sheet. Use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Contact the administrator (the support email shown on the Google consent screen) to request account removal.</p>
      </div>
      <p className="pt-4"><Link href="/login" className="underline">← เข้าสู่ระบบ</Link></p>
    </main>
  );
}
