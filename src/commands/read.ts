// src/commands/read.ts -- `wikeeper read`: a web page or a file to markdown (STORY-003-10, contract K7 consumer).
import { lstat, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { DEFAULT_CONFIG, loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot, isInside, resolvePaths } from "../core/paths.js";
import { formatSize } from "../ingest/report.js";
import { describeTokens } from "../ingest/source-size.js";
import { levelOf } from "../core/tokens.js";
import type { TokenLevel } from "../core/tokens.js";
import type { CommandModule } from "../program.js";
import { readSource } from "../read/index.js";
import type { ReadResult } from "../read/index.js";

export interface ReadDeps {
  timeoutMs?: number;
  maxBytes?: number;
  fetch?: typeof fetch;
}
/** --json data: the ReadResult, plus `out` when --out was given. */
export interface ReadCommandData extends ReadResult {
  level: TokenLevel;
  out?: string;
}

const usage = (message: string): WikeeperError => new WikeeperError(ExitCode.USAGE, "usage", message);

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** R8: lexical checks, all before anything is read or fetched. Returns the absolute target. */
async function checkOut(cwd: string, out: string, contentDir: string): Promise<string> {
  const abs = path.resolve(cwd, out);
  if (await exists(abs)) throw usage(`--out ${out} already exists: read never overwrites, pick a new name`);
  let parentOk = false;
  try {
    parentOk = (await stat(path.dirname(abs))).isDirectory();
  } catch {
    parentOk = false;
  }
  if (!parentOk) throw usage(`--out ${out}: the folder ${path.dirname(out)} does not exist`);
  const ext = path.extname(abs).toLowerCase();
  if (ext !== ".md" && ext !== ".txt") throw usage(`--out ${out}: only .md and .txt files can be written`);
  if (["agents.md", "claude.md", "gemini.md"].includes(path.basename(abs).toLowerCase())) {
    throw usage(`--out ${out}: AGENTS.md, CLAUDE.md and GEMINI.md cannot be written by read`);
  }
  if (path.relative(cwd, abs).split(path.sep).some((s) => s.startsWith(".") && s !== "..")) {
    throw usage(`--out ${out}: read does not write into hidden folders or hidden files`);
  }
  const paths = resolvePaths(findRepoRoot(cwd), { content_dir: contentDir });
  if (abs === paths.contentDir || isInside(paths.contentDir, abs)) {
    throw usage(`--out ${out}: read does not write into the wiki's content directory`);
  }
  return abs;
}

export function createReadCommand(deps: ReadDeps = {}): CommandModule {
  return {
    register(program: Command): void {
      program
        .command("read")
        .description("turn a web page or a file (HTML, Markdown, text, CSV) into markdown for wikeeper ingest start --text-file")
        .argument("[source]", "a file path or an http(s) URL")
        .option("--out <file>", "write the markdown to a new .md or .txt file instead of stdout")
        .action(async (source: string | undefined, opts: { out?: string }, command: Command) => {
          const ctx = getOutputContext(command);
          if (source === undefined) throw usage("read needs a source: a file path or an http(s) URL");
          if (source === "-") throw usage("read takes a file or a URL, not stdin");
          let config = DEFAULT_CONFIG;
          try {
            config = (await loadConfig(findRepoRoot(ctx.cwd))).config;
          } catch {
            // no config.yml or a broken one: default limits, default content directory
          }
          const abs = opts.out === undefined ? undefined : await checkOut(ctx.cwd, opts.out, config.content_dir);
          const r = await readSource(source, { cwd: ctx.cwd, ...deps });
          const text = r.markdown + "\n";
          if (abs !== undefined) {
            try {
              await writeFile(abs, text, { flag: "wx" });
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code === "EEXIST") {
                throw usage(`--out ${opts.out} already exists: read never overwrites, pick a new name`);
              }
              throw err;
            }
          }
          const level = levelOf(r.tokens, config.tokens.source);
          const data: ReadCommandData = { ...r, level, ...(abs !== undefined ? { out: abs } : {}) };
          emitResult(ctx, {
            command: "read",
            data,
            warnings: r.warnings.map((w) => w.message),
            message:
              abs !== undefined
                ? `wrote ${opts.out} (${describeTokens(r.tokens, level, r.tokens_rough)} · ${formatSize(Buffer.byteLength(text))} · ${r.format})`
                : r.markdown,
          });
        });
    },
  };
}

export const readCommand: CommandModule = createReadCommand();
