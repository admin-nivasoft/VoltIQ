import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../src/openapi.ts';

// D-12 / non-negotiable 4: internal quality data never enters the portal.
// Terms are assembled so this file does not trip the repo's own guard.
const banned = [
  ['sup', 'plier'],
  ['coh', 'ort'],
  ['cell', '_lot'],
  ['cell', 'lot'],
].map((p) => p.join(''));
const re = new RegExp(banned.join('|'), 'i');

const repoRoot = resolve(import.meta.dirname, '../../..');

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('internal quality data stays out (D-12)', () => {
  it('contracts sources contain no banned terms', () => {
    const files = walk(join(repoRoot, 'packages/contracts/src'));
    expect(files.length).toBeGreaterThan(0);
    const hits = files.filter((f) => re.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('the generated OpenAPI document contains no banned terms', () => {
    expect(re.test(JSON.stringify(buildOpenApiDocument()))).toBe(false);
  });

  it('db directories exist so the scans cannot pass vacuously', () => {
    expect(existsSync(join(repoRoot, 'db/migrations'))).toBe(true);
    expect(existsSync(join(repoRoot, 'db/seed'))).toBe(true);
  });

  it('database migrations and seed contain no banned terms', () => {
    const files = [
      ...walk(join(repoRoot, 'db/migrations')),
      ...walk(join(repoRoot, 'db/seed')),
    ].filter((f) => !f.endsWith('.gitkeep'));
    const hits = files.filter((f) => re.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
});
