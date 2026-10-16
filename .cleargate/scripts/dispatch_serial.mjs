#!/usr/bin/env node
/**
 * dispatch_serial.mjs — the serial dispatch driver (STORY-058-12, protocol §23.5).
 *
 * The dispatch path for a host whose adapter declares `dispatchMode: serial` (a host with no
 * Workflow primitive). It runs a wave from the Architect's `waves.json` one story at a time,
 * in wave order: the flashcard gate between every pair of stories, the same ClearGate-managed
 * worktree command the wave path builds, the same verdict envelope (validated in serial
 * mode), and a synchronous halt on any non-GREEN verdict. The contract it implements is
 * `.claude/skills/sprint-execution/dispatch-serial.md` (installed for a serial host as
 * `.agents/skills/sprint-execution/dispatch-serial.md`).
 *
 * A model orchestrator cannot be driven from a node process, so the orchestrator drives this
 * file step by step through its CLI:
 *
 *   node .cleargate/scripts/dispatch_serial.mjs next   --sprint <SPRINT-ID> --wave <wave-id> [--resume] [--repo <dir>]
 *   node .cleargate/scripts/dispatch_serial.mjs record --sprint <SPRINT-ID> --wave <wave-id> --verdict <file|-> [--repo <dir>]
 *
 * `next` prints one JSON line naming the next action (exit 0 dispatch / wave-complete,
 * 3 halt, 4 process-flashcards); `record` validates a story's verdict, appends it to
 * `.cleargate/sprint-runs/<sprint>/serial/<wave>.verdicts.jsonl`, and exits 0 on GREEN,
 * 3 on a non-GREEN verdict (halt now), 1 on an invalid verdict (nothing appended). Usage
 * errors exit 2 with nothing on stdout. `dispatchSerial()` is the same loop as a pure
 * function over injected seams — the reference the unit tests drive, mirroring
 * `launchWave`'s seam shape.
 *
 * Deliberately NOT here (dispatch-serial.md §4): no flashcard-gate suppression window (the
 * gate runs per story and this file never reads, sets or deletes the gate's bypass key), no
 * run-keyed barrier ledger rows (`record` never opens `token-ledger.jsonl`), and no
 * verdict-instead-of-halt. The only environment variable read is ORCHESTRATOR_PROJECT_DIR
 * (the repo-root fallback); CLEARGATE_ADVISORY is not honoured here — the host's dispatch
 * hook still applies it per dispatch.
 *
 * A `schema_version: 2` plan is run through its derived `waves` exactly like any other plan:
 * `contracts[]`, the top-level `stories` map and every `base` are ignored, so every worktree
 * is cut from the sprint branch. Every story in its `upstream` has already merged, because
 * the serial loop merges each GREEN story before the next one starts.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mintRunId, validateVerdicts, worktreeAddCommand } from './launch_wave.mjs';
import { extractWorkItemIds } from './lib/work-item-id.mjs';
import { pendingFlashcards } from './lib/flashcard-gate.mjs';

/** CLI exit codes. */
export const SERIAL_EXIT = Object.freeze({ OK: 0, INVALID: 1, USAGE: 2, HALT: 3, FLASHCARDS: 4 });

/** A wave id is a single safe path segment (it names `serial/<wave>.verdicts.jsonl`). */
const WAVE_ID_RE = /^[A-Za-z0-9._-]+$/;

