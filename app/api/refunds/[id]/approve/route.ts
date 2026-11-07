import { refundDecisionRoute } from "../decision";

/** POST /api/refunds/[id]/approve — body { reason?: string }. */
export const POST = refundDecisionRoute("approve");
