#!/usr/bin/env node
/**
 * prep_reporter_context.mjs — Reporter context-bundle assembler
 *
 * Usage:
 *   node prep_reporter_context.mjs <sprint-id>
 *
 * Writes:
 *   .cleargate/sprint-runs/<sprint-id>/.reporter-context.md
 *
 * Env overrides:
 *   CLEARGATE_SPRINT_DIR      — override the sprint-runs/<sprint-id> directory
 *   CLEARGATE_PENDING_SYNC_DIR — override .cleargate/delivery/pending-sync/ (for test isolation)
 *
 * Both env overrides are forwarded to child process (count_tokens.mjs --json) via process.env.
 *
 * Output bundle sections (in order):
 *   1. Sprint Plan Slices       — §1 Consolidated Deliverables, §2 Execution Strategy, §5 (from sprint plan)
 *   2. State.json Summary       — one-liner per story: ID | state | lane | qa_bounces=N arch_bounces=N
 *   3. Milestone Plans          — plans/M*.md verbatim, or one-liner if absent
 *   4. Git Log Digest           — git log --stat sprint/S-NN ^main (silent fail if branch absent)
 *   5. Token Ledger Digest      — count_tokens.mjs --json output embedded as markdown
 *   6. Flashcard Slice          — FLASHCARD.md entries in [start_date, end_date] window;
 *                                  Strategy-3 fallback (git log --grep) when:
 *                                    - date filter returns 0 rows AND
 *                                    - sprint_status === 'Completed' (gated to avoid false
 *                                      positives during active execution per M1 gotcha #6)
 *   7. REPORT template pointer  — one line citing the template path
 *
 * Exit codes:
 *   0 — success
 *   1 — token-ledger.jsonl missing (hard error per story R4)
 *   2 — usage error (missing sprint-id)
 *
 * CLI shape is locked (positional <sprint-id> only; no required flags):
 *   STORY-025-03 invokes this from close_sprint.mjs Step 3.5.
 *   Do NOT add required flags without updating that invocation.
 *
 * Bundle-size budget: ≤160KB target (CR-022 M5 raised from 80KB; R3 superseded). If exceeded, a warning is logged to stderr
 * but the file is still written (do NOT truncate — partial bundles are worse than oversized).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseJsonl } from './lib/ledger-digest.mjs';
import { locateFrontmatterFence } from './assert_story_files.mjs';

// Bundle-size budget: ≤160KB target (CR-022 M5 raise from 80KB; SPRINT-18 hit 138KB).
const MAX_BUNDLE_BYTES = 160 * 1024; // 163840

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── Env overrides ─────────────────────────────────────────────────────────────

function resolveSprintDir(sprintId) {
  return process.env.CLEARGATE_SPRINT_DIR
    ? path.resolve(process.env.CLEARGATE_SPRINT_DIR)
    : path.join(REPO_ROOT, '.cleargate', 'sprint-runs', sprintId);
}

function resolvePendingSyncDir() {
  return process.env.CLEARGATE_PENDING_SYNC_DIR
    ? path.resolve(process.env.CLEARGATE_PENDING_SYNC_DIR)
    : path.join(REPO_ROOT, '.cleargate', 'delivery', 'pending-sync');
}

function resolveArchiveDir() {
  return path.join(REPO_ROOT, '.cleargate', 'delivery', 'archive');
}

// ── Atomic write ──────────────────────────────────────────────────────────────

function atomicWrite(filePath, content) {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, content, 'utf8');
  fs.renameSync(tmpFile, filePath);
}

// ── Frontmatter parser (minimal: key: value pairs only) ──────────────────────
//
// BUG-098: the block is found with assert_story_files.mjs's position-independent
// locateFrontmatterFence, so a leading `<instructions>` preamble is skipped.
// Absent frontmatter, or framing the locator rejects (it throws), gives {}.

function parseFrontmatter(content) {
  let span = null;
  try {
    span = locateFrontmatterFence(content);
  } catch {
    span = null;
  }
  if (!span) return {};
  const fields = {};
  for (const line of content.slice(span.yamlStart, span.yamlEnd).split('\n')) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*"?([^"]*)"?\s*$/);
    if (m) {
      const val = m[2].trim();
      fields[m[1]] = val === 'null' || val === '' ? null : val;
    }
  }
  return fields;
}

// ── Section 1: Sprint Plan Slices ─────────────────────────────────────────────

/**
 * Search pending-sync then archive for SPRINT-{id}_*.md.
 * Extract sections §1, §2, §5 (numbered heading blocks).
 * Section numbers as per sprint plan template conventions.
 */
