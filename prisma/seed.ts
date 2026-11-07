/**
 * Demo seed. Kept separate from migrations so schema changes never depend on
 * demo data. Idempotent: safe to re-run.
 *
 *   npm run db:seed        (also run by `npm run setup`)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const [analyst, lead] = await Promise.all([
    prisma.user.upsert({
      where: { email: "analyst@demo.test" },
      update: {},
      create: {
        email: "analyst@demo.test",
        passwordHash: await bcrypt.hash("analyst123", 10),
        role: "ANALYST",
      },
    }),
    prisma.user.upsert({
      where: { email: "lead@demo.test" },
      update: {},
      create: {
        email: "lead@demo.test",
        passwordHash: await bcrypt.hash("lead123", 10),
        role: "OPS_LEAD",
      },
    }),
  ]);

  // Two notes for app/api/_template/route.ts. Fixed ids so docs/tests can refer to them.
  await prisma.note.upsert({
    where: { id: "note_open_1" },
    update: {},
    create: { id: "note_open_1", body: "Follow up with merchant about chargeback #4411", status: "OPEN" },
  });
  await prisma.note.upsert({
    where: { id: "note_resolved_1" },
    update: {},
    create: { id: "note_resolved_1", body: "Verify KYC document re-upload for acct 9921", status: "RESOLVED" },
  });

  // Three sample audit rows so /audit is not empty. audit_log is append-only,
  // so only insert them when the table is still empty.
  const existing = await prisma.auditLog.count();
  if (existing === 0) {
    const base = Date.now();
    await prisma.auditLog.createMany({
      data: [
        {
          actorId: lead.id,
          actorRole: "OPS_LEAD",
          action: "user.create",
          requestId: "seed-user-create-0001",
          entityType: "user",
          entityId: analyst.id,
          before: null,
          after: JSON.stringify({ id: analyst.id, email: analyst.email, role: "ANALYST" }),
          createdAt: new Date(base - 3 * 60_000),
        },
        {
          actorId: lead.id,
          actorRole: "OPS_LEAD",
          action: "note.create",
          requestId: "seed-note-create-0001",
          entityType: "note",
          entityId: "note_open_1",
          before: null,
          after: JSON.stringify({ id: "note_open_1", status: "OPEN" }),
          createdAt: new Date(base - 2 * 60_000),
        },
        {
          actorId: analyst.id,
          actorRole: "ANALYST",
          action: "note.resolve",
          requestId: "seed-note-resolve-0001",
          reason: "Customer confirmed the re-uploaded document by phone",
          entityType: "note",
          entityId: "note_resolved_1",
          before: JSON.stringify({ id: "note_resolved_1", status: "OPEN" }),
          after: JSON.stringify({ id: "note_resolved_1", status: "RESOLVED" }),
          createdAt: new Date(base - 60_000),
        },
      ],
    });
  }

  await seedRefunds({ analyst, lead });
  await seedKyc({ lead });

  console.log("Seeded: analyst@demo.test / analyst123 (ANALYST), lead@demo.test / lead123 (OPS_LEAD)");
}

type Decider = { id: string; role: string };

/**
 * Refund review queue (docs/tools/refunds.md). Fixed ids so tests and docs can
 * refer to them; createdAt is spread over the last 14 days relative to the
 * first seed. Decided refunds get a matching audit_log row (once) so /audit
 * shows their history on first run.
 */
