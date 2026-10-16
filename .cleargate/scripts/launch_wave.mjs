#!/usr/bin/env node
/**
 * launch_wave.mjs — STORY-033-04 (EPIC-033 capstone): Parallel-Wave Execution + Barrier.
 *
 * Drives a `parallel()` Workflow of one worktree-isolated segment per story in an
 * Architect-planned wave (waves.json, produced by STORY-033-03), mints a stable per-thunk
 * RUN_ID for each segment, and returns the array of schema-typed segment verdicts to the
 * Orchestrator at the barrier. The Orchestrator consolidates serially: validate → process
 * flashcards (between-wave) → merge GREEN stories one worktree at a time → restore env.
 *
 * This launcher IS the execution path: every wave runs through it via the Workflow tool
 * (`/workflows`). The testable JS surface is the exported `validateVerdicts` barrier validator
 * plus the helper constructors; the `parallel()` dispatch is driven by the live Workflow runtime.
 *
 * Spike facts honored (STORY-033-01-spike-result.md, FLASHCARD #workflow #token-ledger #worktree):
 *   - Per-agent SubagentStop attribution is DEAD under workflows → the barrier writes one
 *     ledger row per segment from `verdict.tokens`, keyed by RUN_ID (STORY-033-02 owns the write).
 *   - `PreToolUse:Task` never fires under workflows → no dispatch-marker auto-attribution.
 *   - Per-thunk child env is NOT settable → the Orchestrator sets `SKIP_FLASHCARD_GATE=1` in
 *     its OWN env before launch (inherited by all children) and restores it at the barrier.
 *   - `isolation:'worktree'` checks out tracked-files-only off the wrong base → segments use
 *     ClearGate's OWN `git worktree add .worktrees/STORY-X -b story/STORY-X sprint/S-NN`.
 *   - `resumeFromRunId` caches completed GREEN agents (0 tokens on replay) → complete-then-resume
 *     re-dispatches only the ESCALATED/BLOCKED segment.
 *
 * Verdict schema (discriminated union, STORY-033-04 §1.2 — inherits protocol §23):
 *   {
 *     verdict: 'GREEN' | 'ESCALATED' | 'BLOCKED',
 *     storyId: string,
 *     runId: string,
 *     devSha: string,
 *     qaSha: string,
 *     archSha?: string,
 *     flashcards_flagged: string[],
 *     counters: { qa_bounces: number, arch_bounces: number, breaker_hits: number },
 *     tokens: { input, output, cache_creation, cache_read, model },
 *     blocker?: { type, message }   // REQUIRED iff verdict !== 'GREEN'
 *   }
 *   blocker.type ∈ the five §22 true-blocker kinds.
 *
 * Serial mode (STORY-058-12, protocol §23.5): `validateVerdicts(verdicts, { mode: 'serial' })`,
 * called by `dispatch_serial.mjs` on hosts that declare `dispatchMode: serial`. It differs from
 * the default mode (`{ mode: 'wave' }`, or no options) in exactly two places:
 *   - `tokens` may be exactly `{ metering: 'unavailable' }` (its only own key); any other
 *     `metering` value, or any extra key beside it (a synthesized `input: 0`), is rejected;
 *   - a non-GREEN verdict may carry `devSha: null` / `qaSha: null` when that commit does not
 *     exist; an absent key is still rejected, and GREEN still requires both SHAs.
 *   The default mode accepts and rejects exactly as it did before serial mode existed.
 */

import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants — the verdict discriminated-union vocabulary (protocol §23).
// ---------------------------------------------------------------------------

/** The three terminal verdict states a segment may return at the barrier. */
export const VERDICT_KINDS = Object.freeze(['GREEN', 'ESCALATED', 'BLOCKED']);

/**
 * The five protocol-§22 true-blocker kinds. A non-GREEN verdict's `blocker.type`
 * MUST be one of these (inherited verbatim from §22 — do not redefine here).
 */
export const BLOCKER_TYPES = Object.freeze([
  'destructive', // force-push, git reset --hard, drop table, delete untracked file, kill process
  'secret', // reading .env / fetching a secret / persisting credential material
  'user-intent', // a genuine "what does the user want?" not inferable from goal/Gherkin
  'technical-impossibility', // required infra unavailable (test DB unreachable, MCP down)
  'spec-contradiction', // story Gherkin self-contradicts or two wave stories collide on a shared surface
]);

