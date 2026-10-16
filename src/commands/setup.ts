import { stat } from "node:fs/promises";
import type { Command } from "commander";
import { loadConfig, setConfigValue } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot, resolvePaths } from "../core/paths.js";
import type { CommandModule } from "../program.js";

export interface SetupResult {
  setup_completed_at: string | null;
  profile: string;
}

export function createSetupCommand(deps: { now?: () => Date } = {}): CommandModule {
  const now = deps.now ?? (() => new Date());
  return {
    register(program: Command): void {
      program
        .command("setup")
        .description("report (or with --done, record) whether setup has been completed")
        .option("--done", "stamp setup_completed_at with the current UTC time")
        .action(async (opts: { done?: boolean }, command: Command) => {
          const ctx = getOutputContext(command);
          const root = findRepoRoot(ctx.cwd);
          let { config } = await loadConfig(root);
          if (opts.done && config.setup_completed_at === null) {
            const paths = resolvePaths(root, config);
            try {
              await stat(paths.configFile);
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                throw new WikeeperError(
                  ExitCode.ERROR,
                  "not_initialised",
                  "wiki is not initialised: run wikeeper init",
                );
              }
              throw err;
            }
            await setConfigValue(root, "setup_completed_at", now().toISOString());
            config = (await loadConfig(root)).config;
          }
          const data: SetupResult = { setup_completed_at: config.setup_completed_at, profile: config.profile };
          emitResult(ctx, {
            command: "setup",
            data,
            message:
              data.setup_completed_at !== null
                ? `setup completed at ${data.setup_completed_at} (profile ${data.profile})`
                : `setup not completed (profile ${data.profile}): read .wiki/system/SETUP.md`,
          });
        });
    },
  };
}

export const setupCommand: CommandModule = createSetupCommand();