async function seedRefunds({ analyst, lead }: { analyst: Decider; lead: Decider }) {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000);

  type Seed = {
    id: string;
    customerId: string;
    amountCents: number;
    reason: string;
    hoursAgo: number;
    decision?: { status: "APPROVED" | "REJECTED"; by: Decider; afterHours: number; auditReason?: string };
  };

  const refunds: Seed[] = [
    { id: "refund_small_1", customerId: "cust_4f2a", amountCents: 1200, hoursAgo: 20, reason: "Duplicate charge: billed twice for the March subscription renewal" },
    { id: "refund_small_2", customerId: "cust_8c1d", amountCents: 4999, hoursAgo: 46, reason: "Item not received: tracking shows delivered but the parcel never arrived" },
    { id: "refund_small_3", customerId: "cust_2b7e", amountCents: 12000, hoursAgo: 75, reason: "Service cancelled within the 14-day cooling-off period" },
    { id: "refund_small_4", customerId: "cust_9a3f", amountCents: 25000, hoursAgo: 122, reason: "Pricing error: charged list price instead of the promotional rate" },
    { id: "refund_small_5", customerId: "cust_6d0c", amountCents: 49900, hoursAgo: 141, reason: "Fraud claim: cardholder does not recognise this transaction" },
    { id: "refund_large_1", customerId: "cust_3e8b", amountCents: 50000, hoursAgo: 9, reason: "Service cancelled: annual plan cancelled on day 2, requesting pro-rated refund" },
    { id: "refund_large_2", customerId: "cust_7f41", amountCents: 75000, hoursAgo: 98, reason: "Item not received: furniture order lost in transit by the carrier" },
    { id: "refund_large_3", customerId: "cust_1c9d", amountCents: 90000, hoursAgo: 165, reason: "Duplicate charge: checkout retried after a timeout and the card was charged twice" },
    { id: "refund_large_4", customerId: "cust_5a62", amountCents: 180000, hoursAgo: 214, reason: "Fraud claim: account takeover, three unauthorised orders placed" },
    { id: "refund_large_5", customerId: "cust_0e5b", amountCents: 250000, hoursAgo: 262, reason: "Pricing error: enterprise invoice issued with the wrong seat count" },
    {
      id: "refund_done_1", customerId: "cust_4b90", amountCents: 15000, hoursAgo: 290,
      reason: "Item not received: order cancelled by the merchant but the card was still charged",
      decision: { status: "APPROVED", by: lead, afterHours: 5 },
    },
    {
      id: "refund_done_2", customerId: "cust_2d17", amountCents: 3200, hoursAgo: 318,
      reason: "Duplicate charge: coffee subscription billed on two different cards",
      decision: { status: "APPROVED", by: analyst, afterHours: 3 },
    },
    {
      id: "refund_done_3", customerId: "cust_8e44", amountCents: 120000, hoursAgo: 238,
      reason: "Fraud claim: cardholder disputes a laptop purchase shipped to a new address",
      decision: { status: "REJECTED", by: lead, afterHours: 26, auditReason: "Chargeback already filed by cardholder" },
    },
    {
      id: "refund_done_4", customerId: "cust_2d17", amountCents: 8900, hoursAgo: 190,
      reason: "Duplicate charge: refund requested again for the coffee subscription double billing",
      decision: { status: "REJECTED", by: analyst, afterHours: 2, auditReason: "Duplicate request, see refund_done_2" },
    },
  ];

  for (const r of refunds) {
    const createdAt = hoursAgo(r.hoursAgo);
    const decidedAt = r.decision ? new Date(createdAt.getTime() + r.decision.afterHours * 3_600_000) : null;
    const row = await prisma.refund.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        customerId: r.customerId,
        amountCents: r.amountCents,
        currency: "USD",
        reason: r.reason,
        status: r.decision?.status ?? "PENDING",
        decidedById: r.decision?.by.id ?? null,
        decidedAt,
        createdAt,
      },
    });

    if (!r.decision) continue;
    const audited = await prisma.auditLog.findFirst({ where: { entityType: "refund", entityId: r.id } });
    if (audited) continue;
    await prisma.auditLog.create({
      data: {
        actorId: r.decision.by.id,
        actorRole: r.decision.by.role,
        action: r.decision.status === "APPROVED" ? "refund.approve" : "refund.reject",
        entityType: "refund",
        entityId: r.id,
        before: JSON.stringify({ ...row, status: "PENDING", decidedById: null, decidedAt: null }),
        after: JSON.stringify(row),
        requestId: `seed-${r.id.replace(/_/g, "-")}`,
        reason: r.decision.auditReason ?? null,
        createdAt: row.decidedAt ?? undefined,
      },
    });
  }
}

/**
 * KYC review queue (docs/tools/kyc.md). Fixed ids; createdAt spread over the
 * last 14 days relative to the first seed. Decided cases get a matching
 * audit_log row (once).
 */
