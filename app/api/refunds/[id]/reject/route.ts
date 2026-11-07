import { refundDecisionRoute } from "../decision";

/** POST /api/refunds/[id]/reject — body { reason?: string }. */
export const POST = refundDecisionRoute("reject");
