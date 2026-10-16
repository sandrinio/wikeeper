#!/usr/bin/env node
/**
 * prefill_report.mjs — Backfill missing YAML frontmatter fields in agent reports
 *
 * Usage: node prefill_report.mjs <sprint-id>
 *   or:  CLEARGATE_STATE_FILE=... node prefill_report.mjs <sprint-id>
 *
 * Reads:
 *   - state.json (v1 schema) for story metadata (bounce counts, states)
 *   - token-ledger.jsonl for commit_sha attribution
 *   - All STORY-<id>-dev.md and STORY-<id>-qa.md in sprint-runs/<id>/reports/
 *
 * Backfills missing deterministic YAML frontmatter fields:
 *   - story_id, sprint_id, commit_sha, qa_bounces, arch_bounces
 *
 * Atomic write (tmp+rename per M1 pattern). Idempotent: re-run on a
 * fully-prefilled report is a no-op.
 *
 * SubagentStop hook attribution note (FLASHCARD 2026-04-19 #reporting #hooks #ledger):
 * Ledger rows may lack story_id; those are attributed to "unassigned" bucket
 * and do not prevent backfill of reports that can be matched by filename.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateState } from './validate_state.mjs';
import { extractWorkItemIds } from './lib/work-item-id.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Parse a minimal YAML frontmatter block from markdown content.
 * Returns { frontmatter: string, body: string, fields: object }
 * Only parses simple key: value pairs (no nested objects).
 * @param {string} content
 * @returns {{ hasFrontmatter: boolean, frontmatter: string, body: string, fields: object }}
 */
function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    return { hasFrontmatter: false, frontmatter: '', body: content, fields: {} };
  }
  const rawFm = fmMatch[1];
  const body = fmMatch[2];
  const fields = {};
  for (const line of rawFm.split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (m) {
      const key = m[1];
      let val = m[2].trim();
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Parse nulls
      if (val === 'null' || val === '') val = null;
      fields[key] = val;
    }
  }
  return { hasFrontmatter: true, frontmatter: rawFm, body, fields };
}

/**
 * Serialize fields back to YAML frontmatter lines (simple key: value).
 * @param {object} fields
 * @param {string} originalFrontmatter - preserve original order and formatting
 * @returns {string}
 */
function serializeFrontmatter(fields, originalFrontmatter) {
  const lines = originalFrontmatter.split('\n');
  const updatedLines = [];
  const processedKeys = new Set();

  for (const line of lines) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
    if (m) {
      const key = m[1];
      processedKeys.add(key);
      if (key in fields && fields[key] !== null && fields[key] !== undefined) {
        const val = fields[key];
        updatedLines.push(`${key}: "${val}"`);
      } else {
        updatedLines.push(line);
      }
    } else {
      updatedLines.push(line);
    }
  }

  // Append any new fields not in the original
  for (const [key, val] of Object.entries(fields)) {
    if (!processedKeys.has(key) && val !== null && val !== undefined) {
      updatedLines.push(`${key}: "${val}"`);
    }
  }

  return updatedLines.join('\n');
}

/**
 * Atomic write to a file using tmp+rename pattern.
 * @param {string} filePath
 * @param {string} content
 */
function atomicWrite(filePath, content) {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, content, 'utf8');
  fs.renameSync(tmpFile, filePath);
}

/**
 * Parse JSONL file, returning an array of parsed objects.
 * Tolerates malformed lines (skips them with a warning).
 * @param {string} filePath
 * @returns {object[]}
 */
