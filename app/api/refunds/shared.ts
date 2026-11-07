import type { Refund } from "@prisma/client";
import type { Role } from "@/lib/auth";

/** Rules from docs/tools/refunds.md, shared by the API routes and the page. */

export const REFUND_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_ROLES = ["ANALYST", "OPS_LEAD"] as const satisfies readonly Role[];

/** ANALYST may decide only refunds strictly below this amount ($500.00). */
export const ANALYST_LIMIT_CENTS = 50_000;

export const REFUND_PERMISSION_MESSAGE = "You do not have permission to view or process this refund.";

export function canDecideAmount(role: string, amountCents: number): boolean {
  if (role === "OPS_LEAD") return true;
  if (role === "ANALYST") return amountCents < ANALYST_LIMIT_CENTS;
  return false;
}

export function alreadyDecidedMessage(status: string): string {
  return `This refund has already been ${status.toLowerCase()}.`;
}

/** Shape returned by GET /api/refunds and the decision routes. */
export type RefundRow = {
  id: string;
  customerId: string;
  amountCents: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  decidedById: string | null;
  decidedByEmail: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export function toRefundRow(row: Refund & { decidedBy: { email: string } | null }): RefundRow {
  return {
    id: row.id,
    customerId: row.customerId,
    amountCents: row.amountCents,
    currency: row.currency,
    reason: row.reason,
    status: row.status as RefundStatus,
    decidedById: row.decidedById,
    decidedByEmail: row.decidedBy?.email ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
