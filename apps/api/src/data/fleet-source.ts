import type { Alert, FleetSummary, Page, PackSummary, PageQuery } from '@ql/contracts';

export interface PackQuery extends PageQuery {
  /** Free-text search over serial, asset id and spec. Matched literally. */
  q?: string | undefined;
}

export interface AlertQuery extends PageQuery {
  status?: Alert['status'] | undefined;
  severity?: Alert['severity'] | undefined;
}

/**
 * The swappable part of the data layer (D-05). Adapters translate a source (the seeded database
 * today, a battery vendor later) into the canonical contracts types. Every method takes
 * consumerId first; it comes from the verified token and is a parameter, not a filter.
 * Pack-to-consumer assignment is owned by our database: adapters never trust a vendor owner field.
 */
export interface FleetDataSource {
  getFleetSummary(consumerId: string): Promise<FleetSummary>;
  listPacks(consumerId: string, q: PackQuery): Promise<Page<PackSummary>>;
  listAlerts(consumerId: string, q: AlertQuery): Promise<Page<Alert>>;
  /** Null when the alert does not exist or belongs to another consumer: callers answer 404 for both. */
  getAlert(consumerId: string, alertId: string): Promise<Alert | null>;
}
