Given a spec file under docs/tools/, build the tool on the existing
foundation. Read docs/adding-a-tool.md first. Add a migration and
extend the seed. Add API routes by copying app/api/_template and using
requireRole and writeAudit; all business rules live in the API. Add a
page using the UI kit and a nav entry. Add tests for every rule in the
spec including one 403 test. Do not modify foundation files unless the
spec requires it; if you do, say so in the PR. Open one PR with
screenshots.
