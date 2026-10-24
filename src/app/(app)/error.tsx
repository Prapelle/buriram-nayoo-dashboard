"use client";

export default function PageError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="max-w-xl space-y-3 rounded-lg bg-red-50 p-5 text-sm text-red-800">
      <p className="font-semibold">เกิดข้อผิดพลาดในการแสดงหน้านี้</p>
      <p>{error.message.slice(0, 200)}</p>
      <button onClick={reset} className="rounded-md bg-red-700 px-3 py-1.5 text-white">ลองอีกครั้ง</button>
    </div>
  );
}
