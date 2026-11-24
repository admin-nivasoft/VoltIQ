// Sample BMS connection data for the connection screens (VITE_DEMO=true). Fictional and deterministic.
// Message counts follow the example send interval in data.ts; times are relative to `now`.
import type { DemoManufacturer } from './data';
import { BATTERY_COUNT, EXAMPLE_SETTINGS } from './data';
import type { BuildConnectors, BuildUnknownFields, Connector, UnknownField } from './data-shapes';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const pad = (n: number, w: number) => String(n).padStart(w, '0');
const iso = (t: number) => new Date(t).toISOString();

/** Messages one battery sends in 24 hours at the example send interval. */
const PER_BATTERY_DAY = (24 * 60) / EXAMPLE_SETTINGS.sendIntervalMinutes;

const uuid = (m: DemoManufacturer, k: number) => `${m.id.charAt(0)}6000000-0000-4000-9000-${pad(k, 12)}`;

export const buildConnectors: BuildConnectors = (m, now) => {
  const batteries = BATTERY_COUNT[m.id] ?? 0;
  const messages24h = batteries * PER_BATTERY_DAY;
  const rejected24h = Math.round(messages24h * 0.008);
  const timestampRejects = Math.floor(rejected24h * 0.6);

  const active: Connector = {
    connectorId: uuid(m, 1),
    name: 'Plant gateway (MQTT)',
    protocol: 'MQTT',
    status: 'active',
    createdAt: iso(now - 200 * DAY),
    lastMessageAt: iso(now - 2 * MINUTE),
    messages24h,
    rejected24h,
    rejectReasons: [
      { reason: 'Timestamp not parseable', count: timestampRejects },
      { reason: 'Missing bms_id', count: rejected24h - timestampRejects },
    ],
  };
  const old: Connector = {
    connectorId: uuid(m, 2),
    name: 'Old pilot feed (MQTT)',
    protocol: 'MQTT',
    status: 'disabled',
    createdAt: iso(now - 400 * DAY),
    lastMessageAt: iso(now - 61 * DAY),
    messages24h: 0,
    rejected24h: 0,
    rejectReasons: [],
  };
  return [active, old];
};

/** Fields the BMS sends that the platform does not recognise. They are stored, never dropped. */
const UNKNOWN_FIELDS = [
  { field: 'bms_hw_rev', share: 0.9, firstDaysAgo: 35, sampleValue: 'HW-3.1' },
  { field: 'balancing_active', share: 0.4, firstDaysAgo: 21, sampleValue: 'true' },
  { field: 'heater_state', share: 0.25, firstDaysAgo: 9, sampleValue: 'off' },
];

export const buildUnknownFields: BuildUnknownFields = (m, now) => {
  const batteries = BATTERY_COUNT[m.id] ?? 0;
  return UNKNOWN_FIELDS.map((u): UnknownField => {
    const count = Math.round(batteries * u.share);
    return {
      field: u.field,
      firstSeenAt: iso(now - u.firstDaysAgo * DAY),
      lastSeenAt: iso(now - 5 * MINUTE),
      batteries: count,
      messages: count * PER_BATTERY_DAY,
      sampleValue: u.sampleValue,
    };
  });
};
