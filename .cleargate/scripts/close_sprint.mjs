#!/usr/bin/env node
/**
 * close_sprint.mjs — Eight-step sprint close pipeline
 *
 * Usage: node close_sprint.mjs <sprint-id> [--assume-ack]
 *        node close_sprint.mjs <sprint-id> --report-body-stdin   (STORY-014-10)
 *
 * Steps:
 *   1. Load and validate state.json via validateState
 *   2. Refuse if any story state is not in TERMINAL_STATES (exit non-zero, list offenders)
 *   3. Invoke prefill_report.mjs on all agent reports
 *   3.5 Build curated Reporter context bundle via prep_reporter_context.mjs (non-fatal)
 *   4. Orchestrator spawns Reporter separately (script validates preconditions only)
 *   5. On Reporter success + user ack (or --assume-ack flag), flip sprint_status -> "Completed"
 *   6. Invoke suggest_improvements.mjs unconditionally
 *   7. Auto-push per-artifact status updates to MCP via cleargate sync work-items (non-fatal)
 *   8. Verbose post-close handoff list (6-item next-steps block to stdout)
 *
 * Report filename: SPRINT-<#>_REPORT.md for new sprints (SPRINT-18+).
 *   Backwards-compat: if SPRINT-<#>_REPORT.md is absent but REPORT.md exists (legacy
 *   SPRINT-01..17), fall back to REPORT.md for read operations. New writes always
 *   use SPRINT-<#>_REPORT.md when the sprint-id carries a numeric portion.
 *   If the sprint-id has no numeric portion (e.g. SPRINT-TEST), plain REPORT.md is used.
 *
 * Stdin fallback (STORY-014-10): when `--report-body-stdin` is passed, the script
 * reads the full SPRINT-<#>_REPORT.md body from stdin and writes it atomically in lieu of
 * waiting for a Reporter-produced file. Replaces the Step-4 gate; implies ack.
 * Refuses empty stdin or pre-existing report file.
 *
 * Does NOT archive the sprint file (pending-sync -> archive stays human per EPIC-013 §4.5 step 7).
 *
 * Reuse: TERMINAL_STATES, VALID_STATES from constants.mjs
 *        validateState from validate_state.mjs
 *        atomicWrite pattern from update_state.mjs
 *
 * Test seams (CR-022 M1):
 *   CLEARGATE_SKIP_LIFECYCLE_CHECK=1  — skip Step 2.6 lifecycle reconciliation AND Step 2.6b
 *                                       cross-sprint orphan drift check entirely (test
 *                                       environments where the CLI binary is present but
 *                                       real git history would produce drift false-positives).
 *   CLEARGATE_SKIP_WORKTREE_CHECK=1   — skip Step 2.7 entirely (test environments that cannot
 *                                       run git worktree list from a real git root).
 *   CLEARGATE_FORCE_WORKTREE_PATHS=p1,p2 — comma-separated fake worktree paths injected into
 *                                          Step 2.7 instead of running git worktree list.
 *                                          Used to exercise the block / advisory paths
 *                                          without a real .worktrees/STORY-* directory.
 *   CLEARGATE_SKIP_MERGE_CHECK=1     — skip Step 2.8 entirely (test environments where git
 *                                      refs are absent or merge state is irrelevant).
 *   CLEARGATE_FORCE_MERGE_STATUS=merged|unmerged — inject merge status for Step 2.8 without
 *                                                  running git merge-base. Used to exercise
 *                                                  the block / advisory paths.
 *   CLEARGATE_REPO_ROOT=<path>       — override REPO_ROOT for Step 2.8 git commands
 *                                      (used in tests that need a controlled git repo).
 *   CLEARGATE_SKIP_SPRINT_TRENDS=1   — skip Step 6.5 entirely (test environments).
 *   CLEARGATE_SKIP_SKILL_CANDIDATES=1 — skip Step 6.6 entirely (test environments).
 *   CLEARGATE_SKIP_FLASHCARD_CLEANUP=1 — skip Step 6.7 entirely (test environments).
 *   CLEARGATE_SPRINT_RUNS_DIR=<path> — override .cleargate/sprint-runs/ root for
 *                                      sibling-sprint counting in sprint_trends.mjs.
 *   CLEARGATE_FLASHCARD_PATH=<path>  — override .cleargate/FLASHCARD.md path for
 *                                      --flashcard-cleanup scan in suggest_improvements.mjs.
 *   CLEARGATE_FLASHCARD_LOOKBACK=<N> — override 3-sprint default lookback for
 *                                      --flashcard-cleanup scan.
 *   CLEARGATE_SKIP_BUNDLE_CHECK=1    — skip Step 3.5 bundle generation + size check entirely
 *                                      (CR-036 test seam; analogous to CLEARGATE_SKIP_MERGE_CHECK).
 *                                      Never use in production — Step 3.5 is fatal in production.
 *   CLEARGATE_SKIP_DEFERRED_VERIFY_CHECK=1 — skip Step 2.9 entirely (test environments where
 *                                            deferred-verification state is irrelevant; mirrors
 *                                            CLEARGATE_SKIP_WORKTREE_CHECK).
 *   CLEARGATE_FORCE_DEFERRED_VERIFY=<json> — inject a JSON map of deferred-verify state without
 *                                            reading real story files or result artifacts (mirrors
 *                                            CLEARGATE_FORCE_WORKTREE_PATHS). Shape:
 *                                            { "<STORY-ID>": { declared:[{command,blocks}],
 *                                              result:"green"|"red"|"unrun"|null } }
 *                                            Used to exercise FAIL/PASS/no-op paths in the node:test.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { TERMINAL_STATES } from './constants.mjs';
import { validateState } from './validate_state.mjs';
import { migrateStateToV3 } from './_migrate-schema-v3.mjs';
import { reportFilename } from './lib/report-filename.mjs';
import { locateFrontmatterFence } from './assert_story_files.mjs';

/**
 * Migrate a v1 state.json to v2 by injecting lane fields with defaults.
 * Inlined from update_state.mjs:migrateV1ToV2 to avoid triggering that
 * script's CLI main() on import (update_state.mjs has no module guard).
 * @param {object} state - Parsed v1 state object
 * @returns {object} - The mutated (now v2) state object
 */
