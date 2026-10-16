import { existsSync } from "node:fs";
import path from "node:path";
import type { WikeeperConfig } from "./config.js";

export interface ResolvedPaths {
  root: string;
  wikiDir: string;
  systemDir: string;
  configFile: string;
  manifestFile: string;
  kbInstructions: string;
  meFile: string;
  projectFile: string;
  lockFile: string;
  contentDir: string;
  pagesDir: string;
  rawDir: string;
  logDir: string;
  indexFile: string;
}
export type WikiPaths = ResolvedPaths;

/** Nearest ancestor (inclusive) holding `.wiki` or `.git` (file or directory); falls back to the resolved cwd. */
export function findRepoRoot(cwd: string): string {
  const start = path.resolve(cwd);
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, ".wiki")) || existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

export function resolvePaths(root: string, config: Pick<WikeeperConfig, "content_dir">): ResolvedPaths {
  const wikiDir = path.join(root, ".wiki");
  const systemDir = path.join(wikiDir, "system");
  const contentDir = path.resolve(root, config.content_dir);
  return {
    root,
    wikiDir,
    systemDir,
    configFile: path.join(wikiDir, "config.yml"),
    manifestFile: path.join(systemDir, "manifest.json"),
    kbInstructions: path.join(wikiDir, "kb_instructions.md"),
    meFile: path.join(wikiDir, "me.md"),
    projectFile: path.join(wikiDir, "project.md"),
    lockFile: path.join(wikiDir, ".lock"),
    contentDir,
    pagesDir: path.join(contentDir, "pages"),
    rawDir: path.join(contentDir, "raw"),
    logDir: path.join(contentDir, "log"),
    indexFile: path.join(contentDir, "index.md"),
  };
}

export function toPosixRelative(root: string, p: string): string {
  return path.relative(root, p).split(path.sep).join("/");
}

/** Inverse of toPosixRelative: the native absolute path of a posix path relative to `root` (the manifest's form). */
export function fromPosixRelative(root: string, rel: string): string {
  return path.join(root, ...rel.split("/"));
}

/** True when `child` is strictly inside `parent`; `parent` itself is not inside. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
}
