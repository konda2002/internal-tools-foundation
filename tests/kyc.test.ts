import { beforeAll, describe, expect, it } from "vitest";
import { GET as listCases } from "@/app/api/kyc/route";
import { POST as verify } from "@/app/api/kyc/[id]/verify/route";
import { POST as escalate } from "@/app/api/kyc/[id]/escalate/route";
import { POST as reject } from "@/app/api/kyc/[id]/reject/route";
import { prisma } from "@/lib/db";
import { navForRole } from "@/lib/nav";
import { cookieFor, getRequest, jsonRequest } from "./helpers";

// Rules from docs/tools/kyc.md. Tests share the seeded database and run in
// order: kyc_high_1 is the 400 case before the lead escalates it.

const PERMISSION = "You do not have permission to view or process this KYC case.";
const HIGH_RISK = "Cases with a risk score of 70 or above must be escalated or rejected.";

type Handler = typeof verify;
const call = (handler: Handler, id: string, body: unknown, cookie?: string, raw = false) =>
  handler(jsonRequest(`/api/kyc/${id}/x`, body, { cookie, raw }), { params: Promise.resolve({ id }) });

const auditCount = (entityId: string) => prisma.auditLog.count({ where: { entityType: "kyc_case", entityId } });

async function latestAudit(entityId: string) {
  return prisma.auditLog.findFirstOrThrow({
    where: { entityType: "kyc_case", entityId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

describe("kyc", () => {
  let analyst: string;
  let lead: string;

  beforeAll(async () => {
    analyst = await cookieFor("analyst@demo.test");
    lead = await cookieFor("lead@demo.test");
  });

  describe("GET /api/kyc", () => {
    it("analyst → 403 with the exact permission message", async () => {
      const res = await listCases(getRequest("/api/kyc", analyst), {});
      expect(res.status).toBe(403);
      expect((await res.json()).error).toEqual({ code: "forbidden", message: PERMISSION });
    });

    it("401 when not signed in", async () => {
      expect((await listCases(getRequest("/api/kyc"), {})).status).toBe(401);
    });

    it("lead → 200, the 12 seeded cases newest first", async () => {
      const res = await listCases(getRequest("/api/kyc", lead), {});
      expect(res.status).toBe(200);
      const { cases } = await res.json();
      expect(cases).toHaveLength(12);
      const times = cases.map((c: { createdAt: string }) => Date.parse(c.createdAt));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      const fourteenDays = 14 * 24 * 3_600_000;
      expect(times.every((t: number) => Date.now() - t <= fourteenDays)).toBe(true);
    });

    it("filters by ?status=", async () => {
      const res = await listCases(getRequest("/api/kyc?status=VERIFIED", lead), {});
      const { cases } = await res.json();
      expect(cases.map((c: { id: string }) => c.id).sort()).toEqual(["kyc_done_1", "kyc_done_4"]);
      expect(cases[0].decidedByEmail).toBe("lead@demo.test");

      const pending = await (await listCases(getRequest("/api/kyc?status=PENDING", lead), {})).json();
      expect(pending.cases).toHaveLength(8);
    });

    it("400 for an unknown status filter", async () => {
      expect((await listCases(getRequest("/api/kyc?status=BOGUS", lead), {})).status).toBe(400);
    });
  });

  describe("POST /api/kyc/[id]/verify|escalate|reject", () => {
    it("401 when not signed in", async () => {
      for (const handler of [verify, escalate, reject]) {
        expect((await call(handler, "kyc_low_1", {})).status).toBe(401);
      }
    });

    it("analyst verify kyc_low_1 → 403 with the exact message (and on every decision route)", async () => {
      for (const handler of [verify, escalate, reject]) {
        const res = await call(handler, "kyc_low_1", { reason: "trying" }, analyst);
        expect(res.status).toBe(403);
        expect((await res.json()).error).toEqual({ code: "forbidden", message: PERMISSION });
      }
      expect(await auditCount("kyc_low_1")).toBe(0);
    });

    it("400 on a bad body", async () => {
      const res = await call(verify, "kyc_low_1", { reason: 42 }, lead);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("bad_request");
      expect((await call(reject, "kyc_low_1", "{nope", lead, true)).status).toBe(400);
    });

    it("404 for a missing id", async () => {
      const res = await call(verify, "kyc_does_not_exist", {}, lead);
      expect(res.status).toBe(404);
      expect((await res.json()).error.code).toBe("not_found");
    });

    it("lead verify kyc_low_1 → 200 and writes a kyc.verify audit row with full before/after", async () => {
      const res = await call(verify, "kyc_low_1", {}, lead);
      expect(res.status).toBe(200);
      const { kycCase } = await res.json();
      expect(kycCase).toMatchObject({ id: "kyc_low_1", status: "VERIFIED", decidedByEmail: "lead@demo.test" });
      expect(kycCase.decidedAt).toEqual(expect.any(String));

      expect(await auditCount("kyc_low_1")).toBe(1);
      const audit = await latestAudit("kyc_low_1");
      expect(audit.action).toBe("kyc.verify");
      expect(audit.actorRole).toBe("OPS_LEAD");
      expect(audit.reason).toBeNull();
      const before = JSON.parse(audit.before!);
      const after = JSON.parse(audit.after!);
      expect(before).toMatchObject({ id: "kyc_low_1", status: "PENDING", riskScore: 12, decidedById: null });
      expect(Object.keys(before).sort()).toEqual(Object.keys(after).sort());
      expect(after).toMatchObject({ status: "VERIFIED", decidedById: expect.any(String) });
    });

    it("lead may verify just under the threshold (kyc_low_4, 61)", async () => {
      expect((await call(verify, "kyc_low_4", {}, lead)).status).toBe(200);
    });

    it("lead verify kyc_high_1 (70) → 400 with the risk message, no audit row", async () => {
      const res = await call(verify, "kyc_high_1", { reason: "looks fine" }, lead);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toEqual({ code: "bad_request", message: HIGH_RISK });
      expect(await auditCount("kyc_high_1")).toBe(0);
      expect((await prisma.kycCase.findUniqueOrThrow({ where: { id: "kyc_high_1" } })).status).toBe("PENDING");
    });

    it("lead escalate kyc_high_1 with reason → 200, reason stored on the audit row", async () => {
      const res = await call(escalate, "kyc_high_1", { reason: "  DOB unreadable, request a new scan  " }, lead);
      expect(res.status).toBe(200);
      expect((await res.json()).kycCase.status).toBe("ESCALATED");
      const audit = await latestAudit("kyc_high_1");
      expect(audit.action).toBe("kyc.escalate");
      expect(audit.reason).toBe("DOB unreadable, request a new scan");
      expect(JSON.parse(audit.before!).status).toBe("PENDING");
      expect(JSON.parse(audit.after!).status).toBe("ESCALATED");
    });

    it("lead reject kyc_high_2 → 200 and writes a kyc.reject audit row", async () => {
      const res = await call(reject, "kyc_high_2", {}, lead);
      expect(res.status).toBe(200);
      expect((await res.json()).kycCase.status).toBe("REJECTED");
      expect((await latestAudit("kyc_high_2")).action).toBe("kyc.reject");
    });

    it("second decision on kyc_done_1 → 409 'already been verified', nothing written", async () => {
      const auditBefore = await prisma.auditLog.count();
      for (const handler of [verify, escalate, reject]) {
        const res = await call(handler, "kyc_done_1", {}, lead);
        expect(res.status).toBe(409);
        expect((await res.json()).error).toEqual({ code: "conflict", message: "This case has already been verified." });
      }
      expect(await prisma.auditLog.count()).toBe(auditBefore);
    });

    it("409 wording for escalated / rejected cases, including ones decided in this run", async () => {
      const expected: [string, string][] = [
        ["kyc_done_2", "This case has already been escalated."],
        ["kyc_high_1", "This case has already been escalated."],
        ["kyc_done_3", "This case has already been rejected."],
        ["kyc_high_2", "This case has already been rejected."],
      ];
      for (const [id, message] of expected) {
        // verify on a decided high-risk case: "decided once" wins over the risk rule.
        const res = await call(verify, id, {}, lead);
        expect(res.status).toBe(409);
        expect((await res.json()).error.message).toBe(message);
      }
    });
  });

  describe("nav", () => {
    it('navForRole("ANALYST") does not include /kyc; OPS_LEAD does', () => {
      expect(navForRole("ANALYST").map((i) => i.href)).not.toContain("/kyc");
      expect(navForRole("OPS_LEAD").map((i) => i.href)).toContain("/kyc");
    });
  });

  describe("seed", () => {
    it("every decided case has a matching audit row", async () => {
      const seeded = await prisma.auditLog.findMany({
        where: { entityType: "kyc_case", requestId: { startsWith: "seed-" } },
        orderBy: { entityId: "asc" },
      });
      expect(seeded.map((a) => [a.entityId, a.action, a.reason, JSON.parse(a.after!).status])).toEqual([
        ["kyc_done_1", "kyc.verify", null, "VERIFIED"],
        ["kyc_done_2", "kyc.escalate", "Document issue date does not match vendor record", "ESCALATED"],
        ["kyc_done_3", "kyc.reject", "Sanctions list match confirmed", "REJECTED"],
        ["kyc_done_4", "kyc.verify", null, "VERIFIED"],
      ]);
    });
  });
});
