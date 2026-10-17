// src/commands/rules.ts
// Contract C3 — contract/S-03-rule-decisions (owner STORY-005-06). createRulesCommand has a working register body,
// because src/program.ts runs it at start-up; the two actions are the stubs. Command, subcommand and option names
// and arities are frozen. No local --json: the root option covers it (STORY-001-09). The --kind help is built from
// KB_PROPOSAL_SECTION_KEYS (C1), never from a copied list.
import type { Command } from "commander";
import { KB_PROPOSAL_SECTION_KEYS } from "../kb/parse-instructions.js";
import type { CommandModule } from "../program.js";

export function createRulesCommand(deps: { now?: () => Date } = {}): CommandModule {
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
        .action(async () => {
          throw new Error("contract stub C3");
        });
      rules
        .command("list")
        .description("list the recorded rule decisions (read-only)")
        .action(async () => {
          throw new Error("contract stub C3");
        });
    },
  };
}

export const rulesCommand: CommandModule = createRulesCommand();
