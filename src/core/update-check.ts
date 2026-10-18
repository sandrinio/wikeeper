import type { Command } from "commander";
import type { ConfigIssue, WikeeperConfig } from "./config.js";
import type { ResolvedPaths } from "./paths.js";

// Contract C3 (K14, frozen). STORY-009-01 replaces the bodies; names and types stay.
// This module never imports src/commands/doctor.ts (import cycle); compareVersions lives in ./version.js.
export const UPDATE_CHECK_TTL_MS = 86_400_000;
export const UPDATE_CHECK_TIMEOUT_MS = 1_500;
export const REGISTRY_VERSION_RE: RegExp = /^\d+\.\d+\.\d+$/;

export interface SavedCheck {
  checked_at: string;
  installed: string;
  latest: string | null;
}
export interface UpdateCheckDeps {
  fetch?: typeof fetch;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  installed?: string;
  timeoutMs?: number;
  configIssues?: readonly ConfigIssue[];
}
export type VersionMismatch =
  | { kind: "files-older"; files: string; installed: string; message: string }
  | { kind: "files-newer"; files: string; installed: string; message: string };

export function updateCheckEnabled(
  _config: WikeeperConfig,
  _env: NodeJS.ProcessEnv,
  _issues?: readonly ConfigIssue[],
): boolean {
  throw new Error("contract stub C3");
}

export function readSavedCheck(_paths: ResolvedPaths): Promise<SavedCheck | null> {
  throw new Error("contract stub C3");
}

/** force: skip the saved result and the off switches (an explicit request); the answer is still saved. */
export function checkForUpdate(
  _paths: ResolvedPaths,
  _config: WikeeperConfig,
  _deps?: UpdateCheckDeps & { force?: boolean },
): Promise<SavedCheck | null> {
  throw new Error("contract stub C3");
}

export function newerVersion(_saved: SavedCheck | null, _installed: string): string | null {
  throw new Error("contract stub C3");
}

export function availableMessage(_latest: string, _installed: string): string {
  throw new Error("contract stub C3");
}

export function versionMismatch(_installed: string, _files: string | null): VersionMismatch | null {
  throw new Error("contract stub C3");
}

export function updateCheckFile(_paths: ResolvedPaths): string {
  throw new Error("contract stub C3");
}

export function fetchLatestVersion(
  _deps?: Pick<UpdateCheckDeps, "fetch" | "env" | "timeoutMs">,
): Promise<{ latest: string | null; error: string | null }> {
  throw new Error("contract stub C3");
}

export function writeSavedCheck(_paths: ResolvedPaths, _saved: SavedCheck): Promise<boolean> {
  throw new Error("contract stub C3");
}

export function updateCheckOffReason(
  _config: WikeeperConfig,
  _env: NodeJS.ProcessEnv,
  _issues?: readonly ConfigIssue[],
): string | null {
  throw new Error("contract stub C3");
}

export function runIngestUpdateCheck(_command: Command, _deps?: UpdateCheckDeps): Promise<void> {
  throw new Error("contract stub C3");
}

export function rememberUpdateNotice(_command: Command, _notice: string | null): void {
  throw new Error("contract stub C3");
}

export function updateNotice(_command: Command): string | null {
  throw new Error("contract stub C3");
}
