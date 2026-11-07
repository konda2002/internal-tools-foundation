import { beforeAll, describe, expect, it } from "vitest";
import { GET as listRefunds } from "@/app/api/refunds/route";
import { POST as approve } from "@/app/api/refunds/[id]/approve/route";
import { POST as reject } from "@/app/api/refunds/[id]/reject/route";
import { prisma } from "@/lib/db";
import { cookieFor, getRequest, jsonRequest } from "./helpers";

// Rules from docs/tools/refunds.md. Tests share the seeded database and run in
// order, so the 403 on refund_large_1 is asserted before the lead approves it.

const PERMISSION = "You do not have permission to view or process this refund.";

type Handler = typeof approve;
const call = (handler: Handler, id: string, body: unknown, cookie?: string, raw = false) =>
  handler(jsonRequest(`/api/refunds/${id}/x`, body, { cookie, raw }), { params: Promise.resolve({ id }) });

async function latestAudit(entityId: string) {
  return prisma.auditLog.findFirstOrThrow({
    where: { entityType: "refund", entityId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { actor: true },
  });
}

describe("refunds", () => {
  let analyst: string;
  let lead: string;
  let auditor: string;

  beforeAll(async () => {
    analyst = await cookieFor("analyst@demo.test");
    lead = await cookieFor("lead@demo.test");
    // A role that is not allowed on these routes, to prove "any role denial" uses the spec's message.
    await prisma.user.upsert({
      where: { email: "auditor@demo.test" },
      update: {},
      create: { email: "auditor@demo.test", passwordHash: "x", role: "AUDITOR" },
    });
    auditor = await cookieFor("auditor@demo.test");
  });

  describe("GET /api/refunds", () => {
    it("200 for ANALYST, newest first, with the 14 seeded refunds", async () => {
      const res = await listRefunds(getRequest("/api/refunds", analyst), {});
      expect(res.status).toBe(200);
      const { refunds } = await res.json();
      expect(refunds).toHaveLength(14);
      const times = refunds.map((r: { createdAt: string }) => Date.parse(r.createdAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it("200 for OPS_LEAD and filters by ?status=", async () => {
      const res = await listRefunds(getRequest("/api/refunds?status=REJECTED", lead), {});
      expect(res.status).toBe(200);
      const { refunds } = await res.json();
      expect(refunds.map((r: { id: string }) => r.id).sort()).toEqual(["refund_done_3", "refund_done_4"]);
      expect(refunds.find((r: { id: string }) => r.id === "refund_done_3").decidedByEmail).toBe("lead@demo.test");
    });

    it("400 for an unknown status filter", async () => {
      const res = await listRefunds(getRequest("/api/refunds?status=BOGUS", analyst), {});
      expect(res.status).toBe(400);
    });

    it("401 when not signed in", async () => {
      const res = await listRefunds(getRequest("/api/refunds"), {});
      expect(res.status).toBe(401);
    });

    it("403 with the exact permission message for a role that may not view refunds", async () => {
      const res = await listRefunds(getRequest("/api/refunds", auditor), {});
      expect(res.status).toBe(403);
      expect((await res.json()).error).toEqual({ code: "forbidden", message: PERMISSION });
    });
  });

  describe("POST /api/refunds/[id]/approve|reject", () => {
    it("401 when not signed in", async () => {
      expect((await call(approve, "refund_small_1", {})).status).toBe(401);
      expect((await call(reject, "refund_small_1", {})).status).toBe(401);
    });

    it("400 on a bad body", async () => {
      const res = await call(approve, "refund_small_1", { reason: 42 }, analyst);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("bad_request");
      expect((await call(reject, "refund_small_1", "{nope", analyst, true)).status).toBe(400);
    });

    it("404 for a missing id", async () => {
      const res = await call(approve, "refund_does_not_exist", {}, lead);
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("not_found");
    });

    it("403 with the exact permission message for a role denial", async () => {
      const res = await call(approve, "refund_small_3", {}, auditor);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toEqual({ code: "forbidden", message: PERMISSION });
    });

    it("analyst approves refund_small_1 → 200 and writes a refund.approve audit row", async () => {
      const auditBefore = await prisma.auditLog.count();
      const res = await call(approve, "refund_small_1", {}, analyst);
      expect(res.status).toBe(200);
      const { refund } = await res.json();
      expect(refund).toMatchObject({ id: "refund_small_1", status: "APPROVED", decidedByEmail: "analyst@demo.test" });
      expect(refund.decidedAt).toEqual(expect.any(String));

      expect(await prisma.auditLog.count()).toBe(auditBefore + 1);
      const audit = await latestAudit("refund_small_1");
      expect(audit.action).toBe("refund.approve");
      expect(audit.actor.email).toBe("analyst@demo.test");
      expect(audit.actorRole).toBe("ANALYST");
      expect(audit.reason).toBeNull();
      const before = JSON.parse(audit.before!);
      const after = JSON.parse(audit.after!);
      const fullRow = ["id", "customerId", "amountCents", "currency", "reason", "status", "decidedById", "decidedAt", "createdAt"];
      expect(Object.keys(before).sort()).toEqual([...fullRow].sort());
      expect(Object.keys(after).sort()).toEqual([...fullRow].sort());
      expect(before).toMatchObject({ status: "PENDING", decidedById: null, decidedAt: null, amountCents: 1200 });
      expect(after).toMatchObject({ status: "APPROVED", decidedById: audit.actorId, amountCents: 1200 });
    });

    it("analyst may decide just under the limit (refund_small_5, 49900)", async () => {
      const res = await call(reject, "refund_small_5", {}, analyst);
      expect(res.status).toBe(200);
      expect((await latestAudit("refund_small_5")).action).toBe("refund.reject");
    });

    it("analyst approves refund_large_1 (50000) → 403 with the exact permission message, nothing written", async () => {
      const auditBefore = await prisma.auditLog.count();
      const res = await call(approve, "refund_large_1", {}, analyst);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toEqual({ code: "forbidden", message: PERMISSION });

      const rej = await call(reject, "refund_large_1", { reason: "trying anyway" }, analyst);
      expect(rej.status).toBe(403);
      expect((await rej.json()).error.message).toBe(PERMISSION);

      expect(await prisma.auditLog.count()).toBe(auditBefore);
      expect((await prisma.refund.findUniqueOrThrow({ where: { id: "refund_large_1" } })).status).toBe("PENDING");
    });

    it("lead approves refund_large_1 → 200", async () => {
      const res = await call(approve, "refund_large_1", {}, lead);
      expect(res.status).toBe(200);
      expect((await res.json()).refund).toMatchObject({ status: "APPROVED", decidedByEmail: "lead@demo.test" });
      const audit = await latestAudit("refund_large_1");
      expect(audit.action).toBe("refund.approve");
      expect(audit.actorRole).toBe("OPS_LEAD");
    });

    it("lead rejects refund_small_2 with a reason → 200, reason stored on the audit row", async () => {
      const res = await call(reject, "refund_small_2", { reason: "  Parcel located at the depot  " }, lead);
      expect(res.status).toBe(200);
      expect((await res.json()).refund.status).toBe("REJECTED");
      const audit = await latestAudit("refund_small_2");
      expect(audit.action).toBe("refund.reject");
      expect(audit.reason).toBe("Parcel located at the depot");
      expect(JSON.parse(audit.before!).status).toBe("PENDING");
      expect(JSON.parse(audit.after!).status).toBe("REJECTED");
    });

    it("second decision on refund_done_1 → 409 'already been approved', nothing written", async () => {
      const auditBefore = await prisma.auditLog.count();
      for (const handler of [approve, reject]) {
        const res = await call(handler, "refund_done_1", {}, lead);
        expect(res.status).toBe(409);
        expect((await res.json()).error).toEqual({ code: "conflict", message: "This refund has already been approved." });
      }
      expect(await prisma.auditLog.count()).toBe(auditBefore);
    });

    it("409 'already been rejected' for a rejected refund, including one decided in this run", async () => {
      for (const id of ["refund_done_4", "refund_small_2"]) {
        const res = await call(approve, id, {}, lead);
        expect(res.status).toBe(409);
        expect((await res.json()).error.message).toBe("This refund has already been rejected.");
      }
    });

    it("permission is checked before state: analyst on decided refund_done_3 (120000) → 403", async () => {
      const res = await call(approve, "refund_done_3", {}, analyst);
      expect(res.status).toBe(403);
      expect((await res.json()).error.message).toBe(PERMISSION);
    });
  });

  describe("seed", () => {
    it("every decided refund has a matching audit row", async () => {
      const seeded = await prisma.auditLog.findMany({
        where: { entityType: "refund", requestId: { startsWith: "seed-" } },
        orderBy: { entityId: "asc" },
      });
      expect(seeded.map((a) => [a.entityId, a.action, a.reason])).toEqual([
        ["refund_done_1", "refund.approve", null],
        ["refund_done_2", "refund.approve", null],
        ["refund_done_3", "refund.reject", "Chargeback already filed by cardholder"],
        ["refund_done_4", "refund.reject", "Duplicate request, see refund_done_2"],
      ]);
    });
  });
});
