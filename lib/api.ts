import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Shared API helpers. Every route in app/api/** uses these so clients can rely
 * on one response shape:
 *
 *   success: any JSON body, status 2xx
 *   error:   { error: { code: string, message: string, details?: unknown } }
 */

export type ErrorBody = {
  error: { code: string; message: string; details?: unknown };
};

export function json<T>(status: number, body: T): NextResponse<T> {
  return NextResponse.json(body, { status });
}

/** Throw this anywhere inside a handler to produce a consistent error response. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function error(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse<ErrorBody> {
  return json(status, {
    error: details === undefined ? { code, message } : { code, message, details },
  });
}

export const errors = {
  unauthorized: (message = "Authentication required") =>
    new ApiError(401, "unauthorized", message),
  forbidden: (message = "You do not have permission to do this") =>
    new ApiError(403, "forbidden", message),
  notFound: (entity: string) => new ApiError(404, "not_found", `${entity} not found`),
  conflict: (message: string) => new ApiError(409, "conflict", message),
  badRequest: (message: string, details?: unknown) =>
    new ApiError(400, "bad_request", message, details),
};

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response>;

/**
 * Wrap a route handler so thrown ApiError / ZodError / unknown errors all
 * become the standard error shape instead of a Next.js 500 page.
 */
export function withErrorHandling<Ctx = unknown>(handler: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return error(err.status, err.code, err.message, err.details);
      }
      if (err instanceof ZodError) {
        return error(400, "bad_request", "Invalid request body", err.issues);
      }
      if (err instanceof SyntaxError) {
        return error(400, "bad_request", "Body must be valid JSON");
      }
      console.error(err);
      return error(500, "internal_error", "Something went wrong");
    }
  };
}

/** Parse a JSON body, turning malformed JSON into a 400 instead of a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw errors.badRequest("Body must be valid JSON");
  }
}
