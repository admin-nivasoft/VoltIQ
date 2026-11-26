import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FileUp, FileText } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { InlineNotification } from '../../../components/ui/inline-notification';
import { Skeleton } from '../../../components/ui/skeleton';
import { Tag } from '../../../components/ui/tag';
import { ApiError, apiFetch } from '../../../lib/api/client';
import { usePageTitle } from '../../../lib/usePageTitle';
import {
  ImportPreviewSchema,
  ImportResultSchema,
  ImportsListSchema,
  type ImportBody,
  type ImportPreview,
  type ImportResult,
} from '../../types-imports';
import { Updated } from '../figure';
import { num, plural } from '../format';
import { useDemoCan, useDemoSession } from '../session';
import { HistoryTable } from './HistoryTable';
import { KIND_LABEL } from './labels';
import { ResultPanel } from './ResultPanel';

const LIST_KEY = ['demo', 'imports'] as const;
const MAX_BYTES = 1_000_000;

interface Chosen extends ImportBody {
  local: boolean;
}

const messageOf = (e: unknown) =>
  e instanceof ApiError ? e.message : 'Something went wrong. Nothing was changed. Try again.';

function LoadingView() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">Loading the import page</span>
      <Skeleton className="mb-3 h-6 w-48" />
      <Skeleton className="mb-8 h-40 w-full" />
      <Skeleton className="mb-3 h-6 w-40" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

