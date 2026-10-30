// สคริปต์สำรอง Google Sheet อัตโนมัติ (Google Apps Script) — แสดงในหน้า ตั้งค่า → ตั้งค่าระบบ ให้ Admin คัดลอกไปวาง
// ทำงานในบัญชีเจ้าของ Sheet: ทำสำเนาไฟล์ทั้งไฟล์ไปไว้ในโฟลเดอร์ Drive ทุกสัปดาห์ · สำเนาเกินจำนวนที่กำหนดย้ายไปถังขยะ (กู้คืนได้ 30 วัน)
export const BACKUP_SCRIPT = `/** สำรอง Google Sheet ของ Buriram NAYOO Dashboard อัตโนมัติ */
const FOLDER_NAME = "NAYOO Dashboard Backup"; // ชื่อโฟลเดอร์ใน Google Drive ของคุณ
const KEEP = 12;                              // เก็บสำเนาล่าสุดกี่ชุด (0 = เก็บทั้งหมด ไม่ลบ)

function backupNow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  const stamp = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd HHmm");
  DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + " (backup " + stamp + ")", folder);
  if (KEEP > 0) {
    const files = [];
    const fi = folder.getFiles();
    while (fi.hasNext()) files.push(fi.next());
    files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
    files.slice(KEEP).forEach((f) => f.setTrashed(true)); // ย้ายสำเนาเก่าไปถังขยะ (กู้คืนได้ 30 วัน)
  }
}

/** รันครั้งเดียว: ตั้งเวลาสำรองทุกวันจันทร์ ตี 2 (เวลาไทย) และสำรองทันที 1 ครั้ง */
function installWeeklyBackup() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "backupNow")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("backupNow").timeBased().everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(2).inTimezone("Asia/Bangkok").create();
  backupNow();
}
`;
