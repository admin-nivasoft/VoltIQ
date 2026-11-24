// @vitest-environment node
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

// D-08: the dev login switcher must not exist in a production bundle. Build twice and grep.
const root = resolve(import.meta.dirname, '..');
const out: string[] = [];
// Inside the project, not the system temp folder, which can be short of space.
const scratch = join(root, 'node_modules', '.cache', 'bundle-test');
mkdirSync(scratch, { recursive: true });

async function bundle(mockAuth: string | undefined, demo?: string): Promise<string> {
  const outDir = mkdtempSync(join(scratch, 'build-'));
  out.push(outDir);
  const saved = { mock: process.env.VITE_MOCK_AUTH, demo: process.env.VITE_DEMO };
  const set = (k: string, v: string | undefined) =>
    v === undefined ? delete process.env[k] : (process.env[k] = v);
  set('VITE_MOCK_AUTH', mockAuth);
  set('VITE_DEMO', demo);
  try {
    await build({
      root,
      logLevel: 'silent',
      configFile: resolve(root, 'vite.config.ts'),
      mode: 'production',
      build: { outDir, emptyOutDir: true, write: true },
    });
  } finally {
    set('VITE_MOCK_AUTH', saved.mock);
    set('VITE_DEMO', saved.demo);
  }
  const files = readdirSync(join(outDir, 'assets')).filter((f) => f.endsWith('.js'));
  expect(files.length).toBeGreaterThan(0);
  return files.map((f) => readFileSync(join(outDir, 'assets', f), 'utf8')).join('\n');
}

// Strings that only the switcher contains.
const MARKERS = [
  'AUTH_PROVIDER',
  'ENABLE_DEV_ENDPOINTS',
  'Development login',
  'Not for production',
  '-0000-4000-8000-00000000000',
  'd0000000-0000-4000-8000-000000000001',
];

afterAll(() => out.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('production bundle', () => {
  // Only the exact string "true" turns the switcher on. Unset is the real default of a CI build.
  it.each<[string, string | undefined]>([
    ['unset', undefined],
    ['false', 'false'],
    ['TRUE', 'TRUE'],
  ])(
    'VITE_MOCK_AUTH %s: no switcher code, no seeded user ids, no mock-login call',
    async (_label, value) => {
      const js = await bundle(value);
      for (const m of MARKERS) expect(js, m).not.toContain(m);
      expect(js).not.toContain('mock-login');
    },
    180_000,
  );

  it('VITE_MOCK_AUTH true: the switcher is there (so the checks above can fail)', async () => {
    const js = await bundle('true');
    for (const m of MARKERS) expect(js, m).toContain(m);
    expect(js).toContain('mock-login');
  }, 180_000);
});

// The stakeholder demo (VITE_DEMO=true) carries made-up fleet data and a fake API. None of it may
// ever be in a normal build, or a real deployment could show invented numbers.
const DEMO_MARKERS = [
  'Sample data only',
  'Choose a demo user',
  'Lumen Ridge Batteries',
  'Corvane Power Cells',
  'Rohan Mehta',
  'ql-demo-user',
  'Ananya Desai',
];

describe('demo bundle', () => {
  it.each<[string, string | undefined]>([
    ['unset', undefined],
    ['false', 'false'],
    ['TRUE', 'TRUE'],
  ])(
    'VITE_DEMO %s: no sample data, no fake API, no banner',
    async (_label, value) => {
      const js = await bundle(undefined, value);
      for (const m of DEMO_MARKERS) expect(js, m).not.toContain(m);
    },
    180_000,
  );

  it('VITE_MOCK_AUTH alone does not pull the demo in either (the picker is shared, so only its wording may appear)', async () => {
    const js = await bundle('true', undefined);
    for (const m of DEMO_MARKERS.filter((x) => x !== 'Choose a demo user'))
      expect(js, m).not.toContain(m);
  }, 180_000);

  it('VITE_DEMO true: the banner, the sample data and the in-browser API are all there', async () => {
    const js = await bundle(undefined, 'true');
    for (const m of DEMO_MARKERS) expect(js, m).toContain(m);
  }, 180_000);
});

describe('demo bundle: the old consumer portal is gone from it', () => {
  it('VITE_DEMO true alone carries no dev login switcher and none of the old consumer sample names', async () => {
    const js = await bundle(undefined, 'true');
    for (const m of ['Aurora Motors', 'Meridian Storage Systems', 'Northgate Logistics', 'Priya Nair', 'Development login', 'Not for production'])
      expect(js, m).not.toContain(m);
  }, 180_000);
});
