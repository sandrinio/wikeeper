# SPRINT-04 decomposition — EPIC-009 addendum (version check and upgrade)

Added 2026-10-18 after the human asked for a version check and an upgrade command, in SPRINT-04. Merged into `decomposition.md` after its consistency audit finishes.

## Human decisions (2026-10-18)

- wikeeper checks npm for a newer version; the human suggested "on every ingest command".
- The CLI runs npm itself (`wikeeper upgrade`).
- In SPRINT-04.
- Gate 1 (2026-10-18, approved as recommended): only `ingest plan` and `ingest start` print the notice; npm only; the agent asks before `update` and `upgrade`.

## Story set

| Story | Title | Upstream | Scope |
|---|---|---|---|
| STORY-009-01 | Version check and version warnings | STORY-007-01 … 007-06, STORY-008-05 (as drafted: shared files and pinned lists) | `src/core/update-check.ts` (check, saved result, off switches); `update_check` config key; the check before every `ingest` subcommand; the warning in `ingest plan` and `ingest start`; `status` `version` field and lines; doctor `update-available` and `version-mismatch` checks |
| STORY-009-02 | `wikeeper upgrade` | STORY-009-01 | `src/commands/upgrade.ts`: install detection (global, project, npx, unknown), npm through an injected runner, the new version's `update` in a child process, `--check`, `--json`; registered in `src/program.ts` |
| STORY-009-03 | Upgrade instructions and docs | STORY-009-02, STORY-008-06 | `WIKI.md` (tell once, ask before `upgrade` and `update`), architecture.md (network rule at `:425` and §2, §3 lifecycle, a decision entry), README (upgrading, the check, turning it off) |

## Contracts

### K14 — `src/core/update-check.ts` (owner STORY-009-01; consumer STORY-009-02)

```ts
export const UPDATE_CHECK_TTL_MS = 86_400_000;
export const UPDATE_CHECK_TIMEOUT_MS = 1_500;
export interface SavedCheck { checked_at: string; installed: string; latest: string | null }
export interface UpdateCheckDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  installed?: string; // registry form, e.g. "0.4.0"
}
export function updateCheckEnabled(config: WikeeperConfig, env: NodeJS.ProcessEnv): boolean;
export function readSavedCheck(paths: ResolvedPaths): Promise<SavedCheck | null>; // never contacts npm
/** Uses the saved result when under 24 h old and for the same installed version; otherwise asks npm once and saves the answer.
 *  `force` skips the saved result (upgrade). Never throws; null when the check is off. */
export function checkForUpdate(paths: ResolvedPaths, config: WikeeperConfig, deps?: UpdateCheckDeps & { force?: boolean }): Promise<SavedCheck | null>;
export function newerVersion(saved: SavedCheck | null, installed: string): string | null;
export function availableMessage(latest: string, installed: string): string;
// 'wikeeper 0.4.1 is available (installed 0.4.0): run "wikeeper upgrade"'
export type VersionMismatch =
  | { kind: "files-older"; files: string; installed: string; message: string } // run "wikeeper update"
  | { kind: "files-newer"; files: string; installed: string; message: string }; // run "wikeeper upgrade"
export function versionMismatch(installed: string, files: string | null): VersionMismatch | null;
```

### K15 — what `status`, `doctor` and ingest show (owner STORY-009-01)

- `StatusData.version: { installed: string; latest: string | null; files: string | null }` — `latest` from the saved result only; `files` is `npmVersion(manifest.package_version)` or null.
- Human `status`: one line for a newer version, one for a mismatch, nothing when neither applies.
- Doctor checks: `update-available` (warning, from the saved result) and `version-mismatch` (warning).
- `ingest plan` and `ingest start` add `availableMessage(...)` to `warnings` while a newer version is known.
- Config: `update_check` (boolean, default true), top level in `SCHEMA`; not written by `init`.

### K16 — `src/commands/upgrade.ts` (owner STORY-009-02; consumer STORY-009-03)

```ts
export type InstallKind = "global" | "local" | "npx" | "unknown";
export interface RunResult { code: number; stdout: string; stderr: string }
export type CommandRunner = (cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => Promise<RunResult>;
export function detectInstall(packageDir: string, o: { root: string | null; env: NodeJS.ProcessEnv; platform: NodeJS.Platform; globalRoot?: string }): InstallKind;
export interface UpgradeResult {
  installed: string; latest: string | null; upgraded: boolean; install: InstallKind;
  commands_run: string[]; updated: boolean;
}
export interface UpgradeCheckResult { installed: string; latest: string | null; newer: boolean; install: InstallKind; command: string | null }
```
- Exit codes: 0 done or nothing to do; 1 npm failed, npm missing, registry unreachable, or `unknown` install (the command to run by hand is in the message and `details.command`).
- The runner and fetch are injected; tests never run npm or reach the network.

## Shared files (EPIC-009 additions)

| File | Stories, merge order |
|---|---|
| `src/core/config.ts` | 007-01 → 007-02 → 009-01 |
| `src/commands/status.ts` | 007-05 → 008-05 → 009-01 |
| `src/commands/doctor.ts` | 009-01 (plus any SPRINT-04 story the audit finds) |
| `src/commands/ingest-start.ts` | 007-03 → 009-01 |
| `src/commands/ingest-plan.ts` | 007-04 → 009-01 |
| `src/program.ts` | 007-02, 007-06, 009-02 (each appends one command) |
| `templates/system/WIKI.md` | 007-05 → 008-05 → 009-01 → 007-07 → 008-06 → 009-03 (009-01 writes the `version` status bullet; `test/templates/sprint-03-commands.red.node.test.ts:307` pins bullets to `status --json` keys) |
| `package.json` | 007-06 → 007-07 → 009-01 (`test:perf` line, version 0.4.0) |
| `vitest.config.ts` (new) | 009-01 (sets `WIKEEPER_NO_UPDATE_CHECK=1` for every test) |
| `test/config.red.node.test.ts` (red) | 007-01 → 009-01 (`tokens`, then `update_check`) |
| `test/templates/wiki-protocol.red.node.test.ts` (red) | 007-07 → 009-03 (`COMMANDS` gains `config`, `statusline`, then `upgrade`) |
| `test/doctor.red.node.test.ts` (red) | 009-01 (id list `:84`, fixture version `:43`) |
| `architecture.md`, `README.md` | 007-07 → 008-06 → 009-03 |

## Drafting results (2026-10-18)

All three stories drafted and gate-checked; contract deviations (new K14 exports, `version.latest` = newer version or null, doctor checks always emitted, `compareVersions` moves to `src/core/version.ts`, K16 additions) are listed in each story's §1.4 and in `gate1-decisions.md` items 41–61.
