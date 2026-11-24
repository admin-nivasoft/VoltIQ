// What a screen's endpoint module gets from the handler. The handler has already checked that someone
// is signed in and resolved their tenant; the module checks its own permissions with need().
// A module returns null for paths it does not own, so the handler can try the next one.
import type { DemoUser } from '../data';
import type { DemoPermission } from '../types';
import type { Tenant } from '../world';

export interface RouteContext {
  method: string;
  url: URL;
  body: unknown;
  user: DemoUser;
  /** The signed-in user's manufacturer. Never taken from the path, query or body. */
  tenant: Tenant;
  /** null when the user has the permission, otherwise a ready 403 response. */
  need: (permission: DemoPermission) => Response | null;
}

export type RouteModule = (ctx: RouteContext) => Response | null;

export const reply = (status: number, body?: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export const fail = (status: number, code: string, message: string) =>
  reply(status, { error: { code, message } });

/** Another manufacturer's resource, or one that does not exist: always 404, never 403. */
export const notFound = () => fail(404, 'not_found', 'Not found');
