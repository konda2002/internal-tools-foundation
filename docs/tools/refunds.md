# Refund review queue

Model `Refund` (@@map "refunds"): id, customerId, amountCents (Int),
currency (default "USD"), reason (customer's reason for the refund),
status "PENDING" | "APPROVED" | "REJECTED", decidedById (nullable),
decidedAt (nullable), createdAt.

## Rules (enforced in the API)
- ANALYST and OPS_LEAD may list and view refunds.
- ANALYST may approve or reject only when amountCents < 50000.
- OPS_LEAD may approve or reject any amount.
- Any permission failure on these routes returns 403 with exactly this
  message: "You do not have permission to view or process this refund."
  This applies to the analyst-over-$500 case and to any role denial.
- A refund is decided once. Approving or rejecting a refund that is not
  PENDING returns 409 with "This refund has already been <approved|rejected>."
- Every decision writes an audit row: action "refund.approve" or
  "refund.reject", before/after the full row. An optional `reason`
  in the body is stored on the audit row.

## API
- GET  /api/refunds            list, newest first, optional ?status=
- POST /api/refunds/[id]/approve
- POST /api/refunds/[id]/reject   body { reason?: string }

## Page /refunds (nav for ANALYST and OPS_LEAD)
- QueueTable showing status PENDING by default with a status filter;
  columns: customer, amount, currency, reason, status, created.
- DetailPanel on row click.
- Approve and Reject ActionButtons. disabledReason mirrors the API rule:
  "Refunds of $500 or more require an OPS_LEAD" for an analyst on a
  large refund, "Already approved" / "Already rejected" when decided.
- ConfirmDialog before each action; reason optional.
- If the server rejects the action, show the API's error message
  verbatim in the detail panel.

## Seed (fixed ids, realistic customers and reasons)
14 refunds total:
- refund_small_1..5: PENDING, amounts 1200 / 4999 / 12000 / 25000 / 49900 cents
- refund_large_1..5: PENDING, amounts 50000 / 75000 / 90000 / 180000 / 250000 cents
- refund_done_1: APPROVED, 15000 cents, decided by lead@demo.test
- refund_done_2: APPROVED, 3200 cents, decided by analyst@demo.test
- refund_done_3: REJECTED, 120000 cents, decided by lead@demo.test,
  audit reason "Chargeback already filed by cardholder"
- refund_done_4: REJECTED, 8900 cents, decided by analyst@demo.test,
  audit reason "Duplicate request, see refund_done_2"
Spread createdAt over the last 14 days. Use plausible customer ids
(cust_xxxx) and varied reasons (duplicate charge, item not received,
service cancelled, fraud claim, pricing error). Decided rows must also
have a matching audit_log row so /audit shows history on first run.

## Tests (tests/refunds.test.ts)
- analyst approves refund_small_1 → 200, audit row refund.approve
- analyst approves refund_large_1 → 403 with the exact permission message
- lead approves refund_large_1 → 200
- lead rejects refund_small_2 with reason → 200, reason on audit row
- second decision on refund_done_1 → 409
- not signed in → 401; bad body → 400; missing id → 404
- GET /api/refunds as analyst → 200
