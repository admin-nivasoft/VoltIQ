import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// CLAUDE.md non-negotiable 5: only apps/api/src/data/** may import the database
// client or a vendor SDK.
export const restrictedImports = {
  paths: [
    { name: 'pg', message: 'Database access belongs in apps/api/src/data/** only.' },
    { name: 'kysely', message: 'Database access belongs in apps/api/src/data/** only.' },
    ...[
      'postgres',
      'knex',
      'drizzle-orm',
      'node-pg-migrate',
      'sequelize',
      'typeorm',
      'mysql',
      'mysql2',
    ].map((name) => ({ name, message: 'Database access belongs in apps/api/src/data/** only.' })),
  ],
  patterns: [
    {
      group: ['pg/*', 'pg-*', 'kysely/*', 'drizzle-orm/*', '@prisma/*', '@neondatabase/*'],
      message: 'Database access belongs in apps/api/src/data/** only.',
    },
    {
      group: [
        '@aws-sdk/*',
        'aws-sdk',
        '@azure/*',
        'firebase*',
        '@google-cloud/*',
        'twilio',
        '@sendgrid/*',
        'nodemailer',
      ],
      message: 'Vendor SDKs belong in apps/api/src/data/** only.',
    },
  ],
};

// Dynamic import() and createRequire() are not covered by no-restricted-imports.
export const restrictedSyntax = [
  {
    selector:
      'ImportExpression[source.value=/^(pg|kysely|postgres|knex|drizzle-orm|@prisma|twilio|nodemailer|@sendgrid)/]',
    message: 'Database and vendor imports belong in apps/api/src/data/** only.',
  },
  {
    selector: "CallExpression[callee.name='createRequire']",
    message: 'createRequire is only allowed in apps/api/src/data/**.',
  },
];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '.claude/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    linterOptions: { noInlineConfig: true },
    rules: {
      'no-restricted-imports': ['error', restrictedImports],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  },
  {
    files: ['apps/api/src/data/**'],
    rules: { 'no-restricted-imports': 'off', 'no-restricted-syntax': 'off' },
  },
);
