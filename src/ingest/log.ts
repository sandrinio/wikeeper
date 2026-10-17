import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { compareCodeUnits } from "../core/compare.js";
import type { IngestPermission } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";

export type LogEventType = "ingest" | "abort" | "miss" | "rule-proposal";
export const LOG_EVENT_TYPES: readonly LogEventType[] = ["ingest", "abort", "miss", "rule-proposal"];

export interface IngestLogEvent {
  type: "ingest";
  at: string; // ISO-8601 UTC, supplied by the caller
  source_id: string;
  kind: string;
  rule_version: number | null;
  permission: IngestPermission;
  origin: string;
  created: string[]; // paths relative to pages/, POSIX
  updated: string[];
  deleted: string[];
  contradictions: number;
  rule_suggestions: number;
}
export interface AbortLogEvent {
  type: "abort";
  at: string;
  source_id: string;
  dropped: boolean;
  restored: string[]; // paths relative to pages/, POSIX
}
export interface MissLogEvent {
  type: "miss";
  at: string;
  query: string;
  filters: Record<string, string | string[]>;
}
export interface RuleProposalLogEvent {
  type: "rule-proposal";
  at: string;
  source_id?: string;
  [field: string]: unknown;
}
export type LogEvent = IngestLogEvent | AbortLogEvent | MissLogEvent | RuleProposalLogEvent;

export interface StoredLogEvent {
  file: string; // relative to paths.root, POSIX
  event: LogEvent;
}
export interface LogFilter {
  type?: LogEventType;
  sourceId?: string;
  since?: string; // "YYYY-MM-DD" (00:00 UTC that day) or a full ISO timestamp; keeps events with at >= since
}
export interface LogReadResult {
  events: StoredLogEvent[]; // sorted by at, then file name
  skipped: Array<{ file: string; reason: string }>;
}

const KEY_ORDER: Record<string, readonly string[]> = {
  ingest: [
    "type", "at", "source_id", "kind", "rule_version", "permission", "origin",
    "created", "updated", "deleted", "contradictions", "rule_suggestions",
  ],
  abort: ["type", "at", "source_id", "dropped", "restored"],
  miss: ["type", "at", "query", "filters"],
};

function invalid(message: string): WikeeperError {
  return new WikeeperError(ExitCode.ERROR, "invalid_event", message);
}

const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArr = (v: unknown): boolean => Array.isArray(v) && v.every(isStr);
const isNum = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);

function validate(event: LogEvent): void {
  const e = event as unknown as Record<string, unknown>;
  if (!isStr(e["at"]) || Number.isNaN(Date.parse(e["at"]))) throw invalid(`log event has an invalid "at": ${String(e["at"])}`);
  const need = (ok: boolean, field: string): void => {
    if (!ok) throw invalid(`${String(e["type"])} log event is missing or has an invalid "${field}"`);
  };
  switch (e["type"]) {
    case "ingest":
      need(isStr(e["source_id"]), "source_id");
      need(isStr(e["kind"]), "kind");
      need(e["rule_version"] === null || isNum(e["rule_version"]), "rule_version");
      need(isStr(e["permission"]), "permission");
      need(isStr(e["origin"]), "origin");
      need(isStrArr(e["created"]), "created");
      need(isStrArr(e["updated"]), "updated");
      need(isStrArr(e["deleted"]), "deleted");
      need(isNum(e["contradictions"]), "contradictions");
      need(isNum(e["rule_suggestions"]), "rule_suggestions");
      break;
    case "abort":
      need(isStr(e["source_id"]), "source_id");
      need(typeof e["dropped"] === "boolean", "dropped");
      need(isStrArr(e["restored"]), "restored");
      break;
    case "miss":
      need(isStr(e["query"]), "query");
      need(typeof e["filters"] === "object" && e["filters"] !== null && !Array.isArray(e["filters"]), "filters");
      break;
    case "rule-proposal":
      need(e["source_id"] === undefined || isStr(e["source_id"]), "source_id");
      break;
    default:
      throw invalid(`unknown log event type "${String(e["type"])}"`);
  }
}

function summaryLine(event: LogEvent): string {
  const e = event as unknown as Record<string, unknown>;
  switch (event.type) {
    case "ingest":
      return `Ingested ${event.source_id}: created ${event.created.length}, updated ${event.updated.length}, deleted ${event.deleted.length}.`;
    case "abort":
      return `Aborted ${event.source_id}${event.dropped ? ", source dropped" : ""}`;
    case "miss":
      return `No results for ${missLabel(event, (q) => `"${q}"`)}.`;
    default:
      return isStr(e["summary"]) ? `Rule proposal: ${e["summary"]}` : "Rule proposal";
  }
}

function orderedFields(event: LogEvent): Record<string, unknown> {
  const e = event as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const order = KEY_ORDER[event.type];
  if (order !== undefined) {
    for (const k of order) out[k] = e[k];
    return out;
  }
  out["type"] = e["type"];
  out["at"] = e["at"];
  if (e["source_id"] !== undefined) out["source_id"] = e["source_id"];
  for (const k of Object.keys(e)) if (!(k in out) && e[k] !== undefined) out[k] = e[k];
  return out;
}

function stamp(at: string): string {
  return new Date(at).toISOString().replace(/[-:.]/g, "");
}

