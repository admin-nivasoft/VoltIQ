import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from '@ql/contracts';
import { api, ApiError, apiFetch } from './client';
import { callsOf, makeMe, stubFetch } from '../../test/utils';

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('sends X-Requested-With, JSON accept and same-origin credentials on every request', async () => {
    const spy = stubFetch(() => ({ body: { ok: 1 } }));
    await apiFetch('/thing');
    const [url, init] = callsOf(spy)[0]!;
    expect(url).toBe('/api/v1/thing');
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.credentials).toBe('same-origin');
    const h = new Headers(init.headers);
    expect(h.get('x-requested-with')).toBe('ql');
    expect(h.get('accept')).toBe('application/json');
  });

  it('sends a JSON body with a content type on writes', async () => {
    const spy = stubFetch(() => ({ body: {} }));
    await apiFetch('/thing', { method: 'POST', body: { a: 1 } });
    const init = callsOf(spy)[0]![1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(new Headers(init.headers).get('x-requested-with')).toBe('ql');
  });

  it('turns the error envelope into an ApiError', async () => {
    stubFetch(() => ({ status: 403, body: { error: { code: 'forbidden', message: 'No.' } } }));
    await expect(apiFetch('/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      code: 'forbidden',
      message: 'No.',
    });
  });

  it('copes with an error that is not our envelope (a proxy page, for example)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })),
    );
    const err = (await apiFetch('/x').catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: 'internal' });
    expect(err.message).not.toContain('Bad gateway');
  });

  it('reports a network failure as status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('gives up on a hung request: a timeout is reported as a network error', async () => {
    const spy = vi.fn(async () => {
      throw new DOMException('The operation timed out', 'TimeoutError');
    });
    vi.stubGlobal('fetch', spy);
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 0, code: 'network' });
    const init = (spy.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('passes a caller cancellation on as an AbortError, not as a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('aborted', 'AbortError');
      }),
    );
    await expect(apiFetch('/x', { signal: new AbortController().signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('validates the response with the contracts schema and rejects a mismatch', async () => {
    stubFetch(() => ({ body: { a: 'not a number' } }));
    await expect(apiFetch('/x', { schema: z.object({ a: z.number() }) })).rejects.toMatchObject({
      code: 'invalid_response',
    });
    stubFetch(() => ({ body: { a: 1 } }));
    await expect(apiFetch('/x', { schema: z.object({ a: z.number() }) })).resolves.toEqual({
      a: 1,
    });
  });

  it('returns undefined for 204', async () => {
    stubFetch(() => ({ status: 204 }));
    await expect(apiFetch('/x', { method: 'POST' })).resolves.toBeUndefined();
  });
});

describe('api helpers', () => {
  it('me() returns a validated Me, and 401 means signed out (null)', async () => {
    stubFetch(() => ({ body: makeMe('technician') }));
    expect((await api.me())?.user.role).toBe('technician');
    stubFetch(() => ({
      status: 401,
      body: { error: { code: 'unauthenticated', message: 'Sign in required' } },
    }));
    expect(await api.me()).toBeNull();
  });

  it('me() still throws for a server error, so it is not mistaken for signed out', async () => {
    stubFetch(() => ({ status: 500, body: { error: { code: 'internal', message: 'x' } } }));
    await expect(api.me()).rejects.toMatchObject({ status: 500 });
  });

  it('logout posts to /auth/logout', async () => {
    const spy = stubFetch(() => ({ status: 204 }));
    await api.logout();
    expect(callsOf(spy)[0]![0]).toBe('/api/v1/auth/logout');
    expect(callsOf(spy)[0]![1].method).toBe('POST');
  });

  it('keeps the mock login call out of the shared client (it lives with the dev-only code)', () => {
    expect(Object.keys(api).sort()).toEqual(['logout', 'me']);
  });
});
