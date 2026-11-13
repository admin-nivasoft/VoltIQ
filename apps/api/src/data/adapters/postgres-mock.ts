import {
  PackSummarySchema,
  PageQuerySchema,
  PackSortFields,
  AlertSortFields,
  type Alert,
  type FleetSummary,
  type PackSummary,
  type Page,
} from '@ql/contracts';
import {
  ALERT_COLUMNS,
  ALERT_FROM,
  ALERT_ORDER,
  selectAlert,
  toAlert,
  type AlertRow,
} from '../alert-sql.ts';
import {
  averageSoh,
  computeTrend,
  isNearEol,
  warrantyStatus,
  type Reading,
  type Thresholds,
} from '../calculations.ts';
import type { AlertQuery, FleetDataSource, PackQuery } from '../fleet-source.ts';
import type { Pool } from '../pool.ts';
import { escapeLike, paginate, parseSort, QueryError } from '../query.ts';
import { withTenant } from '../tenant.ts';

interface PackRow extends Record<string, unknown> {
  id: string;
  serial: string;
  spec: string;
  asset_id: string | null;
  status: PackSummary['status'];
  warranty_expires_on: string;
  soh_pct: string | null;
  rul_months_low: string | null;
  rul_months_high: string | null;
  confidence: string | null;
  model_version: string | null;
  recorded_at: Date | null;
  readings: [number, number][];
}

const WARRANTY_RANK = { expired: 0, expiring: 1, active: 2 } as const;

const PACK_SORT_KEYS: Record<
  (typeof PackSortFields)[number],
  (p: PackSummary) => string | number | null
> = {
  serial: (p) => p.serial,
  sohPct: (p) => p.sohPct,
  trend: (p) => p.trend.pointsPer30Days,
  remainingLife: (p) => p.remainingLife?.monthsLow ?? null,
  warrantyStatus: (p) => WARRANTY_RANK[p.warrantyStatus],
};

function validatePage(q: { page: number; pageSize: number; sort?: string | undefined }) {
  const r = PageQuerySchema.safeParse(q);
  if (!r.success) throw new QueryError('Invalid page');
  return r.data;
}

/**
 * Seeded Postgres tables as the fleet source (DATA_PROVIDER=postgres-mock). Every read runs inside
 * withTenant AND repeats the consumer id in its WHERE clause: RLS is the enforcement, the explicit
 * predicate is a second, independent layer.
 */
