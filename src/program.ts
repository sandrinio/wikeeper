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
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { setupCommand } from "./commands/setup.js";
import { hookCommand } from "./commands/hook.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

export const VERSION: string = packageJson.version;

export interface CommandModule {
  register(program: Command): void;
}

export const defaultCommands: CommandModule[] = [
  initCommand,
  doctorCommand,
  setupCommand,
  hookCommand,
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
    .addHelpText(
      "after",
      "\nStatus: pre-alpha. Commands land in upcoming releases: https://github.com/sandrinio/wikeeper",
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
