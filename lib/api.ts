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
    const requestId = requestIdFor(req);
    const res = await run(handler, req, ctx, requestId);
    res.headers.set(REQUEST_ID_HEADER, requestId);
    return res;
  };
}

async function run<Ctx>(handler: Handler<Ctx>, req: Request, ctx: Ctx, requestId: string) {
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
    console.error(`[${requestId}]`, err);
    return error(500, "internal_error", "Something went wrong", { requestId });
  }
}

/**
 * Request ids tie an audit row, the API response and server logs together.
 * Clients (or an API gateway) may supply `x-request-id`; otherwise one is
 * generated. The id is echoed on every response and stored in
 * audit_log.request_id by defineWriteRoute.
 */
export const REQUEST_ID_HEADER = "x-request-id";
const requestIds = new WeakMap<Request, string>();

export function requestIdFor(req: Request): string {
  let id = requestIds.get(req);
  if (!id) {
    const supplied = req.headers.get(REQUEST_ID_HEADER)?.trim() ?? "";
    id = /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
    requestIds.set(req, id);
  }
  return id;
}

/** Parse a JSON body, turning malformed JSON into a 400 instead of a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw errors.badRequest("Body must be valid JSON");
  }
}
