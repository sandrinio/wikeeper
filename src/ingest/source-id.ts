// src/ingest/source-id.ts
// Contract C3 — contract/S-02-registry (owner STORY-003-01). Frozen exports. Consumers: STORY-003-04, 003-05,
// 003-06, 003-08, 003-09.

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C3)`);
}

export const SOURCE_ID_PATTERN: RegExp = /^src-\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSourceId(value: string): boolean {
  return stub("isSourceId");
}
export function slugify(label: string): string {
  return stub("slugify");
}
export function formatIdDate(date: Date): string {
  return stub("formatIdDate");
}
export function makeSourceId(date: Date, label: string, taken: (id: string) => boolean): string {
  return stub("makeSourceId");
}
