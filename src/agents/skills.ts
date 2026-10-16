import { lstat, mkdir, readlink, rm, symlink as fsSymlink } from "node:fs/promises";
import type { AgentName } from "./agent-names.js";
import { compareCodeUnits } from "../core/compare.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import type { Manifest, ManifestEntry } from "../core/manifest.js";
import { fromPosixRelative } from "../core/paths.js";
import { copyTemplate, listTemplateFiles, templatesDir as defaultTemplatesDir } from "../core/templates.js";

export const SHARED_SKILLS_DIR = ".agents/skills";
export const CLAUDE_SKILLS_DIR = ".claude/skills";
export const SHARED_AGENT = "shared"; // ManifestEntry.agent for .agents/skills/**
export interface InstallResult {
  // posix paths relative to root, code-unit sorted
  created: string[];
  replaced: string[];
  skipped: string[];
  dirs: string[]; // directories this call created, parents first
  warnings: string[];
}
export interface InstallSkillsOptions {
  root: string;
  agents: readonly AgentName[];
  manifest: Manifest; // mutated in place
  templatesDir?: string; // default templatesDir()
  platform?: NodeJS.Platform; // default process.platform
  symlink?: (target: string, linkPath: string) => Promise<void>; // default (t, p) => fs.symlink(t, p, "dir")
}

export async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch {
    return false;
  }
}

export function emptyResult(): InstallResult {
  return { created: [], replaced: [], skipped: [], dirs: [], warnings: [] };
}

export function finishResult(r: InstallResult): InstallResult {
  r.created.sort(compareCodeUnits);
  r.replaced.sort(compareCodeUnits);
  r.skipped.sort(compareCodeUnits);
  return r;
}

/** Create `relDir` (and missing ancestors) under root, recording each created directory, parents first. */
export async function ensureDir(root: string, relDir: string, dirs: string[]): Promise<void> {
  const parts = relDir.split("/").filter(Boolean);
  for (let i = 1; i <= parts.length; i++) {
    const rel = parts.slice(0, i).join("/");
    if (!(await exists(fromPosixRelative(root, rel)))) {
      await mkdir(fromPosixRelative(root, rel));
      if (!dirs.includes(rel)) dirs.push(rel);
    }
  }
}

export function upsertManifestEntry(manifest: Manifest, entry: ManifestEntry): void {
  const i = manifest.files.findIndex((f) => f.path === entry.path && f.kind === entry.kind);
  if (i >= 0) manifest.files[i] = entry;
  else manifest.files.push(entry);
}

function owned(manifest: Manifest, rel: string): boolean {
  return manifest.files.some((f) => f.path === rel);
}

function ownedTree(manifest: Manifest, rel: string): boolean {
  return manifest.files.some((f) => f.path === rel || f.path.startsWith(`${rel}/`));
}

async function skillFiles(base: string): Promise<Array<{ name: string; file: string }>> {
  const files = await listTemplateFiles("skills", base);
  return files.map((rel) => {
    const [, name, ...rest] = rel.split("/");
    return { name: name as string, file: rest.join("/") };
  });
}

export async function skillConflicts(options: InstallSkillsOptions): Promise<string[]> {
  const { root, agents, manifest } = options;
  if (agents.length === 0) return [];
  const base = options.templatesDir ?? defaultTemplatesDir();
  const out = new Set<string>();
  for (const { name, file } of await skillFiles(base)) {
    const rel = `${SHARED_SKILLS_DIR}/${name}/${file}`;
    if ((await exists(fromPosixRelative(root, rel))) && !owned(manifest, rel)) out.add(rel);
  }
  if (agents.includes("claude")) {
    const names = [...new Set((await skillFiles(base)).map((s) => s.name))];
    for (const name of names) {
      const rel = `${CLAUDE_SKILLS_DIR}/${name}`;
      if (!(await exists(fromPosixRelative(root, rel)))) continue;
      if (!ownedTree(manifest, rel)) {
        out.add(rel);
        continue;
      }
      const isLink = manifest.files.some((f) => f.path === rel && f.kind === "link");
      if (isLink) continue;
      for (const s of (await skillFiles(base)).filter((x) => x.name === name)) {
        const frel = `${rel}/${s.file}`;
        if ((await exists(fromPosixRelative(root, frel))) && !owned(manifest, frel)) out.add(frel);
      }
    }
  }
  return [...out].sort(compareCodeUnits);
}