const USAGE = [
  'Usage: node .cleargate/scripts/dispatch_serial.mjs <command> [options]',
  '',
  'Commands:',
  '  next   --sprint <SPRINT-ID> --wave <wave-id> [--resume] [--repo <dir>]',
  '         Print the next action as one JSON line:',
  '           dispatch (exit 0) | wave-complete (exit 0) | halt (exit 3) | process-flashcards (exit 4)',
  '  record --sprint <SPRINT-ID> --wave <wave-id> --verdict <file|-> [--repo <dir>]',
  '         Validate a story verdict (serial mode) and append it to the wave log:',
  '           exit 0 GREEN | exit 3 not GREEN (halt now) | exit 1 invalid (nothing appended)',
  '  --help Print this text.',
  '',
  'The repo root is --repo, else ORCHESTRATOR_PROJECT_DIR, else the git top level of the cwd.',
  'Usage errors exit 2 with nothing on stdout.',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * The sprint branch for a sprint id: 'SPRINT-01' → 'sprint/S-01'.
 *
 * @param {string} sprintId
 * @returns {string}
 * @throws {TypeError} unless sprintId is a well-formed sprint id
 */
export function sprintBranchFor(sprintId) {
  const m = /^SPRINT-(\d{2,3})$/.exec(String(sprintId));
  if (!m) throw new TypeError(`sprintBranchFor: invalid sprint id '${String(sprintId)}' (expected SPRINT-NN)`);
  return `sprint/S-${m[1]}`;
}

/**
 * The serial verdict log of one wave.
 *
 * @param {string} repoRoot
 * @param {string} sprintId
 * @param {string} waveId
 * @returns {string}  <repo>/.cleargate/sprint-runs/<sprint>/serial/<wave>.verdicts.jsonl
 */
export function serialLogPath(repoRoot, sprintId, waveId) {
  return path.join(repoRoot, '.cleargate', 'sprint-runs', sprintId, 'serial', `${waveId}.verdicts.jsonl`);
}

/**
 * Read a serial verdict log: one JSON object per non-empty line, in append order.
 *
 * @param {string} file
 * @returns {object[]}  [] when the file does not exist
 * @throws {Error} when the file exists but a line is not valid JSON
 */
export function readVerdictLog(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    out.push(JSON.parse(line));
  }
  return out;
}

/**
 * The next serial action for a wave, from the verdicts recorded so far (latest verdict per
 * story wins, in append order).
 *
 * @param {{ wave: { stories: string[] }, verdicts: object[], resume?: boolean }} args
 * @returns {{ action: 'dispatch', storyId: string, resumed: boolean }
 *   | { action: 'halt', storyId: string, verdict: object }
 *   | { action: 'wave-complete' }}
 */
export function nextAction({ wave, verdicts, resume = false }) {
  const latest = new Map();
  for (const v of verdicts ?? []) {
    if (v !== null && typeof v === 'object' && typeof v.storyId === 'string') latest.set(v.storyId, v);
  }
  for (const storyId of wave.stories) {
    const v = latest.get(storyId);
    if (v === undefined) return { action: 'dispatch', storyId, resumed: false };
    if (v.verdict === 'GREEN') continue;
    return resume ? { action: 'dispatch', storyId, resumed: true } : { action: 'halt', storyId, verdict: v };
  }
  return { action: 'wave-complete' };
}

/** True iff `id` is exactly one work-item id (shell-safe to interpolate into a git command). */
function isExactWorkItemId(id) {
  if (typeof id !== 'string') return false;
  const ids = extractWorkItemIds(id);
  return ids.length === 1 && ids[0] === id;
}

/** Throws a TypeError unless `wave.stories` is an array of exact work-item ids. */
function assertWaveStories(wave) {
  if (wave === null || typeof wave !== 'object' || !Array.isArray(wave.stories)) {
    throw new TypeError('dispatchSerial: wave.stories must be an array');
  }
  for (const id of wave.stories) {
    if (!isExactWorkItemId(id)) throw new TypeError(`dispatchSerial: invalid story id in wave: ${JSON.stringify(id)}`);
  }
}

// ---------------------------------------------------------------------------
// Default seams (used by dispatchSerial when a seam is not injected)
// ---------------------------------------------------------------------------

/** realpath when the path exists, else the resolved path. */
function canonicalPath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** True iff `.worktrees/<storyId>` is a worktree registered with the repo (`git worktree list`). */
function worktreeRegistered(repoRoot, storyId, env) {
  const listing = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const target = canonicalPath(path.join(canonicalPath(repoRoot), '.worktrees', storyId));
  return listing
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .some((line) => canonicalPath(line.slice('worktree '.length)) === target);
}

/** Append one recorded verdict line to a wave's serial log. */
function appendVerdict(logFile, verdict) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, `${JSON.stringify({ ...verdict, recorded_at: new Date().toISOString() })}\n`);
}

