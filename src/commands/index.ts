import { existsSync } from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { getOutputContext, emitResult } from "../core/output.js";
import { assertInitialised, findRepoRoot, resolvePaths, toPosixRelative } from "../core/paths.js";
import { writeIndex } from "../ingest/index-builder.js";
import { readLogEvents, regenerateLogView } from "../ingest/log.js";
import type { CommandModule } from "../program.js";

export interface IndexRebuildResult {
  index: { file: string; pages: number; archived: number; changed: boolean };
  log: { file: string; events: number };
  skipped: Array<{ file: string; reason: string }>;
}

export const indexCommand: CommandModule = {
  register(program: Command): void {
    const index = program.command("index").description("maintain index.md and the generated log view");
    index
      .command("rebuild")
      .description("regenerate index.md and log.md from pages and log/ (recovery after a git merge)")
      .action(async (_opts: unknown, command: Command) => {
        const ctx = getOutputContext(command);
        const root = findRepoRoot(ctx.cwd);
        const { config } = await loadConfig(root);
        const paths = resolvePaths(root, config);
        await assertInitialised(paths);
        if (existsSync(paths.lockFile)) {
          throw new WikeeperError(
            ExitCode.ERROR,
            "ingest_in_progress",
            "an ingest is in progress (.wiki/.lock): finish or abort it before rebuilding the index",
          );
        }
        const idx = await writeIndex(paths);
        const { skipped } = await readLogEvents(paths);
        const log = await regenerateLogView(paths);
        const warnings = [
          ...idx.errors.map((e) => `${toPosixRelative(root, path.join(paths.pagesDir, e.path))}: ${e.message}`),
          ...skipped.map((s) => `${s.file}: ${s.reason}`),
        ];
        const data: IndexRebuildResult = {
          index: { file: idx.file, pages: idx.pages, archived: idx.archived, changed: idx.changed },
          log: { file: log.file, events: log.events },
          skipped,
        };
        emitResult(ctx, {
          command: "index rebuild",
          data,
          message: `rebuilt ${idx.file} (${idx.pages} pages${idx.archived > 0 ? `, ${idx.archived} archived` : ""}${idx.changed ? "" : ", unchanged"}) and ${log.file} (${log.events} events)`,
          warnings,
        });
      });
  },
};
