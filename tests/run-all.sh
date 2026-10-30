#!/usr/bin/env bash
# รันเทสต์ทั้งหมด: bash tests/run-all.sh
# - security: ไม่ต้องมีไฟล์ตัวอย่าง
# - import/dashboard/e2e: ต้องวางไฟล์ CSV ตัวอย่างจริงใน tests/fixtures/ (ดู tests/fixtures/README.md)
# - sales: ใช้ไฟล์ Excel จำลองที่สคริปต์สร้างให้ (ถ้ามีไฟล์จริง ตั้ง REAL_SALES_FILE=ชื่อไฟล์ ใน tests/fixtures/)
set -e
FIX="${FIXTURE_DIR:-tests/fixtures}"
echo "== security";  npx tsx tests/security.test.mts
python3 tests/make-sales-fixture.py "$FIX/synthetic_SalesReport.xlsx"
echo "== sales";     npx tsx tests/sales.test.mts
echo "== seller-leads"; npx tsx tests/sellerleads.test.ts
echo "== seller-leads-service"; npx tsx tests/sellerleads-service.test.mts
if ls "$FIX"/Page.csv >/dev/null 2>&1; then
  echo "== import";    npx tsx tests/import.test.ts
  echo "== dashboard"; npx tsx tests/dashboard.test.ts
  echo "== overview";  npx tsx tests/overview.test.ts
  echo "== fbactions"; npx tsx tests/fbactions.test.ts
  echo "== performance"; npx tsx tests/performance.test.ts
  echo "== yoy";       npx tsx tests/yoy.test.ts
  echo "== kpicard";   npx tsx --tsconfig tests/tsconfig.jsx.json tests/kpicard.test.tsx
  echo "== website";   npx tsx tests/website.test.ts
  echo "== fbpage";    npx tsx tests/fbpage.test.mts
  echo "== e2e";       npx tsx tests/e2e.test.mts
else
  echo "(ข้าม import/dashboard/e2e เพราะยังไม่มีไฟล์ CSV ตัวอย่างใน $FIX)"
fi
# Phase 9: Integration Test ระดับ HTTP (เซิร์ฟเวอร์ Next จริง + Google จำลอง) — ต้อง build ก่อน (.next)
if [ -f .next/BUILD_ID ]; then echo "== http-integration"; node tests/integration/run.mjs; else echo "(ข้าม http-integration: ยังไม่ได้ build)"; fi
# Phase 5: หน้า Website ในเบราว์เซอร์จริง (ต้องมี Playwright + Chromium และไฟล์ใน tests/fixtures/website)
if [ -f .next/BUILD_ID ] && [ -f "${FIXTURE_DIR:-tests/fixtures}/website/ga4_pages.csv" ] && node -e 'require("playwright")' 2>/dev/null; then echo "== browser-website"; sleep 3; node tests/integration/browser-website.mjs; else echo "(ข้าม browser-website)"; fi
if [ -f .next/BUILD_ID ] && [ -f "${FIXTURE_DIR:-tests/fixtures}/fbpage/Viewers.csv" ] && node -e 'require("playwright")' 2>/dev/null; then echo "== browser-import"; sleep 3; node tests/integration/browser-import.mjs; else echo "(ข้าม browser-import)"; fi
