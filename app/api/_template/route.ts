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
 * Every state-changing route is built with `defineWriteRoute`, which runs the
 * six steps below in this order and will not let you skip the audit write:
 *
 *   1. role     – requireRole                       (401 / 403)
 *   2. body     – zod schema, parsed + validated    (400)
 *   3. load     – fetch the entity, null → 404
 *   4. check    – business rules: errors.forbidden() → 403, errors.conflict() → 409
 *   5. mutate   – runs inside prisma.$transaction; writeAudit() is appended to
 *                 the SAME transaction by the helper (before/after, actor role,
 *                 request id, reason)
 *   6. respond  – the updated entity (default `{ <entityType>: entity }`)
 *
 * This copy operates on the trivial `notes` table (id, body, status) and lets
 * an OPS_LEAD move a note between statuses, optionally recording a reason.
 */
import { z } from "zod";
import type { Note } from "@prisma/client";
import { errors } from "@/lib/api";
import { prisma } from "@/lib/db";
import { defineWriteRoute } from "@/lib/write-route";

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
  // Optional justification; stored on the audit row. Make it required
  // (`z.string().min(3)`) when the spec demands a reason for the action.
  reason: z.string().trim().max(500).optional(),
});

export const POST = defineWriteRoute<z.infer<typeof Body>, Note>({
  // 1. Authorization. Never trust the UI; the API is the check.
  role: "OPS_LEAD",

  // 2. Validation.
  body: Body,

  // 3. Load. Returning null yields 404.
  entityType: "note",
  load: ({ body }) => prisma.note.findUnique({ where: { id: body.id } }),

  // 4. Business rules. 409 for state conflicts, 403 for actor-specific denials
  //    (e.g. "cannot approve your own request" → errors.forbidden()).
  check(note, { body }) {
    if (note.status === "ARCHIVED") throw errors.conflict("Archived notes are read-only");
    if (note.status === body.status) throw errors.conflict(`Note is already ${body.status}`);
  },

  // 5. The change. `tx` is the transaction client; the helper writes the audit
  //    row with the same `tx` right after this returns.
  action: (_note, { body }) => ACTION_FOR_STATUS[body.status],
  mutate: (tx, note, { body }) =>
    tx.note.update({ where: { id: note.id }, data: { status: body.status } }),

  // 6. Response: `{ note: <updated> }` by default. Override with `respond` if needed.
});
