// A tiny in-browser stand-in for the API, used only when the app is built with VITE_DEMO=true.
// It answers the same paths with the same shapes (the app still validates every response with the
// shared contracts schemas) and applies the same permission rules from config/permissions.json.
// Nothing leaves the browser, and nothing is saved: a reload starts again.
import {
  NotificationChannelsPutSchema,
  NotificationTestRequestSchema,
  RolePolicyUpdateSchema,
  type Alert,
  type FleetSummary,
  type Me,
  type NotificationChannel,
  type NotificationLogEntry,
  type PackSummary,
} from '@ql/contracts';
import policy from '../../../../config/permissions.json';
import {
  buildAlerts,
  buildPacks,
  CONSUMERS,
  MANUFACTURER,
  USERS,
  type DemoConsumer,
  type DemoUser,
} from './data';

const STORAGE_KEY = 'ql-demo-user';
let latencyMs = 120; // enough to see loading states, not enough to be annoying
/** Tests turn the artificial delay off. */
export const setDemoLatency = (ms: number) => {
  latencyMs = ms;
};
const NEAR_EOL_MONTHS = 6;

interface Tenant {
  consumer: DemoConsumer;
  packs: PackSummary[];
  alerts: Alert[];
}
let tenants: Map<string, Tenant> | null = null;
let currentUserId: string | null | undefined;

// Settings state, all in memory (reset with the rest of the demo).
const channelsByUser = new Map<string, NotificationChannel[]>();
const logByConsumer = new Map<string, NotificationLogEntry[]>();
let policyState = freshPolicy();

function freshPolicy() {
  return { version: 1, roles: structuredClone(policy.roles) as Record<string, string[]> };
}

function seedLog(consumerId: string): NotificationLogEntry[] {
  const now = Date.now();
  const e = (n: number, over: Partial<NotificationLogEntry>): NotificationLogEntry => ({
    // The first character differs per company (a, b, c), so ids never repeat across companies.
    id: `5${consumerId[0]}000000-0000-4000-9000-${String(n).padStart(12, '0')}`,
    alertId: null,
    kind: 'alert',
    channel: 'email',
    status: 'sent',
    attempt: 1,
    error: null,
    at: new Date(now - n * 3_600_000).toISOString(),
    ...over,
  });
  return [
    e(1, { kind: 'test' }),
    e(5, { channel: 'webhook', status: 'failed', attempt: 3, error: 'mock_delivery_failed' }),
    e(6, { channel: 'webhook', status: 'failed', attempt: 2, error: 'mock_delivery_failed' }),
    e(7, { channel: 'webhook', status: 'failed', attempt: 1, error: 'mock_delivery_failed' }),
    e(30, { channel: 'sms' }),
    e(31, { channel: 'email' }),
  ];
}
function logFor(consumerId: string): NotificationLogEntry[] {
  let l = logByConsumer.get(consumerId);
  if (!l) logByConsumer.set(consumerId, (l = seedLog(consumerId)));
  return l;
}

function world(): Map<string, Tenant> {
  if (!tenants) {
    tenants = new Map(
      CONSUMERS.map((c) => {
        const packs = buildPacks(c);
        return [c.id, { consumer: c, packs, alerts: buildAlerts(c, packs) }];
      }),
    );
  }
  return tenants;
}

function readUser(): DemoUser | null {
  if (currentUserId === undefined) {
    try {
      currentUserId = sessionStorage.getItem(STORAGE_KEY);
    } catch {
      currentUserId = null;
    }
  }
  return USERS.find((u) => u.id === currentUserId) ?? null;
}
function writeUser(id: string | null) {
  currentUserId = id;
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the demo user is simply held in memory.
  }
}

/** Forgets the demo user and every change made, then lets the caller reload. */
export function resetDemo(): void {
  tenants = null;
  channelsByUser.clear();
  logByConsumer.clear();
  policyState = freshPolicy();
  writeUser(null);
}

