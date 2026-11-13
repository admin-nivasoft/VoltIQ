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

async function bundle(mockAuth: string | undefined): Promise<string> {
  const outDir = mkdtempSync(join(scratch, 'build-'));
  out.push(outDir);
  const previous = process.env.VITE_MOCK_AUTH;
  if (mockAuth === undefined) delete process.env.VITE_MOCK_AUTH;
  else process.env.VITE_MOCK_AUTH = mockAuth;
  try {
    await build({
      root,
      logLevel: 'silent',
      configFile: resolve(root, 'vite.config.ts'),
      mode: 'production',
      build: { outDir, emptyOutDir: true, write: true },
    });
  } finally {
    if (previous === undefined) delete process.env.VITE_MOCK_AUTH;
    else process.env.VITE_MOCK_AUTH = previous;
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
