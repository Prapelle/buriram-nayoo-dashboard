import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Link from "next/link";
import { GoogleButton } from "@/components/GoogleButton";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user?.role) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight">Buriram NAYOO</h1>
        <p className="text-sm text-slate-600">Marketing Dashboard — เฉพาะผู้ได้รับอนุญาต</p>
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          เข้าสู่ระบบไม่สำเร็จ หรืออีเมลนี้ยังไม่ได้รับสิทธิ์ กรุณาติดต่อ Admin
        </p>
      )}
      <GoogleButton />
      <p className="text-center text-xs text-slate-500"><Link href="/privacy" className="underline">นโยบายความเป็นส่วนตัว (Privacy Policy)</Link></p>
    </main>
  );
}
