#!/usr/bin/env node
// PreToolUse guard. Exit 2 blocks the tool call and sends stderr back to Claude.
// Enforces the CLAUDE.md non-negotiables that can be checked mechanically.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const input = JSON.parse(await new Promise((r) => {
  let d = ''; process.stdin.on('data', (c) => (d += c)); process.stdin.on('end', () => r(d || '{}'));
}));
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const tool = input.tool_name;
const ti = input.tool_input || {};
const block = (msg) => { process.stderr.write(`BLOCKED by .claude/hooks/guard.mjs: ${msg}\n`); process.exit(2); };

if (tool === 'Bash') {
  const cmd = String(ti.command || '');
  const rules = [
    [/\bgit\s+push\b/, 'git push is not allowed; the user pushes after review.'],
    [/\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/, 'destructive git commands are not allowed.'],
    [/\bgit\s+(merge|rebase)\b/, 'merging and rebasing are left to the user.'],
    [/\brm\s+-[a-z]*r[a-z]*f?\s+(\/|~|\.\.?\s*$|\$HOME)/, 'recursive delete of a root, home or project path.'],
    [/\b(DROP\s+DATABASE|BYPASSRLS|DISABLE\s+ROW\s+LEVEL\s+SECURITY|NO\s+FORCE\s+ROW\s+LEVEL)/i, 'this weakens the database or RLS (CLAUDE.md non-negotiable 3).'],
    [/(curl|wget)[^|]*\|\s*(ba|z)?sh/, 'piping a download into a shell is not allowed.'],
    [/(^|\s)(cat|less|head|tail|more)\s+[^|]*\.env(\s|$)/, 'reading .env is not allowed; use .env.example.'],
  ];
  for (const [re, msg] of rules) if (re.test(cmd)) block(msg);
  process.exit(0);
}

if (!['Edit', 'Write', 'MultiEdit', 'Read'].includes(tool)) process.exit(0);

const abs = path.resolve(root, String(ti.file_path || ''));
const rel = path.relative(root, abs).split(path.sep).join('/');
const base = path.basename(rel);

// 1. Secrets
if (/^\.env(\..+)?$/.test(base) && base !== '.env.example') block(`${rel} holds secrets; Claude may not read or edit it. Use .env.example.`);
if (tool === 'Read') process.exit(0);

// Collect the text being written
const texts = [ti.content, ti.new_string, ...(Array.isArray(ti.edits) ? ti.edits.map((e) => e.new_string) : [])]
  .filter((t) => typeof t === 'string').join('\n');

// 2. Applied migrations are immutable
if (/^db\/migrations\//.test(rel)) {
  try {
    execFileSync('git', ['cat-file', '-e', `HEAD:${rel}`], { cwd: root, stdio: 'ignore' });
    block(`${rel} is already committed. Applied migrations are immutable; add a new migration (CLAUDE.md non-negotiable 10).`);
  } catch { /* not in HEAD: new migration, fine */ }
}

// 3. RLS must never be weakened (docs are exempt so they can describe the rule)
if (!/^(docs\/|CLAUDE\.md|\.claude\/)/.test(rel) &&
    /\b(BYPASSRLS|DISABLE\s+ROW\s+LEVEL\s+SECURITY|NO\s+FORCE\s+ROW\s+LEVEL)\b/i.test(texts)) {
  block('this text weakens row-level security (CLAUDE.md non-negotiable 3).');
}
// Plain SET of the tenant setting leaks across pooled connections
if (/\bSET\s+(SESSION\s+)?app\.consumer_id\b/i.test(texts) || /set_config\(\s*'app\.consumer_id'\s*,[^)]*,\s*false\s*\)/i.test(texts)) {
  block("set app.consumer_id only with set_config('app.consumer_id', $1, true) inside withTenant (D-02).");
}

// 4. (Retired for BPTE.) The old rule blocked supplier, cohort and cell-lot data in db/ and contracts,
// because SCR-04 was a consumer portal. The manufacturer view needs that data. When a consumer-facing
// view is built (later), add a check scoped to that view's contracts instead.
const isTest = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);

// 5. Data boundary: DB clients only under apps/api/src/data
if (/^apps\/(api|web)\/src\//.test(rel) && !/^apps\/api\/src\/data\//.test(rel) && !isTest &&
    /from\s+['"](pg|kysely|pg-pool)['"]|require\(\s*['"](pg|kysely)['"]\s*\)/.test(texts)) {
  block('only apps/api/src/data/** may import pg or kysely (CLAUDE.md non-negotiable 5).');
}

process.exit(0);
