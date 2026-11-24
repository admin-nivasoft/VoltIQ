// The demo's in-memory world: one Tenant per fictional manufacturer, built from data.ts on first use
// and thrown away by resetDemo(). Owned by the lead; screen agents read it through RouteContext.
import {
  BATTERY_COUNT,
  buildBatteries,
  buildFreshness,
  buildUnmatched,
  MANUFACTURERS,
  type DemoBattery,
  type DemoManufacturer,
  type DemoUnmatched,
} from './data';

export interface Tenant {
  manufacturer: DemoManufacturer;
  /** Mutable within a session (an import or an ID link changes it); a reload starts again. */
  batteries: DemoBattery[];
  unmatched: DemoUnmatched[];
  freshness: ReturnType<typeof buildFreshness>;
  now: number;
  /**
   * IDs linked to a battery during this session (an Admin linking an unmatched BMS ID, or an import
   * matching one). Written by the connection and import endpoints, read by the battery endpoint.
   */
  linkedIds: { batteryId: string; idType: 'bms_id'; idValue: string; linkedAt: string; by: string; messagesReplayed: number }[];
}

let tenants: Map<string, Tenant> | null = null;

export function world(): Map<string, Tenant> {
  if (!tenants) {
    const now = Date.now();
    tenants = new Map(
      MANUFACTURERS.map((m) => [
        m.id,
        {
          manufacturer: m,
          batteries: buildBatteries(m, now, BATTERY_COUNT[m.id] ?? 0),
          unmatched: buildUnmatched(m, now),
          freshness: buildFreshness(now),
          now,
          linkedIds: [],
        },
      ]),
    );
  }
  return tenants;
}

export function resetWorld(): void {
  tenants = null;
}
