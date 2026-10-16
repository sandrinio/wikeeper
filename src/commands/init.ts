import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { compareCodeUnits } from "../core/compare.js";
import { formatConfigIssue, loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { applyManagedBlock, backupPaths, managedIgnoreEntries } from "../core/gitignore.js";
import { runIntegrations } from "../core/integrations.js";
import type { IntegrationOptions } from "../core/integrations.js";
import { readManifest, serializeManifest, writeManifest } from "../core/manifest.js";
import type { Manifest, ManifestEntry } from "../core/manifest.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot, resolvePaths, toPosixRelative } from "../core/paths.js";
import {
  copyTemplate,
  listTemplateFiles,
  readPackageVersion,
  templatesDir as defaultTemplatesDir,
} from "../core/templates.js";
import type { CommandModule } from "../program.js";

export const PROFILES = ["management"] as const;

export interface InitResult {
  created: string[];
  updated: string[];
  skipped: string[];
  removed: string[];
  backed_up: string[];
  manifest: string;
}
export interface InitDeps {
  templatesDir?: string;
  packageVersion?: string;
}

const MANIFEST_REL = ".wiki/system/manifest.json";

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

async function readBytes(p: string): Promise<Buffer | null> {
  try {
    return await readFile(p);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

interface Execution {
  result: InitResult;
  warnings: string[];
  message: string;
}

async function execInit(
  root: string,
  run: Pick<IntegrationOptions, "flags" | "json" | "interactive" | "io">,
  deps: InitDeps,
): Promise<Execution> {
  const profile = typeof run.flags.profile === "string" ? run.flags.profile : "management";
  if (!(PROFILES as readonly string[]).includes(profile)) {
    throw new WikeeperError(
      ExitCode.USAGE,
      "usage",
      `unknown profile "${profile}"; available profiles: ${PROFILES.join(", ")}`,
      { available: [...PROFILES] },
    );
  }

  const { config, warnings: cfgWarnings, errors } = await loadConfig(root);
  if (errors.length > 0) {
    throw new WikeeperError(
      ExitCode.ERROR,
      "config_invalid",
      ".wiki/config.yml is invalid: " + errors.map(formatConfigIssue).join("; "),
    );
  }
  const warnings: string[] = cfgWarnings.map(formatConfigIssue);

  const paths = resolvePaths(root, config);
  const old = await readManifest(paths.manifestFile);
  const tplDir = deps.templatesDir ?? defaultTemplatesDir();
  const packageVersion = deps.packageVersion ?? readPackageVersion();

  const tpl = await listTemplateFiles("system", tplDir);
  const systemTargets = tpl.map((rel) => {
    const rest = rel.slice("system/".length);
    return {
      rel,
      posix: `.wiki/system/${rest}`,
      abs: path.join(paths.systemDir, ...rest.split("/")),
    };
  });
  for (const t of systemTargets) {
    if (t.abs === paths.manifestFile) throw new WikeeperError(ExitCode.ERROR, "unsafe_path", `${t.posix} is reserved`);
    try {
      if (!(await lstat(t.abs)).isFile()) {
        throw new WikeeperError(ExitCode.ERROR, "unsafe_path", `${t.posix} is not a regular file`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  const giPath = path.join(root, ".gitignore");
  const giBytes = await readBytes(giPath);
  const existedBefore = giBytes !== null;
  let giText = "";
  if (giBytes) {
    try {
      giText = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(giBytes);
    } catch {
      throw new WikeeperError(ExitCode.ERROR, "gitignore_not_utf8", ".gitignore is not valid UTF-8; fix it and re-run");
    }
  }

  const manifestBefore = await readBytes(paths.manifestFile);

  // Every question is asked before the first write.
  const options: IntegrationOptions = {
    flags: run.flags,
    json: run.json,
    interactive: run.interactive,
    io: run.io,
    manifest: { package_version: packageVersion, files: [...(old?.files ?? [])] },
    templatesDir: tplDir,
    packageVersion,
  };
  await runIntegrations("prepare", { root, paths, config, options });

  // Rollback bookkeeping: exactly what this run creates or overwrites.
  const createdFiles: string[] = [];
  const createdDirs: string[] = [];
  const overwritten = new Map<string, Buffer>();

  const ensureDir = async (dir: string): Promise<void> => {
    let top: string | null = null;
    for (let d = dir; ; d = path.dirname(d)) {
      if (await exists(d)) break;
      top = d;
      if (path.dirname(d) === d) break;
    }
    if (top) createdDirs.push(top);
    await mkdir(dir, { recursive: true });
  };

  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const removed: string[] = [];
  const backedUp: string[] = [];
  const rel = (p: string): string => toPosixRelative(root, p);

  try {
    // 6. package-owned system files
    const systemEntries: ManifestEntry[] = [];
    for (const t of systemTargets) {
      const before = await readBytes(t.abs);
      if (before === null) await ensureDir(path.dirname(t.abs));
      const r = await copyTemplate(t.rel, t.abs, tplDir);
      if (r.written) {
        if (before === null) {
          created.push(t.posix);
          createdFiles.push(t.abs);
        } else {
          updated.push(t.posix);
          overwritten.set(t.abs, before);
        }
      } else skipped.push(t.posix);
      systemEntries.push({ path: t.posix, sha256: r.sha256, kind: "system" });
    }

    // 7. user-owned seeds
    const seed = async (abs: string, write: () => Promise<void>): Promise<void> => {
      if (await exists(abs)) {
        skipped.push(rel(abs));
        return;
      }
      await ensureDir(path.dirname(abs));
      await write();
      createdFiles.push(abs);
      created.push(rel(abs));
    };
    await seed(paths.configFile, () =>
      writeFile(
        paths.configFile,
        `# wikeeper configuration (user-owned). Missing keys use built-in defaults.\nprofile: ${profile}\nagents: []\n`,
      ),
    );
    await seed(paths.kbInstructions, async () => {
      await copyTemplate(`kb_instructions.${profile}.md`, paths.kbInstructions, tplDir);
    });
    await seed(paths.indexFile, async () => {
      await copyTemplate("index.md", paths.indexFile, tplDir);
    });
    for (const dir of [paths.rawDir, paths.pagesDir, paths.logDir]) {
      await seed(path.join(dir, ".gitkeep"), () => writeFile(path.join(dir, ".gitkeep"), ""));
    }

    // 8. .gitignore
    // The block is written after the integrations, so it lists the final backups.
    const oldGi = old?.files.find((f) => f.kind === "gitignore" && f.path === ".gitignore");
    const giEntry: ManifestEntry = {
      path: ".gitignore",
      sha256: null,
      kind: "gitignore",
      created: oldGi?.created ?? !existedBefore,
    };

    // 9. working manifest
    const systemPaths = new Set(systemEntries.map((e) => e.path));
    const kept = (old?.files ?? []).filter(
      (f) => !(f.kind === "system" && systemPaths.has(f.path)) && !(f.kind === "gitignore" && f.path === ".gitignore"),
    );
    const working: Manifest = { package_version: packageVersion, files: [...kept, ...systemEntries, giEntry] };
    await ensureDir(paths.systemDir);
    await writeManifest(working, paths.manifestFile);

    // 10. integrations
    options.manifest = working;
    const r = await runIntegrations("init", { root, paths, config, options });
    created.push(...r.created);
    updated.push(...r.replaced);
    skipped.push(...r.skipped);
    removed.push(...r.removed);
    backedUp.push(...r.backed_up);
    warnings.push(...r.warnings);

    const ignore = managedIgnoreEntries(paths, config, backupPaths(working));
    warnings.push(...ignore.warnings);
    const nextGi = applyManagedBlock(giText, ignore.entries);
    if (nextGi !== giText) {
      await writeFile(giPath, nextGi);
      (existedBefore ? updated : created).push(".gitignore");
    } else skipped.push(".gitignore");
    // Handlers mutate `working`; persist the final state.
    await writeManifest(working, paths.manifestFile);

    const finalBytes = Buffer.from(serializeManifest(working), "utf8");
    if (manifestBefore === null) created.push(MANIFEST_REL);
    else if (!manifestBefore.equals(finalBytes)) updated.push(MANIFEST_REL);
    else skipped.push(MANIFEST_REL);
  } catch (err) {
    for (const [abs, bytes] of overwritten) await writeFile(abs, bytes).catch(() => undefined);
    for (const f of createdFiles) await rm(f, { force: true }).catch(() => undefined);
    if (giBytes === null) await rm(giPath, { force: true }).catch(() => undefined);
    else await writeFile(giPath, giBytes).catch(() => undefined);
    if (manifestBefore === null) await rm(paths.manifestFile, { force: true }).catch(() => undefined);
    else await writeFile(paths.manifestFile, manifestBefore).catch(() => undefined);
    for (const d of createdDirs.reverse()) await rm(d, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }

  const result: InitResult = {
    created: [...new Set(created)].sort(compareCodeUnits),
    updated: [...new Set(updated)].sort(compareCodeUnits),
    skipped: [...new Set(skipped)]
      .filter((p) => !created.includes(p) && !updated.includes(p) && !removed.includes(p) && !backedUp.includes(p))
      .sort(compareCodeUnits),
    removed: [...new Set(removed)].sort(compareCodeUnits),
    backed_up: [...new Set(backedUp)].sort(compareCodeUnits),
    manifest: MANIFEST_REL,
  };
  const message =
    result.created.length === 0 &&
    result.updated.length === 0 &&
    result.removed.length === 0 &&
    result.backed_up.length === 0
      ? "already initialised: nothing changed"
      : [
          `initialised .wiki/: ${result.created.length} created, ${result.updated.length} updated, ${result.skipped.length} unchanged`,
          "next: ask your agent to read .wiki/system/SETUP.md",
        ].join("\n");
  return { result, warnings, message };
}

export async function runInit(
  root: string,
  run: Pick<IntegrationOptions, "flags" | "json" | "interactive" | "io">,
  deps: InitDeps = {},
): Promise<InitResult> {
  return (await execInit(root, run, deps)).result;
}

export function createInitCommand(deps: InitDeps = {}): CommandModule {
  return {
    register(program: Command): void {
      program
        .command("init")
        .description("scaffold .wiki/ and wire it into your agents")
        .option("--profile <name>", "wiki profile", "management")
        .option("--agents <list>", "comma-separated agents to wire")
        .option("--yes", "never prompt; take the default for each question")
        .option("--enforce", "install the optional enforcement hook")
        .action(async (opts: Record<string, unknown>, cmd: Command) => {
          const ctx = getOutputContext(cmd);
          const root = findRepoRoot(ctx.cwd);
          const interactive = ctx.isTTY && !ctx.json && !opts.yes;
          const { result, warnings, message } = await execInit(
            root,
            { flags: opts, json: ctx.json, interactive, io: { stdout: ctx.stdout, stderr: ctx.stderr, stdin: ctx.stdin, cwd: ctx.cwd } },
            deps,
          );
          emitResult(ctx, { command: "init", data: result, warnings, message });
        });
    },
  };
}

export const initCommand: CommandModule = createInitCommand();
