// src/commands/lint.ts
// Contract C2 — contract/S-03-lint (owner STORY-005-02). createLintCommand has a working register body, because
// src/program.ts runs it at start-up; the action is the stub. The command name and the option names and arities are
// frozen. No local --json: the root option covers it (STORY-001-09).
import type { Command } from "commander";
import type { LintFinding } from "../ingest/lint-hook.js";
import type { LintScope } from "../lint/checks.js";
import type { CommandModule } from "../program.js";

export interface LintData {
  scope: LintScope;
  findings: LintFinding[];
  counts: { error: number; warning: number; info: number };
}

export function createLintCommand(deps: { now?: () => Date } = {}): CommandModule {
  return {
    register(program: Command): void {
      program
        .command("lint")
        .description("check the wiki pages, or with --rules kb_instructions.md and the ingest rules, and list what is wrong")
        .option("--rules", "check kb_instructions.md and the ingest settings instead of the pages")
        .option("--check <id...>", "run only these checks (repeatable)")
        .action(async () => {
          throw new Error("contract stub C2");
        });
    },
  };
}

export const lintCommand: CommandModule = createLintCommand();
