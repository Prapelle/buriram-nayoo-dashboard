function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

// ทนต่อการวางคีย์ผิดรูป: มีเครื่องหมายคำพูด, \n เป็นตัวอักษร, ขึ้นบรรทัดใหม่ถูกแทนด้วยเว้นวรรค
function normalizePem(raw: string): string {
  const cleaned = raw.trim().replace(/^["']|["'],?$/g, "").replace(/\\n/g, "\n");
  const body = cleaned
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "")
    .replace(/-----END [A-Z ]*PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

export const env = {
  get sheetId() { return req("GOOGLE_SHEET_ID"); },
  get saEmail() { return req("GOOGLE_SERVICE_ACCOUNT_EMAIL"); },
  get saKey() { return normalizePem(req("GOOGLE_PRIVATE_KEY")); },
  get initialAdmin() { return (process.env.INITIAL_ADMIN_EMAIL ?? "").trim().toLowerCase(); },
};