/** The repo root: ORCHESTRATOR_PROJECT_DIR, else the git top level of `cwd`. */
function resolveRepoRoot(env, cwd = process.cwd()) {
  const fromEnv = env.ORCHESTRATOR_PROJECT_DIR;
  if (typeof fromEnv === 'string' && fromEnv !== '') return path.resolve(fromEnv);
  return execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function defaultSeams({ sprintId, wave, env }) {
  let root;
  const repoRoot = () => (root ??= resolveRepoRoot(env));
  return {
    createWorktree: async (cmd) => {
      // The exact printed command, run token by token without a shell.
      const [bin, ...args] = cmd.split(' ');
      execFileSync(bin, args, { cwd: repoRoot(), env, stdio: ['ignore', 'pipe', 'pipe'] });
    },
    worktreeExists: async (storyId) => worktreeRegistered(repoRoot(), storyId, env),
    flashcardGate: async () =>
      pendingFlashcards({ sprintDir: path.join(repoRoot(), '.cleargate', 'sprint-runs', sprintId) }),
    recordVerdict: async (v) => {
      if (typeof wave.wave !== 'string' || !WAVE_ID_RE.test(wave.wave) || wave.wave === '.' || wave.wave === '..') {
        throw new TypeError(`dispatchSerial: cannot record without a valid wave id (got ${JSON.stringify(wave.wave)})`);
      }
      appendVerdict(serialLogPath(repoRoot(), sprintId, wave.wave), v);
    },
  };
}

// ---------------------------------------------------------------------------
// dispatchSerial — the serial loop over injected seams
// ---------------------------------------------------------------------------

/**
 * Run one wave serially. Each story: flashcard gate → worktree (unless it exists) → dispatch
 * → validate (serial mode) → record; a non-GREEN verdict is recorded and then halts the loop.
 *
 * @param {object} args
 * @param {string} args.sprintId
 * @param {string} args.sprintBranch               e.g. 'sprint/S-01' (see sprintBranchFor)
 * @param {{ wave?: string, stories: string[] }} args.wave  one wave from waves.json
 * @param {object[]} [args.verdicts]               verdicts already recorded for this wave
 * @param {boolean} [args.resume]                  re-dispatch the blocked story (first dispatch only)
 * @param {(storyId: string) => Promise<object>} [args.dispatchStory]  runs one story, returns its verdict
 * @param {(cmd: string, storyId: string) => Promise<void>} [args.createWorktree]
 * @param {(storyId: string) => Promise<boolean>} [args.worktreeExists]
 * @param {(a: { sprintId: string, storyId: string }) => Promise<{ ok: boolean, unprocessed?: object[], unparseable?: string[] }>} [args.flashcardGate]
 * @param {(verdict: object) => Promise<void>} [args.recordVerdict]
 * @param {NodeJS.ProcessEnv} [args.env]           env handed to the default seams' child processes
 * @returns {Promise<object>}  { status: 'planned', steps } without dispatchStory; otherwise
 *   'complete' | 'halted' | 'flashcards-pending', with `dispatched` and `verdicts`
 * @throws {Error} from validateVerdicts on a malformed verdict (naming the storyId; nothing recorded)
 */
export async function dispatchSerial({
  sprintId,
  sprintBranch,
  wave,
  verdicts = [],
  resume = false,
  dispatchStory,
  createWorktree,
  worktreeExists,
  flashcardGate,
  recordVerdict,
  env = process.env,
}) {
  assertWaveStories(wave);

  if (typeof dispatchStory !== 'function') {
    // Plan only: nothing is dispatched, no seam is called, env is untouched.
    return {
      status: 'planned',
      steps: wave.stories.map((storyId) => ({ storyId, worktreeCommand: worktreeAddCommand(storyId, sprintBranch) })),
    };
  }

  const needsDefaults =
    typeof createWorktree !== 'function' ||
    typeof worktreeExists !== 'function' ||
    typeof flashcardGate !== 'function' ||
    typeof recordVerdict !== 'function';
  const defaults = needsDefaults ? defaultSeams({ sprintId, wave, env }) : {};
  const seams = {
    createWorktree: typeof createWorktree === 'function' ? createWorktree : defaults.createWorktree,
    worktreeExists: typeof worktreeExists === 'function' ? worktreeExists : defaults.worktreeExists,
    flashcardGate: typeof flashcardGate === 'function' ? flashcardGate : defaults.flashcardGate,
    recordVerdict: typeof recordVerdict === 'function' ? recordVerdict : defaults.recordVerdict,
  };

  const known = Array.isArray(verdicts) ? verdicts.slice() : [];
  const dispatched = [];
  let resumeNext = resume;

  for (;;) {
    const a = nextAction({ wave, verdicts: known, resume: resumeNext });
    if (a.action === 'wave-complete') return { status: 'complete', dispatched, verdicts: known };
    if (a.action === 'halt') {
      return { status: 'halted', storyId: a.storyId, verdict: a.verdict, dispatched, verdicts: known };
    }

    const { storyId } = a;
    const gate = await seams.flashcardGate({ sprintId, storyId });
    if (!gate || gate.ok !== true) {
      return {
        status: 'flashcards-pending',
        storyId,
        unprocessed: (gate && gate.unprocessed) || [],
        unparseable: (gate && gate.unparseable) || [],
        dispatched,
        verdicts: known,
      };
    }

    const cmd = worktreeAddCommand(storyId, sprintBranch);
    if (!(await seams.worktreeExists(storyId))) await seams.createWorktree(cmd, storyId);

    const v = await dispatchStory(storyId);
    validateVerdicts([v], { mode: 'serial' });
    if (v.storyId !== storyId) {
      throw new Error(`Malformed segment verdict for ${storyId}: verdict names storyId '${v.storyId}'.`);
    }
    await seams.recordVerdict(v);
    known.push(v);
    dispatched.push(storyId);
    if (v.verdict !== 'GREEN') return { status: 'halted', storyId, verdict: v, dispatched, verdicts: known };
    resumeNext = false; // --resume applies to the first re-dispatch only
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

class UsageError extends Error {}

const COMMAND_FLAGS = Object.freeze({
  next: { values: ['--sprint', '--wave', '--repo'], booleans: ['--resume'], required: ['--sprint', '--wave'] },
  record: { values: ['--sprint', '--wave', '--verdict', '--repo'], booleans: [], required: ['--sprint', '--wave', '--verdict'] },
});

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command === undefined) throw new UsageError('missing command');
  const spec = COMMAND_FLAGS[command];
  if (!spec) throw new UsageError(`unknown command '${command}'`);
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (spec.booleans.includes(arg)) {
      flags[arg] = true;
    } else if (spec.values.includes(arg)) {
      const value = rest[i + 1];
      if (value === undefined) throw new UsageError(`${arg} needs a value`);
      flags[arg] = value;
      i += 1;
    } else {
      throw new UsageError(`unknown argument '${arg}' for '${command}'`);
    }
  }
  for (const name of spec.required) {
    if (flags[name] === undefined) throw new UsageError(`'${command}' needs ${name}`);
  }
  return { command, flags };
}

