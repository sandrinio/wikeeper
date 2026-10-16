// src/commands/ingest.ts
// Contract C5 — contract/S-02-ingest-group (owner STORY-003-04). Frozen exports. createIngestCommand has a working
// body because src/program.ts runs it at start-up. Consumers (STORY-003-05, 003-06, 003-08, 003-09) add their lines
// directly below their own INSERTION POINT anchor; the owner keeps every anchor line exactly as written.
import type { Command } from "commander";
import type { CommandModule } from "../program.js";
import { ingestStartCommand } from "./ingest-start.js";
// INSERTION POINT STORY-003-05: import { ingestPlanCommand } from "./ingest-plan.js";
import { ingestPlanCommand } from "./ingest-plan.js";
// INSERTION POINT STORY-003-06: import { ingestFactsCommand } from "./ingest-facts.js";
import { ingestFactsCommand } from "./ingest-facts.js";
// INSERTION POINT STORY-003-08: import { ingestApplyCommand } from "./ingest-apply.js"; import { ingestAbortCommand } from "./ingest-abort.js";
import { ingestApplyCommand } from "./ingest-apply.js";
import { ingestAbortCommand } from "./ingest-abort.js";
// INSERTION POINT STORY-003-09: import { ingestFinishCommand } from "./ingest-finish.js";
import { ingestFinishCommand } from "./ingest-finish.js";

export interface IngestSubcommand {
  register(group: Command): void;
}

/** One entry per subcommand, in CLI-flow order: start, plan, facts, apply, abort, finish. */
export const ingestSubcommands: readonly IngestSubcommand[] = [
  ingestStartCommand,
  // INSERTION POINT STORY-003-05: ingestPlanCommand,
  ingestPlanCommand,
  // INSERTION POINT STORY-003-06: ingestFactsCommand,
  ingestFactsCommand,
  // INSERTION POINT STORY-003-08: ingestApplyCommand, ingestAbortCommand,
  ingestApplyCommand,
  ingestAbortCommand,
  // INSERTION POINT STORY-003-09: ingestFinishCommand,
  ingestFinishCommand,
];

export function createIngestCommand(subcommands: readonly IngestSubcommand[] = ingestSubcommands): CommandModule {
  return {
    register(program: Command): void {
      const group = program
        .command("ingest")
        .description("ingest a source into the wiki: start, facts, apply, finish");
      for (const sub of subcommands) sub.register(group);
    },
  };
}

export const ingestCommand: CommandModule = createIngestCommand();
