// The shared contract suite for FleetDataSource (D-05). Any adapter must pass it, including its
// cross-tenant cases; a new provider is accepted only if it behaves like the existing ones.
import { AlertSchema, PackSummarySchema } from '@ql/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Thresholds } from '../calculations.ts';
import type { FleetDataSource } from '../fleet-source.ts';
import { QueryError } from '../query.ts';

export interface ContractContext {
  source: FleetDataSource;
  /** Three consumers the adapter was seeded with; B and C carry CANARY names. */
  consumers: { A: string; B: string; C: string };
  thresholds: Thresholds;
  /** A consumer id that has no data at all. */
  emptyConsumer: string;
  /** Hard-coded from the seed, so the summary test cannot share a bug with the code under test. */
  expectedSummary: Record<
    'A' | 'B' | 'C',
    { packsInService: number; averageSohPct: number; activeAlerts: number; packsNearingEol: number }
  >;
}

const PAGE = { page: 1, pageSize: 100 } as const;

export function fleetDataSourceContract(
  name: string,
  setup: () => Promise<ContractContext> | ContractContext,
): void {
  describe(`FleetDataSource contract: ${name}`, () => {
    let ctx: ContractContext;
    beforeAll(async () => {
      ctx = await setup();
    });

    const allPacks = (id: string) => ctx.source.listPacks(id, PAGE);
    const allAlerts = (id: string) => ctx.source.listAlerts(id, PAGE);

    describe('summary matches the lists it summarises (D-10)', () => {
      it.each(['A', 'B', 'C'] as const)('consumer %s', async (k) => {
        const id = ctx.consumers[k];
        const [summary, packs, open] = await Promise.all([
          ctx.source.getFleetSummary(id),
          allPacks(id),
          ctx.source.listAlerts(id, { ...PAGE, status: 'open' }),
        ]);
        const inService = packs.items.filter((p) => p.status === 'in_service');
        expect(summary.packsInService).toBe(inService.length);
        expect(summary.activeAlerts).toBe(open.total);
        const sohs = inService.flatMap((p) => (p.sohPct === null ? [] : [p.sohPct]));
        const mean = Math.round((sohs.reduce((a, b) => a + b, 0) / sohs.length) * 10) / 10;
        expect(summary.averageSohPct).toBe(mean);
        expect(summary.packsNearingEol).toBe(
          inService.filter(
            (p) => p.remainingLife && p.remainingLife.monthsLow < ctx.thresholds.nearEolMonths,
          ).length,
        );
        expect(summary).toMatchObject(ctx.expectedSummary[k]);
        expect(new Date(summary.asOf).toString()).not.toBe('Invalid Date');
      });
    });

    describe('packs', () => {
      it('every item satisfies the contract and carries trend, remaining life and confidence', async () => {
        const { items } = await allPacks(ctx.consumers.A);
        for (const p of items) expect(PackSummarySchema.safeParse(p).success).toBe(true);
        const withLife = items.find((p) => p.remainingLife);
        expect(withLife?.remainingLife?.confidence).toBeGreaterThan(0);
        expect(items.some((p) => p.trend.direction === 'declining')).toBe(true);
        expect(items.some((p) => p.trend.direction === 'improving')).toBe(true);
      });

      it('pages without gaps or duplicates and reports the total', async () => {
        const seen: string[] = [];
        let total = 0;
        for (let page = 1; page <= 5; page++) {
          const r = await ctx.source.listPacks(ctx.consumers.A, { page, pageSize: 10 });
          total = r.total;
          expect(r.page).toBe(page);
          expect(r.items.length).toBeLessThanOrEqual(10);
          seen.push(...r.items.map((p) => p.id));
        }
        expect(total).toBe(40);
        expect(seen).toHaveLength(40);
        expect(new Set(seen).size).toBe(40);
      });

      it('a page beyond the end is empty but keeps the total', async () => {
        const r = await ctx.source.listPacks(ctx.consumers.A, { page: 99, pageSize: 25 });
        expect(r.items).toEqual([]);
        expect(r.total).toBe(40);
      });

      it('sorts by every allow-listed field in both directions, missing values last', async () => {
        for (const field of ['serial', 'sohPct', 'trend', 'remainingLife', 'warrantyStatus']) {
          for (const dir of ['asc', 'desc']) {
            const r = await ctx.source.listPacks(ctx.consumers.A, {
              ...PAGE,
              sort: `${field}:${dir}`,
            });
            expect(r.items).toHaveLength(40);
          }
        }
        const asc = await ctx.source.listPacks(ctx.consumers.A, { ...PAGE, sort: 'sohPct:asc' });
        const desc = await ctx.source.listPacks(ctx.consumers.A, { ...PAGE, sort: 'sohPct:desc' });
        const vals = (r: typeof asc) =>
          r.items.flatMap((p) => (p.sohPct === null ? [] : [p.sohPct]));
        expect(vals(asc)).toEqual([...vals(asc)].sort((a, b) => a - b));
        expect(vals(desc)).toEqual([...vals(desc)].sort((a, b) => b - a));
      });

      it.each(['password', 'serial; DROP TABLE packs', 'consumer_id', 'serial:up'])(
        'rejects sort %j',
        async (sort) => {
          await expect(
            ctx.source.listPacks(ctx.consumers.A, { ...PAGE, sort }),
          ).rejects.toBeInstanceOf(QueryError);
        },
      );

      it.each([
        { page: 0, pageSize: 10 },
        { page: 1, pageSize: 101 },
        { page: 1, pageSize: 0 },
      ])('rejects paging %j', async (q) => {
        await expect(ctx.source.listPacks(ctx.consumers.A, q)).rejects.toBeInstanceOf(QueryError);
      });

      it('searches serials, and treats % and _ literally', async () => {
        const one = (await allPacks(ctx.consumers.A)).items[7]!;
        const hit = await ctx.source.listPacks(ctx.consumers.A, { ...PAGE, q: one.serial });
        expect(hit.items.map((p) => p.id)).toContain(one.id);
        expect(hit.total).toBeLessThan(40);
        for (const wild of ['%', '_', '%_%', 'QL-%-0001']) {
          const r = await ctx.source.listPacks(ctx.consumers.A, { ...PAGE, q: wild });
          expect(r.total, wild).toBe(0);
        }
      });
    });

    describe('alerts', () => {
      it('every severity and status combination exists and filters are exact', async () => {
        for (const severity of ['high', 'medium', 'low'] as const) {
          for (const status of ['open', 'acknowledged', 'resolved'] as const) {
            const r = await ctx.source.listAlerts(ctx.consumers.A, { ...PAGE, severity, status });
            expect(r.total, `${severity}/${status}`).toBeGreaterThan(0);
            expect(r.items.every((a) => a.severity === severity && a.status === status)).toBe(true);
          }
        }
      });

      it('items satisfy the contract; acknowledged ones say who and when', async () => {
        const { items } = await allAlerts(ctx.consumers.A);
        for (const a of items) expect(AlertSchema.safeParse(a).success).toBe(true);
        const acked = items.filter((a) => a.status !== 'open');
        expect(acked.length).toBeGreaterThan(0);
        for (const a of acked) {
          expect(a.acknowledgedBy).toEqual(expect.any(String));
          expect(a.acknowledgedAt).toEqual(expect.any(String));
        }
        for (const a of items.filter((x) => x.status === 'open')) {
          expect(a.acknowledgedBy).toBeNull();
          expect(a.acknowledgedAt).toBeNull();
        }
      });

      it('sorts by severity with ties in a stable order', async () => {
        const r = await ctx.source.listAlerts(ctx.consumers.A, { ...PAGE, sort: 'severity:asc' });
        const rank = { high: 0, medium: 1, low: 2 } as const;
        const ranks = r.items.map((a) => rank[a.severity]);
        expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
        const again = await ctx.source.listAlerts(ctx.consumers.A, {
          ...PAGE,
          sort: 'severity:asc',
        });
        expect(again.items.map((a) => a.id)).toEqual(r.items.map((a) => a.id));
      });

      it('getAlert returns one alert, and null for an unknown or malformed id', async () => {
        const first = (await allAlerts(ctx.consumers.A)).items[0]!;
        expect((await ctx.source.getAlert(ctx.consumers.A, first.id))?.id).toBe(first.id);
        expect(
          await ctx.source.getAlert(ctx.consumers.A, '99999999-9999-4999-8999-999999999999'),
        ).toBeNull();
        expect(await ctx.source.getAlert(ctx.consumers.A, "x'; DROP TABLE alerts;--")).toBeNull();
      });

      it.each(['password', 'packId', 'createdAt;x'])('rejects sort %j', async (sort) => {
        await expect(
          ctx.source.listAlerts(ctx.consumers.A, { ...PAGE, sort }),
        ).rejects.toBeInstanceOf(QueryError);
      });
    });

    describe('cross-tenant', () => {
      it("another consumer's alert is invisible: getAlert is null, never found by filters", async () => {
        const b = await allAlerts(ctx.consumers.B);
        expect(b.items.length).toBeGreaterThan(0);
        for (const alert of b.items) {
          expect(await ctx.source.getAlert(ctx.consumers.A, alert.id)).toBeNull();
          expect(await ctx.source.getAlert(ctx.consumers.C, alert.id)).toBeNull();
        }
      });

      it('lists never overlap between consumers', async () => {
        const ids = async (k: 'A' | 'B' | 'C') => {
          const id = ctx.consumers[k];
          return new Set([
            ...(await allPacks(id)).items.map((p) => p.id),
            ...(await allAlerts(id)).items.map((a) => a.id),
          ]);
        };
        const [a, b, c] = [await ids('A'), await ids('B'), await ids('C')];
        for (const x of a) expect(b.has(x) || c.has(x)).toBe(false);
        for (const x of b) expect(c.has(x)).toBe(false);
      });

      it('the canary is detectable: B and C data does contain the canary strings', async () => {
        for (const k of ['B', 'C'] as const) {
          const id = ctx.consumers[k];
          const text = JSON.stringify([await allPacks(id), await allAlerts(id)]);
          expect(text).toContain(`CANARY-CONSUMER-${k}`);
        }
      });

      it('nothing A can fetch mentions B or C (canary check)', async () => {
        const id = ctx.consumers.A;
        const everything = JSON.stringify([
          await ctx.source.getFleetSummary(id),
          await allPacks(id),
          await allAlerts(id),
          await ctx.source.listPacks(id, { ...PAGE, q: 'CANARY' }),
          await ctx.source.listPacks(id, { ...PAGE, q: 'B' }),
        ]);
        expect(everything).not.toMatch(/CANARY/i);
        for (const other of [ctx.consumers.B, ctx.consumers.C])
          expect(everything).not.toContain(other);
      });

      it("searching for another consumer's serial finds nothing", async () => {
        const bSerial = (await allPacks(ctx.consumers.B)).items[0]!.serial;
        const r = await ctx.source.listPacks(ctx.consumers.A, { ...PAGE, q: bSerial });
        expect(r.total).toBe(0);
      });

      it('an unknown consumer sees an empty fleet, not an error and not someone else', async () => {
        const id = ctx.emptyConsumer;
        const s = await ctx.source.getFleetSummary(id);
        expect(s).toMatchObject({
          packsInService: 0,
          averageSohPct: null,
          activeAlerts: 0,
          packsNearingEol: 0,
        });
        expect((await allPacks(id)).total).toBe(0);
        expect((await allAlerts(id)).total).toBe(0);
      });

      it('a malformed consumer id is refused before any query', async () => {
        await expect(ctx.source.getFleetSummary("x' OR '1'='1")).rejects.toThrow();
        await expect(ctx.source.listPacks('', PAGE)).rejects.toThrow();
      });
    });
  });
}
