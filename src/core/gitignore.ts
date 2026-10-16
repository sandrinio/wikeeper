import path from "node:path";
import { compareCodeUnits } from "./compare.js";
import type { WikeeperConfig } from "./config.js";
import { ExitCode, WikeeperError } from "./exit-codes.js";
import type { Manifest } from "./manifest.js";
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
    if (pos === 0 && content.startsWith("\uFEFF")) {
      start = 1;
      content = content.slice(1);
    }
    if (content.endsWith("\r")) content = content.slice(0, -1);
    lines.push({ start, next, content });
    pos = next;
  }
  return lines;
}

/**
 * Pure: returns `text` with the wikeeper managed block created or replaced in place.
 * A new block is appended, or inserted at the top (after a BOM) when the text has no final line break.
 */
export function applyManagedBlock(text: string, entries: readonly string[]): string {
  const firstNl = text.indexOf("\n");
  const eol = firstNl > 0 && text[firstNl - 1] === "\r" ? "\r\n" : "\n";
  const block = [GITIGNORE_BLOCK_START, ...entries, GITIGNORE_BLOCK_END].join(eol) + eol;
  const lines = scanLines(text);
  const si = lines.findIndex((l) => l.content === GITIGNORE_BLOCK_START);
  if (si === -1) {
    if (text.length > 0 && !text.endsWith("\n")) {
      const bom = text.startsWith("\uFEFF") ? "\uFEFF" : "";
      return bom + block + text.slice(bom.length);
    }
    return text + block;
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

function formatEntry(rel: string): string {
  let e = rel;
  if (!e.includes("/")) e = "/" + e;
  if (e.startsWith("#") || e.startsWith("!")) e = "\\" + e;
  return e;
}

export function managedIgnoreEntries(
  paths: ResolvedPaths,
  config: Pick<WikeeperConfig, "private">,
  backups: readonly string[] = [],
): { entries: string[]; warnings: string[] } {
  const rel = (p: string): string => toPosixRelative(paths.root, p);
  const entries: string[] = [
    rel(paths.meFile),
    rel(paths.lockFile),
    rel(path.join(paths.wikiDir, ".snapshots")) + "/",
    rel(path.join(paths.wikiDir, ".cache")) + "/",
    rel(path.join(paths.contentDir, "log.md")),
  ].map(formatEntry);
  entries.push(...[...new Set(backups.map(formatEntry))].sort(compareCodeUnits));
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
  entries.push(...[...priv].sort(compareCodeUnits));
  return { entries, warnings };
}

/** Paths of the backups the manifest records as wikeeper's. */
export function backupPaths(manifest: Manifest): string[] {
  return manifest.files.filter((e) => e.kind === "hook" && e.identity === "backup").map((e) => e.path);
}

export type GitignoreStripStatus = "stripped" | "absent" | "malformed";

/** Removes every managed START…END block (with its line terminators); pure. */
export function stripManagedBlock(text: string): { text: string; status: GitignoreStripStatus } {
  const lines: string[] = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const body = (line: string, index: number): string => {
    let s = line.replace(/\r?\n$/, "");
    if (index === 0 && s.startsWith("\uFEFF")) s = s.slice(1);
    return s;
  };
  let status: GitignoreStripStatus = "absent";
  let current = lines;
  for (;;) {
    const start = current.findIndex((l, i) => body(l, i) === GITIGNORE_BLOCK_START);
    if (start === -1) break;
    let end = -1;
    for (let i = start + 1; i < current.length; i++) {
      if (body(current[i]!, i) === GITIGNORE_BLOCK_END) {
        end = i;
        break;
      }
    }
    if (end === -1) return { text, status: "malformed" };
    const bom = start === 0 && current[0]!.startsWith("\uFEFF") ? "\uFEFF" : "";
    const rest = current.slice(end + 1);
    if (bom) {
      rest[0] = bom + (rest[0] ?? "");
    }
    current = [...current.slice(0, start), ...rest];
    status = "stripped";
  }
  return status === "absent" ? { text, status } : { text: current.join(""), status };
}
