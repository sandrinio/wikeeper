import { readFileSync } from "node:fs";
import { Command } from "commander";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

export const VERSION: string = packageJson.version;

export function createProgram(): Command {
  const program = new Command()
    .name("wikeeper")
    .description("A Karpathy-style LLM wiki that your AI coding agent keeps.")
    .version(VERSION, "-v, --version")
    .addHelpText(
      "after",
      "\nStatus: pre-alpha. Commands land in upcoming releases: https://github.com/sandrinio/wikeeper",
    );

  program.action(() => {
    program.outputHelp();
  });

  return program;
}
