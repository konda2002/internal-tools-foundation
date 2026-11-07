import { z } from "zod";
import { errors, json, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { KYC_PERMISSION_MESSAGE, KYC_ROLES, KYC_STATUSES, toKycRow } from "./shared";

const Query = z.object({ status: z.enum(KYC_STATUSES).optional() });

/**
 * GET /api/kyc — OPS_LEAD only.
 * KYC cases newest first. Optional ?status=PENDING|VERIFIED|ESCALATED|REJECTED.
 */
export const GET = withErrorHandling(async (req) => {
  await requireRole(KYC_ROLES, req, { forbiddenMessage: KYC_PERMISSION_MESSAGE });

  const url = new URL(req.url);
  const query = Query.safeParse({ status: url.searchParams.get("status") || undefined });
  if (!query.success) throw errors.badRequest("Invalid status filter", query.error.issues);

  const rows = await prisma.kycCase.findMany({
    where: query.data.status ? { status: query.data.status } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { decidedBy: { select: { email: true } } },
  });

  return json(200, { cases: rows.map(toKycRow) });
});