/** Required scalar fields present on EVERY verdict regardless of discriminant. */
const REQUIRED_SCALAR_FIELDS = Object.freeze(['storyId', 'runId', 'devSha', 'qaSha']);

/** Required `tokens` sub-fields (per-segment cost the barrier writes to the ledger). */
const REQUIRED_TOKEN_FIELDS = Object.freeze([
  'input',
  'output',
  'cache_creation',
  'cache_read',
  'model',
]);

/** Required `counters` sub-fields. */
const REQUIRED_COUNTER_FIELDS = Object.freeze(['qa_bounces', 'arch_bounces', 'breaker_hits']);

// ---------------------------------------------------------------------------
// RUN_ID minting — one stable, distinct id per wave segment.
// ---------------------------------------------------------------------------

/**
 * Mint a stable, distinct RUN_ID for a wave segment. Stable so a resumeFromRunId replay
 * can re-key the same segment; distinct so sibling segments do not collide on the
 * RUN_ID-keyed ledger row STORY-033-02 writes.
 *
 * @param {string} storyId   The story this segment executes (e.g. "STORY-033-04").
 * @param {string} sprintId  The active sprint (e.g. "SPRINT-32").
 * @returns {string}         A run id of the form "run-<sprint>-<story>-<8hex>".
 */
export function mintRunId(storyId, sprintId) {
  const entropy = crypto.randomBytes(4).toString('hex');
  const story = String(storyId || 'STORY-UNKNOWN').replace(/[^A-Za-z0-9-]/g, '');
  const sprint = String(sprintId || 'SPRINT-UNKNOWN').replace(/[^A-Za-z0-9-]/g, '');
  return `run-${sprint}-${story}-${entropy}`;
}

// ---------------------------------------------------------------------------
// Worktree command construction (spike decision 2 — ClearGate-managed worktrees).
// ---------------------------------------------------------------------------

/**
 * Build the bash `git worktree add` command for a segment. ClearGate manages its OWN
 * worktrees (NOT the Workflow tool's `isolation:'worktree'`, which checks out
 * tracked-files-only off the wrong base — spike decision 2). Worktrees are pre-created
 * SERIALLY at wave launch to avoid concurrent `git worktree add` racing the repo index.
 *
 * @param {string} storyId       e.g. "STORY-033-04"
 * @param {string} sprintBranch  the base ref (the sprint branch, or a contract branch from a
 *                               `schema_version: 2` plan), e.g. "sprint/S-32"
 * @returns {string}             the bash command string
 */
export function worktreeAddCommand(storyId, sprintBranch) {
  const story = String(storyId);
  return `git worktree add .worktrees/${story} -b story/${story} ${sprintBranch}`;
}

/** CR-124: per-story worktree bases from a plan. No schema_version → {} (no per-story bases). */
export function storyBases(plan) {
  if (!plan || plan.schema_version === undefined) return {};
  if (plan.schema_version !== 2) throw new TypeError(`storyBases: unsupported schema_version ${plan.schema_version}`);
  const contractBranches = new Set((plan.contracts ?? []).map((c) => c && c.branch));
  const out = {};
  for (const [id, entry] of Object.entries(plan.stories ?? {})) {
    if (!entry || typeof entry.base !== 'string' || entry.base === '') continue;
    if (!/^[A-Za-z0-9._\/-]+$/.test(entry.base)) throw new TypeError(`storyBases: ${id} has an unsafe base '${entry.base}'`);
    if (entry.base.startsWith('contract/') && !contractBranches.has(entry.base)) throw new TypeError(`storyBases: ${id} names undeclared contract '${entry.base}'`);
    out[id] = entry.base;
  }
  return out;
}
/** CR-124: true iff every `upstream` story of storyId is in mergedIds. No schema_version → true (no edges). */
export function integrationReady(plan, storyId, mergedIds) {
  if (!plan || plan.schema_version === undefined) return true;
  const entry = plan.stories?.[storyId];
  if (!entry) throw new Error(`integrationReady: unknown story ${storyId}`);
  const merged = new Set(mergedIds ?? []);
  return (entry.upstream ?? []).every((u) => merged.has(u));
}

