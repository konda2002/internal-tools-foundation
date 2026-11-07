import { NextResponse } from "next/server";
import { z } from "zod";
import { json, readJson, withErrorHandling, errors } from "@/lib/api";
import { authenticate, createSessionToken, sessionCookieOptions } from "@/lib/auth";

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** POST /api/auth/login { email, password } → 200 { user } + session cookie, or 401. */
export const POST = withErrorHandling(async (req) => {
  const body = LoginBody.parse(await readJson(req));
  const user = await authenticate(body.email, body.password);
  if (!user) throw errors.unauthorized("Invalid email or password");

  const res: NextResponse = json(200, { user });
  res.cookies.set({ ...sessionCookieOptions(), value: createSessionToken(user.id) });
  return res;
});
