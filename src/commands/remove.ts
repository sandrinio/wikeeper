import { lstat, readdir, readFile, rm, rmdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import type { CommandModule } from "../program.js";
import { compareCodeUnits } from "../core/compare.js";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { stripManagedBlock } from "../core/gitignore.js";
import { runIntegrations } from "../core/integrations.js";
import type { IntegrationContext } from "../core/integrations.js";
import { readManifest } from "../core/manifest.js";
import { emitResult, getOutputContext } from "../core/output.js";
import type { OutputContext } from "../core/output.js";
import { findRepoRoot, fromPosixRelative, isInside, resolvePaths, toPosixRelative } from "../core/paths.js";
import { readPackageVersion, templatesDir } from "../core/templates.js";

export interface RemoveResult {
  removed: string[];
  kept: string[];
  purged: boolean;
}

export const CONFIRM_WORD = "wikeeper";

function mismatch(): WikeeperError {
  return new WikeeperError(
    ExitCode.ERROR,
    "confirmation_mismatch",
    `confirmation did not match "${CONFIRM_WORD}"; nothing was removed`,
  );
}

async function confirmPurge(ctx: OutputContext, confirm: string | undefined): Promise<void> {
  if (confirm !== undefined) {
    if (confirm !== CONFIRM_WORD) throw mismatch();
    return;
  }
  if (!(ctx.isTTY && !ctx.json)) {
    throw new WikeeperError(
      ExitCode.NEEDS_INPUT,
      "needs_input",
      `remove --purge deletes the wiki: re-run with --confirm ${CONFIRM_WORD}`,
    );
  }
  ctx.stderr.write(`This deletes the wiki and its content. Type "${CONFIRM_WORD}" to confirm: `);
  const rl = createInterface({ input: ctx.stdin, terminal: false });
  let answer = "";
  for await (const line of rl) {
    answer = line;
    break;
  }
  rl.close();
  if (answer.trim() !== CONFIRM_WORD) throw mismatch();
}

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function rmdirIfEmpty(dir: string): Promise<void> {
  try {
    await rmdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTEMPTY" || code === "EEXIST" || code === "ENOENT") return;
    throw err;
  }
}

async function dirsDeepestFirst(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const abs = path.join(dir, e.name);
      out.push(...(await dirsDeepestFirst(abs)), abs);
    }
  }
  return out;
}

async function filesUnder(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await filesUnder(abs)));
    else out.push(abs);
  }
  return out;
}

async function stripGitignore(
  root: string,
  created: boolean,
  removed: string[],
  warnings: string[],
): Promise<void> {
  const file = path.join(root, ".gitignore");
  let buf: Buffer;
  try {
    buf = await readFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(buf);
  } catch {
    warnings.push(".gitignore is not valid UTF-8; left unchanged");
    return;
  }
  const r = stripManagedBlock(text);
  if (r.status === "malformed") {
    warnings.push(".gitignore has a wikeeper start marker without an end marker; left unchanged");
    return;
  }
  if (r.status === "absent") return;
  if (r.text.trim() === "" && created) {
    await unlink(file);
    removed.push(".gitignore");
  } else {
    await writeFile(file, r.text);
  }
}

