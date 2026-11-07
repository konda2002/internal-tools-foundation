import { prisma } from "@/lib/db";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function userByEmail(email: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { email } });
  return u;
}

export async function cookieFor(email: string): Promise<string> {
  const u = await userByEmail(email);
  return `${SESSION_COOKIE}=${createSessionToken(u.id)}`;
}

export function jsonRequest(
  url: string,
  body: unknown,
  opts: { cookie?: string; method?: string; raw?: boolean } = {},
): Request {
  return new Request(`http://localhost${url}`, {
    method: opts.method ?? "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    body: opts.raw ? (body as string) : JSON.stringify(body),
  });
}

export function getRequest(url: string, cookie?: string): Request {
  return new Request(`http://localhost${url}`, {
    headers: cookie ? { cookie } : {},
  });
}
