import { describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as getAudit } from "@/app/api/audit/route";
import { requireRole, verifySessionToken, SESSION_COOKIE } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { cookieFor, getRequest, jsonRequest, userByEmail } from "./helpers";

describe("POST /api/auth/login", () => {
  it("succeeds with valid credentials and sets a signed httpOnly cookie", async () => {
    const res = await login(jsonRequest("/api/auth/login", { email: "lead@demo.test", password: "lead123" }), {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toMatchObject({ email: "lead@demo.test", role: "OPS_LEAD" });
    expect(body.user.passwordHash).toBeUndefined();

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    const token = /itf_session=([^;]+)/.exec(setCookie)![1];
    const lead = await userByEmail("lead@demo.test");
    expect(verifySessionToken(token)).toBe(lead.id);
  });

  it("fails with 401 and no cookie for a wrong password", async () => {
    const res = await login(jsonRequest("/api/auth/login", { email: "lead@demo.test", password: "nope" }), {});
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.json()).toEqual({
      error: { code: "unauthorized", message: "Invalid email or password" },
    });
  });

  it("fails with 401 for an unknown email", async () => {
    const res = await login(jsonRequest("/api/auth/login", { email: "ghost@demo.test", password: "x" }), {});
    expect(res.status).toBe(401);
  });

  it("fails with 400 for a malformed body", async () => {
    const res = await login(jsonRequest("/api/auth/login", { email: "not-an-email" }), {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("bad_request");
  });
});

describe("session token", () => {
  it("rejects tampered tokens", async () => {
    const cookie = await cookieFor("lead@demo.test");
    const token = cookie.split("=")[1];
    expect(verifySessionToken(token + "x")).toBeNull();
    expect(verifySessionToken("garbage")).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });
});

describe("requireRole", () => {
  it("returns the user when the role matches", async () => {
    const user = await requireRole("OPS_LEAD", getRequest("/x", await cookieFor("lead@demo.test")));
    expect(user.email).toBe("lead@demo.test");
  });

  it("throws 403 for the wrong role", async () => {
    const req = getRequest("/x", await cookieFor("analyst@demo.test"));
    await expect(requireRole("OPS_LEAD", req)).rejects.toMatchObject({ status: 403, code: "forbidden" });
    await expect(requireRole("OPS_LEAD", req)).rejects.toBeInstanceOf(ApiError);
  });

  it("throws 401 when not signed in", async () => {
    await expect(requireRole("OPS_LEAD", getRequest("/x"))).rejects.toMatchObject({ status: 401 });
  });

  it("surfaces as 403 JSON from a real route (GET /api/audit as ANALYST)", async () => {
    const res = await getAudit(getRequest("/api/audit", await cookieFor("analyst@demo.test")), {});
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error.code).toBe("forbidden");
  });

  it("GET /api/audit returns rows newest first for OPS_LEAD", async () => {
    const res = await getAudit(getRequest("/api/audit", await cookieFor("lead@demo.test")), {});
    expect(res.status).toBe(200);
    const { rows } = await res.json();
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const times = rows.map((r: { createdAt: string }) => Date.parse(r.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect(rows[0]).toHaveProperty("actorEmail");
  });
});
