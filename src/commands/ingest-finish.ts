// src/commands/ingest-finish.ts
// `wikeeper ingest finish <id>`: close the write phase — check what changed, record the ingest, print its report.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { compareCodeUnits } from "../core/compare.js";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { sha256File } from "../core/manifest.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { assertInitialised, findRepoRoot, resolvePaths, toPosixRelative } from "../core/paths.js";
import { diffOutside, diffPages } from "../ingest/diff.js";
import { factsFilePath, readFacts } from "../ingest/facts.js";
import { normalizeKindId } from "../ingest/kind-rules.js";
import { writeIndex } from "../ingest/index-builder.js";
import { runLintHook } from "../ingest/lint-hook.js";
import type { LintFinding } from "../ingest/lint-hook.js";
import { readLock, releaseLock } from "../ingest/lock.js";
import { readLogEvents, regenerateLogView, writeLogEvent } from "../ingest/log.js";
import type { IngestLogEvent } from "../ingest/log.js";
import { readMeta } from "../ingest/registry.js";
import { countContradictions, formatReport } from "../ingest/report.js";
import type { IngestReport } from "../ingest/report.js";
import { isSourceId } from "../ingest/source-id.js";
import { readSnapshot, removeSnapshot } from "../ingest/snapshot.js";
import { hookFailed, runUserHooks } from "../ingest/user-hooks.js";
import type { UserHookResult } from "../ingest/user-hooks.js";
import { validateIngest } from "../ingest/validate.js";
import { parsePage } from "../wiki/parse-page.js";
import type { Page } from "../wiki/parse-page.js";
import type { IngestSubcommand } from "./ingest.js";

const msg = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function lintLine(f: LintFinding): string {
  return `lint ${f.severity} ${f.id}: ${f.message}${f.path === undefined ? "" : ` (${f.path})`}`;
}

