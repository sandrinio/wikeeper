// The ingest report (STORY-003-09 R7): metadata only, never page content (D-08).
import { plural } from "../commands/doctor.js";
import type { IngestPermission } from "../core/config.js";
import { formatTokens, levelMark } from "../core/tokens.js";
import type { TokenLevel } from "../core/tokens.js";
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
  archived: { facts: number; pages: number };
  contradictions: number;
  rule_suggestions: number;
  log_file: string;
  index_changed: boolean;
  hooks: UserHookResult[];
  lint: LintFinding[];
  tokens: { wiki: number; change: number | null; largest: { path: string; tokens: number; level: TokenLevel } | null };
}

export function formatChange(n: number | null): string {
  if (n === null) return "";
  if (n === 0) return "±0";
  return (n > 0 ? "+" : "-") + formatTokens(Math.abs(n)).slice(1);
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
  const lines = [
    `✅ Ingested ${r.source_id}`,
    `   kind ${r.kind} · origin ${r.origin} · ${formatSize(r.size)} · sha ${r.sha256.slice(0, 4)}…`,
    `   ${rule} · permission ${r.permission}`,
    `   created ${r.created.length} · updated ${r.updated.length} · deleted ${r.deleted.length} · contradictions ${r.contradictions} · rule suggestions ${r.rule_suggestions}`,
    `   wiki ${formatTokens(r.tokens.wiki)} tokens${r.tokens.change === null ? "" : ` (${formatChange(r.tokens.change)})`} · ${
      r.tokens.largest === null
        ? "no pages"
        : `largest page ${r.tokens.largest.path} ${formatTokens(r.tokens.largest.tokens)} ${levelMark(r.tokens.largest.level)}`
    }`,
  ];
  if (r.archived.facts > 0 || r.archived.pages > 0) {
    lines.push(`   archived ${plural(r.archived.facts, "fact line")} · ${plural(r.archived.pages, "page")}`);
  }
  return lines;
}
