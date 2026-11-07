import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { KycQueue } from "./KycQueue";

/**
 * KYC review queue (docs/tools/kyc.md). Data and every rule live in /api/kyc;
 * the page renders whatever the API returns, including its 403 message.
 */
export default async function KycPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <>
      <div className="page-header">
        <div>
          <h1>KYC review</h1>
          <p>Review identity verification cases. Each case is decided once and every decision is audited.</p>
        </div>
      </div>
      <KycQueue />
    </>
  );
}
