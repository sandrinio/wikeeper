// src/ingest/registry.ts
// Contract C3 — contract/S-02-registry (owner STORY-003-01). Frozen exports. SourceMeta field order is the JSON key
// order of raw/<id>.meta.json.
import type { ResolvedPaths } from "../core/paths.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C3)`);
}

export type OriginType = "file" | "url" | "stdin";
export interface SourcePermission {
  mode: "ai" | "ask" | "whitelist";
  approved: boolean; // --approved was passed
  matched: { by: "kind" | "origin"; entry: string } | null;
  kind_pending: boolean; // whitelist kind still to be checked at `ingest facts`
}
export interface SourceMeta {
  id: string;
  origin: string; // repo-relative POSIX path | absolute POSIX path | normalized URL | "stdin"
  origin_type: OriginType;
  kind: string | null; // normalized kind id from --kind, else null
  provided_by: "user" | "agent";
  captured_at: string; // ISO-8601 UTC
  size: number; // bytes of the original, or of the text when original is null
  sha256: string; // hash of the same bytes
  rule_version: number | null;
  original: string | null; // raw file name, e.g. "src-2026-10-16-q4.pdf"
  text: string | null; // "src-2026-10-16-q4.md" when agent/excerpt text is stored
  reingest_of: string | null;
  permission: SourcePermission;
}
export interface RegisterInput {
  originType: OriginType;
  origin: string;
  label: string;
  originalPath: string | null;
  text: string | null;
  kind: string | null;
  providedBy: "user" | "agent";
  ruleVersion: number | null;
  reingestOf: string | null;
  permission: SourcePermission;
  now?: Date;
}
export interface DuplicateMatch {
  meta: SourceMeta;
  match: "sha256" | "origin";
}

export function fileOrigin(root: string, absPath: string): string {
  return stub("fileOrigin");
}
export function normalizeUrl(url: string): string {
  return stub("normalizeUrl");
}
export function hashText(text: string): { sha256: string; size: number } {
  return stub("hashText");
}
export async function hashSource(input: Pick<RegisterInput, "originalPath" | "text">): Promise<{ sha256: string; size: number }> {
  return stub("hashSource");
}
export function findDuplicate(
  sources: readonly SourceMeta[],
  probe: { sha256: string; originType: OriginType; origin: string },
): DuplicateMatch | null {
  return stub("findDuplicate");
}
export async function registerSource(paths: ResolvedPaths, input: RegisterInput): Promise<SourceMeta> {
  return stub("registerSource");
}
export async function readMeta(paths: ResolvedPaths, id: string): Promise<SourceMeta | null> {
  return stub("readMeta");
}
export async function listSources(paths: ResolvedPaths): Promise<SourceMeta[]> {
  return stub("listSources");
}
export async function removeSource(paths: ResolvedPaths, id: string): Promise<string[]> {
  return stub("removeSource");
}
