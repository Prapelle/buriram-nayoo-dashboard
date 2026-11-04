"use client";
export function PrintButton() {
  return (
    <div className="print:hidden fixed right-4 top-4 flex gap-2">
      <button type="button" onClick={() => window.print()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-brand-700">พิมพ์ / บันทึกเป็น PDF</button>
      <button type="button" onClick={() => window.history.length > 1 ? window.history.back() : window.close()} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm shadow">กลับ</button>
    </div>
  );
}
