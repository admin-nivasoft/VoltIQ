#!/usr/bin/env node
// PostToolUse: format and lint the file Claude just changed. Remaining lint errors are
// sent back to Claude (exit 2) so it fixes them straight away. It does nothing until
// dependencies are installed.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(await new Promise((r) => {
  let d = ''; process.stdin.on('data', (c) => (d += c)); process.stdin.on('end', () => r(d || '{}'));
}));
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const file = input.tool_input?.file_path;
if (!file || !existsSync(path.join(root, 'node_modules'))) process.exit(0);
if (!/\.(m?[jt]sx?|json|css|md)$/.test(file)) process.exit(0);

const run = (args) => spawnSync('pnpm', ['exec', ...args], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });

run(['prettier', '--write', '--log-level', 'warn', file]);

if (/\.m?[jt]sx?$/.test(file)) {
  const r = run(['eslint', '--fix', '--max-warnings', '0', file]);
  if (r.status !== 0) {
    process.stderr.write(`ESLint problems in ${file}. Fix them before moving on:\n${(r.stdout + r.stderr).slice(-4000)}\n`);
    process.exit(2);
  }
}
process.exit(0);
