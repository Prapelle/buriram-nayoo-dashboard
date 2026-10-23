"use client";

// ส่งฟอร์ม POST ไปที่ /api/auth/signin/google พร้อม CSRF token (วิธีมาตรฐานของ Auth.js)
export function GoogleButton() {
  async function go() {
    const res = await fetch("/api/auth/csrf");
    const { csrfToken } = (await res.json()) as { csrfToken: string };
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/auth/signin/google";
    for (const [name, value] of Object.entries({ csrfToken, callbackUrl: "/" })) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  }

  return (
    <button
      onClick={go}
      className="w-full rounded-md bg-slate-900 px-4 py-2.5 font-medium text-white hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
    >
      เข้าสู่ระบบด้วย Google
    </button>
  );
}
