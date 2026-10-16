#!/usr/bin/env node
/**
 * count_tokens.mjs — Sprint token-ledger digest CLI
 *
 * Usage:
 *   node count_tokens.mjs <sprint-id> [--json]
 *
 * Args:
 *   sprint-id   — e.g. SPRINT-17 or SPRINT-fixture
 *   --json      — emit machine-readable JSON digest instead of human text
 *
 * Reads:
 *   .cleargate/sprint-runs/<sprint-id>/token-ledger.jsonl
 *   (or override with CLEARGATE_SPRINT_DIR env var)
 *
 * stdout (default — human):
 *   Total tokens this sprint: <N> (input: <X> / output: <Y> / cache_read: <Z>)
 *   Per-agent breakdown:
 *     architect: <N> (across <M> dispatches)
 *     ...
 *   Anomalies:
 *     - STORY-XXX-YY: 4.2× higher than median story cost
 *
 * stdout (--json):
 *   { total, by_agent, by_work_item, anomalies }
 *   JSON schema is a stable public API — consumed by prep_reporter_context.mjs
 *   and referenced in STORY-025-05 reporter.md capability surface table.
 *
 * Exit codes:
 *   0 — success (empty ledger exits 0 with a note; not an error per STORY-025-01 §1.4)
 *   1 — token-ledger.jsonl file not found at the expected path (hard error)
 *   2 — usage error (missing sprint-id)
 *
 * CLI shape is locked (positional <sprint-id> only; no required flags):
 *   STORY-025-03 consumes this script from close_sprint.mjs Step 3.5.
 *   Do NOT add required flags without updating STORY-025-03's invocation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonl, normalizeRow, aggregate } from './lib/ledger-digest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Format the aggregated digest as human-readable text.
 * Matches the CR-021 §3.2.5 example shape.
 * @param {{ total, by_agent, by_work_item, anomalies }} digest
 * @param {string} sprintId
 * @returns {string}
 */
function formatDigest(digest, sprintId) {
  const { total, by_agent, by_work_item, anomalies } = digest;
  const lines = [];

  lines.push(`Total tokens this sprint: ${total.sum.toLocaleString()} ` +
    `(input: ${total.input.toLocaleString()} / output: ${total.output.toLocaleString()} / ` +
    `cache_read: ${total.cache_read.toLocaleString()})`);

  lines.push('Per-agent breakdown:');
  // Always emit the four canonical agent types first (even if zero) for test predictability.
  const canonicalAgents = ['architect', 'developer', 'qa', 'reporter'];
  const emittedAgents = new Set();
  for (const agent of canonicalAgents) {
    const entry = by_agent[agent] || { sum: 0, dispatches: 0 };
    lines.push(`  ${agent}: ${entry.sum.toLocaleString()} (across ${entry.dispatches} dispatches)`);
    emittedAgents.add(agent);
  }
  // Emit any non-canonical agent types (e.g. 'unknown') after the canonical ones.
  for (const [agent, entry] of Object.entries(by_agent)) {
    if (!emittedAgents.has(agent)) {
      lines.push(`  ${agent}: ${entry.sum.toLocaleString()} (across ${entry.dispatches} dispatches)`);
    }
  }

  lines.push('Anomalies:');
  if (anomalies.length === 0) {
    lines.push('  (none)');
  } else {
    for (const a of anomalies) {
      lines.push(`  - ${a.work_item_id}: ${a.multipleOfMedian}× higher than median story cost`);
    }
  }

  return lines.join('\n') + '\n';
}

function main() {
  const args = process.argv.slice(2);
  const sprintId = args.find(a => !a.startsWith('--'));
  const jsonMode = args.includes('--json');

  if (!sprintId) {
    process.stderr.write('Usage: node count_tokens.mjs <sprint-id> [--json]\n');
    process.exit(2);
  }

  const sprintDir = process.env.CLEARGATE_SPRINT_DIR
    ? path.resolve(process.env.CLEARGATE_SPRINT_DIR)
    : path.join(REPO_ROOT, '.cleargate', 'sprint-runs', sprintId);

  const ledgerFile = path.join(sprintDir, 'token-ledger.jsonl');

  if (!fs.existsSync(ledgerFile)) {
    process.stderr.write(`Error: token-ledger.jsonl not found at ${ledgerFile}\n`);
    process.exit(1);
  }

  const rawRows = parseJsonl(ledgerFile);
  const rows = rawRows.map(normalizeRow);

  if (rows.length === 0) {
    if (jsonMode) {
      process.stdout.write(JSON.stringify({ total: 0, by_agent: {}, by_work_item: {}, anomalies: [] }) + '\n');
    } else {
      process.stdout.write(`Ledger empty for ${sprintId} (0 rows).\n`);
    }
    process.exit(0);
  }

  const digest = aggregate(rows);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(digest) + '\n');
  } else {
    process.stdout.write(formatDigest(digest, sprintId));
  }

  process.exit(0);
}

main();
