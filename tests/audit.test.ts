import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as auditModule from "@/lib/audit";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { userByEmail } from "./helpers";

describe("writeAudit", () => {
  it("writes a row with JSON-encoded before/after", async () => {
    const lead = await userByEmail("lead@demo.test");
    const row = await writeAudit(prisma, {
      actorId: lead.id,
      action: "test.write",
      entityType: "widget",
      entityId: "w1",
      before: { status: "A" },
      after: { status: "B" },
    });
    const stored = await prisma.auditLog.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored).toMatchObject({
      actorId: lead.id,
      action: "test.write",
      entityType: "widget",
      entityId: "w1",
      before: JSON.stringify({ status: "A" }),
      after: JSON.stringify({ status: "B" }),
    });
  });

  it("never updates: a second write for the same entity appends and leaves the first row intact", async () => {
    const lead = await userByEmail("lead@demo.test");
    const base = { actorId: lead.id, entityType: "widget", entityId: "w2" };
    const first = await writeAudit(prisma, { ...base, action: "test.first", after: { v: 1 } });
    const countAfterFirst = await prisma.auditLog.count();

    const second = await writeAudit(prisma, { ...base, action: "test.second", before: { v: 1 }, after: { v: 2 } });

    expect(second.id).not.toBe(first.id);
    expect(await prisma.auditLog.count()).toBe(countAfterFirst + 1);
    const firstAgain = await prisma.auditLog.findUniqueOrThrow({ where: { id: first.id } });
    expect(firstAgain).toEqual(first);
  });

  it("works inside a transaction and rolls back with it", async () => {
    const lead = await userByEmail("lead@demo.test");
    const before = await prisma.auditLog.count();
    await expect(
      prisma.$transaction(async (tx) => {
        await writeAudit(tx, { actorId: lead.id, action: "test.rollback", entityType: "widget", entityId: "w3" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await prisma.auditLog.count()).toBe(before);
  });

  it("exposes no update or delete code path", () => {
    expect(Object.keys(auditModule).sort()).toEqual(["toAuditRow", "writeAudit"]);
    const src = readFileSync(path.resolve(__dirname, "../lib/audit.ts"), "utf8");
    expect(src).not.toMatch(/auditLog\.(update|updateMany|delete|deleteMany|upsert)/);
  });

  it("database rejects UPDATE and DELETE on audit_log even when attempted directly", async () => {
    const row = await prisma.auditLog.findFirstOrThrow();
    // Prisma reports SQLite RAISE(ABORT) as a generic constraint error; the raw
    // query below shows the trigger's actual message.
    await expect(
      prisma.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } }),
    ).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    await expect(
      prisma.$executeRawUnsafe(`UPDATE audit_log SET action = 'tampered' WHERE id = '${row.id}'`),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM audit_log`)).rejects.toThrow(/append-only/);
    const same = await prisma.auditLog.findUniqueOrThrow({ where: { id: row.id } });
    expect(same.action).toBe(row.action);
  });
});
