function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export const env = {
  get sheetId() { return req("GOOGLE_SHEET_ID"); },
  get saEmail() { return req("GOOGLE_SERVICE_ACCOUNT_EMAIL"); },
  // รองรับทั้งกรณีใส่ \n เป็นตัวอักษร และขึ้นบรรทัดจริง
  get saKey() { return req("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n"); },
  get initialAdmin() { return (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase(); },
};
