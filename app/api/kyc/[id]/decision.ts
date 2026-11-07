/*
 * Shared write route for POST /api/kyc/[id]/verify, /escalate and /reject,
 * built on defineWriteRoute (see app/api/_template/route.ts for the six steps).
 */
import { z } from "zod";
import type { KycCase } from "@prisma/client";
import { errors } from "@/lib/api";
import { prisma } from "@/lib/db";
import { defineWriteRoute } from "@/lib/write-route";
import {
  HIGH_RISK_VERIFY_MESSAGE,
  KYC_PERMISSION_MESSAGE,
  KYC_ROLES,
  alreadyDecidedMessage,
  isHighRisk,
  toKycRow,
} from "../shared";

const Body = z.object({
  // Optional; stored on the audit row by defineWriteRoute.
  reason: z.string().trim().max(500).optional(),
});

const STATUS_FOR = { verify: "VERIFIED", escalate: "ESCALATED", reject: "REJECTED" } as const;

export type KycVerb = keyof typeof STATUS_FOR;

export function kycDecisionRoute(verb: KycVerb) {
  const status = STATUS_FOR[verb];

  return defineWriteRoute<z.infer<typeof Body>, KycCase>({
    role: KYC_ROLES,
    forbiddenMessage: KYC_PERMISSION_MESSAGE,
    body: Body,

    entityType: "kyc_case",
    load: async ({ params }) =>
      typeof params.id === "string" ? prisma.kycCase.findUnique({ where: { id: params.id } }) : null,

    // "Decided once" applies to any decision, so it is checked before the risk rule.
    check(kycCase) {
      if (kycCase.status !== "PENDING") throw errors.conflict(alreadyDecidedMessage(kycCase.status));
      if (verb === "verify" && isHighRisk(kycCase.riskScore)) throw errors.badRequest(HIGH_RISK_VERIFY_MESSAGE);
    },

    action: `kyc.${verb}`,
    // Conditional update so two concurrent decisions cannot both win: the
    // loser sees count 0, the transaction rolls back and it gets a 409.
    async mutate(tx, kycCase, { actor }) {
      const { count } = await tx.kycCase.updateMany({
        where: { id: kycCase.id, status: "PENDING" },
        data: { status, decidedById: actor.id, decidedAt: new Date() },
      });
      const current = await tx.kycCase.findUniqueOrThrow({ where: { id: kycCase.id } });
      if (count === 0) throw errors.conflict(alreadyDecidedMessage(current.status));
      return current;
    },

    respond: (kycCase, { actor }) => ({ kycCase: toKycRow({ ...kycCase, decidedBy: { email: actor.email } }) }),
  });
}