// ---------------------------------------------------------------------------
// Barrier verdict validator (EXPORTED — STORY-033-04 §1.2 / §4.1).
// ---------------------------------------------------------------------------

/** The validation modes `validateVerdicts` accepts (STORY-058-12). 'wave' is the default. */
const VALIDATION_MODES = Object.freeze(['wave', 'serial']);

/** The SHA fields a non-GREEN serial verdict may set to null (no such commit exists). */
const SERIAL_NULLABLE_SHA_FIELDS = Object.freeze(['devSha', 'qaSha']);

/**
 * Internal: validate a single verdict, returning a human-readable reason string when it
 * is malformed, or null when it is well-formed. Never throws — the array-level
 * `validateVerdicts` owns the throw so it can name the offending storyId.
 *
 * @param {unknown} v
 * @param {'wave'|'serial'} [mode]  'serial' adds the two serial-mode deltas (header block)
 * @returns {string|null}  malformation reason, or null if valid
 */
function verdictMalformationReason(v, mode = 'wave') {
  if (v === null || typeof v !== 'object') {
    return 'verdict is not an object';
  }
  const verdict = /** @type {Record<string, unknown>} */ (v);

  // Discriminant must be one of the three known verdict kinds.
  if (!VERDICT_KINDS.includes(/** @type {string} */ (verdict.verdict))) {
    return `'verdict' must be one of ${VERDICT_KINDS.join(', ')} (got ${JSON.stringify(verdict.verdict)})`;
  }

  // Required scalar fields. Serial mode: a non-GREEN verdict may carry a null SHA.
  const nullableShas = mode === 'serial' && verdict.verdict !== 'GREEN';
  for (const field of REQUIRED_SCALAR_FIELDS) {
    if (nullableShas && SERIAL_NULLABLE_SHA_FIELDS.includes(field)) {
      if (verdict[field] === null) continue;
      if (typeof verdict[field] !== 'string' || verdict[field] === '') {
        return `'${field}' must be a non-empty string, or null on a non-GREEN serial verdict`;
      }
      continue;
    }
    if (typeof verdict[field] !== 'string' || verdict[field] === '') {
      return `missing or empty required field '${field}'`;
    }
  }

  // flashcards_flagged must be an array (may be empty).
  if (!Array.isArray(verdict.flashcards_flagged)) {
    return `'flashcards_flagged' must be an array`;
  }

  // counters object with the three required numeric sub-fields.
  const counters = verdict.counters;
  if (counters === null || typeof counters !== 'object') {
    return `missing required 'counters' object`;
  }
  for (const field of REQUIRED_COUNTER_FIELDS) {
    if (typeof (/** @type {Record<string, unknown>} */ (counters))[field] !== 'number') {
      return `'counters.${field}' must be a number`;
    }
  }

  // tokens object with the five required sub-fields (per-segment cost the ledger consumes).
  const tokens = verdict.tokens;
  if (tokens === null || typeof tokens !== 'object') {
    return `missing required 'tokens' object`;
  }
  if (mode === 'serial' && Object.prototype.hasOwnProperty.call(tokens, 'metering')) {
    // Serial mode: explicit unavailable metering, never a synthesized (zero) usage object.
    const t = /** @type {Record<string, unknown>} */ (tokens);
    if (Reflect.ownKeys(t).length !== 1 || t.metering !== 'unavailable') {
      return `'tokens' must be the measured object or exactly { metering: 'unavailable' }`;
    }
  } else {
    for (const field of REQUIRED_TOKEN_FIELDS) {
      const val = (/** @type {Record<string, unknown>} */ (tokens))[field];
      if (field === 'model') {
        if (typeof val !== 'string' || val === '') return `'tokens.model' must be a non-empty string`;
      } else if (typeof val !== 'number') {
        return `'tokens.${field}' must be a number`;
      }
    }
  }

  // blocker is REQUIRED iff verdict !== GREEN (§1.2).
  if (verdict.verdict !== 'GREEN') {
    const blocker = verdict.blocker;
    if (blocker === null || blocker === undefined || typeof blocker !== 'object') {
      return `non-GREEN verdict (${verdict.verdict}) is missing the required 'blocker' object`;
    }
    const b = /** @type {Record<string, unknown>} */ (blocker);
    if (!BLOCKER_TYPES.includes(/** @type {string} */ (b.type))) {
      return `'blocker.type' must be one of the §22 true-blocker kinds ${BLOCKER_TYPES.join(', ')} (got ${JSON.stringify(b.type)})`;
    }
    if (typeof b.message !== 'string' || b.message === '') {
      return `'blocker.message' must be a non-empty string`;
    }
  }

  return null;
}