/** Resolve and validate everything `next`/`record` share; every failure is a UsageError. */
function loadWave(flags) {
  const sprintId = flags['--sprint'];
  let sprintBranch;
  try {
    sprintBranch = sprintBranchFor(sprintId);
  } catch (err) {
    throw new UsageError(err.message);
  }

  const waveId = flags['--wave'];
  if (!WAVE_ID_RE.test(waveId) || waveId === '.' || waveId === '..') {
    throw new UsageError(`invalid wave id '${waveId}'`);
  }

  let repoRoot;
  if (flags['--repo'] !== undefined) {
    repoRoot = path.resolve(flags['--repo']);
  } else {
    try {
      repoRoot = resolveRepoRoot(process.env);
    } catch {
      throw new UsageError('cannot resolve the repo root: pass --repo or set ORCHESTRATOR_PROJECT_DIR');
    }
  }

  const sprintDir = path.join(repoRoot, '.cleargate', 'sprint-runs', sprintId);
  const wavesFile = path.join(sprintDir, 'plans', 'waves.json');
  let plan;
  try {
    plan = JSON.parse(fs.readFileSync(wavesFile, 'utf8'));
  } catch (err) {
    throw new UsageError(`cannot read ${wavesFile}: ${err.message}`);
  }
  if (plan === null || typeof plan !== 'object') throw new UsageError(`${wavesFile} is not a JSON object`);
  if (plan.schema_version !== undefined && plan.schema_version !== 2) {
    throw new UsageError(`${wavesFile}: unsupported schema_version ${JSON.stringify(plan.schema_version)}`);
  }
  if (!Array.isArray(plan.waves)) throw new UsageError(`${wavesFile}: 'waves' must be an array`);
  const wave = plan.waves.find((w) => w !== null && typeof w === 'object' && w.wave === waveId);
  if (!wave) throw new UsageError(`${wavesFile}: no wave '${waveId}'`);
  if (!Array.isArray(wave.stories)) throw new UsageError(`${wavesFile}: wave '${waveId}' has no stories array`);
  for (const id of wave.stories) {
    if (!isExactWorkItemId(id)) throw new UsageError(`${wavesFile}: wave '${waveId}' has an invalid story id ${JSON.stringify(id)}`);
  }

  const logFile = serialLogPath(repoRoot, sprintId, waveId);
  let verdicts;
  try {
    verdicts = readVerdictLog(logFile);
  } catch (err) {
    throw new UsageError(`cannot read ${logFile}: ${err.message}`);
  }
  return { sprintId, sprintBranch, waveId, wave, repoRoot, sprintDir, logFile, verdicts };
}

