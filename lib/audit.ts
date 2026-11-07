import type { Prisma, AuditLog } from "@prisma/client";

/**
 * Append-only audit log.
 *
 * Rules:
 *  - This module exports exactly one write: `writeAudit`. There is no update or
 *    delete helper and the migration installs SQLite triggers that abort any
 *    UPDATE/DELETE on `audit_log`, so the table cannot be rewritten even by
 *    accident (tests/audit.test.ts proves it).
 *  - Always call `writeAudit` with the SAME transaction client that performs
 *    the state change, so the audit row and the change commit or roll back
 *    together:
 *
 *      await prisma.$transaction(async (tx) => {
 *        const after = await tx.note.update({ ... });
 *        await writeAudit(tx, { actorId, action: "note.resolve", entityType: "note",
 *                               entityId: after.id, before, after });
 *      });
 */

/** Anything that exposes `auditLog.create` — the real client or a transaction client. */
export type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export type AuditInput = {
  actorId: string;
  /** The actor's role at the time of the action (roles change; the log must not). */
  actorRole: string;
  /** Dot-namespaced verb, e.g. "note.resolve", "refund.approve". */
  action: string;
  /** Table / model name, e.g. "note". */
  entityType: string;
  entityId: string;
  /** Snapshot before the change. Omit or pass null for creates. */
  before?: unknown;
  /** Snapshot after the change. Omit or pass null for deletes. */
  after?: unknown;
  /** Correlates with the `x-request-id` response header and server logs. */
  requestId?: string;
  /** Free-text justification supplied by the actor (e.g. "customer called"). */
  reason?: string;
};

export async function writeAudit(tx: AuditClient, input: AuditInput): Promise<AuditLog> {
  return tx.auditLog.create({
    data: {
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before == null ? null : JSON.stringify(input.before),
      after: input.after == null ? null : JSON.stringify(input.after),
      requestId: input.requestId ?? null,
      reason: input.reason ?? null,
    },
  });
}

/** Shape returned by GET /api/audit: JSON columns parsed, actor email attached. */
export type AuditRow = {
  id: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  requestId: string | null;
  reason: string | null;
  createdAt: string;
};

export function toAuditRow(row: AuditLog & { actor: { email: string } }): AuditRow {
  return {
    id: row.id,
    actorId: row.actorId,
    actorEmail: row.actor.email,
    actorRole: row.actorRole,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before == null ? null : JSON.parse(row.before),
    after: row.after == null ? null : JSON.parse(row.after),
    requestId: row.requestId,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}
