import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Non-negotiable 5: only apps/api/src/data/** may import pg, kysely or a vendor SDK.
const cwd = resolve(import.meta.dirname, '../../..');
const eslint = new ESLint({ cwd });

async function lint(filePath: string, code: string) {
  const [res] = await eslint.lintText(code, { filePath: resolve(cwd, filePath) });
  return (
    res?.messages.filter(
      (m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-syntax',
    ) ?? []
  );
}

describe('data-boundary lint rule', () => {
  it.each([
    ['apps/api/src/modules/fleet/routes.ts', "import pg from 'pg';\nexport default pg;\n"],
    [
      'apps/api/src/modules/fleet/routes.ts',
      "import { Kysely } from 'kysely';\nexport { Kysely };\n",
    ],
    [
      'apps/api/src/modules/alerts/x.ts',
      "import { S3 } from '@aws-sdk/client-s3';\nexport { S3 };\n",
    ],
    ['apps/api/src/modules/a/x.ts', "export const load = () => import('pg');\n"],
    [
      'apps/api/src/modules/a/x.ts',
      "import { createRequire } from 'node:module';\nexport const r = createRequire(import.meta.url);\n",
    ],
    ['apps/api/src/modules/a/x.ts', "import postgres from 'postgres';\nexport default postgres;\n"],
    ['apps/api/src/modules/a/x.ts', "import twilio from 'twilio';\nexport default twilio;\n"],
    [
      'apps/api/src/modules/a/x.ts',
      "// eslint-disable-next-line no-restricted-imports\nimport pg from 'pg';\nexport default pg;\n",
    ],
    ['apps/web/src/features/fleet/x.ts', "import pg from 'pg';\nexport default pg;\n"],
  ])('rejects restricted imports in %s', async (file, code) => {
    expect((await lint(file, code)).length).toBeGreaterThan(0);
  });

  it('allows pg and kysely inside apps/api/src/data/**', async () => {
    const code = "import pg from 'pg';\nimport { Kysely } from 'kysely';\nexport { pg, Kysely };\n";
    expect(await lint('apps/api/src/data/client.ts', code)).toEqual([]);
  });
});
