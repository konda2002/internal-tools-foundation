import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { errors } from "@/lib/api";

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTH STUB — replace with OIDC before production
 * ─────────────────────────────────────────────────────────────────────────────
 * This module is a deliberately small stand-in for a real identity provider.
 * It stores bcrypt password hashes in the `users` table and issues an
 * HMAC-signed, httpOnly session cookie (`itf_session`) containing the user id.
 *
 * Where OIDC replaces this:
 *   - `POST /api/auth/login` (app/api/auth/login/route.ts) becomes a redirect to
 *     the IdP's authorization endpoint; a new `/api/auth/callback` route
 *     exchanges the code for tokens, validates the ID token (issuer, audience,
 *     signature, nonce) and then calls `createSessionToken(userId)` exactly as
 *     login does today. Nothing downstream changes.
 *   - `verifyPassword` and the `password_hash` column go away; `users` becomes a
 *     cache keyed by the IdP `sub` claim (add a `subject` column), upserted on
 *     each callback so audit rows can still reference a local `actor_id`.
 *   - `getCurrentUser` / `requireRole` keep their signatures. Routes and tests
 *     that use them do not need to change.
 *
 * How IdP groups map to `role`:
 *   - The IdP includes a `groups` (or `roles`) claim in the ID token. On every
 *     callback map it with a single table, e.g.
 *       { "internal-tools-ops-leads": "OPS_LEAD", "internal-tools-analysts": "ANALYST" }
 *     and write the result to `users.role`. Highest-privilege match wins.
 *   - A user with no matching group gets no session (deny by default).
 *   - Because role is re-derived on every login, removing someone from a group
 *     in the IdP revokes access the next time their session is created; if you
 *     need faster revocation shorten SESSION_TTL_SECONDS or re-check the IdP
 *     in `getCurrentUser`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const ROLES = ["ANALYST", "OPS_LEAD"] as const;
export type Role = (typeof ROLES)[number];

export const SESSION_COOKIE = "itf_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

export type SessionUser = Pick<User, "id" | "email" | "createdAt"> & { role: Role };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET must be set (>=16 chars). See .env.example.");
  }
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Token format: base64url(JSON{ uid, exp }).signature */
export function createSessionToken(userId: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      uid?: unknown;
      exp?: unknown;
    };
    if (typeof data.uid !== "string" || typeof data.exp !== "number") return null;
    if (data.exp * 1000 < now) return null;
    return data.uid;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Returns the user for valid credentials, or null. Never reveals which part failed. */
export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) {
    // Burn roughly the same time as a real compare so timing does not leak existence.
    await bcrypt.compare(password, "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Z0x9bK0pE0hF0e8Zz3k1g2h3i4j5k");
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? toSessionUser(user) : null;
}

function toSessionUser(user: User): SessionUser {
  return { id: user.id, email: user.email, role: user.role as Role, createdAt: user.createdAt };
}

function cookieFromHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/**
 * The signed-in user, or null.
 *
 * In API routes pass the incoming `Request` so the cookie is read from it
 * (this also keeps route handlers testable without Next's request context).
 * In server components call it with no argument and it reads `next/headers`.
 */
export async function getCurrentUser(req?: Request): Promise<SessionUser | null> {
  let token: string | undefined;
  if (req) {
    token = cookieFromHeader(req.headers.get("cookie"), SESSION_COOKIE);
  } else {
    const { cookies } = await import("next/headers");
    token = (await cookies()).get(SESSION_COOKIE)?.value;
  }
  const userId = verifySessionToken(token);
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user ? toSessionUser(user) : null;
}

/**
 * THE authorization check. Call it first in every API route.
 * Throws ApiError 401 when not signed in and 403 when the role does not match;
 * `withErrorHandling` turns those into JSON responses.
 *
 * Roles are exact: an OPS_LEAD calling an ANALYST-only route gets 403 too.
 * If a route should accept several roles, pass them all. Pass
 * `forbiddenMessage` when a spec fixes the 403 wording for its routes.
 */
export async function requireRole(
  role: Role | readonly Role[],
  req?: Request,
  opts: { forbiddenMessage?: string } = {},
): Promise<SessionUser> {
  const allowed = Array.isArray(role) ? (role as readonly Role[]) : [role as Role];
  const user = await getCurrentUser(req);
  if (!user) throw errors.unauthorized();
  if (!allowed.includes(user.role)) {
    throw errors.forbidden(opts.forbiddenMessage ?? `This action requires role ${allowed.join(" or ")}`);
  }
  return user;
}