async function seedKyc({ lead }: { lead: Decider }) {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3_600_000);

  type Seed = {
    id: string;
    customerId: string;
    documentType: "PASSPORT" | "DRIVERS_LICENSE" | "NATIONAL_ID";
    riskScore: number;
    notes: string | null;
    hoursAgo: number;
    decision?: {
      status: "VERIFIED" | "ESCALATED" | "REJECTED";
      by: Decider;
      afterHours: number;
      auditReason?: string;
    };
  };

  const cases: Seed[] = [
    { id: "kyc_low_1", customerId: "cust_a19f", documentType: "PASSPORT", riskScore: 12, hoursAgo: 6, notes: "MRZ and photo match; liveness check passed on first attempt." },
    { id: "kyc_low_2", customerId: "cust_b27c", documentType: "DRIVERS_LICENSE", riskScore: 28, hoursAgo: 31, notes: "Address on licence differs from signup address; utility bill on file matches signup." },
    { id: "kyc_low_3", customerId: "cust_c3d0", documentType: "NATIONAL_ID", riskScore: 45, hoursAgo: 58, notes: null },
    { id: "kyc_low_4", customerId: "cust_d48e", documentType: "PASSPORT", riskScore: 61, hoursAgo: 104, notes: "Passport expires in 5 weeks. Name transliteration differs slightly from bank record." },
    { id: "kyc_high_1", customerId: "cust_e52b", documentType: "DRIVERS_LICENSE", riskScore: 70, hoursAgo: 14, notes: "Glare over the date of birth field; vendor OCR confidence 0.62." },
    { id: "kyc_high_2", customerId: "cust_f6a1", documentType: "NATIONAL_ID", riskScore: 78, hoursAgo: 77, notes: "Device fingerprint seen on two other accounts opened this month." },
    { id: "kyc_high_3", customerId: "cust_g7c4", documentType: "PASSPORT", riskScore: 86, hoursAgo: 150, notes: "Possible PEP match (family member of a regional official); needs manual review." },
    { id: "kyc_high_4", customerId: "cust_h8e9", documentType: "NATIONAL_ID", riskScore: 95, hoursAgo: 222, notes: "Selfie fails liveness; document template does not match issuing country specimen." },
    {
      id: "kyc_done_1", customerId: "cust_i903", documentType: "DRIVERS_LICENSE", riskScore: 20, hoursAgo: 270,
      notes: "All checks passed.",
      decision: { status: "VERIFIED", by: lead, afterHours: 4 },
    },
    {
      id: "kyc_done_2", customerId: "cust_j0b6", documentType: "PASSPORT", riskScore: 88, hoursAgo: 300,
      notes: "Issue date on document is 2019-04-11; vendor record shows 2018-04-11.",
      decision: { status: "ESCALATED", by: lead, afterHours: 9, auditReason: "Document issue date does not match vendor record" },
    },
    {
      id: "kyc_done_3", customerId: "cust_k1d2", documentType: "NATIONAL_ID", riskScore: 92, hoursAgo: 318,
      notes: "Name and date of birth match an entry on the consolidated sanctions list.",
      decision: { status: "REJECTED", by: lead, afterHours: 2, auditReason: "Sanctions list match confirmed" },
    },
    {
      id: "kyc_done_4", customerId: "cust_l2f7", documentType: "PASSPORT", riskScore: 35, hoursAgo: 190,
      notes: null,
      decision: { status: "VERIFIED", by: lead, afterHours: 6 },
    },
  ];

  const ACTION_FOR = { VERIFIED: "kyc.verify", ESCALATED: "kyc.escalate", REJECTED: "kyc.reject" } as const;

  for (const c of cases) {
    const createdAt = hoursAgo(c.hoursAgo);
    const decidedAt = c.decision ? new Date(createdAt.getTime() + c.decision.afterHours * 3_600_000) : null;
    const row = await prisma.kycCase.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        customerId: c.customerId,
        documentType: c.documentType,
        riskScore: c.riskScore,
        notes: c.notes,
        status: c.decision?.status ?? "PENDING",
        decidedById: c.decision?.by.id ?? null,
        decidedAt,
        createdAt,
      },
    });

    if (!c.decision) continue;
    const audited = await prisma.auditLog.findFirst({ where: { entityType: "kyccase", entityId: c.id } });
    if (audited) continue;
    await prisma.auditLog.create({
      data: {
        actorId: c.decision.by.id,
        actorRole: c.decision.by.role,
        action: ACTION_FOR[c.decision.status],
        entityType: "kyccase",
        entityId: c.id,
        before: JSON.stringify({ ...row, status: "PENDING", decidedById: null, decidedAt: null }),
        after: JSON.stringify(row),
        requestId: `seed-${c.id.replace(/_/g, "-")}`,
        reason: c.decision.auditReason ?? null,
        createdAt: row.decidedAt ?? undefined,
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
