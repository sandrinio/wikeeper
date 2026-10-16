// src/ingest/kind-rules.ts
// Contract C2 — contract/S-02-permissions (owner STORY-003-02). Frozen exports. The owner builds from sprint/S-02;
// at a consumer's integration the owner's file replaces this one (owner's file wins).

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C2)`);
}

export interface SourceKindRule {
  id: string; // normalized, e.g. "meeting-notes"
  version: number; // 1 when the line has no (vN)
  targets: string; // text after the arrow, trimmed
  line: number; // 1-based line number in the file
}

export function normalizeKindId(kind: string): string {
  return stub("normalizeKindId");
}
export function isValidKindId(kind: string): boolean {
  return stub("isValidKindId");
}
export function parseSourceKinds(text: string): SourceKindRule[] {
  return stub("parseSourceKinds");
}
export function findKindRule(text: string, kind: string): SourceKindRule | null {
  return stub("findKindRule");
}
