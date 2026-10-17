// src/commands/rules.ts
// Contract C3 — contract/S-03-rule-decisions (owner STORY-005-06). createRulesCommand has a working register body,
// because src/program.ts runs it at start-up; the two actions are the stubs. Command, subcommand and option names
// and arities are frozen. No local --json: the root option covers it (STORY-001-09). The --kind help is built from
// KB_PROPOSAL_SECTION_KEYS (C1), never from a copied list.
import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { assertInitialised, findRepoRoot, resolvePaths } from "../core/paths.js";
import { isSourceId } from "../ingest/source-id.js";
import { readMeta } from "../ingest/registry.js";
import { KB_PROPOSAL_SECTION_KEYS } from "../kb/parse-instructions.js";
import { normalizeKindId } from "../ingest/kind-rules.js";
import { normalizeSummary, readDecisions, recordDecision } from "../kb/rule-decisions.js";
import type { RuleDecisionKind } from "../kb/rule-decisions.js";
import { plural } from "./doctor.js";
import type { CommandModule } from "../program.js";

interface RecordOpts {
  accepted?: boolean;
  rejected?: boolean;
  kind?: string;
  summary?: string;
  from?: string;
}

function usage(message: string): WikeeperError {
  return new WikeeperError(ExitCode.USAGE, "usage", message);
}

export function createRulesCommand(deps: { now?: () => Date } = {}): CommandModule {
  const now = deps.now ?? (() => new Date());
  return {
    register(program: Command): void {
      const rules = program
        .command("rules")
        .description("record and list the user's decisions on proposed kb_instructions.md rule changes");
      rules
        .command("record")
        .description("record that the user accepted or rejected a proposed rule change")
        .option("--accepted", "the user accepted the proposal")
        .option("--rejected", "the user rejected the proposal")
        .option("--kind <k>", `source kind id, or one of ${KB_PROPOSAL_SECTION_KEYS.join(", ")}`)
        .option("--summary <text>", "the proposal in one line")
        .option("--from <source-id>", "the registered source whose ingest raised the proposal")
        .action(async (opts: RecordOpts, command: Command) => {
          const ctx = getOutputContext(command);
          const root = findRepoRoot(ctx.cwd);
          const { config } = await loadConfig(root);
          const paths = resolvePaths(root, config);
          await assertInitialised(paths);
          if ((opts.accepted === true) === (opts.rejected === true)) {
            throw usage("give exactly one of --accepted or --rejected");
          }
          if (opts.kind === undefined) throw usage("--kind is required");
          if (opts.summary === undefined) throw usage("--summary is required");
          if (opts.from !== undefined) {
            if (!isSourceId(opts.from)) throw usage(`--from must be a source id: ${opts.from}`);
            if ((await readMeta(paths, opts.from)) === null) {
              throw new WikeeperError(ExitCode.ERROR, "unknown_source", `no source ${opts.from} is registered`);
            }
          }
          const decision: RuleDecisionKind = opts.accepted === true ? "accepted" : "rejected";
          const at = now().toISOString();
          const res = await recordDecision(paths, {
            kind: opts.kind,
            summary: opts.summary,
            decision,
            ...(opts.from !== undefined ? { sourceId: opts.from } : {}),
            at,
          });
          const warnings: string[] = [];
          if (res.previouslyRejected) {
            const prior = (await readDecisions(paths)).decisions
              .filter((d) => d.fingerprint === res.fingerprint && d.decision === "rejected" && d.file !== res.file)
              .at(-1);
            if (prior !== undefined) warnings.push(`this proposal was rejected before (${prior.file})`);
          }
          const kind = normalizeKindId(opts.kind);
          const summary = normalizeSummary(opts.summary);
          emitResult(ctx, {
            command: "rules record",
            data: {
              file: res.file,
              fingerprint: res.fingerprint,
              previously_rejected: res.previouslyRejected,
              kind,
              summary,
              decision,
              at,
              source_id: opts.from ?? null,
            },
            message: `recorded ${decision} proposal ${res.fingerprint} for ${kind}: ${summary} (${res.file})`,
            warnings,
          });
        });
      rules
        .command("list")
        .description("list the recorded rule decisions (read-only)")
        .action(async (_opts: unknown, command: Command) => {
          const ctx = getOutputContext(command);
          const root = findRepoRoot(ctx.cwd);
          const { config } = await loadConfig(root);
          const paths = resolvePaths(root, config);
          await assertInitialised(paths);
          const { decisions, skipped } = await readDecisions(paths);
          const counts = {
            accepted: decisions.filter((d) => d.decision === "accepted").length,
            rejected: decisions.filter((d) => d.decision === "rejected").length,
          };
          const lines =
            decisions.length === 0
              ? ["no rule decisions recorded"]
              : [
                  plural(decisions.length, "rule decision"),
                  ...decisions.map(
                    (d) =>
                      `${d.at.slice(0, 10)} ${d.decision} ${d.kind}: ${d.summary} [${d.fingerprint}]` +
                      (d.source_id !== null ? ` from ${d.source_id}` : "") +
                      (d.previously_rejected ? " (previously rejected)" : ""),
                  ),
                ];
          emitResult(ctx, {
            command: "rules list",
            data: { decisions, counts },
            message: lines.join("\n"),
            warnings: skipped.map((s) => `${s.file}: ${s.reason}`),
          });
        });
    },
  };
}

export const rulesCommand: CommandModule = createRulesCommand();
