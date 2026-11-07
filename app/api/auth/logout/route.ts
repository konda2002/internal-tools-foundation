import { NextResponse } from "next/server";
import { json, withErrorHandling } from "@/lib/api";
import { sessionCookieOptions } from "@/lib/auth";

/** POST /api/auth/logout → 200 and clears the session cookie. */
export const POST = withErrorHandling(async () => {
  const res: NextResponse = json(200, { ok: true });
  res.cookies.set({ ...sessionCookieOptions(), value: "", maxAge: 0 });
  return res;
});
