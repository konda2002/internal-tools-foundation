import { kycDecisionRoute } from "../decision";

/** POST /api/kyc/[id]/escalate — body { reason?: string }. */
export const POST = kycDecisionRoute("escalate");
