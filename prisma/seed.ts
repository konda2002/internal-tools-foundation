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

  console.log("Seeded: analyst@demo.test / analyst123 (ANALYST), lead@demo.test / lead123 (OPS_LEAD)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
