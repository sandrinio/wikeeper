// src/ingest/permissions.ts
// Contract C2 — contract/S-02-permissions (owner STORY-003-02). Frozen exports. Consumers: STORY-003-04, 003-05,
// 003-06, 006-03.
import type { WikeeperConfig } from "../core/config.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C2)`);
}

export type PermissionDecision = "allowed" | "needs_approval" | "denied";
export interface PermissionRequest {
  origin: string; // as SourceMeta.origin records it
  originType: "file" | "url" | "stdin";
  kind: string | null;
  approved: boolean;
}
export interface WhitelistMatch {
  by: "kind" | "origin";
  entry: string;
}
export interface PermissionResult {
  decision: PermissionDecision;
  mode: WikeeperConfig["ingest"]["permission"];
  reason: string;
  matched: WhitelistMatch | null;
  kind_pending: boolean;
}

export function evaluatePermission(
  ingest: Pick<WikeeperConfig["ingest"], "permission" | "whitelist">,
  request: PermissionRequest,
  options?: { homeDir?: string },
): PermissionResult {
  return stub("evaluatePermission");
}
export function matchesOrigin(
  entry: string,
  origin: string,
  originType: "file" | "url" | "stdin",
  options?: { homeDir?: string },
): boolean {
  return stub("matchesOrigin");
}
export function matchesKind(entry: string, kind: string): boolean {
  return stub("matchesKind");
}