function migrateV1ToV2(state) {
  state.schema_version = 2;
  const storyIds = Object.keys(state.stories || {});
  for (const id of storyIds) {
    const story = state.stories[id];
    if (story.lane == null) story.lane = 'standard';
    if (story.lane_assigned_by == null) story.lane_assigned_by = 'migration-default';
    if (story.lane_demoted_at === undefined) story.lane_demoted_at = null;
    if (story.lane_demotion_reason === undefined) story.lane_demotion_reason = null;
  }
  process.stderr.write(
    `migration: schema_version 1 → 2 for sprint ${state.sprint_id} (${storyIds.length} stories defaulted to lane: standard)\n`
  );
  return state;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.CLEARGATE_REPO_ROOT
  ? path.resolve(process.env.CLEARGATE_REPO_ROOT)
  : path.resolve(__dirname, '..', '..');
const SCRIPTS_DIR = __dirname;

/**
 * CR-107: dependency-free line-scan reader for `vcs.sprint_pr` in
 * <repoRoot>/.cleargate/config.yml. No YAML parser — close_sprint.mjs
 * imports none today, and js-yaml lives only in the meta-repo root
 * node_modules/, which does not exist inside a worktree and does not exist
 * in a target install. Precedent: pre_gate_common.sh:193 read_provision_config
 * (awk, "keeps it dependency-light and avoids a full YAML parse").
 * An absent `vcs:` block, or an absent `sprint_pr` key, means `false`.
 * @param {string} repoRoot
 * @returns {boolean}
 */
function readVcsSprintPr(repoRoot) {
  const configPath = path.join(repoRoot, '.cleargate', 'config.yml');
  let text;
  try {
    text = fs.readFileSync(configPath, 'utf8');
  } catch {
    return false;
  }
  let inVcsBlock = false;
  let vcsIndent = 0;
  for (const line of text.split('\n')) {
    const vcsHeader = /^(\s*)vcs:\s*$/.exec(line);
    if (vcsHeader) {
      inVcsBlock = true;
      vcsIndent = vcsHeader[1].length;
      continue;
    }
    if (!inVcsBlock) continue;
    if (line.trim() === '') continue;
    const indentMatch = /^(\s*)/.exec(line);
    const indent = indentMatch ? indentMatch[1].length : 0;
    if (indent <= vcsIndent) {
      inVcsBlock = false;
      continue;
    }
    const kv = /^\s*sprint_pr:\s*(\S+)/.exec(line);
    if (kv) return kv[1].trim() === 'true';
  }
  return false;
}

/**
 * CR-107: true if a `gh` binary resolves on PATH. Used as a fail-CLOSED
 * presence gate for `vcs.sprint_pr: true` — the binary is never invoked for
 * real work by anything in this file; merge/squash detection below is pure
 * git plumbing.
 * @returns {boolean}
 */
function isGhOnPath() {
  try {
    execSync('command -v gh', { stdio: 'ignore', env: process.env });
    return true;
  } catch {
    return false;
  }
}

/**
 * CR-107: true if an `origin` remote is configured in repoRoot.
 * @param {string} repoRoot
 * @returns {boolean}
 */
function hasOriginRemote(repoRoot) {
  try {
    execSync('git remote get-url origin', { stdio: 'ignore', cwd: repoRoot, env: process.env });
    return true;
  } catch {
    return false;
  }
}

/**
 * CR-107 F2a: real squash/rebase-merge detection — a genuine probe, not a
 * hardcoded string. Builds a throwaway commit carrying the sprint branch's
 * tip TREE on top of the merge-base, then asks `git cherry` whether that
 * diff is already reachable from mainRef (`git cherry` prefixes an
 * already-applied patch with `-`). Stays silent (false) on a never-merged
 * sprint — validated against both a real squash-merge fixture and a
 * never-merged negative control.
 * @param {string} sprintBranch
 * @param {string} mainRef
 * @param {string} repoRoot
 * @returns {boolean}
 */
function isSquashMerged(sprintBranch, mainRef, repoRoot) {
  try {
    const mergeBase = execSync(
      `git merge-base ${mainRef} ${sprintBranch}`,
      { encoding: 'utf8', cwd: repoRoot, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    const sprintTree = execSync(
      `git rev-parse ${sprintBranch}^{tree}`,
      { encoding: 'utf8', cwd: repoRoot, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    const probe = execSync(
      `git commit-tree ${sprintTree} -p ${mergeBase} -m probe`,
      { encoding: 'utf8', cwd: repoRoot, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    const cherryOut = execSync(
      `git cherry ${mainRef} ${probe}`,
      { encoding: 'utf8', cwd: repoRoot, env: process.env, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return cherryOut.split('\n').some((line) => line.trim().startsWith('-'));
  } catch {
    return false;
  }
}

/**
 * BUG-076: resolve the built CLI, wherever it actually lives.
 *
 * `cleargate-cli/dist/cli.js` exists ONLY in the ClearGate meta-repo, where the
 * CLI source tree sits beside the planning scaffold. Every consumer install has
 * the CLI under `node_modules/cleargate/dist/`. Hard-coding the meta-repo path
 * made Gate-4 close structurally unreachable for the users the framework ships
 * to: the sprint would execute fully and then refuse to close.
 *
 * Returns an absolute path, or null when no built CLI can be found.
 */
function resolveCliBin(repoRoot, rel = 'cli.js') {
  const candidates = [
    path.join(repoRoot, 'cleargate-cli', 'dist', rel),          // meta-repo dogfood
    path.join(repoRoot, 'node_modules', 'cleargate', 'dist', rel), // consumer install
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * BUG-090: locate a file's frontmatter wherever its fence sits (behind a leading
 * `<instructions>` block too) via assert_story_files.mjs's locateFrontmatterFence.
 * Returns { span, yaml } where yaml is the text between the fences, or null when
 * there is no frontmatter or its framing cannot be read (the locator throws).
 * @param {string} raw
 * @returns {{span: {start:number,end:number,yamlStart:number,yamlEnd:number,eol:string}, yaml: string} | null}
 */
function fenceYaml(raw) {
  let span = null;
  try {
    span = locateFrontmatterFence(raw);
  } catch {
    return null;
  }
  if (!span) return null;
  return { span, yaml: raw.slice(span.yamlStart, span.yamlEnd) };
}

/** BUG-083: read just the `status:` value from a file's frontmatter. Null if unreadable. */
function readFmStatus(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const fm = fenceYaml(raw);
    if (!fm) return null;
    const m = fm.yaml.match(/^status:\s*"?([^"\n#]+)"?\s*$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function usage() {
  process.stderr.write(
    'Usage: node close_sprint.mjs <sprint-id> [--assume-ack | --report-body-stdin]\n' +
    '\n' +
    'Options:\n' +
    '  --assume-ack           Skip user acknowledgement prompt (automated tests ONLY — conversational orchestrators MUST NOT pass this);\n' +
    '                         refused unless CLEARGATE_CI_ACK=1 (enforcement §12.3)\n' +
    '  --report-body-stdin    Read SPRINT-<#>_REPORT.md body from stdin; implies ack (STORY-014-10)\n'
  );
  process.exit(2);
}


/**
 * Atomic write using tmp+rename pattern (per M1 update_state.mjs convention).
 * @param {string} filePath
 * @param {object} data
 */
function atomicWrite(filePath, data) {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpFile, filePath);
}

/**
 * Atomic write for a string body. Separate from atomicWrite() so we don't
 * accidentally JSON.stringify a markdown body.
 * @param {string} filePath
 * @param {string} body
 */
function atomicWriteString(filePath, body) {
  const tmpFile = `${filePath}.tmp.${process.pid}`;
  fs.writeFileSync(tmpFile, body, 'utf8');
  fs.renameSync(tmpFile, filePath);
}

/**
 * Invoke a script via node (for .mjs scripts in the same directory).
 * Throws on non-zero exit.
 * @param {string} scriptName
 * @param {string[]} scriptArgs
 * @param {object} env
 */
function invokeScript(scriptName, scriptArgs, env) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script not found: ${scriptPath}`);
  }
  const argStr = scriptArgs.map(a => JSON.stringify(a)).join(' ');
  const cmd = `node ${JSON.stringify(scriptPath)} ${argStr}`;
  execSync(cmd, {
    stdio: 'inherit',
    env: Object.assign({}, process.env, env || {}),
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) usage();

  const sprintId = args[0];
  const reportBodyStdin = args.includes('--report-body-stdin');
  const assumeAck = args.includes('--assume-ack') || reportBodyStdin;

  if (args.includes('--assume-ack') && process.env.CLEARGATE_CI_ACK !== '1') {
    process.stderr.write(
      'Error: --assume-ack requires CLEARGATE_CI_ACK=1.\n' +
      'This token is never set unprompted by an agent — it is set for a single invocation\n' +
      'only after an explicit human close authorization (Gate 4), or by CI (enforcement §12.3).\n'
    );
    process.exit(2);
  }

  const sprintDir = process.env.CLEARGATE_SPRINT_DIR
    ? path.resolve(process.env.CLEARGATE_SPRINT_DIR)
    : path.join(REPO_ROOT, '.cleargate', 'sprint-runs', sprintId);

  if (!fs.existsSync(sprintDir)) {
    process.stderr.write(`Error: sprint directory not found: ${sprintDir}\n`);
    process.exit(1);
  }

  const stateFile = process.env.CLEARGATE_STATE_FILE
    ? path.resolve(process.env.CLEARGATE_STATE_FILE)
    : path.join(sprintDir, 'state.json');

  // ── Step 1: Load and validate state.json ──────────────────────────────────
  if (!fs.existsSync(stateFile)) {
    process.stderr.write(
      `Error: state.json not found at ${stateFile}\n` +
      `Hint: run init_sprint.mjs ${sprintId} --stories <ids> first\n`
    );
    process.exit(1);
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch (err) {
    process.stderr.write(`Error: failed to parse state.json: ${err.message}\n`);
    process.exit(1);
  }

  // Migrate v1 → v2 if needed before strict validation
  if (state.schema_version === 1) {
    state = migrateV1ToV2(state);
    atomicWrite(stateFile, state);
  }

  // Migrate v2 → v3: strip execution_mode (STORY-070-01)
  const { changed: v3Changed } = migrateStateToV3(state, stateFile);
  if (v3Changed) {
    atomicWrite(stateFile, state);
  }

  const { valid, errors } = validateState(state);
  if (!valid) {
    process.stderr.write('Error: state.json validation failed:\n');
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }

  // ── Step 2: Refuse if any story not in TERMINAL_STATES ────────────────────
  const nonTerminal = [];
  for (const [storyId, story] of Object.entries(state.stories || {})) {
    if (!TERMINAL_STATES.includes(story.state)) {
      nonTerminal.push(`${storyId}: ${story.state} — not terminal`);
    }
  }

  if (nonTerminal.length > 0) {
    process.stderr.write('Error: sprint cannot close — non-terminal stories:\n');
    for (const msg of nonTerminal) {
      process.stderr.write(`  ${msg}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`Step 1-2 passed: all ${Object.keys(state.stories || {}).length} stories are terminal.\n`);

  // ── Step 2.5: v2.1 validation — activation-gated ──────────────────────────
  // Activation gate: at least one story has lane: 'fast'
  // (schema_version is always >= 3 post-STORY-070-01 migrator)
  const hasFastLane = Object.values(state.stories || {}).some(
    (s) => /** @type {any} */ (s).lane === 'fast'
  );

  if (hasFastLane) {
    // Naming convention: sprint dir must match ^SPRINT-\d{2,3}$
    const sprintDirName = path.basename(sprintDir);
    if (!/^SPRINT-\d{2,3}$/.test(sprintDirName)) {
      process.stderr.write(
        `close_sprint: sprint dir "${sprintDirName}" does not match ^SPRINT-\\d{2,3}$\n` +
        `  Expected format: SPRINT-NN or SPRINT-NNN (e.g. SPRINT-14)\n` +
        `  Got: "${sprintDirName}" at path: ${sprintDir}\n`
      );
      process.exit(1);
    }

    // Read SPRINT-<#>_REPORT.md (with legacy REPORT.md fallback for pre-CR-021 sprints)
    const reportFile2 = reportFilename(sprintDir, sprintId, { forRead: true });
    if (!fs.existsSync(reportFile2)) {
      process.stderr.write(
        `close_sprint: v2.1 validation requires ${path.basename(reportFile2)} at ${reportFile2}\n` +
        '  Run the Reporter agent first, then re-run close_sprint.mjs.\n'
      );
      process.exit(1);
    }
    const report = fs.readFileSync(reportFile2, 'utf8');

    // Check required §3 metric rows
    const requiredMetricRows = [
      /Fast-Track Ratio/,
      /Fast-Track Demotion Rate/,
      /Hotfix Count/,
      /Hotfix-to-Story Ratio/,
      /Hotfix Cap Breaches/,
      /LD events/,
    ];
    const missingMetrics = requiredMetricRows.filter((rx) => !rx.test(report));
    if (missingMetrics.length > 0) {
      process.stderr.write(
        `close_sprint: §3 missing rows: ${missingMetrics.map((rx) => rx.source).join(', ')}\n`
      );
      process.exit(1);
    }

    // Check required §5 sections
    const requiredSections = [
      /Lane Audit/,
      /Hotfix Audit/,
      /Hotfix Trend/,
    ];
    const missingSections = requiredSections.filter((rx) => !rx.test(report));
    if (missingSections.length > 0) {
      process.stderr.write(
        `close_sprint: §5 missing: ${missingSections.map((rx) => rx.source).join(', ')}\n`
      );
      process.exit(1);
    }

    process.stdout.write('Step 2.5 passed: v2.1 validation — all required §3 metrics and §5 sections present.\n');
  }

  // ── WS8(e) Dist Fail-Closed Assertion ────────────────────────────────────
  // Verify that cleargate-cli/dist/cli.js is present BEFORE attempting the
  // Step 2.6 cascade. Absent dist means the build is stale and the lifecycle/
  // orphan/parent-rollup/backsync/merge gates will silently no-op — that is
  // worse than failing loudly. Exit 1 early so the operator fixes the build.
  //
  // Test seam bypass: CLEARGATE_SKIP_LIFECYCLE_CHECK=1 skips this assertion
  // (the deliberate skip-env path for test environments where the CLI binary
  // is intentionally absent — e.g. sandbox-only sprint dirs).
  if (process.env.CLEARGATE_SKIP_LIFECYCLE_CHECK !== '1') {
    const cliBinEarly = resolveCliBin(REPO_ROOT);
    if (cliBinEarly === null) {
      process.stderr.write(
        `cleargate CLI dist not found.\n` +
        `  Looked for: <root>/cleargate-cli/dist/cli.js (meta-repo) and\n` +
        `              <root>/node_modules/cleargate/dist/cli.js (installed)\n` +
        `  Fix: npm install cleargate  (or \`npm run build\` in cleargate-cli/ when developing ClearGate itself)\n` +
        `  The lifecycle/orphan/parent-rollup/backsync/merge gates require a built CLI dist.\n`
      );
      process.exit(1);
    }
  }

  // BUG-077 (round 2): 2.6d must precede EVERY step that judges an artifact by
  // its FRONTMATTER status — not just 2.6c. Step 2.6 (lifecycle reconciliation)
  // and 2.6b read the same field, and 2.6d is the only step that writes it from
  // state.json. Round 1 moved 2.6d ahead of 2.6c alone, which left 2.6 still
  // failing a first close with:
  //   DRIFT: STORY-NNN-NN status=Approved in pending-sync, expected Completed
  // for a story that was Done in state.json all along. Found by running a close
  // on a fresh consumer project rather than on an already-half-closed sprint.

  // BUG-077 (round 3 — the actual invariant): every step that WRITES an
  // artifact's frontmatter status must precede every step that JUDGES it.
  //
  //   writers: 2.6d (stories, from state.json)  2.6c (parents, from children)
  //   judges:  2.6  (lifecycle reconciliation)  2.6b (cross-sprint orphan drift)
  //
  // Order is therefore 2.6d -> 2.6c -> 2.6 -> 2.6b.
  //
  // Round 1 moved 2.6d ahead of 2.6c only, and 2.6 still failed a first close on
  // the stories. Round 2 moved 2.6d ahead of 2.6 as well, and 2.6 then failed on
  // the EPIC — because 2.6d syncs stories but 2.6c is what sets parents, and it
  // was still running last. Each round fixed the symptom in front of it; this is
  // the rule that covers all of them.

  // ── Step 2.6d: Same-Sprint Story Backsync (BUG-032) ─────────────────────────
  // Flip all Done-state stories in the closing sprint from their current
  // frontmatter status to `status: Completed, approved: true`, then move
  // the file from pending-sync/ to archive/.
  //
  // Root cause: reconcileCrossSprintOrphans explicitly SKIPS the active sprint
  // (reads .active sentinel). No prior step flipped same-sprint story frontmatter.
  // This step fills that gap.
  //
  // Idempotence: stories already at a terminal status are silently skipped.
  // Runs unconditionally (no CLEARGATE_SKIP_* seam) — the function is pure FS,
  // no git calls, no CLI binary required. CLEARGATE_REPO_ROOT overrides delivery paths.
  process.stdout.write('Step 2.6d: back-syncing same-sprint story frontmatter...\n');
  try {
    const reconcilerMod26d = await import(
      // BUG-076: resolve via the same multi-root lookup as every other CLI
      // reference. SCRIPTS_DIR/../.. is the meta-repo layout only; a consumer
      // install has the lib under node_modules/cleargate/dist/.
      (resolveCliBin(path.resolve(SCRIPTS_DIR, '..', '..'), path.join('lib', 'lifecycle-reconcile.js'))
        ?? resolveCliBin(REPO_ROOT, path.join('lib', 'lifecycle-reconcile.js'))
        ?? '/nonexistent-cleargate-lib')
    ).catch(() => null);

    if (!reconcilerMod26d || typeof reconcilerMod26d.reconcileCurrentSprintStories !== 'function') {
      process.stdout.write(
        'Step 2.6d skipped: reconcileCurrentSprintStories not in built CLI — rebuild cleargate-cli/.\n',
      );
    } else {
      const deliveryRoot26d = path.join(REPO_ROOT, '.cleargate', 'delivery');
      const sprintRunsRoot26d = path.join(REPO_ROOT, '.cleargate', 'sprint-runs');

      const backsyncResult = reconcilerMod26d.reconcileCurrentSprintStories({
        deliveryRoot: deliveryRoot26d,
        sprintRunsRoot: sprintRunsRoot26d,
        sprintId,
        retroactive: false,
      });

      if (backsyncResult.flipped.length > 0) {
        for (const item of backsyncResult.flipped) {
          process.stdout.write(
            `Step 2.6d: ${item.id} status ${item.old_status} → Completed` +
            ` (state.json: Done) → archived at ${item.file_path}\n`,
          );
        }
        process.stdout.write(
          `Step 2.6d passed: ${backsyncResult.flipped.length} story/stories back-synced and archived.\n`,
        );
      } else {
        process.stdout.write(
          `Step 2.6d passed: no same-sprint story backsync needed` +
          ` (${backsyncResult.skipped_already_terminal} already terminal, ` +
          `${backsyncResult.skipped_not_done} pending non-Done).\n`,
        );
      }
    }
  } catch (e26d) {
    process.stderr.write(`Step 2.6d warning: same-sprint backsync unavailable: ${e26d.message}\n`);
  }

  // ── Step 2.6c: Parent (Epic/Sprint) Rollup (CR-066) ──────────────────────
  // Runs unconditionally (not gated by CLEARGATE_SKIP_LIFECYCLE_CHECK).
  // For each active parent in delivery/pending-sync/, checks children coverage:
  //   auto-flip      → rewrite status: Completed atomically, log one line.
  //   halt-partial   → collect into haltList; exit 1 after processing all.
  //   halt-zero-children → collect into haltList; exit 1 after processing all.
  //   no-op / skip-deferred → silent.
  // Defensive guard: if walkActiveParents is not a function (stale dist/), skip with warning.

  /**
   * Atomic in-place status rewrite (raw-bytes regex-replace).
   * Follows FLASHCARD 2026-04-24 #frontmatter #write-back pattern.
   * BUG-090: the rewrite is spliced into the located YAML span by offset, so a
   * leading `<instructions>` block stays byte-identical and is never matched.
   * @param {string} filePath
   * @param {string} newStatus
   */
  function setFrontmatterStatusAtomic(filePath, newStatus) {
    const raw = fs.readFileSync(filePath, 'utf8');
    const fm = fenceYaml(raw);
    if (!fm) throw new Error(`No frontmatter in ${filePath}`);
    const newFm = fm.yaml.replace(/^status:.*$/m, `status: ${newStatus}`);
    const newRaw = raw.slice(0, fm.span.yamlStart) + newFm + raw.slice(fm.span.yamlEnd);
    const tmp = filePath + '.tmp.' + process.pid;
    fs.writeFileSync(tmp, newRaw, 'utf8');
    fs.renameSync(tmp, filePath);
  }

  // ── Step 2.6c test seam ──────────────────────────────────────────────────────
  if (process.env.CLEARGATE_SKIP_PARENT_ROLLUP === '1') {
    process.stdout.write('Step 2.6c skipped: CLEARGATE_SKIP_PARENT_ROLLUP=1 set (test seam).\n');
  } else {
  process.stdout.write('Step 2.6c: rolling up parent statuses...\n');
  try {
    // Use __dirname-relative path so the import finds the ACTUAL built dist,
    // not a fixture tmpdir override (CLEARGATE_REPO_ROOT may point elsewhere in tests).
    const scriptRepoRoot26c = path.resolve(SCRIPTS_DIR, '..', '..');
    const reconcilerMod26c = await import(
      (resolveCliBin(scriptRepoRoot26c, path.join('lib', 'lifecycle-reconcile.js')) ?? resolveCliBin(REPO_ROOT, path.join('lib', 'lifecycle-reconcile.js')) ?? '')
    ).catch(() => null);

    if (!reconcilerMod26c || typeof reconcilerMod26c.walkActiveParents !== 'function') {
      process.stdout.write('Step 2.6c skipped: walkActiveParents not in built CLI — rebuild cleargate-cli/.\n');
    } else {
      // Delivery paths come from REPO_ROOT (may be fixture tmpdir in tests)
      const deliveryRoot26c = path.join(REPO_ROOT, '.cleargate', 'delivery');
      const archiveRoot26c = path.join(deliveryRoot26c, 'archive');
      const results26c = await reconcilerMod26c.walkActiveParents({
        deliveryRoot: deliveryRoot26c,
        archiveRoot: archiveRoot26c,
        // BUG-078: lets a SPRINT parent resolve its roster from state.json.
        // Nothing in a story's frontmatter names its sprint.
        sprintRunsRoot: path.join(REPO_ROOT, '.cleargate', 'sprint-runs'),
      });
      const flips26c = results26c.filter((r) => r.verdict === 'auto-flip');
      const halts26c = results26c.filter(
        (r) => r.verdict === 'halt-partial' || r.verdict === 'halt-zero-children',
      );

      for (const f of flips26c) {
        setFrontmatterStatusAtomic(f.parent_path, 'Completed');

        // BUG-083: flipping status is only half of terminality — the lifecycle
        // reconciler also requires a Completed artifact to LIVE in archive/.
        // 2.6d already archives the stories it syncs; 2.6c did not archive the
        // parents it flips, so Step 2.6 then reported the self-contradictory
        //   "DRIFT: EPIC-001 status=Completed in pending-sync, expected Completed"
        // — a status comparison that passes, describing a location problem.
        let archivedTo = null;
        try {
          if (path.dirname(f.parent_path).endsWith(path.join('delivery', 'pending-sync'))) {
            fs.mkdirSync(archiveRoot26c, { recursive: true });
            const dest = path.join(archiveRoot26c, path.basename(f.parent_path));
            fs.renameSync(f.parent_path, dest);
            archivedTo = path.relative(deliveryRoot26c, dest);
          }
        } catch (archErr) {
          process.stderr.write(
            `Step 2.6c warning: ${f.parent_id} flipped to Completed but could not be archived: ${archErr.message}\n`
          );
        }

        process.stdout.write(
          `Step 2.6c: ${f.parent_id} status ${f.current_status} → Completed` +
          ` (${f.terminal_children.length}/${f.terminal_children.length} children Completed:` +
          ` ${f.terminal_children.join(', ')})` +
          (archivedTo ? ` → archived at ${archivedTo}` : '') + `\n`,
        );
      }

      // BUG-083 (round 2): archive any parent that is ALREADY Completed but still
      // sitting in pending-sync. The flip loop above only reaches parents it
      // changes; a parent completed by an earlier close attempt — or edited by
      // hand — is a no-op there and never gets moved, so Step 2.6 reports drift
      // forever. Terminality is status AND location; reconcile both.
      for (const r of results26c) {
        if (flips26c.includes(r)) continue;
        try {
          const rawFm = readFmStatus(r.parent_path);
          if (rawFm !== 'Completed') continue;
          if (!path.dirname(r.parent_path).endsWith(path.join('delivery', 'pending-sync'))) continue;
          fs.mkdirSync(archiveRoot26c, { recursive: true });
          const dest = path.join(archiveRoot26c, path.basename(r.parent_path));
          fs.renameSync(r.parent_path, dest);
          process.stdout.write(
            `Step 2.6c: ${r.parent_id} already Completed but in pending-sync → archived at ` +
            `${path.relative(deliveryRoot26c, dest)}\n`
          );
        } catch {
          // Best-effort: a parent we cannot read or move is left for Step 2.6 to report.
        }
      }

      if (halts26c.length > 0) {
        process.stderr.write(`Step 2.6c HALT: ${halts26c.length} parent(s) require manual ack:\n`);
        for (const h of halts26c) {
          process.stderr.write(`  - [${h.verdict}] ${h.halt_reason}\n`);
        }
        process.exit(1);
      }

      process.stdout.write(`Step 2.6c passed: ${flips26c.length} parent(s) auto-flipped; no halts.\n`);
    }
  } catch (e26c) {
    process.stderr.write(`Step 2.6c warning: parent rollup unavailable: ${e26c.message}\n`);
  }
  } // end CLEARGATE_SKIP_PARENT_ROLLUP else block

  // ── Step 2.6: Lifecycle Reconciliation (CR-017) ──────────────────────────
  // Block close if any artifact referenced in this sprint's commits is still
  // non-terminal in pending-sync (excluding carry_over: true).
  // Invokes `cleargate sprint reconcile-lifecycle <sprint-id>` CLI wrapper.
  // Fail-open if CLI binary is unavailable (non-blocking for test environments).
  // Test seam: CLEARGATE_SKIP_LIFECYCLE_CHECK=1 skips this step entirely (non-fatal).
  process.stdout.write('Step 2.6: running lifecycle reconciliation...\n');
  if (process.env.CLEARGATE_SKIP_LIFECYCLE_CHECK === '1') {
    process.stdout.write('Step 2.6 skipped: CLEARGATE_SKIP_LIFECYCLE_CHECK=1 set (test seam).\n');
  } else {
    try {
      // Resolve CLI binary: prefer local dist/
      const cliBin = resolveCliBin(REPO_ROOT);

      if (cliBin !== null) {
        // Read sprint start_date from frontmatter for the --since arg
        let sinceArg = '';
        try {
          const pendingDir = path.join(REPO_ROOT, '.cleargate', 'delivery', 'pending-sync');
          if (fs.existsSync(pendingDir)) {
            const entries = fs.readdirSync(pendingDir);
            const sprintFile = entries.find(
              (e) => (e.startsWith(`${sprintId}_`) || e === `${sprintId}.md`) && e.endsWith('.md')
            );
            if (sprintFile) {
              const raw = fs.readFileSync(path.join(pendingDir, sprintFile), 'utf8');
              const startDateMatch = /^start_date:\s*(.+)$/m.exec(raw);
              if (startDateMatch && startDateMatch[1]) {
                sinceArg = `--since ${startDateMatch[1].trim()}`;
              }
            }
          }
        } catch { /* ignore */ }

        const reconcileArgs = [
          'node', JSON.stringify(cliBin), 'sprint', 'reconcile-lifecycle', JSON.stringify(sprintId),
        ];
        if (sinceArg) reconcileArgs.push(sinceArg);
        const reconcileCmd = reconcileArgs.join(' ');

        try {
          execSync(reconcileCmd, { stdio: 'inherit', env: process.env });
          process.stdout.write('Step 2.6 passed: lifecycle reconciliation clean.\n');
        } catch (_reconcileErr) {
          // Exit code 1 from reconcile-lifecycle means drift found
          process.stderr.write(
            'close_sprint: Step 2.6 FAILED — lifecycle drift blocks sprint close.\n' +
            '  Remediate the listed artifacts and re-run close_sprint.mjs.\n' +
            '  To carry over an artifact: set carry_over: true in its frontmatter.\n'
          );
          process.exit(1);
        }
      } else {
        process.stdout.write('Step 2.6 skipped: no built CLI found in cleargate-cli/dist or node_modules/cleargate/dist (non-fatal).\n');
      }
    } catch (step26Err) {
      // Unexpected error — fail-open (log but do not block)
      process.stderr.write(`Step 2.6 warning: lifecycle reconciliation unavailable: ${step26Err.message}\n`);
    }
  }

  // ── Step 2.6b: Cross-Sprint Orphan Drift Check (CR-048) ─────────────────────
  // Detect items in pending-sync/ with non-terminal status whose state.json entry
  // in any closed sprint shows Done — i.e., completed but never archived.
  // Always enforced (STORY-070-01: execution_mode retired).
  // Test seam: CLEARGATE_SKIP_LIFECYCLE_CHECK=1 also skips this step.
  process.stdout.write('Step 2.6b: checking for cross-sprint orphan drift...\n');
  if (process.env.CLEARGATE_SKIP_LIFECYCLE_CHECK !== '1') {
    try {
      const cliBin26b = resolveCliBin(REPO_ROOT);
      if (cliBin26b !== null) {
        // Dynamic import the compiled reconciler function
        const reconcilerMod = await import(
          (resolveCliBin(REPO_ROOT, path.join('lib', 'lifecycle-reconcile.js')) ?? '')
        ).catch(() => null);

        if (reconcilerMod && typeof reconcilerMod.reconcileCrossSprintOrphans === 'function') {
          const deliveryRoot = path.join(REPO_ROOT, '.cleargate', 'delivery');
          const sprintRunsRoot = path.join(REPO_ROOT, '.cleargate', 'sprint-runs');
          const orphanResult = reconcilerMod.reconcileCrossSprintOrphans({ deliveryRoot, sprintRunsRoot });

          if (orphanResult.drift.length > 0) {
            process.stderr.write(
              `Step 2.6b: ${orphanResult.drift.length} cross-sprint orphan(s) detected:\n`
            );
            for (const item of orphanResult.drift) {
              process.stderr.write(
                `  ${item.id} — status: ${item.pending_sync_status} in pending-sync, ` +
                `state: ${item.state_json_state} in ${item.state_json_sprint}\n`
              );
            }
            // Always enforced (STORY-070-01: execution_mode retired)
            process.stderr.write(
              'close_sprint: Step 2.6b FAILED — orphan drift blocks sprint close.\n' +
              '  Archive the listed items and re-run close_sprint.mjs.\n'
            );
            process.exit(1);
          } else {
            process.stdout.write('Step 2.6b passed: no cross-sprint orphan drift.\n');
          }
        } else {
          process.stdout.write('Step 2.6b skipped: reconcileCrossSprintOrphans not available in built CLI.\n');
        }
      } else {
        process.stdout.write('Step 2.6b skipped: CLI binary not found (non-fatal).\n');
      }
    } catch (step26bErr) {
      process.stderr.write(`Step 2.6b warning: orphan check unavailable: ${step26bErr.message}\n`);
    }
  } else {
    process.stdout.write('Step 2.6b skipped: CLEARGATE_SKIP_LIFECYCLE_CHECK=1 set (test seam).\n');
  }

  // BUG-077 ORDERING FIX: 2.6d (child backsync) now runs BEFORE 2.6c (parent
  // rollup). 2.6c judges a parent by its children's FRONTMATTER status, but
  // 2.6d is the step that flips those children from their in-flight status to
  // `Completed` using state.json. With 2.6c first, every parent saw
  // "0/N children terminal" and halted on a first close, even when every child
  // was Done in state.json. The two steps have no dependency in this direction,
  // so swapping them makes the rollup see the truth it was always meant to read.

  // ── Step 2.7: Worktree-Closed Check (CR-022 M1) ──────────────────────────
  // Block close if any .worktrees/STORY-* path is present.
  // Always enforced (STORY-070-01: execution_mode retired).
  // Skip if git worktree list is unavailable (non-fatal — tests run against tmpdirs).
  // Test seams: CLEARGATE_SKIP_WORKTREE_CHECK=1 bypasses entirely;
  //             CLEARGATE_FORCE_WORKTREE_PATHS=p1,p2 injects fake paths (no git call).
  process.stdout.write('Step 2.7: checking for leftover worktrees...\n');
  {
    if (process.env.CLEARGATE_SKIP_WORKTREE_CHECK === '1') {
      process.stdout.write('Step 2.7 skipped: CLEARGATE_SKIP_WORKTREE_CHECK=1 set (test seam).\n');
    } else {
      let leftoverWorktrees = [];
      let worktreeListAvailable = true;

      if (process.env.CLEARGATE_FORCE_WORKTREE_PATHS) {
        // Test seam: inject fake worktree paths without running git
        leftoverWorktrees = process.env.CLEARGATE_FORCE_WORKTREE_PATHS
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean);
      } else {
        try {
          const output = execSync('git worktree list --porcelain', {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          });
          for (const line of output.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('worktree ')) continue;
            const wtPath = trimmed.slice('worktree '.length);
            if (/[/\\]\.worktrees[/\\]STORY-/.test(wtPath)) {
              const m = /(\.(worktrees)[/\\]STORY-.+)$/.exec(wtPath);
              leftoverWorktrees.push(m ? m[1] : wtPath);
            }
          }
        } catch {
          worktreeListAvailable = false;
        }
      }

      // Step 2.7 always enforced (STORY-070-01: execution_mode retired).

      if (!worktreeListAvailable) {
        process.stdout.write('Step 2.7 skipped: git worktree list unavailable (non-fatal).\n');
      } else if (leftoverWorktrees.length === 0) {
        process.stdout.write('Step 2.7 passed: no leftover worktrees.\n');
      } else {
        // Always block close on leftover worktrees
        process.stderr.write(
          `close_sprint: Step 2.7 failed: leftover worktree at ${leftoverWorktrees[0]}\n` +
          `  ${leftoverWorktrees.length === 1 ? '' : `(plus ${leftoverWorktrees.length - 1} more)\n  `}` +
          `Run \`git worktree remove ${leftoverWorktrees[0]}\` if abandoned, or merge the work in progress.\n` +
          `  All worktrees must be closed before sprint close.\n`
        );
        process.exit(1);
      }
    }
  }

  // ── Step 2.8: Sprint branch merged to main (verify-only, NO auto-merge) ──────
  // CR-022 §1: verify-only — script asserts merge ancestry, does NOT run the merge.
  // On miss: list unmerged commits + exit 1 (always enforced).
  // Skip when sprintId has no numeric portion (e.g. SPRINT-TEST fixture) —
  // UNLESS vcs.sprint_pr is enabled, in which case the fail-CLOSED gh/origin
  // gate below still runs regardless (CR-107: a vcs-gated refusal must not
  // be reachable-around via this skip).
  // Test seams: CLEARGATE_SKIP_MERGE_CHECK=1 bypasses entirely;
  //             CLEARGATE_FORCE_MERGE_STATUS=merged|unmerged injects status without git call.
  // CR-107: `vcs.sprint_pr` (read from REPO_ROOT/.cleargate/config.yml, no
  // YAML dependency) gates a merge-via-pull-request path. Fail-CLOSED on an
  // absent `gh` binary or an absent `origin` remote — never silently fall
  // through to the local-merge assumption (unlike Step 2.7's `git worktree
  // list` degradation above, which is intentionally fail-open).
  {
    if (process.env.CLEARGATE_SKIP_MERGE_CHECK === '1') {
      process.stdout.write('Step 2.8 skipped: CLEARGATE_SKIP_MERGE_CHECK=1 set (test seam).\n');
    } else {
      // vcs.sprint_pr fail-CLOSED gate — placed BEFORE the sprintNumMatch
      // test so a non-numeric sprint-id cannot bypass it.
      const vcsSprintPr = readVcsSprintPr(REPO_ROOT);
      if (vcsSprintPr) {
        if (!isGhOnPath()) {
          process.stderr.write(
            `Step 2.8 failed: vcs.sprint_pr is enabled but the gh CLI is not on PATH.\n` +
            `  Install the GitHub CLI (https://cli.github.com), or set vcs.sprint_pr: false in .cleargate/config.yml.\n`
          );
          process.exit(1);
        }
        if (!hasOriginRemote(REPO_ROOT)) {
          process.stderr.write(
            `Step 2.8 failed: vcs.sprint_pr is enabled but no 'origin' remote is configured.\n` +
            `  Add a GitHub 'origin' remote, or set vcs.sprint_pr: false in .cleargate/config.yml.\n`
          );
          process.exit(1);
        }
      }

      const sprintNumMatch = /^SPRINT-(\d{2,3})$/.exec(sprintId);
      if (!sprintNumMatch) {
        process.stdout.write(`Step 2.8 skipped: sprint-id "${sprintId}" has no numeric portion.\n`);
      } else {
        const sprintBranch = `refs/heads/sprint/S-${sprintNumMatch[1]}`;
        let mainRef = 'refs/heads/main';
        process.stdout.write(`Step 2.8: verifying ${sprintBranch} merged to ${mainRef}...\n`);

        // Step 2.8 always enforced (STORY-070-01: execution_mode retired).
        const forcedStatus = process.env.CLEARGATE_FORCE_MERGE_STATUS;
        let isMerged = false;
        let mergeCheckAvailable = true;

        if (forcedStatus === 'merged') {
          isMerged = true;
        } else if (forcedStatus === 'unmerged') {
          isMerged = false;
        } else {
          try {
            execSync(
              `git merge-base --is-ancestor ${sprintBranch} ${mainRef}`,
              { stdio: 'pipe', cwd: REPO_ROOT, env: process.env }
            );
            isMerged = true;
          } catch (mergeErr) {
            const exitStatus = /** @type {any} */ (mergeErr).status;
            if (exitStatus === 1) {
              isMerged = false;
              // CR-107 F2b: local refs/heads/main goes stale after a PR is
              // merged on GitHub, until the human pulls. Fall back to
              // refs/remotes/origin/main — ONLY as a fallback, never a
              // replacement — and only when vcs.sprint_pr is enabled, so
              // the vcs.sprint_pr:false path stays byte-identical to today.
              if (vcsSprintPr && hasOriginRemote(REPO_ROOT)) {
                const originRef = 'refs/remotes/origin/main';
                try {
                  execSync(
                    `git merge-base --is-ancestor ${sprintBranch} ${originRef}`,
                    { stdio: 'pipe', cwd: REPO_ROOT, env: process.env }
                  );
                  isMerged = true;
                  mainRef = originRef;
                } catch {
                  // Still not merged (or origin/main unresolvable). The
                  // local check already established a verdict, so this
                  // fallback never triggers the git-unavailable fail-open
                  // below — it can only confirm a merge, not un-confirm one.
                }
              }
            } else {
              // exit 128: refs missing or other git failure — fail-open with warning
              mergeCheckAvailable = false;
              process.stderr.write(
                `Step 2.8 warning: git merge-base check unavailable (${/** @type {Error} */ (mergeErr).message}). ` +
                `Skipping merge verification.\n`
              );
            }
          }
        }

        if (!mergeCheckAvailable) {
          // fail-open: refs missing or git unavailable — continue to Step 3
        } else if (isMerged) {
          process.stdout.write(`Step 2.8 passed: ${sprintBranch} is merged to ${mainRef}.\n`);
        } else {
          // Always enforced (STORY-070-01: execution_mode retired)
          let unmergedLog = '';
          if (!forcedStatus) {
            try {
              unmergedLog = execSync(
                `git log ${mainRef}..${sprintBranch} --oneline`,
                { encoding: 'utf8', cwd: REPO_ROOT, env: process.env }
              );
            } catch { /* unmerged-log fetch failed — proceed without */ }
          }
          // CR-107 F2a: squash/rebase merges leave no merge commit, so
          // --is-ancestor correctly (if unhelpfully) reports "not merged"
          // for a sprint that WAS merged that way. Name it explicitly via a
          // real probe, never a static string — and only when vcs.sprint_pr
          // is enabled and no forced status short-circuited the real check.
          let squashNote = '';
          if (vcsSprintPr && !forcedStatus && isSquashMerged(sprintBranch, mainRef, REPO_ROOT)) {
            squashNote =
              `  This sprint looks squash- or rebase-merged: its changes are already reachable from ` +
              `${mainRef}, but no merge commit makes ${sprintBranch} an ancestor. Squash and rebase ` +
              `merge strategies are unsupported when vcs.sprint_pr is enabled — merge the pull request ` +
              `with a merge commit instead (gh pr merge --merge).\n`;
          }
          process.stderr.write(
            `Step 2.8 failed: sprint/S-${sprintNumMatch[1]} not merged to main.\n` +
            (unmergedLog ? `  Unmerged commits:\n${unmergedLog}` : '') +
            squashNote +
            `  Resolve: merge sprint/S-${sprintNumMatch[1]} → main, then re-run close_sprint.mjs.\n`
          );
          process.exit(1);
        }
      }
    }
  }

  // ── Step 2.9: Deferred-Verification Close Gate (CR-082) ─────────────────────
  // Block close if any story in this sprint declares a deferred_verification entry
  // with blocks: close and does NOT have a matching green result artifact.
  // NO-OP when no story declares any deferred_verification (the common case — SPRINT-34's path).
  // Fail-open if story-file scan throws (delivery dir absent) — print skip, continue.
  // Test seams: CLEARGATE_SKIP_DEFERRED_VERIFY_CHECK=1 bypasses entirely;
  //             CLEARGATE_FORCE_DEFERRED_VERIFY=<json> injects state without reading files.
  process.stdout.write('Step 2.9: checking deferred verifications...\n');
  {
    if (process.env.CLEARGATE_SKIP_DEFERRED_VERIFY_CHECK === '1') {
      process.stdout.write('Step 2.9 skipped: CLEARGATE_SKIP_DEFERRED_VERIFY_CHECK=1 set (test seam).\n');
    } else {
      /**
       * Parse minimal frontmatter from a markdown file: returns an object of
       * key: value pairs from the located YAML block (BUG-090: found behind a
       * leading `<instructions>` block too, via fenceYaml).
       * List fields (e.g. deferred_verification: [...]) are returned as raw strings.
       * @param {string} raw
       * @returns {Record<string,string>}
       */
      function parseFrontmatterFields(raw) {
        const fm = fenceYaml(raw);
        if (!fm) return {};
        const fields = {};
        for (const line of fm.yaml.split('\n')) {
          const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)/);
          if (m) fields[m[1]] = m[2].trim();
        }
        return fields;
      }

      /**
       * Extract the deferred_verification list from raw frontmatter text.
       * Looks for the multi-line YAML list following `deferred_verification:`.
       * Returns an array of { description?, command, blocks } objects, or [].
       * @param {string} raw
       * @returns {Array<{description?: string, command: string, blocks: string}>}
       */
      function parseDeferredVerifications(raw) {
        const fm = fenceYaml(raw);
        if (!fm) return [];
        const block = fm.yaml;
        // Find the deferred_verification key and its value
        const keyIdx = block.indexOf('deferred_verification:');
        if (keyIdx === -1) return [];
        const afterKey = block.slice(keyIdx + 'deferred_verification:'.length);
        const inlineVal = afterKey.match(/^\s*\[([^\]]*)\]/);
        if (inlineVal) {
          const inner = inlineVal[1].trim();
          if (!inner) return []; // empty list []
        }
        // Parse YAML-list items: lines starting with "- " at same or deeper indent
        // For simplicity: if the inline value is empty or the list is multi-line,
        // scan for list entries. A minimal deferred_verification entry has a `command:` field.
        const lines = afterKey.split('\n');
        const entries = [];
        let currentEntry = null;
        for (const line of lines) {
          const listItem = line.match(/^(\s*)-\s+(.*)/);
          const keyVal = line.match(/^\s+([a-zA-Z_]+)\s*:\s*(.*)/);
          if (listItem) {
            if (currentEntry) entries.push(currentEntry);
            currentEntry = {};
            const rest = listItem[2].trim();
            if (rest.startsWith('{')) {
              // Inline object: { description: ..., command: ..., blocks: ... }
              const descM = rest.match(/description\s*:\s*([^,}]+)/);
              const cmdM = rest.match(/command\s*:\s*([^,}]+)/);
              const blkM = rest.match(/blocks\s*:\s*([^,}]+)/);
              if (descM) currentEntry.description = descM[1].trim().replace(/['"]/g, '');
              if (cmdM) currentEntry.command = cmdM[1].trim().replace(/['"]/g, '');
              if (blkM) currentEntry.blocks = blkM[1].trim().replace(/['"]/g, '');
            }
          } else if (keyVal && currentEntry !== null) {
            const k = keyVal[1].trim();
            const v = keyVal[2].trim().replace(/['"]/g, '');
            currentEntry[k] = v;
          } else if (line.match(/^[a-zA-Z_]/) && !line.match(/^\s/)) {
            // Hit a top-level key — end of list
            break;
          }
        }
        if (currentEntry) entries.push(currentEntry);
        // Filter to only entries that have a command (valid entries)
        return entries.filter((e) => e && (e.command || e.blocks));
      }

      // Determine the declared deferred-verify entries per story
      /** @type {Record<string, {declared: Array<{command:string,blocks:string}>, result: string|null}>} */
      let deferredMap = {};
      let storyFileScanAvailable = true;

      if (process.env.CLEARGATE_FORCE_DEFERRED_VERIFY) {
        // Test seam: inject state without reading real story files
        try {
          deferredMap = JSON.parse(process.env.CLEARGATE_FORCE_DEFERRED_VERIFY);
        } catch (parseErr) {
          process.stderr.write(
            `Step 2.9 warning: CLEARGATE_FORCE_DEFERRED_VERIFY is not valid JSON: ${/** @type {Error} */ (parseErr).message}\n`
          );
          storyFileScanAvailable = false;
        }
      } else {
        // Scan delivery/pending-sync/ + delivery/archive/ for sprint's story files
        try {
          const deliveryBase = path.join(REPO_ROOT, '.cleargate', 'delivery');
          const dirsToScan = [
            path.join(deliveryBase, 'pending-sync'),
            path.join(deliveryBase, 'archive'),
          ];
          for (const dir of dirsToScan) {
            if (!fs.existsSync(dir)) continue;
            for (const fname of fs.readdirSync(dir)) {
              if (!fname.endsWith('.md')) continue;
              const fpath = path.join(dir, fname);
              let raw;
              try {
                raw = fs.readFileSync(fpath, 'utf8');
              } catch {
                continue;
              }
              const fields = parseFrontmatterFields(raw);
              if (fields['sprint_cleargate_id'] !== sprintId) continue;
              // This file belongs to the sprint — check for deferred_verification
              const entries = parseDeferredVerifications(raw);
              const storyId = fields['story_id'] || fields['cr_id'] || fname.replace('.md', '');
              if (entries.length > 0) {
                deferredMap[storyId] = { declared: entries, result: null };
              }
            }
          }
        } catch (scanErr) {
          storyFileScanAvailable = false;
          process.stdout.write(
            `Step 2.9 skipped: story-file scan unavailable (non-fatal): ${/** @type {Error} */ (scanErr).message}\n`
          );
        }
      }

      if (!storyFileScanAvailable) {
        // fail-open: scan threw, already printed message above
      } else {
        // Check: any stories with deferred_verification declared?
        const storiesWithDeferred = Object.keys(deferredMap);
        if (storiesWithDeferred.length === 0) {
          // NO-OP: no deferred verifications — silent pass (SPRINT-34's own close path)
          process.stdout.write('Step 2.9 passed: no deferred verifications declared.\n');
        } else {
          const deferred_verify_dir = path.join(sprintDir, 'deferred-verify');
          const failures = [];

          for (const storyId of storiesWithDeferred) {
            const { declared, result: forcedResult } = deferredMap[storyId];
            const closeEntries = declared.filter(
              (e) => !e.blocks || e.blocks === 'close'
            );
            if (closeEntries.length === 0) continue;

            if (forcedResult !== undefined && forcedResult !== null) {
              // Test seam: result injected via CLEARGATE_FORCE_DEFERRED_VERIFY
              if (forcedResult !== 'green') {
                for (const entry of closeEntries) {
                  failures.push({ storyId, command: entry.command, reason: forcedResult ?? 'unrun' });
                }
              }
            } else {
              // Read result artifact from deferred-verify/<STORY-ID>.json
              const resultFile = path.join(deferred_verify_dir, `${storyId}.json`);
              if (!fs.existsSync(resultFile)) {
                for (const entry of closeEntries) {
                  failures.push({ storyId, command: entry.command, reason: 'no result file' });
                }
              } else {
                let resultJson;
                try {
                  resultJson = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
                } catch {
                  for (const entry of closeEntries) {
                    failures.push({ storyId, command: entry.command, reason: 'unreadable result file' });
                  }
                  continue;
                }
                if (resultJson.status !== 'green' || resultJson.exit_code !== 0) {
                  for (const entry of closeEntries) {
                    failures.push({
                      storyId,
                      command: entry.command,
                      reason: `status=${resultJson.status ?? 'unknown'} exit_code=${resultJson.exit_code ?? 'unknown'}`,
                    });
                  }
                }
              }
            }
          }

          if (failures.length > 0) {
            process.stderr.write(
              `Step 2.9 failed: ${failures.length} deferred verification(s) not green:\n`
            );
            for (const f of failures) {
              process.stderr.write(
                `  - ${f.storyId}: command="${f.command}" reason=${f.reason}\n`
              );
            }
            process.stderr.write(
              `  Run each command, write the result to ${deferred_verify_dir}/<STORY-ID>.json,\n` +
              `  then re-run close_sprint.mjs.\n`
            );
            process.exit(1);
          } else {
            process.stdout.write(
              `Step 2.9 passed: all ${storiesWithDeferred.length} story/stories' deferred verifications are green.\n`
            );
          }
        }
      }
    }
  }

  // ── Step 3: Invoke prefill_report.mjs ─────────────────────────────────────
  process.stdout.write('Step 3: running prefill_report.mjs...\n');
  try {
    invokeScript('prefill_report.mjs', [sprintId], {
      CLEARGATE_STATE_FILE: stateFile,
      CLEARGATE_SPRINT_DIR: sprintDir,
    });
  } catch (err) {
    process.stderr.write(`Error: prefill_report.mjs failed: ${err.message}\n`);
    process.exit(1);
  }

  // ── Step 3.5: Build curated Reporter context bundle ───────────────────────
  const bundlePath = path.join(sprintDir, '.reporter-context.md');
  const MIN_BUNDLE_BYTES = 2048;
  if (process.env.CLEARGATE_SKIP_BUNDLE_CHECK === '1') {
    process.stdout.write('Step 3.5 skipped: CLEARGATE_SKIP_BUNDLE_CHECK=1 set (test seam).\n');
  } else {
    process.stdout.write('Step 3.5: building Reporter context bundle...\n');
    try {
      invokeScript('prep_reporter_context.mjs', [sprintId], {
        CLEARGATE_STATE_FILE: stateFile,
        CLEARGATE_SPRINT_DIR: sprintDir,
      });
      if (!fs.existsSync(bundlePath)) {
        throw new Error(`bundle not written at ${bundlePath}`);
      }
      const bundleSize = fs.statSync(bundlePath).size;
      // BUG-082: the size floor is a smoke test for a TRUNCATED bundle, but it
      // cannot tell "truncated" from "legitimately smaller". A sprint with no
      // token ledger (BUG-081 — hooks never fired, cross-repo orchestration,
      // a hand-run sprint) produces a valid bundle that is simply missing its
      // cost section, and the floor rejected it — blocking close for absent
      // data rather than bad data.
      //
      // Structure is the real signal: a bundle that carries its required
      // headings is complete regardless of byte count.
      const bundleText = fs.readFileSync(bundlePath, 'utf8');
      const REQUIRED_BUNDLE_HEADINGS = [
        '## Sprint Plan Slices',
        '## State.json Summary',
        '## REPORT Template',
      ];
      const missingHeadings = REQUIRED_BUNDLE_HEADINGS.filter((h) => !bundleText.includes(h));
      if (bundleSize < MIN_BUNDLE_BYTES && missingHeadings.length > 0) {
        throw new Error(
          `bundle too small (${bundleSize}B < ${MIN_BUNDLE_BYTES}B) AND missing required ` +
          `section(s) ${missingHeadings.join(', ')}: ${bundlePath}`
        );
      }
      if (bundleSize < MIN_BUNDLE_BYTES) {
        process.stdout.write(
          `Step 3.5 note: bundle is ${bundleSize}B (under the ${MIN_BUNDLE_BYTES}B smoke-test floor) ` +
          `but carries every required section — accepting. A sprint with no token ledger is ` +
          `legitimately smaller.\n`
        );
      }
      process.stdout.write(`Step 3.5 passed: ${bundlePath} ready (${Math.round(bundleSize / 1024)}KB).\n`);
    } catch (err) {
      // Always enforced (STORY-070-01: execution_mode retired)
      const msg = /** @type {Error} */ (err).message;
      process.stderr.write(
        `close_sprint: Step 3.5 FAILED: ${msg}\n` +
        `  Cannot dispatch Reporter without bundle. Fix prep_reporter_context.mjs.\n` +
        `  Diagnostic: node .cleargate/scripts/prep_reporter_context.mjs ${sprintId}\n`
      );
      process.exit(1);
    }
  }

  // ── Step 4: Orchestrator spawns Reporter separately ───────────────────────
  // This script only validates preconditions; it does NOT fork the Reporter agent.
  const reportFile = reportFilename(sprintDir, sprintId);
  const reportBasename = path.basename(reportFile);
  process.stdout.write(
    'Step 4: preconditions satisfied — orchestrator should now spawn the Reporter agent.\n' +
    `        The Reporter writes ${reportBasename} using the sprint_report.md template.\n` +
    `        Expected output: ${reportFile}\n`
  );

  // ── Step 4.5 (STORY-014-10): --report-body-stdin fallback ────────────────
  // Orchestrator pipes the Reporter's markdown body here when the Reporter's
  // Write tool is blocked. Refuses empty stdin + pre-existing report file.
  if (reportBodyStdin) {
    if (fs.existsSync(reportFile)) {
      process.stderr.write(
        `Error: ${reportBasename} already exists at ${reportFile}\n` +
        'Delete it or skip --report-body-stdin mode to use the primary Reporter-write path.\n'
      );
      process.exit(1);
    }
    let body;
    try {
      body = fs.readFileSync(0, 'utf8');
    } catch (err) {
      process.stderr.write(`Error: failed to read stdin: ${/** @type {Error} */ (err).message}\n`);
      process.exit(1);
    }
    if (!body || body.trim().length === 0) {
      process.stderr.write('Error: empty report body — refusing to write.\n');
      process.exit(1);
    }
    atomicWriteString(reportFile, body);
    process.stdout.write(
      `Step 4.5 (stdin mode): ${reportBasename} written (${body.length} bytes) at ${reportFile}\n`
    );
    // Fall through to Step 5 + 6 + 7 unconditionally — stdin mode implies ack.
  } else if (!assumeAck) {
    // Apply read-fallback for legacy sprints (e.g. SPRINT-15 with plain REPORT.md)
    const reportFileForCheck = reportFilename(sprintDir, sprintId, { forRead: true });
    if (!fs.existsSync(reportFileForCheck)) {
      process.stdout.write(
        `\nWaiting for Reporter to produce ${reportBasename}...\n` +
        'After Reporter succeeds, re-run with --assume-ack to complete the close.\n' +
        '--assume-ack is refused unless CLEARGATE_CI_ACK=1 (enforcement §12.3).\n'
      );
      process.exit(0);
    }
    // In non-assume-ack mode with existing report, prompt user
    process.stdout.write(
      `\n${reportBasename} found at ${reportFileForCheck}\n` +
      'Review the report, then confirm close by re-running with --assume-ack\n' +
      '--assume-ack is refused unless CLEARGATE_CI_ACK=1 (enforcement §12.3).\n'
    );
    process.exit(0);
  }

  // ── Step 5: Flip sprint_status to "Completed" ────────────────────────────
  process.stdout.write('Step 5: flipping sprint_status to "Completed"...\n');
  const now = new Date().toISOString();
  state.sprint_status = 'Completed';
  state.last_action = `close_sprint: sprint ${sprintId} completed`;
  state.updated_at = now;
  atomicWrite(stateFile, state);
  process.stdout.write(`sprint_status flipped to "Completed" at ${now}\n`);

  // ── Step 6: Invoke suggest_improvements.mjs unconditionally ───────────────
  process.stdout.write('Step 6: running suggest_improvements.mjs...\n');
  try {
    invokeScript('suggest_improvements.mjs', [sprintId], {
      CLEARGATE_STATE_FILE: stateFile,
      CLEARGATE_SPRINT_DIR: sprintDir,
    });
  } catch (err) {
    // suggest_improvements failure is non-fatal — log but do not abort
    process.stderr.write(`Warning: suggest_improvements.mjs failed: ${/** @type {Error} */ (err).message}\n`);
    process.stderr.write('Sprint is still marked Completed; improvement suggestions may be incomplete.\n');
  }

  // ── Step 6.5: Run sprint_trends.mjs (stub — full impl deferred to CR-027) ──
  if (process.env.CLEARGATE_SKIP_SPRINT_TRENDS !== '1') {
    process.stdout.write('Step 6.5: running sprint_trends.mjs (stub)...\n');
    try {
      invokeScript('sprint_trends.mjs', [sprintId], {
        CLEARGATE_STATE_FILE: stateFile,
        CLEARGATE_SPRINT_DIR: sprintDir,
      });
    } catch (err) {
      // Non-fatal — sprint stays Completed; trends are advisory only.
      process.stderr.write(`Step 6.5 warning: sprint_trends.mjs failed: ${/** @type {Error} */ (err).message}\n`);
    }
  }

  // ── Step 6.6: Skill-candidate detection (folds into suggest_improvements.mjs) ──
  if (process.env.CLEARGATE_SKIP_SKILL_CANDIDATES !== '1') {
    process.stdout.write('Step 6.6: scanning for skill candidates...\n');
    try {
      invokeScript('suggest_improvements.mjs', [sprintId, '--skill-candidates'], {
        CLEARGATE_STATE_FILE: stateFile,
        CLEARGATE_SPRINT_DIR: sprintDir,
      });
    } catch (err) {
      process.stderr.write(`Step 6.6 warning: skill-candidate scan failed: ${/** @type {Error} */ (err).message}\n`);
    }
  }

  // ── Step 6.7: FLASHCARD cleanup pass (folds into suggest_improvements.mjs) ──
  if (process.env.CLEARGATE_SKIP_FLASHCARD_CLEANUP !== '1') {
    process.stdout.write('Step 6.7: scanning FLASHCARD.md for cleanup candidates...\n');
    try {
      invokeScript('suggest_improvements.mjs', [sprintId, '--flashcard-cleanup'], {
        CLEARGATE_STATE_FILE: stateFile,
        CLEARGATE_SPRINT_DIR: sprintDir,
      });
    } catch (err) {
      process.stderr.write(`Step 6.7 warning: FLASHCARD cleanup scan failed: ${/** @type {Error} */ (err).message}\n`);
    }
  }

  // ── Step 7: Auto-push per-artifact status updates to MCP ─────────────────
  // Runs after Gate 4 ack succeeds. Non-fatal: sprint stays Completed on failure.
  process.stdout.write('Step 7: pushing per-artifact status updates to MCP...\n');
  try {
    const cliBin = resolveCliBin(REPO_ROOT);
    if (cliBin !== null) {
      // cleargate sync work-items takes ZERO positional args (verified cli.ts:592-598).
      // CR-021 §3.2.3 spec shows a sprint-id arg — that is spec drift; drop it.
      execSync(`node ${JSON.stringify(cliBin)} sync work-items`, {
        stdio: 'inherit',
        env: process.env,
        timeout: 30000,
      });
      process.stdout.write('Step 7 passed: work-item statuses synced.\n');
    } else {
      process.stdout.write('Step 7 skipped: CLI binary not found (non-fatal).\n');
    }
  } catch (err) {
    // Non-fatal — sprint stays Completed; sync can be retried manually
    process.stderr.write(`Step 7 warning: sync work-items failed: ${/** @type {Error} */ (err).message}\n`);
    process.stderr.write('Run `cleargate sync work-items` manually to retry.\n');
  }

  // ── Step 7.4: MCP push of sprint plan + report ───────────────────────────────
  // CR-064: mcp push sprint plan + report
  // Runs after Step 7 (work-item sync) and BEFORE Step 7.5 (CR-063 wiki ingest).
  // Per SDR-locked ordering: MCP push first, wiki ingest second (CR-064 §0.5 Q4 accepted).
  // Non-fatal on failure: sprint stays Completed. MCP push can be retried manually.
  process.stdout.write('Step 7.4: pushing sprint plan + report to MCP...\n');
  try {
    const cliBin74 = resolveCliBin(REPO_ROOT);
    if (cliBin74 !== null) {
      // Resolve sprint plan path: prefer archive/, fall back to pending-sync/
      const deliveryBase = path.join(REPO_ROOT, '.cleargate', 'delivery');
      const archiveDir = path.join(deliveryBase, 'archive');
      const pendingDir = path.join(deliveryBase, 'pending-sync');
      let planPath = null;
      for (const dir of [archiveDir, pendingDir]) {
        if (!fs.existsSync(dir)) continue;
        const match = fs.readdirSync(dir).find(
          (f) => f.startsWith(sprintId + '_') && f.endsWith('.md'),
        );
        if (match) { planPath = path.join(dir, match); break; }
      }
      if (planPath && fs.existsSync(planPath)) {
        try {
          execSync(`node ${JSON.stringify(cliBin74)} push ${JSON.stringify(planPath)}`, {
            stdio: 'inherit',
            env: process.env,
            timeout: 60000,
          });
          process.stdout.write('Step 7.4a passed: sprint plan pushed to MCP.\n');
        } catch (err74a) {
          process.stderr.write(`Step 7.4a warning: sprint plan push failed: ${/** @type {Error} */ (err74a).message}\n`);
        }
      } else {
        process.stdout.write('Step 7.4a skipped: sprint plan file not found.\n');
      }
      // Resolve sprint report path: reuses reportFile resolved via legacy-fallback in Step 4
      if (reportFile && fs.existsSync(reportFile)) {
        try {
          execSync(`node ${JSON.stringify(cliBin74)} push ${JSON.stringify(reportFile)}`, {
            stdio: 'inherit',
            env: process.env,
            timeout: 60000,
          });
          process.stdout.write('Step 7.4b passed: sprint report pushed to MCP.\n');
        } catch (err74b) {
          process.stderr.write(`Step 7.4b warning: sprint report push failed: ${/** @type {Error} */ (err74b).message}\n`);
        }
      } else {
        process.stdout.write('Step 7.4b skipped: sprint report file not found (legacy sprint or report not yet written).\n');
      }
    } else {
      process.stdout.write('Step 7.4 skipped: CLI binary not found (non-fatal).\n');
    }
  } catch (err) {
    // Non-fatal — sprint stays Completed; MCP push can be retried manually
    process.stderr.write(`Step 7.4 warning: MCP push failed: ${/** @type {Error} */ (err).message}\n`);
    process.stderr.write('Run `cleargate push <plan-or-report-path>` manually to retry.\n');
  }

  // ── Step 7.5: wiki ingest sprint report ──────────────────────────────────
  // CR-063: wiki ingest sprint report
  // Runs after Step 7 (MCP sync). Non-fatal: sprint stays Completed on failure.
  // CR-064 (Wave 3) inserts its MCP-push step at Step 7.4, immediately before this anchor.
  process.stdout.write('Step 7.5: ingesting sprint report into wiki...\n');
  try {
    const cliBin = resolveCliBin(REPO_ROOT);
    if (cliBin !== null) {
      // Resolve report path using the same legacy-fallback rule as Step 4
      // (SPRINT-NN_REPORT.md preferred; fall back to REPORT.md for legacy sprints)
      const reportPath = reportFile; // reportFile is already resolved via legacy-fallback in Step 4
      if (fs.existsSync(reportPath)) {
        execSync(`node ${JSON.stringify(cliBin)} wiki ingest ${JSON.stringify(reportPath)}`, {
          stdio: 'inherit',
          env: process.env,
          timeout: 60000,
        });
        process.stdout.write('Step 7.5 passed: sprint report ingested into wiki.\n');
      } else {
        process.stdout.write('Step 7.5 skipped: report file not found (legacy sprint or report not yet written).\n');
      }
    } else {
      process.stdout.write('Step 7.5 skipped: CLI binary not found (non-fatal).\n');
    }
  } catch (err) {
    // Non-fatal — sprint stays Completed; ingest can be retried manually
    process.stderr.write(`Step 7.5 warning: wiki ingest sprint report failed: ${/** @type {Error} */ (err).message}\n`);
    process.stderr.write('Run `cleargate wiki ingest <report-path>` manually to retry.\n');
  }

  // ── Step 8: Verbose post-close handoff list ───────────────────────────────
  // Prints 6 explicit next-step items to stdout (CR-022 §3 M4).
  {
    const sprintNumMatch = /^SPRINT-(\d{2,3})$/.exec(sprintId);
    const nextSprintNum = sprintNumMatch
      ? String(parseInt(sprintNumMatch[1], 10) + 1).padStart(sprintNumMatch[1].length, '0')
      : null;
    const nextSprintId = nextSprintNum ? `SPRINT-${nextSprintNum}` : '<next-sprint-id>';
    const reportBasename = path.basename(reportFile);
    const suggestionsPath = path.join(sprintDir, 'improvement-suggestions.md');

    process.stdout.write(`\n${sprintId} closed. Next steps:\n`);
    process.stdout.write(`  1. Review ${reportBasename}\n`);
    process.stdout.write(
      `  2. Review improvement-suggestions.md (sections: Suggestions / Skill Candidates / FLASHCARD Cleanup)\n`,
    );
    process.stdout.write(
      `  3. Approve or reject Skill Candidates → run /improve or cleargate skill create <name>\n`,
    );
    process.stdout.write(
      `  4. Approve or reject FLASHCARD cleanup entries → run /improve or cleargate flashcard prune\n`,
    );
    process.stdout.write(
      `  5. Push approved status changes to MCP if Step 7 warned (\`cleargate sync work-items\`)\n`,
    );
    process.stdout.write(
      `  6. Initialize next sprint: \`cleargate sprint init ${nextSprintId} --stories <ids>\`\n`,
    );

    // Surface artifact paths for convenience
    process.stdout.write(`\nArtifacts:\n`);
    process.stdout.write(`  report:               ${reportFile}\n`);
    process.stdout.write(`  improvement-suggestions: ${suggestionsPath}\n`);
  }
}

await main();
