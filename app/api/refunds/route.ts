import { z } from "zod";
import { errors, json, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { REFUND_PERMISSION_MESSAGE, REFUND_ROLES, REFUND_STATUSES, toRefundRow } from "./shared";

const Query = z.object({ status: z.enum(REFUND_STATUSES).optional() });

/**
 * GET /api/refunds — ANALYST and OPS_LEAD.
 * Refunds newest first. Optional ?status=PENDING|APPROVED|REJECTED.
 */
export const GET = withErrorHandling(async (req) => {
  await requireRole(REFUND_ROLES, req, { forbiddenMessage: REFUND_PERMISSION_MESSAGE });

  const url = new URL(req.url);
  const query = Query.safeParse({ status: url.searchParams.get("status") || undefined });
  if (!query.success) throw errors.badRequest("Invalid status filter", query.error.issues);

  const rows = await prisma.refund.findMany({
    where: query.data.status ? { status: query.data.status } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { decidedBy: { select: { email: true } } },
  });

  return json(200, { refunds: rows.map(toRefundRow) });
});
