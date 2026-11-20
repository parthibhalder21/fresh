/** Append-only audit trail of every state-changing action. */
export function audit(db, req, action, entity, entityId = null, detail = "") {
  db.prepare(
    "INSERT INTO audit_log (user_id, org_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(req.user?.id ?? null, req.user?.orgId ?? null, action, entity, entityId, String(detail).slice(0, 500));
}