/**
 * Barrier validator. Accepts a well-formed verdict array; raises a validation Error NAMING
 * the offending `storyId` on the first malformed verdict (missing required field, unknown
 * discriminant, or non-GREEN without a valid `blocker`). The named segment is the one the
 * Orchestrator marks ESCALATED (no ledger row); sibling GREEN verdicts consolidate.
 *
 * `options.mode` selects the contract: 'wave' (the default, also when `options` or its
 * `mode` is absent) or 'serial' (STORY-058-12 — see the header's serial-mode block).
 *
 * @param {unknown[]} verdicts
 * @param {{ mode?: 'wave'|'serial' }} [options]
 * @returns {void}
 * @throws {TypeError} on an unknown `options.mode`, before any verdict is inspected.
 * @throws {Error} when any verdict is malformed — message contains the offending storyId.
 */
export function validateVerdicts(verdicts, options) {
  const mode = options == null || options.mode === undefined ? 'wave' : options.mode;
  if (!VALIDATION_MODES.includes(mode)) {
    throw new TypeError(`validateVerdicts: unknown mode '${String(mode)}'`);
  }

  if (!Array.isArray(verdicts)) {
    throw new Error(
      `validateVerdicts: expected an array of segment verdicts, got ${typeof verdicts}.`,
    );
  }

  for (const v of verdicts) {
    const reason = verdictMalformationReason(v, mode);
    if (reason !== null) {
      // Name the offending storyId so the Orchestrator can mark exactly that segment
      // ESCALATED. Fall back to a placeholder when the verdict has no usable storyId.
      const offendingId =
        v !== null && typeof v === 'object' && typeof v.storyId === 'string' && v.storyId !== ''
          ? v.storyId
          : '<unknown-storyId>';
      throw new Error(`Malformed segment verdict for ${offendingId}: ${reason}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// launchWave — the parallel() driver (the live wave-execution path, protocol §23).
// ---------------------------------------------------------------------------

/**
 * Drive a `parallel()` Workflow of one segment per story in the wave. Each segment mints a
 * stable RUN_ID, runs the linear per-story pipeline inside its own ClearGate-managed
 * `.worktrees/STORY-X`, accumulates `tokens` from the outset, and RETURNS a verdict object —
 * it never blocks (a §22 true-blocker becomes a BLOCKED verdict with `blocker.type`, never an
 * `AskUserQuestion`).
 *
 * Flashcard write-gate (BUG-034 — code-enforced restore). Per the spike, per-thunk child env
 * is not settable, so the WRITE-gate is suppressed by setting `SKIP_FLASHCARD_GATE=1` in the
 * env inherited by every segment for the duration of the `parallel()` dispatch. This launcher
 * OWNS that save/set/restore in a `try/finally`: the prior value is snapshotted, `=1` is set
 * before dispatch, and the EXACT prior value is restored (deleted iff it was unset) in a
 * `finally` that runs even when `parallel()` or `validateVerdicts()` throws. Previously this
 * was an Orchestrator prose obligation (SKILL.md §C.0.1); a mid-barrier throw left the gate
 * suppressed session-wide; the code-enforced restore closes that leak.
 *
 * `validateVerdicts()` (the designed throw site) runs INSIDE the protected region so the
 * `finally` always restores the gate before the validation Error propagates to the caller.
 *
 * The `parallel`/`segmentRunner` seams are injected as a testability affordance — this makes
 * the function testable without a live Workflow runtime. When omitted, the function
 * documents the shape and performs NO env mutation; the live launcher wires the Workflow
 * `parallel()` primitive.
 *
 * @param {object} args
 * @param {string} args.sprintId
 * @param {string} args.sprintBranch
 * @param {{ wave: string, stories: string[], parallel: boolean }} args.wave  one wave from waves.json
 * @param {(thunks: Array<() => Promise<object>>) => Promise<object[]>} [args.parallel]  parallel() seam
 * @param {(story: string, runId: string) => Promise<object>} [args.segmentRunner]       per-segment seam
 * @param {NodeJS.ProcessEnv} [args.env]  env handle for the gate save/restore (defaults to process.env)
 * @param {Record<string,string>} [args.bases]  per-story worktree base refs (from `storyBases(plan)`);
 *                                              a story without a non-empty entry is cut from `sprintBranch`
 * @returns {Promise<object[]>}  the validated array of segment verdicts
 * @throws {Error} from validateVerdicts when any verdict is malformed — gate is restored first.
 */
export async function launchWave({ sprintId, sprintBranch, wave, parallel, segmentRunner, env = process.env, bases = {} }) {
  const stories = (wave && Array.isArray(wave.stories) ? wave.stories : []).slice();

  // CR-124: a story's worktree base is its declared base (a contract branch or the sprint
  // branch from a `schema_version: 2` plan) when one is given, otherwise the sprint branch.
  const baseFor = (story) => {
    const base = bases ? bases[story] : undefined;
    return typeof base === 'string' && base !== '' ? base : sprintBranch;
  };

  // Pre-create each wave story's worktree SERIALLY (spike risk-mitigation: concurrent
  // `git worktree add` races the repo index). The actual exec is the Orchestrator's job;
  // here we surface the commands so the launcher / tests can assert their construction.
  const worktreeCommands = stories.map((story) => worktreeAddCommand(story, baseFor(story)));

  // Build one thunk per story; each mints its own distinct RUN_ID.
  const segmentPlan = stories.map((story) => ({ story, runId: mintRunId(story, sprintId) }));

  if (typeof parallel !== 'function' || typeof segmentRunner !== 'function') {
    // No live runtime seam supplied (the seam-not-supplied / plan-only case). Return the plan so a
    // caller can inspect the worktree commands + minted RUN_IDs without dispatching agents.
    // NO env mutation here — nothing is dispatched, so the gate need not be suppressed.
    return segmentPlan.map((seg) => ({
      storyId: seg.story,
      runId: seg.runId,
      worktreeCommand: worktreeAddCommand(seg.story, baseFor(seg.story)),
      planned: true,
    }));
  }

  // BUG-034: snapshot the PRIOR gate value, suppress it for the dispatch, restore it EXACTLY
  // in a `finally` — even if parallel()/validateVerdicts() throws. `hasOwnProperty` (not a
  // truthiness check) distinguishes "unset" from "set to empty string" so restore is exact.
  const hadPriorGate = Object.prototype.hasOwnProperty.call(env, 'SKIP_FLASHCARD_GATE');
  const priorGate = env.SKIP_FLASHCARD_GATE;
  env.SKIP_FLASHCARD_GATE = '1';
  try {
    const thunks = segmentPlan.map((seg) => () => segmentRunner(seg.story, seg.runId));
    const verdicts = await parallel(thunks);
    // Designed throw site (names the offending storyId). Inside the try so the finally below
    // restores the gate before the Error propagates to the Orchestrator.
    validateVerdicts(verdicts);
    void worktreeCommands; // pre-created by the Orchestrator before the parallel() call
    return verdicts;
  } finally {
    if (hadPriorGate) env.SKIP_FLASHCARD_GATE = priorGate;
    else delete env.SKIP_FLASHCARD_GATE;
  }
}

// When run directly (`node launch_wave.mjs`), direct execution prints a usage note;
// live waves run via the Workflow tool (`/workflows`).
if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(
    'launch_wave.mjs — wave launcher (EPIC-033). ' +
      'Exports validateVerdicts, mintRunId, worktreeAddCommand, storyBases, integrationReady, launchWave. ' +
      'Every wave runs through this launcher via the Workflow tool (/workflows).\n',
  );
}
