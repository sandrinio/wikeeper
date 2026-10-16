// The ingest report (STORY-003-09 R7): metadata only, never page content (D-08).
import type { IngestPermission } from "../core/config.js";
import type { Page } from "../wiki/parse-page.js";
import type { LintFinding } from "./lint-hook.js";
import type { UserHookResult } from "./user-hooks.js";

export interface IngestReport {
  source_id: string;
  kind: string;
  rule_version: number | null;
  permission: IngestPermission;
  origin: string;
  size: number;
  sha256: string;
  created: string[];
  updated: string[];
  deleted: string[];
  contradictions: number;
  rule_suggestions: number;
  log_file: string;
  index_changed: boolean;
  hooks: UserHookResult[];
  lint: LintFinding[];
}

export function countContradictions(pages: readonly Page[], sourceId: string): number {
  let n = 0;
  for (const page of pages) for (const f of page.facts) if (f.contradiction && f.sources.includes(sourceId)) n += 1;
  return n;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatReport(r: IngestReport): string[] {
  const rule = r.rule_version === null ? `no rule for ${r.kind}` : `rule ${r.kind} v${r.rule_version}`;
  return [
    `✅ Ingested ${r.source_id}`,
    `   kind ${r.kind} · origin ${r.origin} · ${formatSize(r.size)} · sha ${r.sha256.slice(0, 4)}…`,
    `   ${rule} · permission ${r.permission}`,
    `   created ${r.created.length} · updated ${r.updated.length} · deleted ${r.deleted.length} · contradictions ${r.contradictions} · rule suggestions ${r.rule_suggestions}`,
  ];
}
