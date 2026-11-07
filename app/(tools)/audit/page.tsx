import { AuditQueue } from "./AuditQueue";

/**
 * Example page: exercises every kit component once.
 * Data comes from GET /api/audit, which is where OPS_LEAD is enforced; an
 * ANALYST who navigates here directly sees the API's 403 message.
 */
export default function AuditPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Audit log</h1>
          <p>Every state change, newest first. Rows are append-only.</p>
        </div>
      </div>
      <AuditQueue />
    </>
  );
}
