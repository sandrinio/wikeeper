// src/commands/ingest-plan.ts
// STORY-003-05: `wikeeper ingest plan <dir>` — a read-only preview of which files are new, duplicate or denied.
import { stat } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot, resolvePaths } from "../core/paths.js";
import { isValidKindId, normalizeKindId } from "../ingest/kind-rules.js";
import { planDirectory } from "../ingest/plan.js";
import type { IngestPlan, PlanEntry } from "../ingest/plan.js";
import type { IngestSubcommand } from "./ingest.js";

function usage(message: string): WikeeperError {
  return new WikeeperError(ExitCode.USAGE, "usage", message);
}

function entryLine(e: PlanEntry): string {
  if (e.status === "new") return `${e.path}: new${e.needs_approval ? " (needs approval)" : ""}`;
  if (e.status === "duplicate") {
    const prior = e.prior === null ? "" : "id" in e.prior ? e.prior.id : e.prior.path;
    return `${e.path}: duplicate of ${prior}`;
  }
  return `${e.path}: denied: ${e.reason}`;
}

function renderPlan(plan: IngestPlan): string[] {
  const t = plan.totals;
  const lines = plan.entries.map(entryLine);
  lines.push(`totals: ${t.new} new (${t.needs_approval} need approval), ${t.duplicate} duplicate, ${t.denied} denied`);
  if (plan.skipped.length > 0) {
    lines.push(`skipped: ${plan.skipped.map((s) => `${s.path} (${s.reason})`).join(", ")}`);
  }
  lines.push(
    t.new > 0
      ? "next: get approval if needed, then run wikeeper ingest start <path> per new file (add --approved after the user agrees)"
      : "next: nothing new to ingest",
  );
  return lines;
}

export const ingestPlanCommand: IngestSubcommand = {
  register(group: Command): void {
    group
      .command("plan")
      .description("list which files of a directory are new, duplicates or denied; stores nothing")
      .argument("<dir>", "directory to plan")
      .option("--kind <kind>", "source kind for every file, as listed in .wiki/kb_instructions.md")
      .action(async (dir: string, opts: { kind?: string }, command: Command) => {
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

        const dirAbs = path.resolve(ctx.cwd, dir);
        let st;
        try {
          st = await stat(dirAbs);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") throw usage(`directory ${dir} does not exist`);
          throw err;
        }
        if (!st.isDirectory()) {
          throw usage(`${dir} is a file: register it with wikeeper ingest start ${dir}`);
        }
        if (opts.kind !== undefined && !isValidKindId(opts.kind)) {
          throw usage(`invalid kind "${opts.kind}": a kind id is lowercase letters, digits and -`);
        }
        const kind = opts.kind === undefined ? null : normalizeKindId(opts.kind);

        const plan = await planDirectory(paths, config, dirAbs, { kind });
        emitResult(ctx, { command: "ingest plan", data: plan, message: renderPlan(plan) });
      });
  },
};