export function createIngestFinishCommand(deps: { now?: () => Date } = {}): IngestSubcommand {
  const now = deps.now ?? (() => new Date());
  return {
    register(group: Command): void {
      group
        .command("finish")
        .description("close an ingest's write phase: check the page changes, record the ingest and print its report")
        .argument("<id>", "source id from wikeeper ingest start")
        .action(async (id: string, _opts: unknown, command: Command) => {
          const ctx = getOutputContext(command);
          const root = findRepoRoot(ctx.cwd);
          const { config } = await loadConfig(root);
          const paths = resolvePaths(root, config);
          await assertInitialised(paths);
          if (!isSourceId(id)) throw new WikeeperError(ExitCode.USAGE, "usage", `not a source id: ${id}`);

          const prior = (await readLogEvents(paths, { type: "ingest", sourceId: id })).events;
          const lock = await readLock(paths);
          if (!lock.held) {
            throw new WikeeperError(
              ExitCode.ERROR,
              "not_applied",
              prior.length > 0
                ? `ingest ${id} is already finished (${prior[0]!.file})`
                : `ingest ${id} is not applied: run wikeeper ingest apply ${id} first`,
            );
          }
          if (lock.lock === null) {
            throw new WikeeperError(
              ExitCode.ERROR,
              "locked",
              `.wiki/.lock is unreadable: take it over with wikeeper ingest apply ${id} --force-unlock`,
              { holder: null },
            );
          }
          if (lock.lock.source_id !== id) {
            const holder = lock.lock.source_id;
            throw new WikeeperError(
              ExitCode.ERROR,
              "locked",
              `ingest ${holder} holds the write lock, not ${id}: finish or abort ${holder} first`,
              { holder, acquired_at: lock.lock.acquired_at, age_ms: lock.age_ms, stale: lock.stale },
            );
          }
          const meta = await readMeta(paths, id);
          if (meta === null) throw new WikeeperError(ExitCode.ERROR, "unknown_source", `no source ${id} is registered`);

          // R6: an earlier finish stopped after logging.
          if (prior.length > 0) {
            const idx = await writeIndex(paths);
            await regenerateLogView(paths);
            await removeSnapshot(paths, id);
            await releaseLock(paths, id);
            const ev = prior[0]!.event as IngestLogEvent;
            const report: IngestReport = {
              source_id: id,
              kind: ev.kind,
              rule_version: ev.rule_version,
              permission: ev.permission,
              origin: ev.origin,
              size: meta.size,
              sha256: meta.sha256,
              created: ev.created,
              updated: ev.updated,
              deleted: ev.deleted,
              contradictions: ev.contradictions,
              rule_suggestions: ev.rule_suggestions,
              log_file: prior[0]!.file,
              index_changed: idx.changed,
              hooks: [],
              lint: [],
            };
            emitResult(ctx, {
              command: "ingest finish",
              data: report,
              warnings: [`ingest ${id} was already recorded in ${prior[0]!.file}; it was not logged again and no hooks ran`],
              message: formatReport(report),
            });
            return;
          }

          const snapshot = await readSnapshot(paths, id);
          if (snapshot === null) {
            throw new WikeeperError(
              ExitCode.ERROR,
              "snapshot_missing",
              `the snapshot of ${id} is missing or unreadable (${toPosixRelative(root, path.join(paths.wikiDir, ".snapshots", id))}): run wikeeper ingest abort ${id}`,
            );
          }
          const changedMsg = `the facts of ${id} changed since apply: run wikeeper ingest abort ${id}, then apply again`;
          let factsSha: string | null = null;
          try {
            factsSha = await sha256File(factsFilePath(paths, id));
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
          }
          if (factsSha !== snapshot.facts_sha256) throw new WikeeperError(ExitCode.ERROR, "facts_changed", changedMsg);
          const facts = await readFacts(paths, id);
          if (facts === null) throw new WikeeperError(ExitCode.ERROR, "facts_changed", changedMsg);

          const diff = await diffPages(paths, snapshot);
          const outside = await diffOutside(paths, snapshot);
          const v = await validateIngest(paths, id, diff, outside);
          if (!v.ok) {
            const parts: string[] = [];
            if (v.uncited.length > 0) parts.push(`pages without [[${id}]]: ${v.uncited.join(", ")}`);
            if (v.outside.length > 0) parts.push(`changed outside pages/: ${v.outside.join(", ")}`);
            if (v.invalid.length > 0) {
              parts.push(`frontmatter errors: ${v.invalid.map((f) => `${f.path} (${f.message})`).join(", ")}`);
            }
            if (v.dropped.length > 0) {
              const byPath = new Map<string, string[]>();
              for (const d of v.dropped) byPath.set(d.path, [...(byPath.get(d.path) ?? []), `"${d.line}"`]);
              const groups = [...byPath].map(([p, ls]) => `${p} (${ls.join(", ")})`).join(", ");
              parts.push(`fact lines dropped (a replaced fact stays in the list): ${groups}`);
            }
            throw new WikeeperError(
              ExitCode.ERROR,
              "validation_failed",
              `finish refused for ${id}: ${parts.join("; ")}. Fix them and rerun wikeeper ingest finish ${id}, or run wikeeper ingest abort ${id}`,
              { uncited: v.uncited, outside: v.outside, invalid: v.invalid, dropped: v.dropped },
            );
          }

          // Post steps (R4). From here index and log errors are real errors; hook and lint problems are warnings (R5).
          const warnings: string[] = [...v.warnings];
          const idx = await writeIndex(paths);
          for (const e of idx.errors) {
            warnings.push(`${toPosixRelative(root, path.join(paths.pagesDir, e.path))}: ${e.message}`);
          }
          const changedPages: Page[] = [];
          for (const rel of [...diff.created, ...diff.updated]) {
            if (!rel.endsWith(".md")) continue;
            changedPages.push(parsePage(await readFile(path.join(paths.pagesDir, ...rel.split("/")), "utf8"), rel));
          }
          const contradictions = countContradictions(changedPages, id);
          const logFile = await writeLogEvent(paths, {
            type: "ingest",
            at: now().toISOString(),
            source_id: id,
            kind: normalizeKindId(facts.kind),
            rule_version: facts.rule_version,
            permission: meta.permission.mode,
            origin: meta.origin,
            created: diff.created,
            updated: diff.updated,
            deleted: diff.deleted,
            contradictions,
            rule_suggestions: facts.uncovered?.length ?? 0,
          });
          await regenerateLogView(paths);

          const hooks: UserHookResult[] = [];
          // runUserHooks skips the rest of a list after a failure; post_ingest commands are independent (R5), so
          // each one runs on its own.
          for (const command of config.hooks.post_ingest) {
            try {
              hooks.push(...(await runUserHooks("post_ingest", [command], { cwd: root, sourceId: id })));
            } catch (err) {
              warnings.push(`post_ingest hooks did not run: ${msg(err)}`);
              break;
            }
          }
          for (const h of hooks) {
            if (hookFailed(h)) {
              warnings.push(
                `post_ingest hook failed: ${h.command} (${h.status === "timed_out" ? "timed out" : `exit ${h.exitCode}`})`,
              );
            }
          }
          let lint: LintFinding[] = [];
          try {
            lint = await runLintHook({
              paths,
              sourceId: id,
              changed: [...diff.created, ...diff.updated].sort(compareCodeUnits),
            });
          } catch (err) {
            warnings.push(`lint hook failed: ${msg(err)}`);
          }
          for (const f of lint) warnings.push(lintLine(f));

          await removeSnapshot(paths, id);
          await releaseLock(paths, id);

          const report: IngestReport = {
            source_id: id,
            kind: normalizeKindId(facts.kind),
            rule_version: facts.rule_version,
            permission: meta.permission.mode,
            origin: meta.origin,
            size: meta.size,
            sha256: meta.sha256,
            created: diff.created,
            updated: diff.updated,
            deleted: diff.deleted,
            contradictions,
            rule_suggestions: facts.uncovered?.length ?? 0,
            log_file: logFile,
            index_changed: idx.changed,
            hooks,
            lint,
          };
          emitResult(ctx, { command: "ingest finish", data: report, warnings, message: formatReport(report) });
        });
    },
  };
}

export const ingestFinishCommand: IngestSubcommand = createIngestFinishCommand();
