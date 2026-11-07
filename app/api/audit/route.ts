import { json, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { toAuditRow } from "@/lib/audit";
import { prisma } from "@/lib/db";

/**
 * GET /api/audit — the READ example.
 * OPS_LEAD only. Returns audit rows newest first.
 * Optional ?limit=N (default 100, max 500).
 */
export const GET = withErrorHandling(async (req) => {
  await requireRole("OPS_LEAD", req);

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);

  const rows = await prisma.auditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: { actor: { select: { email: true } } },
  });

  return json(200, { rows: rows.map(toAuditRow) });
});
