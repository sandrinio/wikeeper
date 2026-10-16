#!/usr/bin/env node
/**
 * assert_story_files.mjs — Gate-2 work-item file existence + approval assertion
 *
 * Usage: node assert_story_files.mjs <sprint-file-path>
 *
 * Parses the "## 1. Consolidated Deliverables" section of a sprint file for
 * all six work-item id shapes:
 *   STORY-\d+-\d+, CR-\d+, BUG-\d+, EPIC-\d+, PROPOSAL-\d+ (PROP-\d+ normalised),
 *   HOTFIX-\d+
 * then checks that each has a corresponding pending-sync/<ID>_*.md file under
 * the repo root, and that each present file is approved + structurally non-empty.
 *
 * Exit 0:  all work-item files present, approved, and non-empty (prints summary to stdout)
 * Exit 1:  one or more missing / unapproved / stub-empty (prints structured stderr)
 * Exit 2:  usage / parse error
 *
 * Env:
 *   CLEARGATE_REPO_ROOT  override repo root (for test isolation)
 *
 * Returns (from assertWorkItemFiles):
 *   { missing: string[], present: string[], unapproved: string[], empty: string[] }
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve repo root: .cleargate/scripts/ -> ../../ (two levels up)
const REPO_ROOT = process.env.CLEARGATE_REPO_ROOT
  ? path.resolve(process.env.CLEARGATE_REPO_ROOT)
  : path.resolve(__dirname, '..', '..');

function usage() {
  process.stderr.write('Usage: node assert_story_files.mjs <sprint-file-path>\n');
  process.exit(2);
}

/**
 * Extract the "## 1. Consolidated Deliverables" section from sprint markdown.
 * Returns the section text or null if not found.
 *
 * Strategy: split on ^## headings, find the one starting with "1. Consolidated Deliverables".
 * This avoids regex lookahead pitfalls with end-of-string anchors in JS.
 */
/**
 * Sub-section headings inside §1 that describe work which is NOT in scope.
 * A sprint plan that records what it deferred — and why — is doing the right
 * thing; before this filter existed, every ID named in such a table was
 * scanned as though it were selected, so documenting a deferral produced
 * spurious "file not found" / "not ready" preflight failures for items that
 * were deliberately archived, backlogged, or pushed to a later sprint.
 */
const EXCLUDED_SUBSECTION_RE =
  /(not\s+selected|not\s+in\s+(this\s+)?(scope|sprint)|out\s+of\s+scope|moved\s+(to|out)|deferred|explicitly\s+not|considered\s+and\s+not|parking\s+lot)/i;

/**
 * Remove spans that name an ID without selecting it:
 *   - `~~STORY-001-01~~`  strikethrough = withdrawn from scope by convention
 *   - anything between <!-- cleargate:ignore-ids --> and its closing marker,
 *     the explicit escape hatch for prose that must cite a deferred ID.
 */
function stripNonSelectingSpans(text) {
  return text
    .replace(/<!--\s*cleargate:ignore-ids\s*-->[\s\S]*?<!--\s*\/\s*cleargate:ignore-ids\s*-->/g, '')
    .replace(/~~[\s\S]*?~~/g, '');
}

