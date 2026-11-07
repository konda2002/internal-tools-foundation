import type { KycCase } from "@prisma/client";
import type { Role } from "@/lib/auth";

/** Rules from docs/tools/kyc.md, shared by the API routes and the page. */

export const KYC_STATUSES = ["PENDING", "VERIFIED", "ESCALATED", "REJECTED"] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

export const KYC_DOCUMENT_TYPES = ["PASSPORT", "DRIVERS_LICENSE", "NATIONAL_ID"] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

export const KYC_ROLES = ["OPS_LEAD"] as const satisfies readonly Role[];

/** Cases at or above this risk score cannot be verified. */
export const HIGH_RISK_SCORE = 70;

export const KYC_PERMISSION_MESSAGE = "You do not have permission to view or process this KYC case.";
export const HIGH_RISK_VERIFY_MESSAGE = "Cases with a risk score of 70 or above must be escalated or rejected.";

export function isHighRisk(riskScore: number): boolean {
  return riskScore >= HIGH_RISK_SCORE;
}

export function alreadyDecidedMessage(status: string): string {
  return `This case has already been ${status.toLowerCase()}.`;
}

/** Shape returned by GET /api/kyc and the decision routes. */
export type KycRow = {
  id: string;
  customerId: string;
  documentType: KycDocumentType;
  riskScore: number;
  notes: string | null;
  status: KycStatus;
  decidedById: string | null;
  decidedByEmail: string | null;
  decidedAt: string | null;
  createdAt: string;
};

export function toKycRow(row: KycCase & { decidedBy: { email: string } | null }): KycRow {
  return {
    id: row.id,
    customerId: row.customerId,
    documentType: row.documentType as KycDocumentType,
    riskScore: row.riskScore,
    notes: row.notes,
    status: row.status as KycStatus,
    decidedById: row.decidedById,
    decidedByEmail: row.decidedBy?.email ?? null,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