export const removeCommand: CommandModule = {
  register(program) {
    program
      .command("remove")
      .description("Uninstall wikeeper's tooling; --purge also deletes the wiki")
      .option("--purge", "also delete .wiki/ (config.yml, kb_instructions.md, me.md) and the wiki content: pages/, raw/, index.md, log/, in .wiki/ or content_dir (needs confirmation)")
      .option("--confirm <word>", `confirmation word for --purge (${CONFIRM_WORD})`)
      .action(async (opts: { purge?: boolean; confirm?: string }, cmd) => {
        const ctx = getOutputContext(cmd);
        const root = findRepoRoot(ctx.cwd);
        const { config } = await loadConfig(root);
        const paths = resolvePaths(root, config);
        const manifest = await readManifest(paths.manifestFile);
        if (manifest === null) {
          throw new WikeeperError(ExitCode.ERROR, "not_initialised", "not initialised — run wikeeper init");
        }
        const purge = Boolean(opts.purge);
        if (purge) await confirmPurge(ctx, opts.confirm);

        const coreEntries = manifest.files.filter((e) => e.kind === "system" || e.kind === "file");
        const coreTargets = coreEntries.map((e) => ({ rel: e.path, abs: fromPosixRelative(root, e.path) }));
        for (const t of coreTargets) {
          if (!isInside(paths.wikiDir, t.abs)) {
            throw new WikeeperError(ExitCode.ERROR, "unsafe_path", `refusing to delete ${t.rel}: outside .wiki/`);
          }
        }

        const removed: string[] = [];
        const warnings: string[] = [];

        const ictx: IntegrationContext = {
          root,
          paths,
          config,
          options: {
            flags: { purge, confirm: opts.confirm },
            json: ctx.json,
            interactive: ctx.isTTY && !ctx.json,
            io: { stdout: ctx.stdout, stderr: ctx.stderr, stdin: ctx.stdin, cwd: ctx.cwd },
            manifest,
            templatesDir: templatesDir(),
            packageVersion: readPackageVersion(),
          },
        };
        const r = await runIntegrations("remove", ictx);

        for (const t of [...coreTargets].sort((a, b) => compareCodeUnits(b.rel, a.rel))) {
          if (await exists(t.abs)) {
            await rm(t.abs, { force: true, maxRetries: 3 });
            removed.push(t.rel);
          }
        }

        const gi = manifest.files.find((e) => e.kind === "gitignore");
        await stripGitignore(root, gi?.created === true, removed, warnings);

        if (await exists(paths.manifestFile)) {
          await rm(paths.manifestFile, { force: true, maxRetries: 3 });
          removed.push(toPosixRelative(root, paths.manifestFile));
        }
        for (const d of await dirsDeepestFirst(paths.systemDir)) await rmdirIfEmpty(d);
        await rmdirIfEmpty(paths.systemDir);
        const leftovers = (await filesUnder(paths.systemDir)).map((f) => toPosixRelative(root, f));

        if (purge) {
          await rm(paths.wikiDir, { recursive: true, force: true, maxRetries: 3 });
          if (paths.contentDir !== paths.wikiDir && !isInside(paths.wikiDir, paths.contentDir)) {
            const owned = [
              paths.pagesDir,
              paths.rawDir,
              paths.logDir,
              paths.indexFile,
              path.join(paths.contentDir, "log.md"),
            ];
            for (const p of owned) {
              if (!isInside(paths.contentDir, p)) continue;
              await rm(p, { recursive: true, force: true, maxRetries: 3 });
            }
            if (paths.contentDir !== root) await rmdirIfEmpty(paths.contentDir);
          }
        }

        const keptCandidates = [
          paths.configFile,
          paths.kbInstructions,
          paths.meFile,
          paths.indexFile,
          paths.pagesDir,
          paths.rawDir,
          paths.logDir,
        ];
        const kept: string[] = [];
        for (const p of keptCandidates) if (await exists(p)) kept.push(toPosixRelative(root, p));
        kept.push(...leftovers.filter(() => !purge));
        if (purge && (await exists(paths.contentDir)) && paths.contentDir !== root) {
          kept.push(toPosixRelative(root, paths.contentDir));
        }

        const data: RemoveResult = {
          removed: [...new Set([...removed, ...r.removed])].sort(compareCodeUnits),
          kept: [...new Set([...kept, ...r.kept])].sort(compareCodeUnits),
          purged: purge,
        };
        const allWarnings = [...warnings, ...r.warnings].sort(compareCodeUnits);
        emitResult(ctx, {
          command: "remove",
          data,
          warnings: allWarnings,
          message: purge
            ? `removed wikeeper and purged the wiki (${data.removed.length} files)`
            : `removed wikeeper tooling (${data.removed.length} files); knowledge kept`,
        });
      });
  },
};
