// Contract C2 — source-kind lines of kb_instructions.md (owner STORY-003-02). Frozen exports.

export interface SourceKindRule {
  id: string; // normalized, e.g. "meeting-notes"
  version: number; // 1 when the line has no (vN)
  targets: string; // text after the arrow, trimmed
  line: number; // 1-based line number in the file
}

const KIND_LINE_RE = /^\s*(?:[-*]\s+)?([A-Za-z0-9][A-Za-z0-9-]*)\s*(?:\(v(\d+)\))?\s*(?:→|->)\s*(.*?)\s*$/;
const KIND_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const SECTION_RE = /^##\s+source\s+kinds\b/i;

export function normalizeKindId(kind: string): string {
  return kind.trim().toLowerCase().replace(/\s*\(v\d+\)$/, "");
}

export function isValidKindId(kind: string): boolean {
  return KIND_ID_RE.test(normalizeKindId(kind));
}

export function parseSourceKinds(text: string): SourceKindRule[] {
  const rules: SourceKindRule[] = [];
  const lines = text.split(/\r?\n/);
  let inSection = false;
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const fenceMatch = /^\s*(```+|~~~+)/.exec(raw);
    if (fenceMatch) {
      const marker = (fenceMatch[1] ?? "").charAt(0);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    if (/^##\s/.test(raw)) {
      inSection = SECTION_RE.test(raw);
      continue;
    }
    if (!inSection) continue;
    const m = KIND_LINE_RE.exec(raw);
    if (!m) continue;
    rules.push({
      id: normalizeKindId(m[1] ?? ""),
      version: m[2] === undefined ? 1 : Number(m[2]),
      targets: m[3] ?? "",
      line: i + 1,
    });
  }
  return rules;
}

export function findKindRule(text: string, kind: string): SourceKindRule | null {
  const id = normalizeKindId(kind);
  return parseSourceKinds(text).find((r) => r.id === id) ?? null;
}
