import type { PackSummary } from '@ql/contracts';
import { WarrantyBadge } from '../../components/ui/badges';
import { PackIdentity, RemainingLife, SohCell } from './PackTable';

/** Below 768 px the table becomes cards: same data, same search, same sort (D-14). */
export function PackCards({ packs }: { packs: PackSummary[] }) {
  return (
    <ul className="space-y-3">
      {packs.map((p) => (
        <li key={p.id}>
          <article
            aria-label={`Pack ${p.serial}`}
            className="space-y-3 rounded-lg border border-slate-300 bg-white p-4"
          >
            <header>
              <h3 className="text-lg">
                <PackIdentity pack={p} />
              </h3>
              <p className="text-sm text-slate-700">
                {p.assetId ? `Asset ${p.assetId}` : 'Asset not assigned'}
              </p>
            </header>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-slate-700">State of health and trend</dt>
                <dd>
                  <SohCell pack={p} />
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-700">Remaining life</dt>
                <dd>
                  <RemainingLife life={p.remainingLife} />
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-slate-700">Warranty</dt>
                <dd>
                  <WarrantyBadge status={p.warrantyStatus} />
                </dd>
              </div>
            </dl>
          </article>
        </li>
      ))}
    </ul>
  );
}