function print(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function runNext(flags) {
  const ctx = loadWave(flags);
  const a = nextAction({ wave: ctx.wave, verdicts: ctx.verdicts, resume: flags['--resume'] === true });
  if (a.action === 'halt') {
    print({ action: 'halt', storyId: a.storyId, verdict: a.verdict });
    return SERIAL_EXIT.HALT;
  }
  if (a.action === 'wave-complete') {
    print({ action: 'wave-complete' });
    return SERIAL_EXIT.OK;
  }

  // The flashcard gate runs before every dispatch answer.
  const gate = pendingFlashcards({ sprintDir: ctx.sprintDir });
  if (!gate.ok) {
    print({ action: 'process-flashcards', storyId: a.storyId, unprocessed: gate.unprocessed, unparseable: gate.unparseable });
    return SERIAL_EXIT.FLASHCARDS;
  }

  let exists;
  try {
    exists = worktreeRegistered(ctx.repoRoot, a.storyId, process.env);
  } catch (err) {
    throw new UsageError(`git worktree list failed in ${ctx.repoRoot}: ${err.message}`);
  }
  print({
    action: 'dispatch',
    storyId: a.storyId,
    runId: mintRunId(a.storyId, ctx.sprintId),
    worktreeCommand: worktreeAddCommand(a.storyId, ctx.sprintBranch),
    worktreeExists: exists,
    resumed: a.resumed,
  });
  return SERIAL_EXIT.OK;
}

function runRecord(flags) {
  const ctx = loadWave(flags);
  const source = flags['--verdict'];
  let raw;
  try {
    raw = fs.readFileSync(source === '-' ? 0 : source, 'utf8');
  } catch (err) {
    throw new UsageError(`cannot read verdict ${source}: ${err.message}`);
  }

  let verdict;
  try {
    verdict = JSON.parse(raw);
  } catch (err) {
    process.stderr.write(`dispatch_serial.mjs record: the verdict is not valid JSON (${err.message}); nothing recorded.\n`);
    return SERIAL_EXIT.INVALID;
  }
  try {
    validateVerdicts([verdict], { mode: 'serial' });
  } catch (err) {
    process.stderr.write(`dispatch_serial.mjs record: ${err.message} Nothing recorded.\n`);
    return SERIAL_EXIT.INVALID;
  }
  if (!ctx.wave.stories.includes(verdict.storyId)) {
    process.stderr.write(
      `dispatch_serial.mjs record: ${verdict.storyId} is not a story of wave '${ctx.waveId}'. Nothing recorded.\n`,
    );
    return SERIAL_EXIT.INVALID;
  }

  appendVerdict(ctx.logFile, verdict);
  const halt = verdict.verdict !== 'GREEN';
  print({ recorded: true, halt });
  return halt ? SERIAL_EXIT.HALT : SERIAL_EXIT.OK;
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return SERIAL_EXIT.OK;
  }
  try {
    const { command, flags } = parseArgs(argv);
    return command === 'next' ? runNext(flags) : runRecord(flags);
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`dispatch_serial.mjs: ${err.message}\n\n${USAGE}`);
      return SERIAL_EXIT.USAGE;
    }
    throw err;
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  process.exitCode = main(process.argv.slice(2));
}
