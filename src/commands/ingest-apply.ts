// src/commands/ingest-apply.ts
// `wikeeper ingest apply <id>`: open the write phase — take the lock, snapshot pages/ and archive/, print the brief's ingest line and the facts.
import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { sha256File } from "../core/manifest.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { assertInitialised, findRepoRoot, resolvePaths, toPosixRelative } from "../core/paths.js";
import { factsFilePath, readFacts } from "../ingest/facts.js";
import type { FactsFile } from "../ingest/facts.js";
import { acquireLock, formatLockAge, readLock, releaseLock } from "../ingest/lock.js";
import type { LockInfo } from "../ingest/lock.js";
import { readLogEvents } from "../ingest/log.js";
import { readMeta } from "../ingest/registry.js";
import { readSnapshot, removeSnapshot, snapshotDir, takeSnapshot } from "../ingest/snapshot.js";
import type { SnapshotInfo } from "../ingest/snapshot.js";
import type { IngestSubcommand } from "./ingest.js";

export function buildBrief(id: string): string {
  return `ingest:    ${id}   facts: raw/${id}.facts.json`;
}

export interface ApplyData {
  source_id: string;
  already_applied: boolean;
  lock: LockInfo;
  snapshot: { dir: string; pages: number; archive: number } | null;
  facts_file: string;
  facts: FactsFile;
  brief: string;
}

export const ingestApplyCommand: IngestSubcommand = {
  register(group: Command): void {
    group
      .command("apply")
      .description("open the write phase for a source: take the lock, snapshot pages/ and archive/, print the facts")
      .argument("<id>", "source id from wikeeper ingest start")
      .option("--force-unlock", "take over a stale lock held by another ingest")
      .action(async (id: string, opts: { forceUnlock?: boolean }, command: Command) => {
        const ctx = getOutputContext(command);
        const root = findRepoRoot(ctx.cwd);
        const { config } = await loadConfig(root);
        const paths = resolvePaths(root, config);
        await assertInitialised(paths);

        if ((await readLogEvents(paths, { type: "ingest", sourceId: id })).events.length > 0) {
          throw new WikeeperError(ExitCode.ERROR, "ingest_finished", `the ingest of ${id} is already finished`);
        }
        if ((await readMeta(paths, id)) === null) {
          throw new WikeeperError(ExitCode.ERROR, "unknown_source", `no source ${id} is registered`);
        }
        const facts = await readFacts(paths, id);
        if (facts === null) {
          throw new WikeeperError(
            ExitCode.ERROR,
            "no_facts",
            `no facts stored for ${id}: run wikeeper ingest facts ${id} first`,
          );
        }

        const now = new Date();
        const before = await readLock(paths, now);
        const factsFile = factsFilePath(paths, id);
        const factsSha = await sha256File(factsFile);
        const got = await acquireLock(paths, id, { now, forceStale: opts.forceUnlock === true });
        const warnings: string[] = [];
        let snapshot: ApplyData["snapshot"];

        const summary = (snap: SnapshotInfo): ApplyData["snapshot"] => ({
          dir: toPosixRelative(root, snapshotDir(paths, id)),
          pages: Object.keys(snap.pages).length,
          archive: Object.keys(snap.archive).length,
        });

        if (got.already_held) {
          const snap = await readSnapshot(paths, id);
          if (snap === null) {
            snapshot = null;
            warnings.push(`snapshot missing; wikeeper ingest abort ${id} will not restore pages`);
          } else {
            snapshot = summary(snap);
          }
        } else {
          try {
            snapshot = summary(await takeSnapshot(paths, id, factsSha, now));
          } catch (err) {
            await releaseLock(paths, id);
            await removeSnapshot(paths, id);
            throw new WikeeperError(
              ExitCode.ERROR,
              "snapshot_failed",
              `could not snapshot pages/ and archive/: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          if (got.replaced !== null) {
            const holder = got.replaced.source_id;
            const aged = Math.max(0, now.getTime() - Date.parse(got.replaced.acquired_at));
            warnings.push(
              `took over the stale lock of ${holder} (acquired ${formatLockAge(aged)} ago): its page changes were not restored; ` +
                `its snapshot is at ${toPosixRelative(root, snapshotDir(paths, holder))}`,
            );
          } else if (before.held && before.lock === null) {
            warnings.push("replaced an unreadable .wiki/.lock: page changes made under it were not restored");
          }
        }

        const brief = buildBrief(id);
        const data: ApplyData = {
          source_id: id,
          already_applied: got.already_held,
          lock: got.lock,
          snapshot,
          facts_file: toPosixRelative(root, factsFile),
          facts,
          brief,
        };
        const lines: string[] = [];
        if (data.already_applied) lines.push("already applied; nothing changed");
        lines.push(brief, "");
        for (const f of facts.facts) {
          lines.push(`- ${f.entity} ${f.field} = ${f.value} (${f.status}, ${f.as_of}) → ${f.page}`);
        }
        lines.push(`write the pages, then run wikeeper ingest finish ${id} (wikeeper ingest abort ${id} rolls them back)`);
        emitResult(ctx, { command: "ingest apply", data, warnings, message: lines });
      });
  },
};