const reply = (status: number, body?: unknown) =>
  new Response(status === 204 ? null : JSON.stringify(body ?? {}), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const fail = (status: number, code: string, message: string) =>
  reply(status, { error: { code, message } });

const permissionsOf = (u: DemoUser): string[] => policyState.roles[u.role] ?? [];

function intParam(url: URL, name: string, def: number, min: number, max: number): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return def;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
function sortParam<F extends string>(
  url: URL,
  allowed: readonly F[],
  def: { field: F; dir: 'asc' | 'desc' },
) {
  const raw = url.searchParams.get('sort');
  if (raw === null) return def;
  const [field, dir = 'asc', extra] = raw.split(':');
  const match = allowed.find((a) => a === field);
  if (extra !== undefined || !match || (dir !== 'asc' && dir !== 'desc')) return null;
  return { field: match, dir };
}
const paged = <T>(items: T[], page: number, pageSize: number) => ({
  items: items.slice((page - 1) * pageSize, page * pageSize),
  total: items.length,
  page,
  pageSize,
  asOf: new Date().toISOString(),
});

const WARRANTY_RANK = { expired: 0, expiring: 1, active: 2 } as const;
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;
const STATUS_RANK = { open: 0, acknowledged: 1, resolved: 2 } as const;

function meFor(u: DemoUser): Me {
  const c = CONSUMERS.find((x) => x.id === u.consumerId);
  return {
    user: { id: u.id, name: u.name, role: u.role },
    consumer: c ? { id: c.id, name: c.name, type: c.type } : null,
    manufacturer: c ? MANUFACTURER : null,
    permissions: permissionsOf(u) as Me['permissions'],
    asOf: new Date().toISOString(),
  };
}

function summaryFor(t: Tenant): FleetSummary {
  const inService = t.packs.filter((p) => p.status === 'in_service');
  const sohs = inService.flatMap((p) => (p.sohPct === null ? [] : [p.sohPct]));
  return {
    packsInService: inService.length,
    averageSohPct: sohs.length
      ? Math.round((sohs.reduce((a, b) => a + b, 0) / sohs.length) * 10) / 10
      : null,
    activeAlerts: t.alerts.filter((a) => a.status === 'open').length,
    packsNearingEol: inService.filter(
      (p) => p.remainingLife && p.remainingLife.monthsLow < NEAR_EOL_MONTHS,
    ).length,
    asOf: new Date().toISOString(),
  };
}

/** Fleet managers start with one email channel, so the form is not empty on first look. */
function defaultChannels(u: DemoUser): NotificationChannel[] {
  return u.role === 'fleet_manager'
    ? [
        {
          id: crypto.randomUUID(),
          type: 'email',
          target: `${u.name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.test`,
          enabled: true,
        },
      ]
    : [];
}

function route(method: string, path: string, body: unknown): Response {
  const url = new URL(path, 'http://demo.invalid');
  const p = url.pathname;
  const user = readUser();

  if (method === 'POST' && p === '/auth/mock-login') {
    const id = (body as { userId?: unknown } | null)?.userId;
    const u = USERS.find((x) => x.id === id);
    if (!u) return fail(401, 'unauthenticated', 'Unknown demo user');
    writeUser(u.id);
    return reply(200, { ok: true });
  }
  if (method === 'POST' && p === '/auth/logout') {
    writeUser(null);
    return reply(204);
  }
  if (!user) return fail(401, 'unauthenticated', 'Sign in required');
  if (method === 'GET' && p === '/me') return reply(200, meFor(user));

  const need = (permission: string) =>
    permissionsOf(user).includes(permission) ? null : fail(403, 'forbidden', 'Missing permission');
  const tenant = user.consumerId ? world().get(user.consumerId) : undefined;

  if (method === 'GET' && p === '/fleet/summary') {
    return (
      need('fleet.view') ??
      (tenant ? reply(200, summaryFor(tenant)) : fail(403, 'forbidden', 'No fleet'))
    );
  }

  if (method === 'GET' && p === '/packs') {
    const denied = need('packs.view');
    if (denied) return denied;
    if (!tenant) return fail(403, 'forbidden', 'No fleet');
    const page = intParam(url, 'page', 1, 1, 100_000);
    const size = intParam(url, 'pageSize', 25, 1, 100);
    const sort = sortParam(
      url,
      ['serial', 'sohPct', 'trend', 'remainingLife', 'warrantyStatus'] as const,
      { field: 'serial', dir: 'asc' },
    );
    const q = (url.searchParams.get('q') ?? '').trim();
    if (page === null || size === null || !sort || q.length > 100)
      return fail(400, 'validation_failed', 'The request is invalid');
    const needle = q.toLowerCase();
    const key = (x: PackSummary): string | number | null =>
      ({
        serial: x.serial,
        sohPct: x.sohPct,
        trend: x.trend.pointsPer30Days,
        remainingLife: x.remainingLife?.monthsLow ?? null,
        warrantyStatus: WARRANTY_RANK[x.warrantyStatus],
      })[sort.field];
    const sign = sort.dir === 'asc' ? 1 : -1;
    const rows = tenant.packs
      .filter(
        (x) =>
          !needle ||
          [x.serial, x.assetId ?? '', x.spec].some((s) => s.toLowerCase().includes(needle)),
      )
      .sort((a, b) => {
        const x = key(a);
        const y = key(b);
        if (x === null && y === null) return a.serial < b.serial ? -1 : 1;
        if (x === null) return 1;
        if (y === null) return -1;
        return x !== y ? (x < y ? -1 : 1) * sign : a.serial < b.serial ? -1 : 1;
      });
    return reply(200, paged(rows, page, size));
  }

  if (method === 'GET' && p === '/alerts') {
    const denied = need('alerts.view');
    if (denied) return denied;
    if (!tenant) return fail(403, 'forbidden', 'No fleet');
    const page = intParam(url, 'page', 1, 1, 100_000);
    const size = intParam(url, 'pageSize', 25, 1, 100);
    const sort = sortParam(url, ['createdAt', 'severity', 'status'] as const, {
      field: 'createdAt',
      dir: 'desc',
    });
    const status = url.searchParams.get('status');
    const severity = url.searchParams.get('severity');
    const bad = (v: string | null, ok: readonly string[]) =>
      v !== null && v !== '' && !ok.includes(v);
    if (
      page === null ||
      size === null ||
      !sort ||
      bad(status, ['open', 'acknowledged', 'resolved']) ||
      bad(severity, ['high', 'medium', 'low'])
    ) {
      return fail(400, 'validation_failed', 'The request is invalid');
    }
    const key = (a: Alert): string | number =>
      ({
        createdAt: a.createdAt,
        severity: SEVERITY_RANK[a.severity],
        status: STATUS_RANK[a.status],
      })[sort.field];
    const sign = sort.dir === 'asc' ? 1 : -1;
    const rows = tenant.alerts
      .filter((a) => (!status || a.status === status) && (!severity || a.severity === severity))
      .sort(
        (a, b) =>
          (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.id < b.id ? -1 : 1) *
          (key(a) === key(b) ? 1 : sign),
      );
    return reply(200, paged(rows, page, size));
  }

  // ---- Settings ----
  if (p === '/notification-channels' && method === 'GET') {
    return (
      need('channels.manage_own') ??
      reply(200, channelsByUser.get(user.id) ?? defaultChannels(user))
    );
  }
  if (p === '/notification-channels' && method === 'PUT') {
    const denied = need('channels.manage_own');
    if (denied) return denied;
    const parsed = NotificationChannelsPutSchema.safeParse(body);
    if (!parsed.success) return fail(400, 'validation_failed', 'The request is invalid');
    // The user is always the signed-in user: the body cannot name anyone else.
    const next = parsed.data.channels.map((c) => ({
      id: crypto.randomUUID(),
      type: c.type,
      target: c.target.trim(),
      enabled: c.enabled,
    }));
    channelsByUser.set(user.id, next);
    return reply(200, next);
  }
  if (p === '/notification-channels/test' && method === 'POST') {
    const denied = need('channels.manage_own');
    if (denied) return denied;
    const req = NotificationTestRequestSchema.safeParse(body);
    if (!req.success || !user.consumerId)
      return fail(400, 'validation_failed', 'The request is invalid');
    const channel = (channelsByUser.get(user.id) ?? defaultChannels(user)).find(
      (c) => c.type === req.data.type,
    );
    if (!channel) return fail(404, 'not_found', 'Not found');
    // Same rule as the sample delivery service: an address containing "fail" always fails.
    const failed = channel.target.toLowerCase().includes('fail');
    const at = new Date().toISOString();
    logFor(user.consumerId).unshift({
      id: crypto.randomUUID(),
      alertId: null,
      kind: 'test',
      channel: channel.type,
      status: failed ? 'failed' : 'sent',
      attempt: 1,
      error: failed ? 'mock_delivery_failed' : null,
      at,
    });
    return reply(200, {
      channel: channel.type,
      status: failed ? 'failed' : 'sent',
      error: failed ? 'mock_delivery_failed' : null,
      at,
    });
  }
  if (p === '/notification-log' && method === 'GET') {
    const denied = need('notifications.view_log');
    if (denied) return denied;
    if (!user.consumerId) return fail(403, 'forbidden', 'No fleet');
    const page = intParam(url, 'page', 1, 1, 100_000);
    const size = intParam(url, 'pageSize', 25, 1, 100);
    if (page === null || size === null || url.searchParams.has('sort'))
      return fail(400, 'validation_failed', 'The request is invalid');
    return reply(200, paged(logFor(user.consumerId), page, size));
  }
  if (p === '/admin/permissions' && method === 'GET') {
    return (
      need('permissions.manage') ??
      reply(200, {
        policy: { version: policyState.version, roles: policyState.roles },
        asOf: new Date().toISOString(),
      })
    );
  }
  if (p === '/admin/permissions' && method === 'PUT') {
    const denied = need('permissions.manage');
    if (denied) return denied;
    const parsed = RolePolicyUpdateSchema.safeParse(body);
    if (!parsed.success) return fail(400, 'validation_failed', 'The request is invalid');
    policyState = {
      version: policyState.version + 1,
      roles: structuredClone(parsed.data.roles) as Record<string, string[]>,
    };
    return reply(200, {
      policy: { version: policyState.version, roles: policyState.roles },
      asOf: new Date().toISOString(),
    });
  }

  const ack = method === 'POST' ? /^\/alerts\/([^/]+)\/acknowledge$/.exec(p) : null;
  if (ack) {
    const denied = need('alerts.acknowledge');
    if (denied) return denied;
    // Only this consumer's alerts are looked at, so another consumer's id is simply "not found".
    const alert = tenant?.alerts.find((a) => a.id === ack[1]);
    if (!alert) return fail(404, 'not_found', 'Not found');
    if (alert.status === 'resolved') return fail(409, 'conflict', 'This alert is already resolved');
    if (alert.status === 'open') {
      alert.status = 'acknowledged';
      alert.acknowledgedBy = user.name;
      alert.acknowledgedAt = new Date().toISOString();
    }
    return reply(200, alert);
  }

  return fail(404, 'not_found', 'Not found');
}

/** The demo's version of `fetch(`/api/v1${path}`)`. */
export async function demoRequest(method: string, path: string, body: unknown): Promise<Response> {
  await new Promise((r) => setTimeout(r, latencyMs));
  return route(method, path, body);
}
