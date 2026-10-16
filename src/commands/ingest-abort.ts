// src/commands/ingest-abort.ts
// `wikeeper ingest abort <id> [--drop]`: roll an ingest's write phase back and release the lock.
import { stat } from "node:fs/promises";
import type { Command } from "commander";
import { compareCodeUnits } from "../core/compare.js";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot, resolvePaths, toPosixRelative } from "../core/paths.js";
import { readLock, releaseLock } from "../ingest/lock.js";
import { readLogEvents, writeLogEvent } from "../ingest/log.js";
import { readMeta, removeSource } from "../ingest/registry.js";
import { readSnapshot, removeSnapshot, restoreSnapshot, snapshotDir } from "../ingest/snapshot.js";
import { plural } from "./doctor.js";
import type { IngestSubcommand } from "./ingest.js";

function ageText(ms: number): string {
  return ms < 3_600_000 ? plural(Math.floor(ms / 60_000), "minute") : plural(Math.floor(ms / 3_600_000), "hour");
}

export const ingestAbortCommand: IngestSubcommand = {
  register(group: Command): void {
    group
      .command("abort")
      .description("roll back an ingest's write phase: restore pages/ and release the lock")
      .argument("<id>", "source id")
      .option("--drop", "also delete the registered source from raw/")
      .action(async (id: string, opts: { drop?: boolean }, command: Command) => {
        const ctx = getOutputContext(command);
        const root = findRepoRoot(ctx.cwd);
        const { config } = await loadConfig(root);
        const paths = resolvePaths(root, config);
        try {
          await stat(paths.configFile);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            throw new WikeeperError(ExitCode.ERROR, "not_initialised", "wiki is not initialised: run wikeeper init");
          }
          throw err;
        }

        if ((await readLogEvents(paths, { type: "ingest", sourceId: id })).events.length > 0) {
          throw new WikeeperError(
            ExitCode.ERROR,
            "ingest_finished",
            `the ingest of ${id} is already finished; its pages and raw files are provenance`,
          );
        }
        const meta = await readMeta(paths, id);
        const now = new Date();
        const lock = await readLock(paths, now);
        const mine = lock.lock?.source_id === id;
        if (meta === null && !mine) {
          throw new WikeeperError(ExitCode.ERROR, "unknown_source", `no source ${id} is registered and no write lock names it`);
        }
        if (opts.drop === true && lock.held && !mine) {
          const holder = lock.lock?.source_id ?? null;
          throw new WikeeperError(
            ExitCode.ERROR,
            "locked",
            holder === null
              ? "cannot drop while .wiki/.lock is unreadable: another ingest may be writing; rerun wikeeper ingest apply --force-unlock first"
              : `cannot drop ${id}: ingest ${holder} holds the write lock (acquired ${ageText(lock.age_ms ?? 0)} ago); ` +
                `dropping raw files mid-write would look like a write outside pages/ to it`,
            { holder, age_ms: lock.age_ms, stale: lock.stale },
          );
        }

        const warnings: string[] = [];
        let restored: string[] = [];
        let removed: string[] = [];
        if (mine) {
          const snap = await readSnapshot(paths, id);
          if (snap === null) {
            warnings.push("snapshot missing; pages were not restored");
            await releaseLock(paths, id);
          } else {
            ({ restored, removed } = await restoreSnapshot(paths, id));
            await removeSnapshot(paths, id);
            await releaseLock(paths, id);
          }
        } else {
          warnings.push(`${id} holds no write lock; nothing to restore`);
          const left = await readSnapshot(paths, id);
          if (left !== null) {
            warnings.push(
              `a snapshot of ${id} from ${left.taken_at} is left at ${toPosixRelative(root, snapshotDir(paths, id))}; it was not restored`,
            );
          }
        }

        let droppedFiles: string[] = [];
        const dropped = opts.drop === true;
        if (dropped) droppedFiles = await removeSource(paths, id);

        const logFile = await writeLogEvent(paths, {
          type: "abort",
          at: now.toISOString(),
          source_id: id,
          dropped,
          restored: [...restored, ...removed].sort(compareCodeUnits),
        });
        const data = {
          source_id: id,
          restored,
          removed,
          dropped,
          dropped_files: droppedFiles,
          log_file: logFile,
        };
        const lines = [
          `aborted ${id}: ${plural(restored.length, "page")} restored, ${removed.length} removed` +
            `${dropped ? `, ${plural(droppedFiles.length, "file")} dropped from raw/` : ""}`,
        ];
        emitResult(ctx, { command: "ingest abort", data, warnings, message: lines });
      });
  },
};
