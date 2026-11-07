import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/_template/route";
import { prisma } from "@/lib/db";
import { cookieFor, jsonRequest } from "./helpers";

const url = "/api/_template";

describe("app/api/_template write handler", () => {
  let lead: string;
  let analyst: string;

  beforeEach(async () => {
    lead = await cookieFor("lead@demo.test");
    analyst = await cookieFor("analyst@demo.test");
    await prisma.note.upsert({
      where: { id: "note_open_1" },
      update: { status: "OPEN" },
      create: { id: "note_open_1", body: "seeded", status: "OPEN" },
    });
  });

  it("401 when not signed in", async () => {
    const res = await POST(jsonRequest(url, { id: "note_open_1", status: "RESOLVED" }), {});
    expect(res.status).toBe(401);
  });

  it("403 for the wrong role", async () => {
    const res = await POST(jsonRequest(url, { id: "note_open_1", status: "RESOLVED" }, { cookie: analyst }), {});
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
  });

  it("400 on a bad body", async () => {
    const res = await POST(jsonRequest(url, { id: "note_open_1", status: "BOGUS" }, { cookie: lead }), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
    expect(Array.isArray(body.error.details)).toBe(true);

    const notJson = await POST(jsonRequest(url, "{nope", { cookie: lead, raw: true }), {});
    expect(notJson.status).toBe(400);
  });

  it("404 on a missing entity", async () => {
    const res = await POST(jsonRequest(url, { id: "does-not-exist", status: "RESOLVED" }, { cookie: lead }), {});
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  it("409 when the business rule rejects the transition", async () => {
    const res = await POST(jsonRequest(url, { id: "note_open_1", status: "OPEN" }, { cookie: lead }), {});
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("conflict");
  });

  it("200 on success and writes an audit row in the same transaction", async () => {
    const auditBefore = await prisma.auditLog.count();
    const res = await POST(jsonRequest(url, { id: "note_open_1", status: "RESOLVED" }, { cookie: lead }), {});
    expect(res.status).toBe(200);
    const { note } = await res.json();
    expect(note).toMatchObject({ id: "note_open_1", status: "RESOLVED" });

    expect(await prisma.auditLog.count()).toBe(auditBefore + 1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityType: "note", entityId: "note_open_1" },
      orderBy: { createdAt: "desc" },
      include: { actor: true },
    });
    expect(audit.action).toBe("note.resolve");
    expect(audit.actor.email).toBe("lead@demo.test");
    expect(JSON.parse(audit.before!)).toMatchObject({ status: "OPEN" });
    expect(JSON.parse(audit.after!)).toMatchObject({ status: "RESOLVED" });
  });

  it("writes no audit row when the update fails (transaction is atomic)", async () => {
    const auditBefore = await prisma.auditLog.count();
    // Simulate a race: the note disappears between the load (step 3) and the
    // update (step 5), so tx.note.update throws inside the transaction.
    const original = prisma.note.findUnique.bind(prisma.note);
    const spy = vi.spyOn(prisma.note, "findUnique").mockImplementation((async (args: unknown) => {
      const found = await (original as (a: unknown) => Promise<{ id: string } | null>)(args);
      if (found) await prisma.note.delete({ where: { id: found.id } });
      return found;
    }) as unknown as typeof prisma.note.findUnique);
    try {
      const res = await POST(jsonRequest(url, { id: "note_open_1", status: "RESOLVED" }, { cookie: lead }), {});
      expect(res.status).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect(await prisma.auditLog.count()).toBe(auditBefore);
  });
});
