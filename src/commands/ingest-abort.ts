// src/commands/ingest-abort.ts
// `wikeeper ingest abort <id> [--drop]`: roll an ingest's write phase back and release the lock.
import type { Command } from "commander";
import { compareCodeUnits } from "../core/compare.js";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { assertInitialised, findRepoRoot, resolvePaths, toPosixRelative } from "../core/paths.js";
import { formatLockAge, readLock, releaseLock } from "../ingest/lock.js";
import { readLogEvents, writeLogEvent } from "../ingest/log.js";
import { readMeta, removeSource } from "../ingest/registry.js";
import { readSnapshot, removeSnapshot, restoreSnapshot, snapshotDir } from "../ingest/snapshot.js";
import { plural } from "./doctor.js";
import type { IngestSubcommand } from "./ingest.js";

const ABORT_HELP =
  "After apply, abort restores pages/ and archive/ from the snapshot and releases the lock. Before apply nothing is locked: abort records the abort in log/. --drop deletes raw/<id>.* (original, text, meta and facts), so the same source can be registered again. A finished ingest cannot be aborted.";

export const ingestAbortCommand: IngestSubcommand = {
  register(group: Command): void {
    group
      .command("abort")
      .description("stop an ingest that is not finished, before or after apply")
      .addHelpText("after", "\n" + ABORT_HELP)
      .argument("<id>", "source id")
      .option("--drop", "also delete the registered source's files from raw/")
      .action(async (id: string, opts: { drop?: boolean }, command: Command) => {
        const ctx = getOutputContext(command);
        const root = findRepoRoot(ctx.cwd);
        const { config } = await loadConfig(root);
        const paths = resolvePaths(root, config);
        await assertInitialised(paths);

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
              : `cannot drop ${id}: ingest ${holder} holds the write lock (acquired ${formatLockAge(lock.age_ms ?? 0)} ago); ` +
                `dropping raw files mid-write would look like a write outside pages/ to it`,
            { holder, age_ms: lock.age_ms, stale: lock.stale },
          );
        }

        const warnings: string[] = [];
        let restored: string[] = [];
        let removed: string[] = [];
        let archiveRestored: string[] = [];
        let archiveRemoved: string[] = [];
        if (mine) {
          const snap = await readSnapshot(paths, id);
          if (snap === null) {
            warnings.push("snapshot missing; pages were not restored");
            await releaseLock(paths, id);
          } else {
            const res = await restoreSnapshot(paths, id);
            ({ restored, removed } = res);
            if (res.archive === null) {
              warnings.push(
                `the snapshot of ${id} was taken by an older wikeeper, so archive/ was not restored: run wikeeper lint to find archive files this ingest left`,
              );
            } else {
              archiveRestored = res.archive.restored;
              archiveRemoved = res.archive.removed;
            }
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

        const archiveChanged = [...archiveRestored, ...archiveRemoved].sort(compareCodeUnits);
        const logFile = await writeLogEvent(paths, {
          type: "abort",
          at: now.toISOString(),
          source_id: id,
          dropped,
          restored: [...restored, ...removed].sort(compareCodeUnits),
          ...(archiveChanged.length > 0 ? { archive_restored: archiveChanged } : {}),
        });
        const data = {
          source_id: id,
          restored,
          removed,
          archive: { restored: archiveRestored, removed: archiveRemoved },
          dropped,
          dropped_files: droppedFiles,
          log_file: logFile,
        };
        const lines = [
          `aborted ${id}: ${plural(restored.length, "page")} restored, ${removed.length} removed` +
            `${archiveChanged.length > 0 ? `, archive/: ${archiveRestored.length} restored, ${archiveRemoved.length} removed` : ""}` +
            `${dropped ? `, ${plural(droppedFiles.length, "file")} dropped from raw/` : ""}`,
        ];
        emitResult(ctx, { command: "ingest abort", data, warnings, message: lines });
      });
  },
};
