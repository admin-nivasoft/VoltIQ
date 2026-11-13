// Sample data for the in-browser demo (VITE_DEMO=true). Entirely made up: fictional companies and
// people, deterministic values, no connection to any real fleet. This module is only ever imported
// by the demo handler, which is only imported when the demo flag is set at build time.
import type { Alert, PackSummary, Role } from '@ql/contracts';

export interface DemoConsumer {
  id: string;
  code: 'A' | 'B' | 'C';
  name: string;
  type: 'oem' | 'ess_integrator' | 'fleet_operator';
}
export interface DemoUser {
  id: string;
  name: string;
  role: Role;
  consumerId: string | null;
}

export const MANUFACTURER = { name: '82 Volts', logoUrl: '/assets/82volts-logo.svg' };

export const CONSUMERS: DemoConsumer[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    code: 'A',
    name: 'Aurora Motors (OEM)',
    type: 'oem',
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    code: 'B',
    name: 'Meridian Storage Systems',
    type: 'ess_integrator',
  },
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    code: 'C',
    name: 'Northgate Logistics',
    type: 'fleet_operator',
  },
];

const PEOPLE: Record<string, [string, string, string]> = {
  A: ['Priya Nair', 'Arjun Rao', 'Meera Iyer'],
  B: ['Daniel Cho', 'Sara Malik', 'Tomasz Nowak'],
  C: ['Lena Fischer', 'Omar Haddad', 'Grace Okafor'],
};

const idFor = (c: number, r: number) => `e000000${c}-0000-4000-8000-00000000000${r}`;

export const USERS: DemoUser[] = [
  ...CONSUMERS.flatMap((c, i) =>
    (['fleet_manager', 'technician', 'consumer_admin'] as const).map((role, r) => ({
      id: idFor(i + 1, r + 1),
      name: PEOPLE[c.code]![r]!,
      role,
      consumerId: c.id,
    })),
  ),
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    name: 'Platform Admin',
    role: 'platform_admin',
    consumerId: null,
  },
];

/** A fixed pseudo-random number in [0, 1) from a string, so every load shows the same fleet. */
function h(seed: string): number {
  let x = 2166136261;
  for (let i = 0; i < seed.length; i++) x = Math.imul(x ^ seed.charCodeAt(i), 16777619);
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pad = (n: number, w: number) => String(n).padStart(w, '0');

const SPECS = ['LFP-48V-100Ah', 'NMC-72V-60Ah', 'LFP-400V-250kWh'];
const MODEL = 'ql-health-1.3.0';
const DAY = 86_400_000;

export function buildPacks(c: DemoConsumer, now = Date.now()): PackSummary[] {
  return Array.from({ length: 40 }, (_, k) => {
    const n = k + 1;
    const kind = n % 5; // 0 declining and near end of life, 1 improving, otherwise gently drifting
    const slope = kind === 0 ? -1.6 : kind === 1 ? 0.8 : -0.15;
    const soh = Math.min(100, Math.max(40, 88 + 10 * h(`s0${c.code}${n}`) + slope * 6));
    const low = kind === 0 ? 1 + (Math.floor(n / 5) % 5) : 8 + (n % 13);
    const days = ((n * 37) % 760) - 200;
    const status: PackSummary['status'] =
      n === 40 ? 'retired' : n >= 38 ? 'out_of_service' : 'in_service';
    return {
      id: `${c.code.toLowerCase()}0000000-0000-4000-9000-${pad(n, 12)}`,
      serial: `QL-${c.code}-${pad(n, 4)}`,
      spec: SPECS[n % 3]!,
      assetId: n <= 36 ? `ASSET-${c.code}-${pad(n, 3)}` : null,
      status,
      warrantyStatus: days < 0 ? 'expired' : days < 90 ? 'expiring' : 'active',
      sohPct: round(soh, 1),
      trend: {
        direction: kind === 0 ? 'declining' : kind === 1 ? 'improving' : 'stable',
        pointsPer30Days: round(slope + (h(`t${c.code}${n}`) - 0.5) * 0.2, 1),
      },
      remainingLife: {
        monthsLow: low,
        monthsHigh: low + 3 + (n % 4),
        confidence: round(0.6 + 0.35 * h(`c${c.code}${n}`), 2),
      },
      modelVersion: MODEL,
      recordedAt: new Date(now).toISOString(),
    };
  });
}

const TEXT = {
  high: [
    'Battery health is dropping faster than expected',
    'This pack has lost capacity quickly over the last few weeks and may not last its planned service life.',
    'Arrange an inspection within 7 days and plan a replacement.',
  ],
  medium: [
    'Battery is ageing faster than similar packs',
    'This pack is losing capacity a little faster than expected. It is still within normal limits.',
    'Review how this pack is used and recheck in 30 days.',
  ],
  low: [
    'Small change in battery behaviour',
    'We noticed a small change in how this pack charges. No action is needed right now.',
    'No action needed. Keep monitoring.',
  ],
} as const;

/** 12 alerts per consumer: every severity in every status (open, acknowledged, resolved). */
export function buildAlerts(c: DemoConsumer, packs: PackSummary[], now = Date.now()): Alert[] {
  const manager = USERS.find((u) => u.consumerId === c.id && u.role === 'fleet_manager')!;
  return Array.from({ length: 12 }, (_, k) => {
    const i = k + 1;
    const severity = (['high', 'medium', 'low'] as const)[(i - 1) % 3]!;
    const status = (['open', 'acknowledged', 'resolved'] as const)[Math.floor((i - 1) / 3) % 3]!;
    const pack = packs[(i * 7) % 40]!;
    const created = now - i * 5 * DAY - i * 3_600_000;
    const [title, description, recommendedAction] = TEXT[severity];
    return {
      id: `${c.code.toLowerCase()}1000000-0000-4000-9000-${pad(i, 12)}`,
      packId: pack.id,
      packSerial: pack.serial,
      severity,
      title,
      description,
      recommendedAction,
      status,
      createdAt: new Date(created).toISOString(),
      acknowledgedBy: status === 'open' ? null : manager.name,
      acknowledgedAt: status === 'open' ? null : new Date(created + 6 * 3_600_000).toISOString(),
      modelVersion: MODEL,
      confidence: round(0.65 + 0.3 * h(`a${c.code}${i}`), 2),
      signals: { capacity_fade: round(h(`f${c.code}${i}`) * 5, 2) },
    };
  });
}
