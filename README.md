# internal-tools-foundation

Foundation for internal operations tools: stub auth with server-side roles, an
append-only audit log, a small monochrome UI kit, and a reference API handler
every future tool copies. No business tools live here yet — they are built on
top of this from spec files under `docs/tools/` (see `docs/adding-a-tool.md`
and `.devin/playbooks/new-tool.md`).

**Stack:** Next.js (App Router) · TypeScript · Prisma · SQLite · Vitest. No external services.

## Run

```bash
npm run setup     # npm install, create .env, prisma migrate deploy, prisma generate, seed
npm run dev       # http://localhost:3000 → redirects to /login
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm test` | Vitest. Uses its own SQLite file (`prisma/test.db`), migrated + seeded fresh on every run |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint |
| `npm run db:migrate` | `prisma migrate dev` — create a new migration from `prisma/schema.prisma` |
| `npm run db:seed` | Re-run `prisma/seed.ts` (idempotent) |
| `npm run db:reset` | Drop, re-migrate and re-seed the dev database |

## Demo logins

| Email | Password | Role | Sees |
| --- | --- | --- | --- |
| `lead@demo.test` | `lead123` | `OPS_LEAD` | Home, **Audit log** (`/audit`) |
| `analyst@demo.test` | `analyst123` | `ANALYST` | Home only |

## Layout

```
app/
  login/                 /login page (email + password → signed httpOnly cookie)
  (tools)/               everything behind sign-in, wrapped in AppShell
    page.tsx             /  home
    audit/               /audit — example page using every kit component
  api/
    auth/login, logout   session endpoints
    audit/route.ts       GET /api/audit (OPS_LEAD) — the READ example
    _template/route.ts   reference WRITE handler — copy for each tool (not served; `_` = private folder)
components/              AppShell, QueueTable, DetailPanel, ActionButton
lib/
  auth.ts                getCurrentUser(), requireRole() + OIDC migration notes
  audit.ts               writeAudit() — the only write path to audit_log
  api.ts                 json(), error(), ApiError, withErrorHandling()
  nav.ts                 role-filtered nav entries
  db.ts                  Prisma client singleton
prisma/
  schema.prisma          users, audit_log, notes
  migrations/            SQL migrations (audit_log has no-UPDATE / no-DELETE triggers)
  seed.ts                demo users, notes, sample audit rows (separate from migrations)
tests/                   Vitest: login, requireRole, writeAudit, _template handler
docs/adding-a-tool.md    checklist for building a new tool on this foundation
.devin/playbooks/        Devin playbook that drives new-tool builds
```

## Principles

- **Authorization lives in API routes.** Every handler starts with
  `requireRole(...)`. Wrong role → `403 { error: { code: "forbidden", ... } }`.
  The UI hides or disables controls for convenience, never as the check.
- **Every state change is audited in the same transaction**, via
  `prisma.$transaction(async (tx) => { ...; await writeAudit(tx, ...) })`.
  `audit_log` is append-only — no update/delete code paths, and the database
  triggers refuse them anyway.
- **One error shape** everywhere: `{ error: { code, message, details? } }`.
