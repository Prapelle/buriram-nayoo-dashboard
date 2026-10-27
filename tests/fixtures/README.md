วางไฟล์ตัวอย่างจริงในโฟลเดอร์นี้ (Page.csv, ไฟล์ Facebook Page รายวัน Sep-01-2026_Sep-30-2026_*.csv, Facebookads.csv และไฟล์ Google Ads ทั้งชุด) แล้วรัน  bash tests/run-all.sh
(ชุด security และ sales ไม่ต้องใช้ไฟล์จริง; sales ใช้ไฟล์ Excel จำลองที่สคริปต์ tests/make-sales-fixture.py สร้างให้
 ถ้ามีไฟล์รายงานยอดขายจริง วางไว้ที่นี่แล้วตั้ง REAL_SALES_FILE="ชื่อไฟล์.xlsx" เพื่อทดสอบเกณฑ์ตามสเปกกับไฟล์จริง)
ไม่ได้ใส่ไฟล์จริงไว้ใน repo เพราะมีตัวเลขค่าโฆษณา/ยอดขายของธุรกิจ (ถ้าจะ commit ไฟล์เหล่านี้ ให้ใช้ repo แบบ Private)
