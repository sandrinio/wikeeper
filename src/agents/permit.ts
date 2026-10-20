import type { IngestPermission } from "../core/config.js";
import { READ_ONLY_COMMANDS } from "./enforce/claude.js";

export type Permit = "allow" | "ask";

/** Shell syntax that could hide a second command behind an allowed one. A command carrying any of it
 *  is never decided here; it falls through to the harness's own permission flow. */
const CHAINING = /[;&|`$(){}<>\n]|\|\||&&/;

/** Flags that make an ingest command destructive; they are asked about even in `ai` mode. */
const DESTRUCTIVE = ["--drop", "--force-unlock"];

/** Splits a simple command line into bare words. Returns null when quoting makes that unsafe. */
export function commandWords(command: string): string[] | null {
  if (CHAINING.test(command)) return null;
  if (/["']/.test(command)) return null;
  // Only space and tab, as bash splits: any other whitespace (no-break space, \r, \v…) stays inside a word.
  return command.split(/[ \t]+/).filter((w) => w !== "");
}

/** `wikeeper@<version>` as the npx guard command pins it: digits only, so no npm alias, tag, URL or path. */
const PINNED = /^wikeeper@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** The arguments of `wikeeper …`, `npx wikeeper …` or `npx [-y|--yes] wikeeper@<version> …`; null for any
 *  other command. A path, another npx flag or a package spec could run a different program named wikeeper. */
export function wikeeperArgs(words: readonly string[]): string[] | null {
  if (words[0] !== "npx") return words[0] === "wikeeper" ? words.slice(1) : null;
  const i = words[1] === "-y" || words[1] === "--yes" ? 2 : 1;
  const head = words[i];
  return head === "wikeeper" || (head !== undefined && PINNED.test(head)) ? words.slice(i + 1) : null;
}

function startsWith(args: readonly string[], phrase: string): boolean {
  const want = phrase.split(" ");
  return want.every((w, i) => args[i] === w);
}

/** The decision wikeeper asks a harness to apply to one shell command, or null to leave it alone.
 *  Mirrors the Claude permission rules in enforce/claude.ts and the Codex prefix rules. */
export function permitDecision(command: string, permission: IngestPermission): Permit | null {
  const words = commandWords(command);
  if (words === null) return null;
  const args = wikeeperArgs(words);
  if (args === null || args.length === 0) return null;

  if (startsWith(args, "ingest")) {
    if (args.some((a) => DESTRUCTIVE.includes(a))) return permission === "ai" ? "ask" : null;
    if (permission === "ai") return "allow";
    if (permission === "ask" && startsWith(args, "ingest start")) return "ask";
    return null;
  }
  if (startsWith(args, "read")) return permission === "ai" ? "allow" : null;
  if (startsWith(args, "search")) return "allow";
  for (const c of READ_ONLY_COMMANDS) if (startsWith(args, c)) return "allow";
  return null;
}