export function createPostgresMockSource(
  pool: Pool,
  thresholds: Thresholds,
  clock: () => Date = () => new Date(),
): FleetDataSource {
  async function loadPacks(consumerId: string, search: string | undefined): Promise<PackSummary[]> {
    const now = clock();
    const windowStart = new Date(now.getTime() - thresholds.trendWindowDays * 86_400_000);
    const pattern = search ? `%${escapeLike(search)}%` : null;
    const rows = await withTenant(
      pool,
      consumerId,
      async (tx) =>
        (
          await tx.query<PackRow>(
            `SELECT p.id, p.serial, p.spec, p.asset_id, p.status, to_char(p.warranty_expires_on, 'YYYY-MM-DD') AS warranty_expires_on,
                  h.soh_pct, h.rul_months_low, h.rul_months_high, h.confidence, h.model_version, h.recorded_at,
                  coalesce(r.readings, '[]'::json) AS readings
             FROM packs p
             LEFT JOIN LATERAL (
               SELECT * FROM pack_health WHERE pack_id = p.id AND consumer_id = p.consumer_id
                ORDER BY recorded_at DESC LIMIT 1) h ON true
             LEFT JOIN LATERAL (
               SELECT json_agg(json_build_array(extract(epoch FROM recorded_at), soh_pct) ORDER BY recorded_at) AS readings
                 FROM pack_health WHERE pack_id = p.id AND consumer_id = p.consumer_id AND recorded_at >= $2) r ON true
            WHERE p.consumer_id = $1
              AND ($3::text IS NULL OR p.serial ILIKE $3 ESCAPE '\\' OR p.asset_id ILIKE $3 ESCAPE '\\' OR p.spec ILIKE $3 ESCAPE '\\')`,
            [consumerId, windowStart.toISOString(), pattern],
          )
        ).rows,
    );
    return rows.map((r) => {
      const readings: Reading[] = r.readings.map(([sec, soh]) => ({ at: sec * 1000, sohPct: soh }));
      const trend = computeTrend(readings, now.getTime(), thresholds);
      return PackSummarySchema.parse({
        id: r.id,
        serial: r.serial,
        spec: r.spec,
        assetId: r.asset_id,
        status: r.status,
        warrantyStatus: warrantyStatus(r.warranty_expires_on, now, thresholds),
        sohPct: r.soh_pct === null ? null : Number(r.soh_pct),
        trend,
        remainingLife:
          r.rul_months_low === null || r.rul_months_high === null
            ? null
            : {
                monthsLow: Number(r.rul_months_low),
                monthsHigh: Number(r.rul_months_high),
                confidence: r.confidence === null ? null : Number(r.confidence),
              },
        modelVersion: r.model_version,
        recordedAt: r.recorded_at ? r.recorded_at.toISOString() : null,
      });
    });
  }

  return {
    async getFleetSummary(consumerId): Promise<FleetSummary> {
      const packs = (await loadPacks(consumerId, undefined)).filter(
        (p) => p.status === 'in_service',
      );
      const activeAlerts = await withTenant(pool, consumerId, async (tx) =>
        Number(
          (
            await tx.query<{ n: string }>(
              "SELECT count(*) AS n FROM alerts WHERE consumer_id = $1 AND status = 'open'",
              [consumerId],
            )
          ).rows[0]?.n ?? 0,
        ),
      );
      return {
        packsInService: packs.length,
        averageSohPct: averageSoh(packs.flatMap((p) => (p.sohPct === null ? [] : [p.sohPct]))),
        activeAlerts,
        packsNearingEol: packs.filter((p) =>
          isNearEol(p.remainingLife?.monthsLow ?? null, thresholds),
        ).length,
        asOf: clock().toISOString(),
      };
    },

    async listPacks(consumerId, q: PackQuery): Promise<Page<PackSummary>> {
      const { page, pageSize } = validatePage(q);
      const sort = parseSort(q.sort, PackSortFields, { field: 'serial', dir: 'asc' });
      const key = PACK_SORT_KEYS[sort.field];
      const sign = sort.dir === 'asc' ? 1 : -1;
      const all = await loadPacks(consumerId, q.q?.trim() || undefined);
      all.sort((a, b) => {
        const x = key(a);
        const y = key(b);
        // Missing values always sort last, whichever the direction.
        if (x === null && y === null) return a.serial < b.serial ? -1 : 1;
        if (x === null) return 1;
        if (y === null) return -1;
        if (x !== y) return (x < y ? -1 : 1) * sign;
        return a.serial < b.serial ? -1 : 1;
      });
      const { items, total } = paginate(all, page, pageSize);
      return { items, total, page, pageSize, asOf: clock().toISOString() };
    },

    async listAlerts(consumerId, q: AlertQuery): Promise<Page<Alert>> {
      const { page, pageSize } = validatePage(q);
      const sort = parseSort(q.sort, AlertSortFields, { field: 'createdAt', dir: 'desc' });
      const orderBy = `${ALERT_ORDER[sort.field]} ${sort.dir === 'asc' ? 'ASC' : 'DESC'}, a.id ASC`;
      const filters = ['a.consumer_id = $1'];
      const params: unknown[] = [consumerId];
      if (q.status) {
        params.push(q.status);
        filters.push(`a.status = $${params.length}`);
      }
      if (q.severity) {
        params.push(q.severity);
        filters.push(`a.severity = $${params.length}`);
      }
      const where = filters.join(' AND ');
      return withTenant(pool, consumerId, async (tx) => {
        const total = Number(
          (
            await tx.query<{ n: string }>(
              `SELECT count(*) AS n ${ALERT_FROM} WHERE ${where}`,
              params,
            )
          ).rows[0]?.n ?? 0,
        );
        const rows = await tx.query<AlertRow>(
          `SELECT ${ALERT_COLUMNS} ${ALERT_FROM} WHERE ${where} ORDER BY ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, pageSize, (page - 1) * pageSize],
        );
        return {
          items: rows.rows.map(toAlert),
          total,
          page,
          pageSize,
          asOf: clock().toISOString(),
        };
      });
    },

    async getAlert(consumerId, alertId) {
      return withTenant(pool, consumerId, (tx) => selectAlert(tx, consumerId, alertId));
    },
  };
}
