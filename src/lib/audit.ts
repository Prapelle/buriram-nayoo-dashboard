import { appendRows, batchGet, toRow } from "./sheets";

/** บันทึก AUDIT_LOG โดยอ่านเฉพาะแถว header (ไม่โหลดทั้งแท็บ ซึ่งจะโตขึ้นเรื่อย ๆ) */
export async function writeAudit(actor: string, action: string, entityType: string, entityId: string, summary: string) {
  const [h] = await batchGet(["'AUDIT_LOG'!1:1"]);
  await appendRows("AUDIT_LOG", [toRow(h[0] ?? [], {
    audit_id: crypto.randomUUID(), actor_email: actor, action, entity_type: entityType, entity_id: entityId,
    timestamp: new Date().toISOString(), summary,
  })]);
}
