#!/usr/bin/env node
// Stop hook: before Claude finishes, uncommitted code must typecheck and pass unit tests.
// Exit 2 sends Claude back to fix it. It runs once per stop (stop_hook_active prevents loops).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(await new Promise((r) => {
  let d = ''; process.stdin.on('data', (c) => (d += c)); process.stdin.on('end', () => r(d || '{}'));
}));
if (input.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
if (!existsSync(path.join(root, 'node_modules'))) process.exit(0);

const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout || '';
if (!/\.(m?[jt]sx?|sql)\s*$/m.test(status)) process.exit(0); // no uncommitted code changes

const shell = process.platform === 'win32';
for (const script of ['typecheck', 'test:unit']) {
  const r = spawnSync('pnpm', ['-s', script], { cwd: root, encoding: 'utf8', shell });
  if (r.status !== 0) {
    process.stderr.write(`Stop gate: \`pnpm ${script}\` fails on uncommitted changes. Fix it, without weakening tests, before finishing:\n${(r.stdout + r.stderr).slice(-5000)}\n`);
    process.exit(2);
  }
}
process.exit(0);
