#!/usr/bin/env node
/**
 * sprint_trends.mjs — Sprint trends stub (full implementation deferred to CR-027)
 *
 * Usage: node sprint_trends.mjs <sprint-id>
 *
 * Counts sibling Completed sprints and appends a placeholder Trends section
 * to the current sprint's improvement-suggestions.md.
 *
 * Test seams:
 *   CLEARGATE_SPRINT_DIR=<path>      — override sprint dir resolution
 *   CLEARGATE_SPRINT_RUNS_DIR=<path> — override .cleargate/sprint-runs/ root for sibling counting
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function main() {
  const sprintId = process.argv[2];
  if (!sprintId) {
    process.stderr.write('Usage: node sprint_trends.mjs <sprint-id>\n');
    process.exit(2);
  }

  const sprintDir = process.env.CLEARGATE_SPRINT_DIR
    ? path.resolve(process.env.CLEARGATE_SPRINT_DIR)
    : path.join(REPO_ROOT, '.cleargate', 'sprint-runs', sprintId);

  const sprintRunsDir = process.env.CLEARGATE_SPRINT_RUNS_DIR
    ? path.resolve(process.env.CLEARGATE_SPRINT_RUNS_DIR)
    : path.dirname(sprintDir);

  // Count sibling sprint dirs whose state.json has sprint_status === 'Completed'
  let completedCount = 0;
  if (fs.existsSync(sprintRunsDir)) {
    for (const entry of fs.readdirSync(sprintRunsDir)) {
      if (entry === path.basename(sprintDir)) continue;
      const siblingState = path.join(sprintRunsDir, entry, 'state.json');
      if (!fs.existsSync(siblingState)) continue;
      try {
        const state = JSON.parse(fs.readFileSync(siblingState, 'utf8'));
        if (state.sprint_status === 'Completed') completedCount++;
      } catch { /* skip malformed state.json */ }
    }
  }

  const suggestionsFile = path.join(sprintDir, 'improvement-suggestions.md');
  const trendsSection = `\n## Trends\n\nTrends: ${completedCount} closed sprints visible — full analysis deferred to CR-027.\n`;

  if (!fs.existsSync(suggestionsFile)) {
    const header = `# Improvement Suggestions — ${sprintId}\n\n`;
    const tmpFile = `${suggestionsFile}.tmp.${process.pid}`;
    fs.writeFileSync(tmpFile, header + trendsSection, 'utf8');
    fs.renameSync(tmpFile, suggestionsFile);
  } else {
    const existing = fs.readFileSync(suggestionsFile, 'utf8');
    const tmpFile = `${suggestionsFile}.tmp.${process.pid}`;
    fs.writeFileSync(tmpFile, existing.trimEnd() + trendsSection, 'utf8');
    fs.renameSync(tmpFile, suggestionsFile);
  }

  process.stdout.write(
    `sprint_trends: stub — full implementation deferred to CR-027 (counted ${completedCount} closed sprints).\n`
  );
}

main();
