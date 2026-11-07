/*
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  TEMPLATE — reference WRITE handler. Copy this file for every new tool.   ║
 * ║  See docs/adding-a-tool.md.                                                ║
 * ║                                                                            ║
 * ║  The leading underscore makes `_template` a Next.js private folder, so    ║
 * ║  this route is NOT served over HTTP. It is exercised by                    ║
 * ║  tests/template.test.ts only. Copies go to app/api/<tool>/... and are live.║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Every state-changing route follows these six steps, in this order:
 *   1. requireRole            – who may call this (401/403)
 *   2. parse + validate body  – zod, 400 on failure
 *   3. load the entity        – 404 if missing
 *   4. business rules         – 403 (not allowed for this actor) or 409 (state conflict)
 *   5. prisma.$transaction    – update the entity AND writeAudit together
 *   6. return the updated entity
 *
 * This copy operates on the trivial `notes` table (id, body, status) and lets
 * an OPS_LEAD move a note between statuses.
 */
import { z } from "zod";
import { json, readJson, withErrorHandling, errors } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

const NOTE_STATUSES = ["OPEN", "RESOLVED", "ARCHIVED"] as const;

/** Audit verbs per target status: "note.resolve", "note.archive", "note.reopen". */
const ACTION_FOR_STATUS: Record<(typeof NOTE_STATUSES)[number], string> = {
  OPEN: "note.reopen",
  RESOLVED: "note.resolve",
  ARCHIVED: "note.archive",
};

const Body = z.object({
  id: z.string().min(1),
  status: z.enum(NOTE_STATUSES),
});

export const POST = withErrorHandling(async (req) => {
  // 1. Authorization. Always first, always in the API — never trust the UI.
  const actor = await requireRole("OPS_LEAD", req);

  // 2. Validate. ZodError → 400 with issues via withErrorHandling.
  const body = Body.parse(await readJson(req));

  // 3. Load. Missing → 404.
  const note = await prisma.note.findUnique({ where: { id: body.id } });
  if (!note) throw errors.notFound("Note");

  // 4. Business rules. Use 409 for state conflicts, 403 for actor-specific
  //    denials (e.g. "cannot approve your own request" → errors.forbidden()).
  if (note.status === "ARCHIVED") {
    throw errors.conflict("Archived notes are read-only");
  }
  if (note.status === body.status) {
    throw errors.conflict(`Note is already ${body.status}`);
  }

  // 5. Change + audit in ONE transaction, so neither exists without the other.
  const updated = await prisma.$transaction(async (tx) => {
    const after = await tx.note.update({
      where: { id: note.id },
      data: { status: body.status },
    });
    await writeAudit(tx, {
      actorId: actor.id,
      action: ACTION_FOR_STATUS[body.status],
      entityType: "note",
      entityId: note.id,
      before: note,
      after,
    });
    return after;
  });

  // 6. Return the updated entity.
  return json(200, { note: updated });
});