export async function writeLogEvent(paths: ResolvedPaths, event: LogEvent): Promise<string> {
  validate(event);
  const e = event as unknown as Record<string, unknown>;
  const rawSlug = isStr(e["source_id"]) ? e["source_id"] : event.type;
  const slug = rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const base = `${stamp(event.at)}-${slug}`;
  const content = `---\n${YAML.stringify(orderedFields(event))}---\n${summaryLine(event)}\n`;
  await mkdir(paths.logDir, { recursive: true });
  for (let n = 1; ; n++) {
    const file = path.join(paths.logDir, `${base}${n === 1 ? "" : `-${n}`}.md`);
    try {
      await writeFile(file, content, { flag: "wx" });
      return toPosixRelative(paths.root, file);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }
}

function sinceMs(since: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(since);
  const ms = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Date.parse(since);
  if (Number.isNaN(ms)) {
    throw new WikeeperError(ExitCode.USAGE, "invalid_since", `invalid --since value "${since}": use YYYY-MM-DD or an ISO timestamp`);
  }
  return ms;
}

function splitFrontmatter(text: string): string | null {
  const t = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  if (!t.startsWith("---\n")) return null;
  const end = t.indexOf("\n---", 3);
  if (end === -1) return null;
  const after = t.slice(end + 4);
  if (after !== "" && !after.startsWith("\n")) return null;
  return t.slice(4, end + 1);
}

export async function readLogEvents(paths: ResolvedPaths, filter: LogFilter = {}): Promise<LogReadResult> {
  const since = filter.since === undefined ? null : sinceMs(filter.since);
  let names: string[];
  try {
    names = await readdir(paths.logDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { events: [], skipped: [] };
    throw err;
  }
  const events: Array<StoredLogEvent & { ms: number; name: string }> = [];
  const skipped: Array<{ file: string; reason: string }> = [];
  for (const name of names.filter((n) => n.endsWith(".md")).sort(compareCodeUnits)) {
    const file = toPosixRelative(paths.root, path.join(paths.logDir, name));
    const text = await readFile(path.join(paths.logDir, name), "utf8");
    const fm = splitFrontmatter(text);
    if (fm === null) {
      skipped.push({ file, reason: "no frontmatter" });
      continue;
    }
    const doc = YAML.parseDocument(fm);
    if (doc.errors.length > 0) {
      skipped.push({ file, reason: `invalid frontmatter: ${doc.errors[0]!.message}` });
      continue;
    }
    const data: unknown = doc.toJS();
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      skipped.push({ file, reason: "invalid frontmatter: not a mapping" });
      continue;
    }
    const rec = data as Record<string, unknown>;
    if (!isStr(rec["type"]) || !(LOG_EVENT_TYPES as readonly string[]).includes(rec["type"])) {
      skipped.push({ file, reason: `unknown type "${String(rec["type"])}"` });
      continue;
    }
    const ms = isStr(rec["at"]) ? Date.parse(rec["at"]) : Number.NaN;
    if (Number.isNaN(ms)) {
      skipped.push({ file, reason: "invalid at" });
      continue;
    }
    events.push({ file, event: rec as unknown as LogEvent, ms, name });
  }
  const kept = events
    .filter((s) => filter.type === undefined || s.event.type === filter.type)
    .filter((s) => filter.sourceId === undefined || (s.event as unknown as Record<string, unknown>)["source_id"] === filter.sourceId)
    .filter((s) => since === null || s.ms >= since)
    .sort((a, b) => a.ms - b.ms || compareCodeUnits(a.name, b.name))
    .map(({ file, event }) => ({ file, event }));
  return { events: kept, skipped };
}

const count = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

const MISS_KEY_ORDER = ["type", "where", "status", "since", "mark", "entity"];

function missLabel(e: MissLogEvent, quote: (q: string) => string): string {
  const parts: string[] = [];
  if (e.query !== "") parts.push(quote(e.query));
  const filters = e.filters;
  const keys = [...MISS_KEY_ORDER.filter((k) => k in filters), ...Object.keys(filters).filter((k) => !MISS_KEY_ORDER.includes(k)).sort(compareCodeUnits)];
  for (const key of keys) {
    const value: unknown = filters[key];
    if (typeof value === "string") parts.push(` --${key} ${value}`);
    else if (isStrArr(value)) for (const v of value as string[]) parts.push(` --${key} ${v}`);
  }
  return parts.length === 0 ? quote(e.query) : parts.join("").trimStart();
}

export function renderLogView(events: readonly StoredLogEvent[]): string {
  const head = "# Wiki log\n\n_Generated by `wikeeper index rebuild` from the files in log/. Do not edit._\n\n";
  if (events.length === 0) return `${head}_No events yet._\n`;
  const items = events
    .map((s) => ({ s, ms: Date.parse(s.event.at), name: s.file }))
    .sort((a, b) => b.ms - a.ms || compareCodeUnits(b.name, a.name));
  const lines = items.map(({ s, ms }) => {
    const iso = new Date(ms).toISOString();
    const when = `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
    const ev = s.event;
    switch (ev.type) {
      case "ingest":
        return `- ${when} · ingest · ${ev.source_id} · created ${count(ev.created)} · updated ${count(ev.updated)} · deleted ${count(ev.deleted)}`;
      case "abort":
        return `- ${when} · abort · ${ev.source_id}${ev.dropped ? " · source dropped" : ""}`;
      case "miss":
        return `- ${when} · miss · ${missLabel(ev, JSON.stringify)}`;
      default: {
        const id = (ev as Record<string, unknown>)["source_id"];
        return `- ${when} · rule-proposal${isStr(id) ? ` · ${id}` : ""}`;
      }
    }
  });
  return `${head}${lines.join("\n")}\n`;
}

export async function regenerateLogView(paths: ResolvedPaths): Promise<{ file: string; events: number }> {
  const { events } = await readLogEvents(paths);
  const file = path.join(paths.contentDir, "log.md");
  await mkdir(paths.contentDir, { recursive: true });
  await writeFile(file, renderLogView(events));
  return { file: toPosixRelative(paths.root, file), events: events.length };
}
