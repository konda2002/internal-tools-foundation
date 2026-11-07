import { kycDecisionRoute } from "../decision";

/** POST /api/kyc/[id]/reject — body { reason?: string }. */
export const POST = kycDecisionRoute("reject");
