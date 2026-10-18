// Contract C2 — permission evaluation (owner STORY-003-02). Frozen exports.
import { homedir } from "node:os";
import type { WikeeperConfig } from "../core/config.js";
import type { TokenLevel } from "../core/tokens.js";
import { normalizeKindId } from "./kind-rules.js";
import type { OriginType } from "./registry.js";

export type PermissionDecision = "allowed" | "needs_approval" | "denied";
export interface PermissionRequest {
  origin: string; // as SourceMeta.origin records it
  originType: OriginType;
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

const globCache = new Map<string, RegExp>();

function compileGlob(pattern: string): RegExp {
  const cached = globCache.get(pattern);
  if (cached) return cached;
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const rest = pattern.slice(i);
    if (rest.startsWith("**/")) {
      out += "(?:.*/)?";
      i += 3;
    } else if (rest === "/**") {
      out += "(?:/.*)?";
      i += 3;
    } else if (rest.startsWith("**")) {
      out += ".*";
      i += 2;
    } else {
      const c = pattern.charAt(i);
      if (c === "*") out += "[^/]*";
      else if (c === "?") out += "[^/]";
      else out += c.replace(/[\\^$.*+?()[\]{}|/-]/g, "\\$&");
      i += 1;
    }
  }
  const re = new RegExp(`^${out}$`);
  globCache.set(pattern, re);
  return re;
}

function isPathEntry(entry: string): boolean {
  return entry.includes("/") || entry.startsWith(".") || entry.startsWith("~");
}

export function matchesOrigin(
  entry: string,
  origin: string,
  originType: OriginType,
  options?: { homeDir?: string },
): boolean {
  if (originType === "stdin") return false;
  if (isPathEntry(entry)) {
    if (originType !== "file") return false;
    const home = (options?.homeDir ?? homedir()).replace(/\\/g, "/");
    const expanded = entry.replace(/^~(?=\/)/, home);
    return compileGlob(expanded).test(origin.replace(/\\/g, "/"));
  }
  if (originType !== "url") return false;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  const pattern = entry.toLowerCase();
  if (pattern.startsWith("*.")) return host.endsWith("." + pattern.slice(2));
  return host === pattern;
}

export function matchesKind(entry: string, kind: string): boolean {
  return normalizeKindId(entry) === normalizeKindId(kind);
}

function list(items: string[]): string {
  return items.length === 0 ? "none" : items.join(", ");
}

export function evaluatePermission(
  ingest: Pick<WikeeperConfig["ingest"], "permission" | "whitelist">,
  request: PermissionRequest,
  options?: { homeDir?: string },
): PermissionResult {
  const mode = ingest.permission;
  const base = { mode, matched: null, kind_pending: false } as const;
  if (mode === "ai") {
    return { ...base, decision: "allowed", reason: "ingest.permission is ai, so the agent may ingest this source." };
  }
  if (mode === "ask") {
    if (request.approved) {
      return { ...base, decision: "allowed", reason: "ingest.permission is ask and the user approved this source." };
    }
    return {
      ...base,
      decision: "needs_approval",
      reason: `ingest.permission is ask: show the user the source "${request.origin}" and rerun with --approved once they agree.`,
    };
  }
  const { origins, kinds } = ingest.whitelist;
  for (const entry of origins) {
    if (matchesOrigin(entry, request.origin, request.originType, options)) {
      return {
        ...base,
        decision: "allowed",
        matched: { by: "origin", entry },
        reason: `The origin "${request.origin}" matches the whitelist entry "${entry}".`,
      };
    }
  }
  if (request.kind !== null) {
    for (const entry of kinds) {
      if (matchesKind(entry, request.kind)) {
        return {
          ...base,
          decision: "allowed",
          matched: { by: "kind", entry },
          reason: `The kind "${request.kind}" matches the whitelist kind "${entry}".`,
        };
      }
    }
  } else if (kinds.length > 0) {
    return {
      ...base,
      decision: "allowed",
      kind_pending: true,
      reason: `The origin "${request.origin}" is not whitelisted and no kind is known yet; the kind is checked against the whitelist kinds (${list(kinds)}) at ingest facts.`,
    };
  }
  return {
    ...base,
    decision: "denied",
    reason:
      `ingest.permission is whitelist and the origin "${request.origin}" with ${request.kind === null ? "no kind" : `kind "${request.kind}"`} is not allowed. ` +
      `Checked origin entries: ${list(origins)}. Checked kind entries: ${list(kinds)}; ` +
      `path entries support **, * and ? - add the path or the kind to ingest.whitelist in .wiki/config.yml.`,
  };
}

// Contract C2 (K5, frozen). STORY-007-03 replaces the bodies; names and types stay.
export type SourceLimits = WikeeperConfig["tokens"]["source"];
export interface SizeCheck {
  tokens: number;
  rough: boolean;
  level: TokenLevel;
  limit: number | null;
  confirm_at: SourceLimits["confirm_at"];
  reached: boolean;
}

export function checkSourceSize(_counted: { tokens: number; rough: boolean }, _limits: SourceLimits): SizeCheck {
  throw new Error("contract stub C2");
}

export function sizeLimitText(_check: SizeCheck): string {
  throw new Error("contract stub C2");
}
