// src/lint/paths.ts
// Contract C2 — contract/S-03-lint. Final body, not a stub: the one place a lint finding's page path is built.
// src/lint/checks.ts re-exports pagePath (its frozen home); check modules import it from here, so no check module
// value-imports checks.ts (that cycle throws a ReferenceError at load when a check module is imported first).
import path from "node:path";
import { toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";

/** "team.md" -> ".wiki/pages/team.md": repository-relative POSIX, following content_dir. */
export function pagePath(paths: ResolvedPaths, rel: string): string {
  return toPosixRelative(paths.root, path.join(paths.pagesDir, ...rel.split("/")));
}
