# KYC review queue

Model `KycCase` (@@map "kyc_cases"): id, customerId, documentType
("PASSPORT" | "DRIVERS_LICENSE" | "NATIONAL_ID"), riskScore (Int, 0-100),
notes (analyst notes from the KYC vendor, nullable), status
"PENDING" | "VERIFIED" | "ESCALATED" | "REJECTED", decidedById (nullable),
decidedAt (nullable), createdAt.

## Rules (enforced in the API)
- OPS_LEAD only. ANALYST gets 403 on every KYC route and does not see
  the tool in the nav.
- Any permission failure returns 403 with exactly this message:
  "You do not have permission to view or process this KYC case."
- A case with riskScore >= 70 cannot be VERIFIED. Attempting it returns
  400 with "Cases with a risk score of 70 or above must be escalated or
  rejected." Use errors.badRequest from lib/api.ts.
- A case is decided once. Any decision on a non-PENDING case returns 409
  with "This case has already been <verified|escalated|rejected>."
- Every decision writes an audit row: action "kyc.verify", "kyc.escalate"
  or "kyc.reject", before/after the full row. An optional `reason` in the
  body is stored on the audit row.

## API
- GET  /api/kyc                 list, newest first, optional ?status=
- POST /api/kyc/[id]/verify
- POST /api/kyc/[id]/escalate
- POST /api/kyc/[id]/reject     body { reason?: string } on all three

## Page /kyc (nav for OPS_LEAD only)
- QueueTable showing PENDING by default with a status filter; columns:
  customer, document type, risk score, status, created. Show risk score
  with a visible high-risk marker when >= 70.
- DetailPanel on row click showing notes.
- Verify, Escalate and Reject ActionButtons. disabledReason mirrors the
  API: "Risk score 70+ must be escalated or rejected" on Verify for
  high-risk cases; "Already verified" etc. when decided.
- ConfirmDialog before each action; reason optional.
- Show the API's error message verbatim if the server rejects an action.

## Seed (fixed ids, 12 cases spread over the last 14 days)
- kyc_low_1..4: PENDING, risk scores 12 / 28 / 45 / 61
- kyc_high_1..4: PENDING, risk scores 70 / 78 / 86 / 95
- kyc_done_1: VERIFIED, score 20, decided by lead@demo.test
- kyc_done_2: ESCALATED, score 88, decided by lead@demo.test,
  audit reason "Document issue date does not match vendor record"
- kyc_done_3: REJECTED, score 92, decided by lead@demo.test,
  audit reason "Sanctions list match confirmed"
- kyc_done_4: VERIFIED, score 35, decided by lead@demo.test
Mix document types. Decided rows must have matching audit_log rows.

## Tests (tests/kyc.test.ts)
- analyst GET /api/kyc → 403 with the exact message
- analyst verify kyc_low_1 → 403 with the exact message
- lead verify kyc_low_1 → 200, audit row kyc.verify
- lead verify kyc_high_1 → 400 with the risk message, no audit row
- lead escalate kyc_high_1 with reason → 200, reason on audit row
- lead reject kyc_high_2 → 200
- second decision on kyc_done_1 → 409
- not signed in → 401; bad body → 400; missing id → 404
- navForRole("ANALYST") does not include /kyc