export function conflictError(conflicts: string[]): WikeeperError {
  return new WikeeperError(
    ExitCode.ERROR,
    "install_conflict",
    "wikeeper does not own these files and will not overwrite them: " + conflicts.join(", "),
    { conflicts },
  );
}

export async function installSkills(options: InstallSkillsOptions): Promise<InstallResult> {
  const { root, agents, manifest } = options;
  const result = emptyResult();
  if (agents.length === 0) return result;
  const conflicts = await skillConflicts(options);
  if (conflicts.length > 0) throw conflictError(conflicts);

  const base = options.templatesDir ?? defaultTemplatesDir();
  const platform = options.platform ?? process.platform;
  const link = options.symlink ?? ((t: string, p: string) => fsSymlink(t, p, "dir"));
  const all = await skillFiles(base);
  const names = [...new Set(all.map((s) => s.name))];

  const copyFiles = async (name: string, destDir: string, agent: string, mode?: "copy"): Promise<void> => {
    for (const s of all.filter((x) => x.name === name)) {
      const rel = `${destDir}/${name}/${s.file}`;
      const target = fromPosixRelative(root, rel);
      const had = await exists(target);
      await ensureDir(root, rel.split("/").slice(0, -1).join("/"), result.dirs);
      const { written, sha256 } = await copyTemplate(`skills/${name}/${s.file}`, target, base);
      (had ? (written ? result.replaced : result.skipped) : result.created).push(rel);
      const entry: ManifestEntry = { path: rel, sha256, kind: "skill", agent };
      if (mode) entry.mode = mode;
      upsertManifestEntry(manifest, entry);
    }
  };

  for (const name of names) await copyFiles(name, SHARED_SKILLS_DIR, SHARED_AGENT);

  if (agents.includes("claude")) {
    for (const name of names) {
      const rel = `${CLAUDE_SKILLS_DIR}/${name}`;
      const target = fromPosixRelative(root, rel);
      const existingLink = manifest.files.some((f) => f.path === rel && f.kind === "link");
      let st = null as Awaited<ReturnType<typeof lstat>> | null;
      try {
        st = await lstat(target);
      } catch {
        st = null;
      }
      let useLink: boolean;
      if (existingLink && st?.isSymbolicLink()) useLink = true;
      else if (st?.isDirectory() && !st.isSymbolicLink() && manifest.files.some((f) => f.path.startsWith(`${rel}/`))) {
        useLink = false;
      } else useLink = platform !== "win32";

      if (useLink) {
        const linkTarget = `../../${SHARED_SKILLS_DIR}/${name}`;
        let done = false;
        if (st?.isSymbolicLink()) {
          if ((await readlink(target)) === linkTarget) {
            result.skipped.push(rel);
            done = true;
          } else {
            await rm(target, { force: true, maxRetries: 3 });
            st = null;
            result.replaced.push(rel);
          }
        }
        if (!done) {
          try {
            await ensureDir(root, CLAUDE_SKILLS_DIR, result.dirs);
            await link(linkTarget, target);
            if (!result.replaced.includes(rel)) result.created.push(rel);
            done = true;
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== "EPERM" && code !== "EACCES") throw err;
            const i = result.replaced.indexOf(rel);
            if (i >= 0) result.replaced.splice(i, 1);
            useLink = false;
          }
        }
        if (done) {
          manifest.files = manifest.files.filter((f) => !(f.kind === "skill" && f.agent === "claude" && f.path.startsWith(`${rel}/`)));
          upsertManifestEntry(manifest, { path: rel, sha256: null, kind: "link", agent: "claude", mode: "symlink" });
          continue;
        }
      }
      await copyFiles(name, CLAUDE_SKILLS_DIR, "claude", "copy");
      manifest.files = manifest.files.filter((f) => !(f.kind === "link" && f.path === rel));
    }
  }
  return finishResult(result);
}

