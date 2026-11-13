#!/usr/bin/env node
// SessionStart: tell Claude where the build is, so every session starts oriented.
// stdout from a SessionStart hook is added to Claude's context.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const f = path.join(root, 'docs/build-steps.md');
if (!existsSync(f)) process.exit(0);

const md = readFileSync(f, 'utf8');
const steps = [...md.matchAll(/^## Step (\d+) · (.+)\nStatus: (\w[\w-]*)/gm)].map((m) => ({ n: m[1], title: m[2], status: m[3] }));
const next = steps.find((s) => s.status !== 'done');
let branch = '';
try { branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}

console.log(`SCR-04 build status: ${steps.filter((s) => s.status === 'done').length}/${steps.length} steps done. ` +
  (next ? `Next: step ${next.n} (${next.title}), status ${next.status}. ` : 'All steps done. ') +
  (branch ? `Current branch: ${branch}. ` : '') +
  'Read CLAUDE.md and docs/plan-amendments.md before changing code.');
