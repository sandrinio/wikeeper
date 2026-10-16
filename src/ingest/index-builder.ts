// src/ingest/index-builder.ts
// Contract C6 — contract/S-02-log-index (owner STORY-003-07); C11 is a cherry-pick of this commit. Frozen exports.
// Consumer: STORY-003-09 (writeIndex).
import type { ResolvedPaths } from "../core/paths.js";
import type { Page } from "../wiki/parse-page.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C6)`);
}

export const INDEX_TYPE_ORDER: readonly string[] = ["person", "team", "project", "risk", "decision", "glossary", "source"];

export function buildIndex(pages: readonly Page[]): string {
  return stub("buildIndex");
}
export async function writeIndex(
  paths: ResolvedPaths,
): Promise<{ file: string; pages: number; changed: boolean; errors: Array<{ path: string; message: string }> }> {
  return stub("writeIndex");
}
