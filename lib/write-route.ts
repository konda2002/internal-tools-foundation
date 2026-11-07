import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { errors, json, readJson, requestIdFor, withErrorHandling } from "@/lib/api";
import { requireRole, type Role, type SessionUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

/**
 * defineWriteRoute — the ONE way to build a state-changing API route.
 *
 * It fixes the order of the six steps every write must follow and performs
 * the governance-critical ones itself, so a tool author cannot forget them:
 *
 *   1. requireRole(def.role)                       → 401 / 403
 *   2. def.body.parse(JSON body)                   → 400 with zod issues
 *   3. def.load(...)                               → 404 when it returns null
 *   4. def.check(...)   throw errors.forbidden()/errors.conflict() → 403 / 409
 *   5. prisma.$transaction: def.mutate(tx, …) THEN writeAudit(tx, …)
 *      — the audit row is written by this helper, in the same transaction,
 *        with before/after snapshots, actor id + role, request id and reason.
 *   6. respond with the updated entity
 *
 * A tool only supplies the parts that are specific to it (schema, load, rules,
 * mutation). See app/api/_template/route.ts for the canonical copy.
 */

type Params = Record<string, string | string[] | undefined>;
export type RouteCtx = { params?: Promise<Params> | Params };

export type WriteStepContext<Body> = {
  actor: SessionUser;
  body: Body;
  /** Dynamic segment values from the route path, e.g. { id: "..." }. */
  params: Params;
  req: Request;
  requestId: string;
};

export type WriteRouteDef<Body, Entity extends { id: string }> = {
  /** Step 1. Role(s) allowed to call this route. */
  role: Role | readonly Role[];
  /** Step 2. Zod schema for the JSON body. Add `reason: z.string()` to require a justification. */
  body: z.ZodType<Body>;
  /** Lower-case model name recorded as audit_log.entity_type, e.g. "note". */
  entityType: string;
  /** Step 3. Return the entity or null (→ 404). Runs outside the transaction. */
  load: (ctx: WriteStepContext<Body>) => Promise<Entity | null>;
  /**
   * Step 4. Throw `errors.forbidden(...)` (403) or `errors.conflict(...)` (409)
   * when a business rule rejects the change. Optional.
   */
  check?: (entity: Entity, ctx: WriteStepContext<Body>) => void | Promise<void>;
  /** Audit verb, "<tool>.<verb>" — constant or derived from the request. */
  action: string | ((entity: Entity, ctx: WriteStepContext<Body>) => string);
  /** Step 5. Perform the change with the transaction client and return the new row. */
  mutate: (
    tx: Prisma.TransactionClient,
    entity: Entity,
    ctx: WriteStepContext<Body>,
  ) => Promise<Entity>;
  /** Justification stored on the audit row. Defaults to `body.reason` when it is a string. */
  reason?: (ctx: WriteStepContext<Body>) => string | undefined;
  /** Step 6. Response body. Defaults to `{ [entityType]: entity }`. */
  respond?: (entity: Entity, ctx: WriteStepContext<Body>) => unknown;
};

export function defineWriteRoute<Body, Entity extends { id: string }>(
  def: WriteRouteDef<Body, Entity>,
) {
  return withErrorHandling<RouteCtx>(async (req, routeCtx) => {
    // 1. Who may do this. Always first, always server-side.
    const actor = await requireRole(def.role, req);

    // 2. What they sent. ZodError → 400 via withErrorHandling.
    const body = def.body.parse(await readJson(req));
    const params = (await routeCtx?.params) ?? {};
    const ctx: WriteStepContext<Body> = { actor, body, params, req, requestId: requestIdFor(req) };

    // 3. The thing being changed.
    const before = await def.load(ctx);
    if (!before) throw errors.notFound(def.entityType);

    // 4. Business rules.
    if (def.check) await def.check(before, ctx);

    // 5. Change + audit, atomically. The audit write is not optional.
    const action = typeof def.action === "function" ? def.action(before, ctx) : def.action;
    const reason = def.reason ? def.reason(ctx) : defaultReason(body);
    const after = await prisma.$transaction(async (tx) => {
      const updated = await def.mutate(tx, before, ctx);
      await writeAudit(tx, {
        actorId: actor.id,
        actorRole: actor.role,
        action,
        entityType: def.entityType,
        entityId: before.id,
        before,
        after: updated,
        requestId: ctx.requestId,
        reason,
      });
      return updated;
    });

    // 6. Hand back the new state.
    return json(200, def.respond ? def.respond(after, ctx) : { [def.entityType]: after });
  });
}

function defaultReason(body: unknown): string | undefined {
  if (body && typeof body === "object" && "reason" in body) {
    const r = (body as { reason?: unknown }).reason;
    if (typeof r === "string" && r.trim()) return r.trim();
  }
  return undefined;
}