function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const results = [];
  for (const line of lines) {
    try {
      results.push(JSON.parse(line));
    } catch {
      process.stderr.write(`Warning: skipping malformed JSONL line: ${line.slice(0, 80)}\n`);
    }
  }
  return results;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    process.stderr.write('Usage: node prefill_report.mjs <sprint-id>\n');
    process.exit(2);
  }

  const sprintId = args[0];
  const sprintRunsDir = path.join(REPO_ROOT, '.cleargate', 'sprint-runs');
  const sprintDir = process.env.CLEARGATE_SPRINT_DIR
    ? path.resolve(process.env.CLEARGATE_SPRINT_DIR)
    : path.join(sprintRunsDir, sprintId);

  if (!fs.existsSync(sprintDir)) {
    process.stderr.write(`Error: sprint directory not found: ${sprintDir}\n`);
    process.exit(1);
  }

  // Load state.json
  const stateFile = process.env.CLEARGATE_STATE_FILE
    ? path.resolve(process.env.CLEARGATE_STATE_FILE)
    : path.join(sprintDir, 'state.json');

  if (!fs.existsSync(stateFile)) {
    process.stderr.write(`Error: state.json not found at ${stateFile}\n`);
    process.exit(1);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (err) {
    process.stderr.write(`Error: failed to parse state.json: ${err.message}\n`);
    process.exit(1);
  }

  const { valid, errors } = validateState(state);
  if (!valid) {
    process.stderr.write('Error: state.json is invalid:\n');
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }

  // Load token-ledger.jsonl — build a map of story_id -> commit_sha
  // Rows lacking story_id are attributed to 'unassigned' (per FLASHCARD 2026-04-19 #reporting #hooks #ledger)
  const ledgerFile = path.join(sprintDir, 'token-ledger.jsonl');
  const ledgerRows = parseJsonl(ledgerFile);
  const storyCommits = {};
  for (const row of ledgerRows) {
    const sid = row.story_id || 'unassigned';
    if (sid !== 'unassigned' && row.commit_sha) {
      storyCommits[sid] = row.commit_sha;
    }
  }

  // Find all agent reports in the sprint dir (reports/ subdirectory + top level)
  const reportsDir = path.join(sprintDir, 'reports');
  const reportFiles = [];

  // Check reports subdirectory
  if (fs.existsSync(reportsDir)) {
    for (const f of fs.readdirSync(reportsDir)) {
      if (/^STORY-.*-(dev|qa)\.md$/.test(f)) {
        reportFiles.push(path.join(reportsDir, f));
      }
    }
  }

  // Check sprint dir directly
  for (const f of fs.readdirSync(sprintDir)) {
    if (/^STORY-.*-(dev|qa)\.md$/.test(f)) {
      reportFiles.push(path.join(sprintDir, f));
    }
  }

  if (reportFiles.length === 0) {
    process.stdout.write(`No agent reports found in ${sprintDir}; nothing to prefill.\n`);
    process.exit(0);
  }

  let prefilled = 0;
  let noops = 0;

  for (const reportPath of reportFiles) {
    const filename = path.basename(reportPath);
    // BUG-041: was /^(STORY-\d+-\d+)-(dev|qa)\.md$/, so a report named after a date-form
    // item — `BUG-2026-08-24-slug-dev.md` — matched nothing and its report was skipped
    // silently. Split the role off the end, then let the id half be anything valid.
    const roleMatch = filename.match(/^(.*)-(dev|qa)\.md$/);
    if (!roleMatch) continue;
    const [storyId] = extractWorkItemIds(roleMatch[1]);
    if (!storyId) continue;
    const content = fs.readFileSync(reportPath, 'utf8');
    const { hasFrontmatter, frontmatter, body, fields } = parseFrontmatter(content);

    if (!hasFrontmatter) {
      process.stdout.write(`Skipping ${filename}: no frontmatter found.\n`);
      continue;
    }

    // Determine what needs backfill
    const updates = {};
    let needsUpdate = false;

    if (!fields.story_id) {
      updates.story_id = storyId;
      needsUpdate = true;
    }

    if (!fields.sprint_id) {
      updates.sprint_id = state.sprint_id || sprintId;
      needsUpdate = true;
    }

    if (!fields.commit_sha && storyCommits[storyId]) {
      updates.commit_sha = storyCommits[storyId];
      needsUpdate = true;
    }

    const storyEntry = state.stories && state.stories[storyId];
    if (storyEntry) {
      if (fields.qa_bounces === null || fields.qa_bounces === undefined) {
        updates.qa_bounces = String(storyEntry.qa_bounces || 0);
        needsUpdate = true;
      }
      if (fields.arch_bounces === null || fields.arch_bounces === undefined) {
        updates.arch_bounces = String(storyEntry.arch_bounces || 0);
        needsUpdate = true;
      }
    }

    if (!needsUpdate) {
      noops++;
      process.stdout.write(`No-op: ${filename} already fully prefilled.\n`);
      continue;
    }

    // Merge updates into existing fields
    const mergedFields = Object.assign({}, fields, updates);
    const newFrontmatter = serializeFrontmatter(mergedFields, frontmatter);
    const newContent = `---\n${newFrontmatter}\n---\n${body}`;

    atomicWrite(reportPath, newContent);
    prefilled++;
    process.stdout.write(`Prefilled ${filename}: ${Object.keys(updates).join(', ')}\n`);
  }

  process.stdout.write(`\nDone. prefilled=${prefilled} noops=${noops}\n`);
}

main();
