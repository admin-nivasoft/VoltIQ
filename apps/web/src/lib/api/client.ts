import { ErrorSchema, MeSchema, type Me, type z } from '@ql/contracts';

/** What the API (or the network) said went wrong. The message is for logs; the UI shows describeError(). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const BASE = '/api/v1';
const TIMEOUT_MS = 15_000;

export interface FetchOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** A contracts schema. The response is validated against it, so the UI only ever sees the agreed shape. */
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
}

/**
 * The one door to the API. Same origin only (no CORS, D-08); the session cookie is httpOnly, so the
 * browser sends it and no script can read it. X-Requested-With is sent on every request: the API
 * requires it on writes and a cross-site form cannot set it.
 */
export async function apiFetch<T = unknown>(path: string, opts: FetchOptions<T> = {}): Promise<T> {
  const { method = 'GET', body, schema, signal } = opts;
  const headers = new Headers({ Accept: 'application/json', 'X-Requested-With': 'ql' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      // A hung request must not leave a screen loading forever: give up after 15 seconds.
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network', 'Could not reach the server');
  }

  if (!res.ok) {
    const parsed = ErrorSchema.safeParse(await res.json().catch(() => null));
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(res.status, code, message, details);
    }
    throw new ApiError(res.status, 'internal', 'The request failed');
  }
  if (res.status === 204) return undefined as T;

  const json: unknown = await res.json().catch(() => undefined);
  if (!schema) return json as T;
  const checked = schema.safeParse(json);
  if (!checked.success)
    throw new ApiError(res.status, 'invalid_response', 'The server sent an unexpected response');
  return checked.data;
}

export const api = {
  /** The signed-in user, or null when signed out (401). Any other failure is thrown, never read as signed out. */
  async me(): Promise<Me | null> {
    try {
      return await apiFetch('/me', { schema: MeSchema });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },
  async logout(): Promise<void> {
    await apiFetch('/auth/logout', { method: 'POST' });
  },
};