function buildSprintPlanSlices(sprintId) {
  const pendingSync = resolvePendingSyncDir();
  const archive = resolveArchiveDir();

  // Glob: <sprint-id>_*.md
  let planFile = null;
  for (const dir of [pendingSync, archive]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.startsWith(sprintId + '_') && f.endsWith('.md'));
    if (files.length > 0) {
      planFile = path.join(dir, files[0]);
      break;
    }
  }

  if (!planFile) {
    return `## Sprint Plan Slices\n\nNo sprint plan found for ${sprintId} in pending-sync or archive.\n`;
  }

  const content = fs.readFileSync(planFile, 'utf8');
  const sections = [];
  // Extract sections 1, 2, 5 by heading number
  for (const num of [1, 2, 5]) {
    // Match `## N. ` heading and capture until next `## \d+.` or EOF
    const regex = new RegExp(`(^## ${num}\\. [^\\n]*\\n[\\s\\S]*?)(?=^## \\d+\\. |$)`, 'gm');
    const match = regex.exec(content);
    if (match) {
      sections.push(match[1].trimEnd());
    }
  }

  if (sections.length === 0) {
    return `## Sprint Plan Slices\n\nNo numbered sections (§1/§2/§5) found in ${path.basename(planFile)}.\n`;
  }

  return `## Sprint Plan Slices\n\n_Source: ${path.basename(planFile)}_\n\n` + sections.join('\n\n') + '\n';
}

// ── Section 2: State.json Summary ─────────────────────────────────────────────

