import path from "node:path";
import type { WikeeperConfig } from "./config.js";
import { ExitCode, WikeeperError } from "./exit-codes.js";
import type { ResolvedPaths } from "./paths.js";
import { toPosixRelative } from "./paths.js";

export const GITIGNORE_BLOCK_START = "# >>> wikeeper >>>";
export const GITIGNORE_BLOCK_END = "# <<< wikeeper <<<";

interface Line {
  start: number; // offset of the line's first character (after a leading BOM on line 0)
  next: number; // offset just past the line terminator
  content: string; // without terminator or trailing \r
}

function scanLines(text: string): Line[] {
  const lines: Line[] = [];
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    const end = nl === -1 ? text.length : nl;
    const next = nl === -1 ? text.length : nl + 1;
    let start = pos;
    let content = text.slice(pos, end);
    if (pos === 0 && content.startsWith("﻿")) {
      start = 1;
      content = content.slice(1);
    }
    if (content.endsWith("\r")) content = content.slice(0, -1);
    lines.push({ start, next, content });
    pos = next;
  }
  return lines;
}

/** Pure: returns `text` with the wikeeper managed block created or replaced in place. */
export function applyManagedBlock(text: string, entries: readonly string[]): string {
  const firstNl = text.indexOf("\n");
  const eol = firstNl > 0 && text[firstNl - 1] === "\r" ? "\r\n" : "\n";
  const block = [GITIGNORE_BLOCK_START, ...entries, GITIGNORE_BLOCK_END].join(eol) + eol;
  const lines = scanLines(text);
  const si = lines.findIndex((l) => l.content === GITIGNORE_BLOCK_START);
  if (si === -1) {
    const sep = text.length > 0 && !text.endsWith("\n") ? eol : "";
    return text + sep + block;
  }
  const ei = lines.findIndex((l, i) => i > si && l.content === GITIGNORE_BLOCK_END);
  if (ei === -1) {
    throw new WikeeperError(
      ExitCode.ERROR,
      "gitignore_malformed",
      ".gitignore has a wikeeper start marker without an end marker; fix it and re-run",
    );
  }
  return text.slice(0, lines[si]!.start) + block + text.slice(lines[ei]!.next);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function formatEntry(rel: string): string {
  let e = rel;
  if (!e.includes("/")) e = "/" + e;
  if (e.startsWith("#") || e.startsWith("!")) e = "\\" + e;
  return e;
}

export function managedIgnoreEntries(
  paths: ResolvedPaths,
  config: Pick<WikeeperConfig, "private">,
): { entries: string[]; warnings: string[] } {
  const rel = (p: string): string => toPosixRelative(paths.root, p);
  const entries: string[] = [
    rel(paths.meFile),
    rel(paths.lockFile),
    rel(path.join(paths.wikiDir, ".snapshots")) + "/",
    rel(path.join(paths.wikiDir, ".cache")) + "/",
    rel(path.join(paths.contentDir, "log.md")),
  ].map(formatEntry);
  const warnings: string[] = [];
  const priv = new Set<string>();
  for (const p of config.private) {
    const abs = path.resolve(paths.pagesDir, p);
    const r = path.relative(paths.pagesDir, abs);
    if (r === "" || r === ".." || r.startsWith(".." + path.sep) || path.isAbsolute(r)) {
      warnings.push(`private entry "${p}" is outside pages/; not ignored`);
      continue;
    }
    priv.add(formatEntry(rel(abs)));
  }
  entries.push(...[...priv].sort(cmp));
  return { entries, warnings };
}