function extractDeliverablesSection(content) {
  // Split on lines that start a new ## section (lookahead keeps delimiter in next part)
  const parts = content.split(/^(?=## )/m);
  const deliverables = parts.find((p) =>
    /^## 1\.? Consolidated Deliverables\b/m.test(p)
  );
  if (!deliverables) return null;
  // Strip the header line itself, keep the rest
  const body = deliverables.replace(/^## [^\n]*\n/, '');

  // Drop ### sub-sections that describe explicitly NOT-selected work, then
  // drop strikethrough / opted-out spans from what remains. Both steps only
  // ever REMOVE text, so a plan using none of these conventions extracts
  // exactly what it did before.
  const kept = body
    .split(/^(?=### )/m)
    .filter((chunk) => {
      const heading = (chunk.match(/^### [^\n]*/) || [''])[0];
      return !EXCLUDED_SUBSECTION_RE.test(heading);
    })
    .join('');

  return stripNonSelectingSpans(kept);
}

/**
 * Extract deduplicated work-item IDs from a text block.
 *
 * ID shapes (longest-alternative-first to avoid prefix collisions):
 *   STORY-\d+-\d+         (e.g. STORY-022-07)
 *   CR-\d+                (e.g. CR-008)
 *   BUG-\d+               (e.g. BUG-007)
 *   EPIC-\d+              (e.g. EPIC-013)
 *   HOTFIX-\d+            (e.g. HOTFIX-001)
 *   PROPOSAL-\d+          (e.g. PROPOSAL-013)
 *   PROP-\d+              normalised to PROPOSAL-NNN post-extract (BUG-009 lesson)
 *
 * STORY before CR/BUG/EPIC/HOTFIX, PROPOSAL before PROP — BUG-010 longest-first rule.
 */
import { extractWorkItemIds, normaliseId, matchesId } from './lib/work-item-id.mjs';
export { extractWorkItemIds };


/**
 * Check whether pending-sync OR archive contains a file matching <ID>_*.md
 * Returns the matching absolute path or null.
 */
export function findWorkItemFile(repoRoot, workItemId) {
  const searchDirs = [
    path.join(repoRoot, '.cleargate', 'delivery', 'pending-sync'),
    path.join(repoRoot, '.cleargate', 'delivery', 'archive'),
  ];
  // BUG-041, the larger half: this required `${id}_`, but `-` is the slug separator for
  // 100% of date-form ids and 59% of numeric multi-segment ones — 789 of 1,464 items in a
  // production repo (54%) were unreachable regardless of any regex fix. The separator is
  // still REQUIRED, so `STORY-152-3` cannot claim `STORY-152-33_Foo.md`.
  const matches = (entry) => matchesId(entry, workItemId);
  for (const dir of searchDirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    const match = entries.find(matches);
    if (match) return path.join(dir, match);
  }
  return null;
}

/**
 * BUG-090: position-independent frontmatter fence locator.
 *
 * A line-for-line JS port of `linesOf`, `isFenceStart` and `locateFrontmatter`
 * from the cli's `src/lib/frontmatter-locator.ts` ([[BUG-067]]). This script
 * ships standalone in `scaffold/core` and cannot import the cli's TypeScript,
 * so it carries its own copy; `test/scripts/frontmatter-fence-parity.red.node.test.ts`
 * pins both implementations to one fixture table (same span, same null, same
 * throw message).
 *
 * Every template `cleargate new` writes opens with an `<instructions>` block
 * (CR-108), so a regex anchored at offset 0 misreads every freshly scaffolded
 * item as having no frontmatter. `close_sprint.mjs` imports this export too.
 */

/** Split raw into lines without normalizing: each line keeps its own EOL marker (or ''). */
function linesOf(raw) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < raw.length;) {
    if (raw[i] === '\r' && raw[i + 1] === '\n') {
      lines.push({ text: raw.slice(start, i), start, end: i, eol: '\r\n' });
      start = i += 2;
    } else if (raw[i] === '\n') {
      lines.push({ text: raw.slice(start, i), start, end: i, eol: '\n' });
      start = ++i;
    } else {
      i++;
    }
  }
  if (start < raw.length || raw.length === 0) {
    lines.push({ text: raw.slice(start), start, end: raw.length, eol: '' });
  }
  return lines;
}

function isFenceStart(line) {
  return line.match(/^ {0,3}(`{3,}|~{3,})/);
}

/**
 * Find the first eligible, column-zero `---` header. `<instructions>` blocks
 * and Markdown fenced examples appearing before it are opaque — their content
 * (including embedded `---` or `<instructions>` lines) can never become the
 * document header. Returns `null` only for genuinely absent frontmatter;
 * throws for physically malformed framing (unterminated header, unterminated
 * protected preamble) so callers cannot mistake "cannot locate" for "none".
 *
 * @param {string} raw
 * @returns {{start: number, end: number, yamlStart: number, yamlEnd: number, eol: '\n'|'\r\n'} | null}
 */
export function locateFrontmatterFence(raw) {
  const lines = linesOf(raw);
  let instructions = false;
  let fence = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // A leading BOM only affects recognition of line 0; it is preamble, never
    // part of the header itself (see the offset adjustment below).
    const text = i === 0 ? line.text.replace(/^﻿/, '') : line.text;

    // A fenced example is opaque, including instruction-looking or delimiter-
    // looking lines inside it. While fenced, only its matching closer counts.
    if (fence) {
      const close = text.match(/^ {0,3}(`+|~+)\s*$/);
      if (close && close[1][0] === fence.char && close[1].length >= fence.length) fence = null;
      continue;
    }
    if (instructions) {
      if (text === '</instructions>') instructions = false;
      continue;
    }
    if (text === '<instructions>') {
      instructions = true;
      continue;
    }
    const openedFence = isFenceStart(text);
    if (openedFence) {
      fence = { char: openedFence[1][0], length: openedFence[1].length };
      continue;
    }
    if (text !== '---') continue;
    if (line.eol === '') throw new Error('locateFrontmatter: missing closing ---');

    for (let j = i + 1; j < lines.length; j++) {
      const close = lines[j];
      if (close.text === '---') {
        return {
          start: line.start + (i === 0 && line.text.startsWith('﻿') ? 1 : 0),
          end: close.end,
          yamlStart: line.end + line.eol.length,
          yamlEnd: close.start,
          eol: line.eol,
        };
      }
    }
    throw new Error('locateFrontmatter: missing closing ---');
  }

  if (instructions) throw new Error('locateFrontmatter: unterminated <instructions> block');
  if (fence) throw new Error('locateFrontmatter: unterminated Markdown fence');
  return null;
}

/**
 * Inline YAML frontmatter extractor.
 * Returns { approved: boolean, has_heading: boolean }.
 *
 * - approved: the located frontmatter contains `approved: true` (quoted or unquoted).
 * - has_heading: body after frontmatter contains at least one "## " line. The
 *   body starts after the closing fence, so a leading `<instructions>` block
 *   (guidance, not content) never counts.
 *
 * Fails closed: no frontmatter, or framing the locator cannot read (it throws),
 * gives approved=false with has_heading per a whole-file scan.
 */
export function assertWorkItemApproved(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { approved: false, has_heading: false };
  }

  let body = content;
  let approved = false;

  let span = null;
  try {
    span = locateFrontmatterFence(content);
  } catch {
    span = null;
  }
  if (span) {
    const fmBlock = content.slice(span.yamlStart, span.yamlEnd);
    body = content.slice(span.end);

    // Look for `approved: true` (unquoted) or `approved: "true"` (quoted)
    const approvedMatch = fmBlock.match(/^approved:\s*["']?(true)["']?\s*$/m);
    approved = approvedMatch !== null;
  }

  // has_heading: body contains at least one "## " markdown heading
  const has_heading = /^## /m.test(body);

  return { approved, has_heading };
}

/**
 * Main assertion logic.
 * Returns { missing: string[], present: string[], unapproved: string[], empty: string[] }
 *
 * - missing:    id referenced in §1 with no file in pending-sync/ or archive/
 * - present:    id with a file found
 * - unapproved: present but approved: false in frontmatter
 * - empty:      present + approved but body has no ## heading (stub)
 */
function assertWorkItemFiles(sprintFilePath, repoRoot) {
  let content;
  try {
    content = fs.readFileSync(sprintFilePath, 'utf8');
  } catch (err) {
    process.stderr.write(`Error: cannot read sprint file: ${err.message}\n`);
    process.exit(2);
  }

  const section = extractDeliverablesSection(content);
  if (section === null) {
    process.stderr.write(
      'Error: "## 1. Consolidated Deliverables" section not found in sprint file\n'
    );
    process.exit(2);
  }

  const workItemIds = extractWorkItemIds(section);
  if (workItemIds.length === 0) {
    process.stderr.write('Warning: no work-item IDs found in §1 Consolidated Deliverables\n');
    // Return empty — no files to check, nothing is missing
    return { missing: [], present: [], unapproved: [], empty: [] };
  }

  const missing = [];
  const present = [];
  const unapproved = [];
  const empty = [];

  for (const id of workItemIds) {
    const found = findWorkItemFile(repoRoot, id);
    if (found) {
      present.push(id);
      const { approved, has_heading } = assertWorkItemApproved(found);
      if (!approved) {
        unapproved.push(id);
      } else if (!has_heading) {
        empty.push(id);
      }
    } else {
      missing.push(id);
    }
  }

  return { missing, present, unapproved, empty };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith('--')) usage();

  const sprintFilePath = path.resolve(args[0]);

  // CR-027: --emit-json flag — extract work-item IDs and print JSON to stdout.
  // Used by sprint.ts checkPerItemReadinessGates (path-a shell-out protocol).
  // When this flag is present, skip the file-presence/approval triage and exit 0.
  if (args.includes('--emit-json')) {
    let content;
    try {
      content = fs.readFileSync(sprintFilePath, 'utf8');
    } catch (err) {
      process.stderr.write(`Error: cannot read sprint file: ${err.message}\n`);
      process.exit(2);
    }
    const section = extractDeliverablesSection(content);
    if (section === null) {
      // No §1 section found — emit empty list (not an error for this flag)
      process.stdout.write(JSON.stringify({ workItemIds: [] }) + '\n');
      process.exit(0);
    }
    const workItemIds = extractWorkItemIds(section);
    process.stdout.write(JSON.stringify({ workItemIds }) + '\n');
    process.exit(0);
  }

  const { missing, present, unapproved, empty } = assertWorkItemFiles(sprintFilePath, REPO_ROOT);

  const hasProblems = missing.length > 0 || unapproved.length > 0 || empty.length > 0;

  if (!hasProblems) {
    process.stdout.write(
      `OK: all ${present.length} work-item file(s) present, approved, and non-empty in pending-sync/ or archive/\n`
    );
    process.exit(0);
  }

  // Build structured stderr output
  if (missing.length > 0) {
    process.stderr.write(`MISSING (${missing.length}): ${missing.join(', ')}\n`);
  }
  if (unapproved.length > 0) {
    process.stderr.write(`UNAPPROVED (${unapproved.length}): ${unapproved.join(', ')}\n`);
  }
  if (empty.length > 0) {
    process.stderr.write(`STUB-EMPTY (${empty.length}): ${empty.join(', ')}\n`);
  }

  process.exit(1);
}

// BUG-041: `main()` used to run on import, which made extractWorkItemIds and
// findWorkItemFile structurally unimportable — and is why neither had a test.
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