function buildStateJsonSummary(sprintDir) {
  const stateFile = path.join(sprintDir, 'state.json');
  if (!fs.existsSync(stateFile)) {
    return '## State.json Summary\n\nNo state.json found.\n';
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (err) {
    return `## State.json Summary\n\nFailed to parse state.json: ${err.message}\n`;
  }

  const stories = state.stories || {};
  const lines = [`## State.json Summary`, ''];
  lines.push(`Sprint: ${state.sprint_id || 'unknown'} | Status: ${state.sprint_status || 'unknown'}`);
  lines.push('');

  for (const [storyId, entry] of Object.entries(stories)) {
    const state_ = entry.state || 'unknown';
    const lane = entry.lane || 'unknown';
    const qa = entry.qa_bounces !== undefined ? entry.qa_bounces : '?';
    const arch = entry.arch_bounces !== undefined ? entry.arch_bounces : '?';
    lines.push(`${storyId} | ${state_} | ${lane} | qa_bounces=${qa} arch_bounces=${arch}`);
  }

  if (Object.keys(stories).length === 0) {
    lines.push('(No stories in state.json)');
  }

  lines.push('');
  return lines.join('\n');
}

// ── Section 3: Milestone Plans ────────────────────────────────────────────────

function buildMilestonePlans(sprintDir, sprintId) {
  const plansDir = path.join(sprintDir, 'plans');

  if (!fs.existsSync(plansDir)) {
    return `## Milestone Plans\n\nNo milestone plans for ${sprintId}.\n`;
  }

  const planFiles = fs.readdirSync(plansDir)
    .filter(f => /^M\d+\.md$/.test(f))
    .sort();

  if (planFiles.length === 0) {
    return `## Milestone Plans\n\nNo milestone plans for ${sprintId}.\n`;
  }

  const parts = ['## Milestone Plans', ''];
  for (const file of planFiles) {
    const filePath = path.join(plansDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    parts.push(`### ${file}`);
    parts.push('');
    parts.push(content.trimEnd());
    parts.push('');
  }

  return parts.join('\n');
}

// ── Section 4: Git Log Digest ─────────────────────────────────────────────────

function buildGitLogDigest(sprintId) {
  // Derive sprint number from ID: SPRINT-17 → S-17
  const numMatch = sprintId.match(/(\d+)$/);
  if (!numMatch) {
    return `## Git Log Digest\n\nCould not derive sprint branch name from ID: ${sprintId}.\n`;
  }
  const branchName = `sprint/S-${numMatch[1]}`;

  try {
    const output = execSync(
      `git -C "${REPO_ROOT}" log --stat "${branchName}" ^main 2>/dev/null`,
      { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
    );
    if (!output || !output.trim()) {
      return `## Git Log Digest\n\nGit log unavailable for ${branchName} (no commits or branch not found).\n`;
    }
    // Truncate to first ~4KB to avoid ballooning the bundle
    const truncated = output.length > 4096 ? output.slice(0, 4096) + '\n...[truncated]\n' : output;
    return `## Git Log Digest\n\n_Branch: ${branchName} ^main_\n\n\`\`\`\n${truncated}\`\`\`\n`;
  } catch {
    return `## Git Log Digest\n\nGit log unavailable for ${branchName} (branch not found).\n`;
  }
}

// ── Section 5: Token Ledger Digest ────────────────────────────────────────────

function buildTokenLedgerDigest(sprintId, sprintDir) {
  const countTokensScript = path.join(__dirname, 'count_tokens.mjs');

  try {
    const output = execSync(
      `node "${countTokensScript}" "${sprintId}" --json`,
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        env: process.env,  // Forward CLEARGATE_SPRINT_DIR + CLEARGATE_PENDING_SYNC_DIR for test isolation
      }
    );
    const digest = JSON.parse(output.trim());
    const lines = ['## Token Ledger Digest', ''];

    const total = digest.total;
    if (total === 0) {
      lines.push(`Ledger empty for ${sprintId} (0 rows).`);
    } else {
      const totalSum = typeof total === 'object' ? total.sum : total;
      const totalInput = typeof total === 'object' ? total.input : 0;
      const totalOutput = typeof total === 'object' ? total.output : 0;
      const totalCacheRead = typeof total === 'object' ? total.cache_read : 0;
      lines.push(`**Total:** ${totalSum.toLocaleString()} tokens ` +
        `(input: ${totalInput.toLocaleString()} / output: ${totalOutput.toLocaleString()} / ` +
        `cache_read: ${totalCacheRead.toLocaleString()})`);
      lines.push('');

      if (digest.by_agent && Object.keys(digest.by_agent).length > 0) {
        lines.push('**Per-agent breakdown:**');
        const canonicalAgents = ['architect', 'developer', 'qa', 'reporter'];
        for (const agent of canonicalAgents) {
          const entry = digest.by_agent[agent];
          if (entry) {
            lines.push(`- ${agent}: ${entry.sum.toLocaleString()} (${entry.dispatches} dispatches)`);
          }
        }
        for (const [agent, entry] of Object.entries(digest.by_agent)) {
          if (!canonicalAgents.includes(agent)) {
            lines.push(`- ${agent}: ${entry.sum.toLocaleString()} (${entry.dispatches} dispatches)`);
          }
        }
        lines.push('');
      }

      if (digest.anomalies && digest.anomalies.length > 0) {
        lines.push('**Anomalies:**');
        for (const a of digest.anomalies) {
          lines.push(`- ${a.work_item_id}: ${a.multipleOfMedian}× higher than median story cost`);
        }
        lines.push('');
      }
    }

    // ── CR-035: Session-totals delta bake-in ──────────────────────────────────
    // Pre-compute the two-line split numbers for the Reporter's §3 token block.
    // Shape of .session-totals.json: Record<sessionUuid, { input, output, cache_creation,
    // cache_read, last_ts, last_turn_index }> — keyed by UUID, NOT flat.
    // Sum Object.values to get the cumulative sprint total.
    const sessionTotalsPath = path.join(sprintDir, '.session-totals.json');
    let sprintTotalTokens = null;
    let sessionTotalsSource = 'session-totals';
    if (fs.existsSync(sessionTotalsPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(sessionTotalsPath, 'utf8'));
        sprintTotalTokens = Object.values(raw).reduce((acc, entry) => {
          return acc +
            (entry.input ?? 0) +
            (entry.output ?? 0) +
            (entry.cache_creation ?? 0) +
            (entry.cache_read ?? 0);
        }, 0);
      } catch {
        sprintTotalTokens = null;
        sessionTotalsSource = 'session-totals (parse-error — null)';
      }
    } else {
      sessionTotalsSource = 'legacy-fallback (no .session-totals.json)';
    }

    // Sprint work = total ledger delta minus reporter rows.
    // Reuse by_agent map: sprint_work = total - reporter_sum.
    let sprintWorkTokens = null;
    if (total !== 0 && typeof total === 'object') {
      const reporterEntry = digest.by_agent && digest.by_agent['reporter'];
      const reporterSum = reporterEntry ? reporterEntry.sum : 0;
      sprintWorkTokens = (typeof total.sum === 'number' ? total.sum : 0) - reporterSum;
    } else if (total === 0) {
      sprintWorkTokens = 0;
    }

    lines.push('**CR-035 two-line split (pre-computed for Reporter §3):**');
    lines.push(`sprint_work_tokens: ${sprintWorkTokens !== null ? sprintWorkTokens.toLocaleString() : 'null'}`);
    lines.push(`sprint_total_tokens: ${sprintTotalTokens !== null ? sprintTotalTokens.toLocaleString() : 'null (see ' + sessionTotalsSource + ')'}`);
    lines.push(`reporter_pass_tokens: null`);
    if (sessionTotalsSource !== 'session-totals') {
      lines.push(`**Note:** ${sessionTotalsSource}`);
    }
    lines.push('');
    // ── end CR-035 ────────────────────────────────────────────────────────────

    return lines.join('\n') + '\n';
  } catch (err) {
    return `## Token Ledger Digest\n\nFailed to run count_tokens.mjs: ${err.message}\n`;
  }
}

// ── Section 6: Flashcard Slice ────────────────────────────────────────────────

/**
 * Flashcard date-window filter with Strategy-3 fallback.
 *
 * Strategy-3 fallback chain (per FLASHCARD 2026-05-01 #closeout #script #fallback):
 *   1. Try date-window filter: entries where YYYY-MM-DD prefix falls in [start_date, end_date].
 *   2. If 0 entries returned AND sprint_status === 'Completed':
 *      → Fall through to git log --grep "<sprint-id>" to surface commit subjects as
 *        "would-be flashcard candidates" (does NOT apply mid-sprint to avoid false positives).
 *
 * @param {string} startDate - ISO date string e.g. "2026-05-02"
 * @param {string} endDate - ISO date string e.g. "2026-05-15"
 * @param {string} sprintId - e.g. "SPRINT-17"
 * @param {string} sprintStatus - e.g. "Completed" | "Active"
 * @returns {string}
 */
function buildFlashcardSlice(startDate, endDate, sprintId, sprintStatus) {
  const flashcardFile = path.join(REPO_ROOT, '.cleargate', 'FLASHCARD.md');

  if (!fs.existsSync(flashcardFile)) {
    return '## Flashcard Slice\n\nFLASHCARD.md not found.\n';
  }

  const content = fs.readFileSync(flashcardFile, 'utf8');
  const lines = content.split('\n');

  // Filter lines that start with a date in [start_date, end_date]
  const matchingLines = [];
  if (startDate && endDate) {
    for (const line of lines) {
      const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})\s+·/);
      if (dateMatch) {
        const lineDate = dateMatch[1];
        if (lineDate >= startDate && lineDate <= endDate) {
          matchingLines.push(line);
        }
      }
    }
  }

  if (matchingLines.length > 0) {
    return '## Flashcard Slice\n\n_Entries within sprint window ' +
      `[${startDate || 'unknown'} → ${endDate || 'unknown'}]:_\n\n` +
      matchingLines.join('\n') + '\n';
  }

  // Strategy-3 fallback: only for completed sprints
  if (sprintStatus === 'Completed') {
    const numMatch = sprintId.match(/(\d+)$/);
    const branchName = numMatch ? `sprint/S-${numMatch[1]}` : null;

    if (branchName) {
      try {
        const gitOut = execSync(
          `git -C "${REPO_ROOT}" log --grep="${sprintId}" --pretty=%s "${branchName}" 2>/dev/null`,
          { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
        );
        const subjects = (gitOut || '').trim().split('\n').filter(Boolean);
        if (subjects.length > 0) {
          const strategyLines = [
            '## Flashcard Slice',
            '',
            `_No flashcard entries found in date window [${startDate || 'unknown'} → ${endDate || 'unknown'}]._`,
            '_Strategy-3 fallback: would-be flashcard candidates from git log --grep:_',
            '',
            ...subjects.map(s => `- ${s}`),
            '',
          ];
          return strategyLines.join('\n');
        }
      } catch {
        // fallthrough
      }
    }
  }

  const windowNote = startDate && endDate
    ? `[${startDate} → ${endDate}]`
    : '(no date window available)';
  return `## Flashcard Slice\n\nNo flashcard entries found in sprint window ${windowNote}.\n`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const sprintId = args[0];

  if (!sprintId) {
    process.stderr.write('Usage: node prep_reporter_context.mjs <sprint-id>\n');
    process.exit(2);
  }

  const sprintDir = resolveSprintDir(sprintId);
  const ledgerFile = path.join(sprintDir, 'token-ledger.jsonl');

  // BUG-081: an ABSENT ledger is a recoverable condition, not a fatal one.
  //
  // The ledger is written by the SubagentStop hook. It legitimately does not
  // exist when the hooks never fired for this sprint — an orchestrator driving
  // the sprint from another repo without ORCHESTRATOR_PROJECT_DIR, a run driven
  // by a different agent, or a sprint executed by hand. Hard-exiting here made
  // Gate-4 close impossible in every one of those cases, for missing data rather
  // than wrong data.
  //
  // Degrade instead: emit the bundle with no cost section and say so loudly, so
  // the Reporter reports the absence rather than inventing or omitting a figure.
  const ledgerMissing = !fs.existsSync(ledgerFile);
  if (ledgerMissing) {
    process.stderr.write(
      `WARN: token-ledger.jsonl not found at ${ledgerFile}\n` +
      `  Proceeding without cost data. The sprint report will record the ledger as\n` +
      `  ABSENT — not zero, not incomplete. If this is unexpected, the SubagentStop\n` +
      `  hook did not fire for this sprint; see ORCHESTRATOR_PROJECT_DIR when driving\n` +
      `  a sprint from another repo.\n`
    );
  }

  // Read sprint frontmatter for start_date, end_date, sprint_status
  // Prefer state.json for sprint_status; read sprint plan for dates.
  let startDate = null;
  let endDate = null;
  let sprintStatus = 'unknown';

  // Read state.json for sprint_status
  const stateFile = path.join(sprintDir, 'state.json');
  if (fs.existsSync(stateFile)) {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      sprintStatus = state.sprint_status || 'unknown';
    } catch {
      // non-fatal
    }
  }

  // Read sprint plan frontmatter for dates
  const pendingSync = resolvePendingSyncDir();
  const archive = resolveArchiveDir();
  for (const dir of [pendingSync, archive]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.startsWith(sprintId + '_') && f.endsWith('.md'));
    if (files.length > 0) {
      const planContent = fs.readFileSync(path.join(dir, files[0]), 'utf8');
      const fields = parseFrontmatter(planContent);
      startDate = fields.start_date || null;
      endDate = fields.end_date || null;
      break;
    }
  }

  // Build all sections
  const sections = [];
  sections.push(`# Reporter Context Bundle — ${sprintId}\n`);
  sections.push(`_Generated: ${new Date().toISOString()}_\n`);
  sections.push('---\n');

  sections.push(buildSprintPlanSlices(sprintId));
  sections.push(buildStateJsonSummary(sprintDir));
  sections.push(buildMilestonePlans(sprintDir, sprintId));
  sections.push(buildGitLogDigest(sprintId));
  sections.push(buildTokenLedgerDigest(sprintId, sprintDir));
  sections.push(buildFlashcardSlice(startDate, endDate, sprintId, sprintStatus));

  // REPORT template pointer
  const templatePath = path.join(REPO_ROOT, '.cleargate', 'templates', 'sprint_report.md');
  sections.push(`## REPORT Template\n\nTemplate path: \`${templatePath}\`\n`);

  const bundle = sections.join('\n');
  const bundleBytes = Buffer.byteLength(bundle, 'utf8');

  // Write bundle
  const outputPath = path.join(sprintDir, '.reporter-context.md');
  atomicWrite(outputPath, bundle);

  const kb = Math.round(bundleBytes / 1024);
  if (bundleBytes > MAX_BUNDLE_BYTES) {
    process.stderr.write(
      `Warning: bundle exceeds 160KB target (${kb}KB) — consider trimming sprint-plan §2 in-place\n`
    );
  }

  process.stdout.write(`Bundle ready: ${kb}KB at ${outputPath}\n`);
  process.exit(0);
}

main();
