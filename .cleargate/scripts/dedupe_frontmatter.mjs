#!/usr/bin/env node
/**
 * dedupe_frontmatter.mjs — BUG-025
 *
 * One-shot corpus dedupe pass: scan every .md file under
 * .cleargate/delivery/pending-sync/ and .cleargate/delivery/archive/.
 * For any file whose YAML frontmatter contains duplicate top-level keys,
 * keep the LAST occurrence of each key (closest to the body — this is what
 * the stamp hook writes most recently) and rewrite the file.
 *
 * Idempotent: re-running produces zero diff when no duplicates remain.
 *
 * Usage:
 *   node .cleargate/scripts/dedupe_frontmatter.mjs [--dry-run] [<dir>]
 *
 *   --dry-run   Print which files would be rewritten without writing.
 *   <dir>       Walk only this directory instead of the canonical corpus dirs.
 *               Used by integration tests targeting a tmpdir.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';
import { locateFrontmatterFence } from './assert_story_files.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DIR_ARG = args.find((a) => !a.startsWith('--'));

const PENDING_SYNC = path.join(REPO_ROOT, '.cleargate', 'delivery', 'pending-sync');
const ARCHIVE = path.join(REPO_ROOT, '.cleargate', 'delivery', 'archive');

/**
 * Collect all .md files in a flat directory (non-recursive — delivery dirs are flat).
 */
function collectMd(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => path.join(dir, e.name));
}

/**
 * Locate a raw markdown string's frontmatter and split its YAML into lines.
 * BUG-098: the block is found with assert_story_files.mjs's position-independent
 * locateFrontmatterFence, so a leading `<instructions>` preamble is skipped.
 *   span        — the located fence span ({start, end, yamlStart, yamlEnd, eol})
 *   fmLines     — the lines between the opening and closing `---` delimiters
 *                 (a CRLF line keeps its trailing \r)
 *   hadFinalEol — the YAML text ended with the EOL before the closing fence;
 *                 that final empty element is popped from fmLines
 *
 * Returns null if the file has no frontmatter, or its framing is malformed
 * (the locator throws).
 */
function parseFmLines(raw) {
  let span = null;
  try {
    span = locateFrontmatterFence(raw);
  } catch {
    return null;
  }
  if (!span) return null;
  const yaml = raw.slice(span.yamlStart, span.yamlEnd);
  const fmLines = yaml.split('\n');
  const hadFinalEol = yaml.endsWith('\n');
  if (hadFinalEol) fmLines.pop();
  return { span, fmLines, hadFinalEol };
}

/**
 * Given the frontmatter lines, detect duplicate top-level keys.
 * Returns a Map from key → array of line-indices (within fmLines) where it appears.
 * Only entries with ≥2 occurrences indicate duplicates.
 *
 * A "top-level key" is a line that starts with a non-space character followed by
 * `:<space>` or `:<end-of-line>`. Multi-line values (YAML scalars, blocks) that
 * contain `:` on continuation lines are NOT top-level keys (they start with space/tab).
 */
function findDuplicateKeys(fmLines) {
  /** @type {Map<string, number[]>} */
  const keyMap = new Map();
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    // Top-level key: starts at column 0, has `:` after a word character sequence
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):/);
    if (m) {
      const key = m[1];
      if (!keyMap.has(key)) {
        keyMap.set(key, []);
      }
      keyMap.get(key).push(i);
    }
  }
  // Return only keys with duplicates
  /** @type {Map<string, number[]>} */
  const dupes = new Map();
  for (const [k, indices] of keyMap) {
    if (indices.length > 1) {
      dupes.set(k, indices);
    }
  }
  return dupes;
}

/**
 * Deduplicate frontmatter lines: for each duplicate key, keep the LAST occurrence
 * and discard all earlier ones (including their potential multi-line values).
 *
 * Multi-line value detection: lines that follow a key line and start with
 * whitespace (` ` or `\t`) belong to the preceding key's value.
 *
 * Returns the deduplicated fmLines array (may be the same reference if no changes).
 */
function dedupeLines(fmLines, dupes) {
  if (dupes.size === 0) return fmLines;

  // Build a set of fmLine indices to DROP (all but the last occurrence of each dup key,
  // including their continuation lines).
  /** @type {Set<number>} */
  const dropSet = new Set();

  for (const [, indices] of dupes) {
    // Keep last occurrence; drop all earlier ones (+ their continuations)
    const toRemove = indices.slice(0, -1); // all but last
    for (const startIdx of toRemove) {
      dropSet.add(startIdx);
      // Mark continuation lines (indent-starting lines following a key line)
      let j = startIdx + 1;
      while (j < fmLines.length && /^[ \t]/.test(fmLines[j])) {
        dropSet.add(j);
        j++;
      }
    }
  }

  return fmLines.filter((_, i) => !dropSet.has(i));
}

/**
 * Atomic write: write to a .tmp file then rename over the target.
 */
function writeAtomic(filePath, content) {
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const files = DIR_ARG
  ? collectMd(path.resolve(DIR_ARG))
  : [...collectMd(PENDING_SYNC), ...collectMd(ARCHIVE)];

let rewritten = 0;
let skipped = 0;
let errors = 0;

for (const filePath of files) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error(`error reading ${filePath}: ${e.message}`);
    errors++;
    continue;
  }

  const parsed = parseFmLines(raw);
  if (!parsed) {
    skipped++;
    continue;
  }

  const { span, fmLines, hadFinalEol } = parsed;
  const dupes = findDuplicateKeys(fmLines);

  if (dupes.size === 0) {
    skipped++;
    continue;
  }

  const relPath = path.relative(REPO_ROOT, filePath);
  const dupeSummary = Array.from(dupes.keys()).join(', ');

  if (DRY_RUN) {
    console.log(`would-rewrite: ${relPath} (duplicate keys: ${dupeSummary})`);
    rewritten++;
    continue;
  }

  // Build the new file content: deduplicated frontmatter spliced between the
  // located fences; every byte outside the YAML (preamble, fences, body) is kept.
  const cleanedFmLines = dedupeLines(fmLines, dupes);
  const newContent =
    raw.slice(0, span.yamlStart) +
    cleanedFmLines.join('\n') +
    (hadFinalEol ? '\n' : '') +
    raw.slice(span.yamlEnd);

  // Verify the result is actually different (guard against no-op edge cases)
  if (newContent === raw) {
    skipped++;
    continue;
  }

  writeAtomic(filePath, newContent);
  console.log(`rewritten: ${relPath} (removed duplicate keys: ${dupeSummary})`);
  rewritten++;
}

console.log(
  `\nDedupe complete: ${rewritten} ${DRY_RUN ? 'would-rewrite' : 'rewritten'}, ${skipped} skipped, ${errors} errors.`,
);
if (errors > 0) {
  process.exit(1);
}
