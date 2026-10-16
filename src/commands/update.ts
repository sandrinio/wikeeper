import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { compareCodeUnits } from "../core/compare.js";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { applyManagedBlock, backupPaths, managedIgnoreEntries, stripManagedBlock } from "../core/gitignore.js";
import { runIntegrations } from "../core/integrations.js";
import type { IntegrationOptions } from "../core/integrations.js";
import { readManifest, sha256File, writeManifest } from "../core/manifest.js";
import type { ManifestEntry } from "../core/manifest.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot, fromPosixRelative, isInside, resolvePaths, toPosixRelative } from "../core/paths.js";
import {
  copyTemplate,
  listTemplateFiles,
  readPackageVersion,
  templatesDir as defaultTemplatesDir,
} from "../core/templates.js";
import type { CommandModule } from "../program.js";

export interface UpdateResult {
  replaced: string[];
  added: string[];
  removed: string[];
  backed_up: string[];
  warnings: string[];
}
export interface UpdateDeps {
  templatesDir?: string;
  packageVersion?: string;
  now?: () => Date;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC "YYYYMMDDHHmmss", digits only (legal in Windows file names). */
export function formatBackupStamp(d: Date): string {
  return (
    String(d.getUTCFullYear()).padStart(4, "0") +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds())
  );
}

/** Copies `file` to `<file>.bak-<stamp>[-N]` without ever overwriting; returns the backup path. */
async function backupName(file: string, stamp: string, mode: "copy" | "rename"): Promise<string> {
  for (let i = 0; ; i++) {
    const bak = `${file}.bak-${stamp}${i === 0 ? "" : `-${i}`}`;
    try {
      if (mode === "copy") {
        await copyFile(file, bak, fsConstants.COPYFILE_EXCL);
      } else {
        // rename would overwrite a file; probe first (directories/links only, rare).
        try {
          await lstat(bak);
          continue;
        } catch {
          await rename(file, bak);
        }
      }
      return bak;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw err;
    }
  }
}

