import type { FastifyError, FastifyInstance } from 'fastify';
import type { ZodError } from 'zod';
import { ErrorSchema, type ApiError } from '@ql/contracts';

type Code = ApiError['error']['code'];

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: Code,
    message: string,
    public readonly details?: ApiError['error']['details'],
  ) {
    super(message);
  }
}

/** The only place request input becomes a 400 with details. A bare ZodError elsewhere is a server bug. */
export function parseInput<T>(
  schema: {
    safeParse(v: unknown): { success: true; data: T } | { success: false; error: ZodError };
  },
  value: unknown,
): T {
  const r = schema.safeParse(value);
  if (r.success) return r.data;
  throw new HttpError(
    400,
    'validation_failed',
    'The request is invalid',
    r.error.issues.map((i) => ({ path: i.path as (string | number)[], message: i.message })),
  );
}

export const unauthenticated = () => new HttpError(401, 'unauthenticated', 'Sign in required');
export const forbidden = (msg = 'You do not have permission to do this') =>
  new HttpError(403, 'forbidden', msg);
export const notFound = () => new HttpError(404, 'not_found', 'Not found');
export const conflict = (msg: string) => new HttpError(409, 'conflict', msg);

const envelope = (
  status: number,
  code: Code,
  message: string,
  details?: ApiError['error']['details'],
) => ({
  status,
  body: ErrorSchema.parse({ error: { code, message, ...(details ? { details } : {}) } }),
});

/** One error shape for everything. Internals (database detail, stack, SQL) never reach a client. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | HttpError, req, reply) => {
    let out;
    if (err instanceof HttpError) {
      out = envelope(err.status, err.code, err.message, err.details);
    } else if ('statusCode' in err && err.statusCode === 429) {
      out = envelope(429, 'rate_limited', 'Too many requests');
    } else if ('statusCode' in err && err.statusCode === 404) {
      out = envelope(404, 'not_found', 'Not found');
    } else if (
      'statusCode' in err &&
      typeof err.statusCode === 'number' &&
      err.statusCode >= 400 &&
      err.statusCode < 500
    ) {
      // Keep the original status (413, 415, ...); the message is generic, never the framework's.
      out = envelope(err.statusCode, 'validation_failed', 'The request is invalid');
    } else {
      req.log.error({ err }, 'unhandled error');
      out = envelope(500, 'internal', 'Something went wrong');
    }
    return reply.status(out.status).send(out.body);
  });

  app.setNotFoundHandler((_req, reply) => {
    const out = envelope(404, 'not_found', 'Not found');
    return reply.status(404).send(out.body);
  });
}
