import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RefundQueue } from "./RefundQueue";

/**
 * Refund review queue (docs/tools/refunds.md). Data and every rule live in
 * /api/refunds; the role is passed down only so buttons can explain why they
 * are disabled.
 */
export default async function RefundsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Refunds</h1>
          <p>Review customer refund requests. Each refund is decided once and every decision is audited.</p>
        </div>
      </div>
      <RefundQueue role={user.role} />
    </>
  );
}
