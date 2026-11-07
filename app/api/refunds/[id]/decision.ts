/*
 * Shared write route for POST /api/refunds/[id]/approve and /reject, built
 * on defineWriteRoute (see app/api/_template/route.ts for the six steps).
 */
import { z } from "zod";
import type { Refund } from "@prisma/client";
import { errors } from "@/lib/api";
import { prisma } from "@/lib/db";
import { defineWriteRoute } from "@/lib/write-route";
import {
  REFUND_PERMISSION_MESSAGE,
  REFUND_ROLES,
  alreadyDecidedMessage,
  canDecideAmount,
  toRefundRow,
} from "../shared";

const Body = z.object({
  // Optional; stored on the audit row by defineWriteRoute.
  reason: z.string().trim().max(500).optional(),
});

const STATUS_FOR = { approve: "APPROVED", reject: "REJECTED" } as const;

export function refundDecisionRoute(verb: keyof typeof STATUS_FOR) {
  const status = STATUS_FOR[verb];

  return defineWriteRoute<z.infer<typeof Body>, Refund>({
    role: REFUND_ROLES,
    forbiddenMessage: REFUND_PERMISSION_MESSAGE,
    body: Body,

    entityType: "refund",
    load: async ({ params }) =>
      typeof params.id === "string" ? prisma.refund.findUnique({ where: { id: params.id } }) : null,

    check(refund, { actor }) {
      if (!canDecideAmount(actor.role, refund.amountCents)) throw errors.forbidden(REFUND_PERMISSION_MESSAGE);
      if (refund.status !== "PENDING") throw errors.conflict(alreadyDecidedMessage(refund.status));
    },

    action: `refund.${verb}`,
    // Conditional update so two concurrent decisions cannot both win: the
    // loser sees count 0, the transaction rolls back and it gets a 409.
    async mutate(tx, refund, { actor }) {
      const { count } = await tx.refund.updateMany({
        where: { id: refund.id, status: "PENDING" },
        data: { status, decidedById: actor.id, decidedAt: new Date() },
      });
      const current = await tx.refund.findUniqueOrThrow({ where: { id: refund.id } });
      if (count === 0) throw errors.conflict(alreadyDecidedMessage(current.status));
      return current;
    },

    respond: (refund, { actor }) => ({ refund: toRefundRow({ ...refund, decidedBy: { email: actor.email } }) }),
  });
}