export async function runUpdate(
  root: string,
  run: Pick<IntegrationOptions, "flags" | "json" | "interactive" | "io">,
  deps: UpdateDeps = {},
): Promise<UpdateResult> {
  const { config } = await loadConfig(root);
  const paths = resolvePaths(root, config);
  const manifest = await readManifest(paths.manifestFile);
  if (!manifest) throw new WikeeperError(ExitCode.ERROR, "not_initialised", "not initialised — run wikeeper init");

  const tplDir = deps.templatesDir ?? defaultTemplatesDir();
  const packageVersion = deps.packageVersion ?? readPackageVersion();
  const stamp = formatBackupStamp((deps.now ?? (() => new Date()))());

  const pkgFiles = (await listTemplateFiles("system", tplDir)).map((rel) => {
    const rest = rel.slice("system/".length);
    return {
      rel,
      mpath: `.wiki/system/${rest}`,
      dest: path.join(paths.systemDir, ...rest.split("/")),
    };
  });
  const oldSet = new Map<string, ManifestEntry>();
  for (const e of manifest.files) if (e.kind === "system") oldSet.set(e.path, e);
  const pkgPaths = new Set(pkgFiles.map((p) => p.mpath));

  // Safety pre-pass: nothing is written unless every target is inside .wiki/system.
  for (const p of pkgFiles) {
    if (!isInside(paths.systemDir, p.dest) || p.dest === paths.manifestFile) {
      throw new WikeeperError(ExitCode.ERROR, "unsafe_path", `refusing to write outside .wiki/system: ${p.mpath}`);
    }
  }
  for (const e of oldSet.values()) {
    const abs = fromPosixRelative(root, e.path);
    if (!isInside(paths.systemDir, abs) || abs === paths.manifestFile) {
      throw new WikeeperError(ExitCode.ERROR, "unsafe_path", `refusing to touch outside .wiki/system: ${e.path}`);
    }
  }

  const replaced: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const backedUp: string[] = [];
  const warnings: string[] = [];
  const newEntries: ManifestEntry[] = [];

  const backup = async (abs: string, mpath: string, mode: "copy" | "rename") => {
    const bak = await backupName(abs, stamp, mode);
    const bakRel = toPosixRelative(root, bak);
    backedUp.push(bakRel);
    warnings.push(`${mpath} was edited locally; saved as ${bakRel}`);
  };

  for (const p of pkgFiles) {
    const src = path.join(tplDir, ...p.rel.split("/"));
    const newHash = await sha256File(src);
    newEntries.push({ path: p.mpath, sha256: newHash, kind: "system" });
    const old = oldSet.get(p.mpath);
    const bucket = old ? replaced : added;
    let st;
    try {
      st = await lstat(p.dest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      await copyTemplate(p.rel, p.dest, tplDir);
      bucket.push(p.mpath);
      continue;
    }
    if (!st.isFile()) {
      await backup(p.dest, p.mpath, "rename");
      await copyTemplate(p.rel, p.dest, tplDir);
      bucket.push(p.mpath);
      continue;
    }
    const cur = await sha256File(p.dest);
    if (cur === newHash) continue;
    if (!(old && cur === old.sha256)) await backup(p.dest, p.mpath, "copy");
    await copyTemplate(p.rel, p.dest, tplDir);
    bucket.push(p.mpath);
  }

  for (const [mpath, old] of oldSet) {
    if (pkgPaths.has(mpath)) continue;
    const abs = fromPosixRelative(root, old.path);
    let st;
    try {
      st = await lstat(abs);
    } catch {
      continue;
    }
    if (st.isFile() && (await sha256File(abs)) !== old.sha256) {
      await backup(abs, mpath, "copy");
    }
    await rm(abs, { force: true, recursive: !st.isFile() && !st.isSymbolicLink() });
    removed.push(mpath);
    for (let dir = path.dirname(abs); isInside(paths.systemDir, dir); dir = path.dirname(dir)) {
      try {
        await rmdir(dir);
      } catch {
        break;
      }
    }
  }

  manifest.files = [...manifest.files.filter((e) => e.kind !== "system"), ...newEntries];
  manifest.package_version = packageVersion;
  await writeManifest(manifest, paths.manifestFile);

  const report = await runIntegrations("update", {
    root,
    paths,
    config,
    options: { ...run, manifest, templatesDir: tplDir, packageVersion },
  });
  await writeManifest(manifest, paths.manifestFile);
  added.push(...report.created);
  replaced.push(...report.replaced);
  removed.push(...report.removed);
  backedUp.push(...report.backed_up);
  warnings.push(...report.warnings);

  // Keep the managed .gitignore block current; never recreate one that is missing or malformed.
  const backups = backupPaths(manifest);
  const giPath = path.join(root, ".gitignore");
  let giText: string | null = null;
  try {
    giText = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(await readFile(giPath));
  } catch {
    giText = null;
  }
  if (giText !== null && stripManagedBlock(giText).status === "stripped") {
    const ignore = managedIgnoreEntries(paths, config, backups);
    const next = applyManagedBlock(giText, ignore.entries);
    if (next !== giText) {
      await writeFile(giPath, next);
      replaced.push(".gitignore");
    }
  } else if (backups.length > 0) {
    warnings.push(
      `.gitignore has no well-formed wikeeper block, so these backups are not ignored: ${[...backups]
        .sort(compareCodeUnits)
        .join(", ")}; run wikeeper init to restore the block`,
    );
  }

  return {
    replaced: replaced.sort(compareCodeUnits),
    added: added.sort(compareCodeUnits),
    removed: removed.sort(compareCodeUnits),
    backed_up: backedUp.sort(compareCodeUnits),
    warnings: warnings.sort(compareCodeUnits),
  };
}

export function createUpdateCommand(deps: UpdateDeps = {}): CommandModule {
  return {
    register(program: Command): void {
      program
        .command("update")
        .description("bring wikeeper's own files up to the installed version")
        .action(async (_opts: unknown, command: Command) => {
          const ctx = getOutputContext(command);
          const root = findRepoRoot(ctx.cwd);
          const data = await runUpdate(
            root,
            {
              flags: command.opts(),
              json: ctx.json,
              interactive: ctx.isTTY && !ctx.json,
              io: { stdout: ctx.stdout, stderr: ctx.stderr, stdin: ctx.stdin, cwd: ctx.cwd },
            },
            deps,
          );
          const changed = data.replaced.length + data.added.length + data.removed.length;
          // Human summary goes to stderr: the red test drives plain `update` and parses the last stdout line.
          if (!ctx.json) {
            ctx.stderr.write(
              (changed
                ? `updated: ${data.replaced.length} replaced, ${data.added.length} added, ${data.removed.length} removed`
                : "already up to date") + "\n",
            );
          }
          emitResult(ctx, { command: "update", data, warnings: data.warnings });
        });
    },
  };
}

export const updateCommand: CommandModule = createUpdateCommand();
