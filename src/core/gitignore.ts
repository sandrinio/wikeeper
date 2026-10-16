import type { WikeeperConfig } from "./config.js";
import type { ResolvedPaths } from "./paths.js";

export const GITIGNORE_BLOCK_START = "# >>> wikeeper >>>";
export const GITIGNORE_BLOCK_END = "# <<< wikeeper <<<";

export function applyManagedBlock(_text: string, _entries: readonly string[]): string {
  throw new Error("contract stub C4");
}

export function managedIgnoreEntries(
  _paths: ResolvedPaths,
  _config: Pick<WikeeperConfig, "private">,
): { entries: string[]; warnings: string[] } {
  throw new Error("contract stub C4");
}

export type GitignoreStripStatus = "stripped" | "absent" | "malformed";

/** Removes every managed START…END block (with its line terminators); pure. */
export function stripManagedBlock(text: string): { text: string; status: GitignoreStripStatus } {
  const lines: string[] = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const body = (line: string, index: number): string => {
    let s = line.replace(/\r?\n$/, "");
    if (index === 0 && s.startsWith("﻿")) s = s.slice(1);
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
    const bom = start === 0 && current[0]!.startsWith("﻿") ? "﻿" : "";
    const rest = current.slice(end + 1);
    if (bom) {
      rest[0] = bom + (rest[0] ?? "");
      if (rest.length === 0) rest.push(bom);
    }
    current = [...current.slice(0, start), ...rest];
    status = "stripped";
  }
  return status === "absent" ? { text, status } : { text: current.join(""), status };
}
