# Governance controls

This foundation is meant for regulated environments (fintech ops tooling), so
the controls below are built into the *framework*, not left to each tool.
Everything listed under "Built in" is enforced in code and covered by tests.
Everything under "Not yet" is what a production rollout would still need to
add — listed so nobody mistakes the prototype for a finished control set.

## Built in

| Control | Where | How it is enforced | Test |
| --- | --- | --- | --- |
| Authentication | `lib/auth.ts` | Signed (HMAC-SHA256) httpOnly, SameSite=Lax session cookie; bcrypt password hashes; 12 h TTL. Stub only — the comment block in the file says where OIDC replaces it. | `tests/auth.test.ts` |
| Authorization in the API, never the UI | `lib/auth.ts#requireRole` | Every route calls `requireRole` first (`defineWriteRoute` does it for you). Wrong role → `403 { error: { code: "forbidden" } }`. Nav/buttons only hide. | `tests/auth.test.ts`, `tests/template.test.ts` |
| Every state change is audited | `lib/write-route.ts` | `defineWriteRoute` is the only sanctioned way to write; it appends the audit row itself. A tool cannot "forget" `writeAudit`. | `tests/template.test.ts` (200 + audit row) |
| Audit and change are atomic | `lib/write-route.ts` | `mutate` and `writeAudit` run in one `prisma.$transaction`; if either fails, neither persists. | "writes no audit row when the update fails" |
| Audit log is append-only | `prisma/migrations/*_init` + `lib/audit.ts` | No update/delete code path exists; SQLite `BEFORE UPDATE` / `BEFORE DELETE` triggers abort any attempt, including raw SQL. | `tests/audit.test.ts` |
| Who, as what, did what, to what, from what → to what | `audit_log` columns | `actor_id`, `actor_role` (role **at the time**), `action` (`<tool>.<verb>`), `entity_type` + `entity_id`, `before` + `after` JSON snapshots, `created_at`. | `tests/template.test.ts` |
| Why | `audit_log.reason` | Tools that need a justification add `reason: z.string().min(n)` to the body schema; `ConfirmDialog` collects it in the UI. Stored verbatim on the row. | "records governance fields" |
| Traceability to a request | `lib/api.ts#requestIdFor` | Every API response carries `x-request-id` (client-supplied or generated). The same id is stored in `audit_log.request_id` and prefixed on server error logs. | "generates a request id…" |
| Input validation | `lib/api.ts` + zod | Bodies are parsed with a zod schema; failures return `400` with the issue list. Unknown JSON → 400, never 500. | "400 on a bad body" |
| Uniform error contract | `lib/api.ts#withErrorHandling` | `{ error: { code, message, details? } }` for every failure; 500s hide internals and include the request id. | all route tests |
| Secrets | `.env.example`, `.gitignore` | No secrets in the repo; `SESSION_SECRET` and the DB file are local. | — |

### Reading the audit log

`/audit` (OPS_LEAD) shows the log newest first with filter, sort and paging;
the detail panel shows actor + role, reason, request id and the before/after
JSON. The same data is available as JSON from `GET /api/audit`.

## Not yet (production checklist)

- **Identity**: replace the stub with OIDC (Okta / Entra / Google) — see the
  comment block in `lib/auth.ts`. Map IdP groups → roles; deny by default.
- **Maker–checker / four-eyes**: the template already supports
  `errors.forbidden("cannot approve your own request")` in `check`; a spec
  that needs dual control should model a `requested_by` / `approved_by` pair
  and test that one actor cannot do both.
- **Tamper evidence**: add a hash chain (`prev_hash`, `row_hash`) to
  `audit_log` or ship rows to a WORM store. Triggers stop casual edits; they do
  not stop someone with the DB file.
- **Retention & export**: SIEM / data-lake export of `audit_log`, retention
  policy, legal hold.
- **Session hardening**: short-lived sessions with refresh, CSRF token for
  non-JSON forms, rate-limited login, lockout after N failures, login/logout
  events in the audit log.
- **Database**: move from SQLite to Postgres (Prisma makes this a
  `datasource` change plus regenerated migrations; keep the triggers).
- **PII in snapshots**: `before`/`after` store full rows. Tools handling
  sensitive fields should redact in `mutate`'s returned entity or add a
  `redact` step before audit.
