import { readFileSync } from "node:fs";
import { Command } from "commander";
import type { ExitCode } from "./core/exit-codes.js";
import {
  bindProgramIO,
  defaultIO,
  emitError,
  getOutputContext,
  getRequestedExitCode,
} from "./core/output.js";
import type { CliIO } from "./core/output.js";
import { buildCommit, versionString } from "./core/version.js";
import { initCommand } from "./commands/init.js";
import { updateCommand } from "./commands/update.js";
import { removeCommand } from "./commands/remove.js";
import { doctorCommand } from "./commands/doctor.js";
import { setupCommand } from "./commands/setup.js";
import { hookCommand } from "./commands/hook.js";
import { searchCommand } from "./commands/search.js";
import { indexCommand } from "./commands/index.js";
import { ingestCommand } from "./commands/ingest.js";
import { lintCommand } from "./commands/lint.js";
import { rulesCommand } from "./commands/rules.js";
import { readCommand } from "./commands/read.js";
import { statusCommand } from "./commands/status.js";
import { configCommand } from "./commands/config.js";
import { statuslineCommand } from "./commands/statusline.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { ensureAgentsIntegration } from "./agents/index.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string; homepage?: string };

export const VERSION: string = versionString(packageJson.version, buildCommit());

export interface CommandModule {
  register(program: Command): void;
}

export const defaultCommands: CommandModule[] = [
  initCommand,
  updateCommand,
  removeCommand,
  doctorCommand,
  setupCommand,
  hookCommand,
  searchCommand,
  indexCommand,
  ingestCommand,
  lintCommand,
  rulesCommand,
  readCommand,
  statusCommand,
  configCommand,
  statuslineCommand,
  upgradeCommand,
];

export function createProgram(
  commands: readonly CommandModule[] = defaultCommands,
  io: CliIO = defaultIO(),
): Command {
  const program = new Command()
    .name("wikeeper")
    .description("A Karpathy-style LLM wiki that your AI coding agent keeps.")
    .version(VERSION, "-v, --version")
    .option("--json", "machine-readable output")
    .configureHelp({ showGlobalOptions: true })
    .addHelpText(
      "after",
      `\nStatus: pre-alpha. Version ${VERSION}. Docs: ${packageJson.homepage}`,
    )
    .exitOverride()
    .configureOutput({
      writeOut: (s) => void io.stdout.write(s),
      writeErr: (s) => void io.stderr.write(s),
      outputError: (s, write) => {
        if (!program.opts<{ json?: boolean }>().json) write(s);
      },
    });

  bindProgramIO(program, io);

  program.action(() => {
    program.outputHelp();
  });

  // Must stay AFTER exitOverride/configureOutput: .command() copies them at call time.
  for (const m of commands) m.register(program);

  return program;
}

export interface RunCliOptions {
  commands?: readonly CommandModule[];
  io?: Partial<CliIO>;
}

export async function runCli(argv: readonly string[], options: RunCliOptions = {}): Promise<number> {
  const io: CliIO = { ...defaultIO(), ...options.io };
  // The default program wires agents at start-up; callers passing their own commands compose their own integrations.
  if (options.commands === undefined) ensureAgentsIntegration();
  const program = createProgram(options.commands ?? defaultCommands, io);
  const dashIndex = argv.indexOf("--");
  const scanned = dashIndex === -1 ? argv : argv.slice(0, dashIndex);
  if (scanned.includes("--json")) program.setOptionValue("json", true);
  try {
    await program.parseAsync([...argv], { from: "user" });
    return getRequestedExitCode(program);
  } catch (err) {
    const code: ExitCode = emitError(getOutputContext(program), err);
    return code;
  }
}