export function ImportsView() {
  usePageTitle('Factory data import');
  const session = useDemoSession();
  const canRun = useDemoCan('imports.run');
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => apiFetch('/imports', { schema: ImportsListSchema }),
  });

  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const groupId = useId();

  const reset = () => {
    setPreview(null);
    setResult(null);
    setFileError(null);
  };
  const choose = (c: Chosen) => {
    reset();
    setChosen(c);
  };

  const previewM = useMutation({
    mutationFn: (b: ImportBody) =>
      apiFetch('/imports/preview', { method: 'POST', body: b, schema: ImportPreviewSchema }),
    onSuccess: (p) => setPreview(p),
  });
  const importM = useMutation({
    mutationFn: (b: ImportBody) => apiFetch('/imports', { method: 'POST', body: b, schema: ImportResultSchema }),
    onSuccess: (r) => {
      setResult(r);
      setPreview(null);
      // Everything under 'demo' reads this session's data: the Fleet view's no-birth count and unmatched IDs change.
      void qc.invalidateQueries({ queryKey: ['demo'] });
    },
  });

  const readLocal = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setFileError(`${file.name} is larger than 1 MB. Choose a smaller CSV file.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      if (!text.trim()) setFileError(`${file.name} is empty. Choose a CSV file that has a header row and data rows.`);
      else choose({ fileName: file.name, csv: text, local: true });
    };
    reader.onerror = () => setFileError(`${file.name} could not be read. Choose it again or pick a sample file.`);
    reader.readAsText(file);
  };

  const data = list.data;
  const shown = result ?? preview;
  const busy = previewM.isPending || importM.isPending;

  return (
    <div className="mx-auto max-w-[1312px] px-4 pb-16 pt-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-2xl leading-8 font-semibold tracking-[-0.01em]">Factory data import</h1>
          <p className="mt-1 text-cds-text-secondary">
            {session.me ? `${session.me.manufacturer.name} · ` : ''}CSV in this demo. File formats are not decided yet.
          </p>
        </div>
        {data ? <Updated at={data.asOf} prefix="Page data" /> : null}
      </div>

      {list.isPending ? (
        <LoadingView />
      ) : list.isError || !data ? (
        <InlineNotification
          kind="error"
          title="The import page could not be loaded"
          action={<Button size="sm" variant="tertiary" onClick={() => void list.refetch()}>Try again</Button>}
        >
          Nothing was changed. Try again; if it keeps failing, reload the page.
        </InlineNotification>
      ) : (
        <>
          {canRun ? (
            <section aria-labelledby="choose-h" className="mb-8">
              <h2 id="choose-h" className="mb-1 text-lg leading-7 font-semibold tracking-[-0.01em]">Choose a file</h2>
              <p className="mb-3 max-w-prose text-cds-text-secondary">
                The file is checked first and nothing changes until you select Import file. It stays in this
                browser and is forgotten when you reset the demo.
              </p>
              <fieldset className="border border-cds-border-subtle bg-cds-layer" aria-describedby={`${groupId}-hint`}>
                <legend className="sr-only">Sample files</legend>
                <ul className="divide-y divide-cds-border-subtle">
                  {data.sampleFiles.map((f) => {
                    const id = `${groupId}-${f.fileName}`;
                    const checked = !!chosen && !chosen.local && chosen.fileName === f.fileName;
                    return (
                      <li key={f.fileName} className="relative flex min-h-12 items-start gap-3 px-4 py-3 hover:bg-cds-layer-hover">
                        <input
                          id={id}
                          type="radio"
                          name={`${groupId}-sample`}
                          className="mt-1 h-4 w-4 shrink-0 accent-[#0f62fe]"
                          checked={checked}
                          aria-describedby={`${id}-d`}
                          onChange={() => choose({ fileName: f.fileName, csv: f.csv, local: false })}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <label
                              htmlFor={id}
                              className="cursor-pointer break-all font-semibold after:absolute after:inset-0 after:content-['']"
                            >
                              {f.fileName}
                            </label>
                            <Tag tone="neutral">{KIND_LABEL[f.kind]}</Tag>
                          </div>
                          <p id={`${id}-d`} className="text-cds-text-secondary">{f.description}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
              <p id={`${groupId}-hint`} className="mt-3 text-xs leading-4 text-cds-text-secondary">
                Or choose a CSV file from your computer. It is read in your browser and never uploaded.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  id={`${groupId}-file`}
                  aria-label="Choose a CSV file from this computer"
                  onChange={(e) => {
                    readLocal(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                <Button type="button" variant="tertiary" onClick={() => fileInput.current?.click()}>
                  <FileUp aria-hidden="true" />
                  Choose a CSV file
                </Button>
                {chosen?.local ? (
                  <span className="inline-flex items-center gap-1 break-all">
                    <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {chosen.fileName}
                  </span>
                ) : null}
              </div>
              {fileError ? (
                <InlineNotification className="mt-3" kind="error" title="That file cannot be used">
                  {fileError}
                </InlineNotification>
              ) : null}
              <div className="mt-4">
                <Button
                  type="button"
                  disabled={!chosen || busy}
                  onClick={() => chosen && previewM.mutate({ fileName: chosen.fileName, csv: chosen.csv })}
                >
                  {previewM.isPending ? 'Checking…' : 'Check file'}
                </Button>
                {!chosen ? <span className="ml-3 text-cds-text-secondary">Choose a file first.</span> : null}
              </div>
              {previewM.isError ? (
                <InlineNotification className="mt-3" kind="error" title="The file could not be checked">
                  {messageOf(previewM.error)}
                </InlineNotification>
              ) : null}
            </section>
          ) : (
            <InlineNotification className="mb-8" kind="info" title="Only an Admin can import files">
              You can see what was imported below. To load a file, ask an Admin.
            </InlineNotification>
          )}

          {canRun && shown ? (
            <section aria-labelledby="result-h" className="mb-8">
              <h2 id="result-h" className="mb-3 text-lg leading-7 font-semibold tracking-[-0.01em]">
                {result ? 'Import result' : 'Check result'}
                <span className="ml-2 break-all text-base text-cds-text-secondary">{shown.fileName}</span>
              </h2>
              {result ? (
                <InlineNotification
                  className="mb-4"
                  kind={result.counts.rejected + result.counts.unmatched ? 'warning' : 'success'}
                  title="File imported"
                  action={
                    <Button asChild size="sm" variant="tertiary">
                      <Link to="/">Battery overview <ArrowRight aria-hidden="true" /></Link>
                    </Button>
                  }
                >
                  {plural(result.counts.loaded, 'row')} loaded, {num(result.counts.rejected)} rejected,{' '}
                  {num(result.counts.unmatched)} with no battery.{' '}
                  {result.effects.birthRecordsAdded
                    ? `${plural(result.effects.birthRecordsAdded - result.effects.batteriesCreated, 'battery', )} got a factory record and ${plural(result.effects.batteriesCreated, 'new battery', 'new batteries')} ${result.effects.batteriesCreated === 1 ? 'was' : 'were'} created.`
                    : 'No battery records changed.'}{' '}
                  {result.effects.unmatchedIdsResolved.length
                    ? `Resolved battery ${result.effects.unmatchedIdsResolved.length === 1 ? 'ID' : 'IDs'} ${result.effects.unmatchedIdsResolved.join(', ')}; their waiting data is now linked. `
                    : ''}
                  Rows that did not load are listed below with the reason.
                </InlineNotification>
              ) : null}
              <ResultPanel p={shown}>
                {preview && !result ? (
                  <div className="mt-4 max-w-prose">
                    <p className="mb-3">
                      {preview.effects.birthRecordsAdded
                        ? `Importing adds ${plural(preview.effects.birthRecordsAdded, 'factory record')} (${plural(preview.effects.batteriesCreated, 'new battery', 'new batteries')}) and clears ${plural(preview.effects.unmatchedIdsResolved.length, 'unrecognised battery ID')}.`
                        : 'Importing records this file in the history. It changes no battery records.'}{' '}
                      Rejected rows and rows with no battery are skipped. All other rows load.
                    </p>
                    <Button
                      type="button"
                      disabled={busy || preview.counts.loaded === 0}
                      onClick={() => chosen && importM.mutate({ fileName: chosen.fileName, csv: chosen.csv })}
                    >
                      {importM.isPending ? 'Importing…' : 'Import file'}
                    </Button>
                    {preview.counts.loaded === 0 ? (
                      <p className="mt-2 text-cds-text-secondary">
                        No row passed the checks, so there is nothing to import. Fix the file and check it again.
                      </p>
                    ) : null}
                    {importM.isError ? (
                      <InlineNotification className="mt-3" kind="error" title="The file was not imported">
                        {messageOf(importM.error)}
                      </InlineNotification>
                    ) : null}
                  </div>
                ) : null}
              </ResultPanel>
            </section>
          ) : null}

          <section aria-labelledby="history-h">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
              <h2 id="history-h" className="text-lg leading-7 font-semibold tracking-[-0.01em]">Import history</h2>
              {data.history[0] ? <Updated at={data.history[0].at} prefix="Last import" /> : null}
            </div>
            {data.history.length ? (
              <HistoryTable entries={data.history} />
            ) : (
              <p className="border border-cds-border-subtle px-4 py-6">
                No file has been imported yet.{canRun ? ' Choose a file above to start.' : ' An Admin can import the first one.'}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
