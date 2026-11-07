import { kycDecisionRoute } from "../decision";

/** POST /api/kyc/[id]/verify — body { reason?: string }. */
export const POST = kycDecisionRoute("verify");
