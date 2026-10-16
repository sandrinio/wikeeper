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
