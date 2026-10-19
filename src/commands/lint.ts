// src/commands/lint.ts
// Contract C2 — contract/S-03-lint (owner STORY-005-02). createLintCommand has a working register body, because
// src/program.ts runs it at start-up; the action is the stub. The command name and the option names and arities are
// frozen. No local --json: the root option covers it (STORY-001-09).
import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { ExitCode } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { assertInitialised, findRepoRoot, resolvePaths, toPosixRelative } from "../core/paths.js";
import { readLogEvents } from "../ingest/log.js";
import { loadInstructions } from "../kb/parse-instructions.js";
import { PAGE_CHECKS, RULE_CHECKS, countFindings, findingLine, runLint } from "../lint/checks.js";
import type { LintContext, LintScope } from "../lint/checks.js";
import { loadPages } from "../wiki/parse-page.js";
import { plural } from "./doctor.js";
import type { LintFinding } from "../ingest/lint-hook.js";
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
        .action(async (opts: { rules?: boolean; check?: string[] }, command: Command) => {
          const ctx = getOutputContext(command);
          const root = findRepoRoot(ctx.cwd);
          const { config } = await loadConfig(root);
          const paths = resolvePaths(root, config);
          await assertInitialised(paths);
          const pages = await loadPages(paths.pagesDir);
          const archivePages = await loadPages(paths.archiveDir);
          const kb = (await loadInstructions(paths))?.kb ?? null;
          const { events, skipped } = await readLogEvents(paths);
          const lintCtx: LintContext = { paths, config, pages, archivePages, kb, log: events, now: (deps.now ?? (() => new Date()))() };
          const scope: LintScope = opts.rules === true ? "rules" : "pages";
          const findings = await runLint(lintCtx, { scope, ...(opts.check ? { checks: opts.check } : {}) });
          const reg = scope === "pages" ? PAGE_CHECKS : RULE_CHECKS;
          const k = reg.filter((c) => !opts.check || opts.check.includes(c.id)).length;
          const counts = countFindings(findings);
          const pagesSubject =
            archivePages.length > 0
              ? `${plural(pages.length, "page")} and ${plural(archivePages.length, "archived page")}`
              : plural(pages.length, "page");
          const subject = scope === "pages" ? pagesSubject : toPosixRelative(root, paths.kbInstructions);
          const message = [
            `checked ${subject} with ${plural(k, "check")}`,
            ...findings.map(findingLine),
            `${plural(counts.error, "error")}, ${plural(counts.warning, "warning")}, ${counts.info} info`,
          ];
          const data: LintData = { scope, findings, counts };
          emitResult(ctx, { command: "lint", data, message, warnings: skipped.map((s) => `${s.file}: ${s.reason}`) });
          if (counts.error > 0) ctx.setExitCode(ExitCode.ERROR);
        });
    },
  };
}

export const lintCommand: CommandModule = createLintCommand();
