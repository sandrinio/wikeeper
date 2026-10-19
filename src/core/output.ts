import { CommanderError } from "commander";
import type { Command } from "commander";
import { ExitCode, WikeeperError } from "./exit-codes.js";

export interface TextSink {
  write(chunk: string): unknown;
}
export interface CliIO {
  stdout: TextSink;
  stderr: TextSink;
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  cwd: string; // commands resolve the repo from ctx.cwd, never process.cwd()
}
export interface OutputContext extends CliIO {
  json: boolean; // --json (global, via optsWithGlobals())
  isTTY: boolean; // Boolean(stdin.isTTY); "interactive" = ctx.isTTY && !ctx.json
  command: string; // "init", "hook guard"; "wikeeper" before dispatch
  setExitCode(code: number): void; // non-zero exit after a successful emitResult (doctor, hook guard)
}
export interface ResultInput<T = unknown> {
  command: string;
  data: T;
  message?: string | readonly string[];
  warnings?: readonly string[];
}
export interface SuccessEnvelope<T = unknown> {
  ok: true;
  command: string;
  data: T;
  warnings: string[];
}
export interface ErrorEnvelope {
  ok: false;
  command: string;
  error: { code: string; message: string; details: unknown };
}

interface ProgramState {
  io: CliIO;
  command: string;
  exitCode: number;
}
const states = new WeakMap<Command, ProgramState>();

/** The program a (sub)command belongs to. */
export function rootOf(command: Command): Command {
  let c = command;
  while (c.parent) c = c.parent;
  return c;
}

function commandPath(command: Command): string {
  const names: string[] = [];
  for (let c: Command | null = command; c?.parent; c = c.parent) names.unshift(c.name());
  return names.length > 0 ? names.join(" ") : command.name();
}

export function defaultIO(): CliIO {
  return { stdout: process.stdout, stderr: process.stderr, stdin: process.stdin, cwd: process.cwd() };
}

export function bindProgramIO(program: Command, io: CliIO): void {
  const state: ProgramState = { io, command: program.name(), exitCode: 0 };
  states.set(program, state);
  program.hook("preAction", (_this, actionCommand) => {
    state.command = commandPath(actionCommand);
  });
}

/** Exit code requested through ctx.setExitCode (0 when none). Used by runCli. */
export function getRequestedExitCode(program: Command): number {
  return states.get(program)?.exitCode ?? 0;
}

export function getOutputContext(command: Command): OutputContext {
  const root = rootOf(command);
  const state = states.get(root);
  if (!state) throw new Error("program IO is not bound: build the program with createProgram()");
  const { io } = state;
  return {
    ...io,
    json: Boolean(command.optsWithGlobals<{ json?: boolean }>().json),
    isTTY: Boolean(io.stdin.isTTY),
    command: state.command,
    setExitCode(code: number): void {
      state.exitCode = code;
    },
  };
}

export function emitResult<T>(ctx: OutputContext, result: ResultInput<T>): void {
  const warnings = result.warnings ?? [];
  if (ctx.json) {
    const envelope: SuccessEnvelope<T | null> = {
      ok: true,
      command: result.command,
      data: result.data ?? null,
      warnings: [...warnings],
    };
    ctx.stdout.write(JSON.stringify(envelope) + "\n");
    return;
  }
  const { message } = result;
  if (message !== undefined) {
    const text = typeof message === "string" ? message : message.join("\n");
    ctx.stdout.write(text + "\n");
  }
  for (const w of warnings) ctx.stderr.write(`warning: ${w}\n`);
}

export function emitError(ctx: OutputContext, error: unknown): ExitCode {
  let exitCode: ExitCode = ExitCode.ERROR;
  let code = "error";
  let details: unknown = null;
  let message = error instanceof Error ? error.message : String(error);
  let print = true;

  if (error instanceof CommanderError) {
    if (error.exitCode === 0) return ExitCode.OK;
    exitCode = ExitCode.USAGE;
    code = "usage";
    message = message.replace(/^error: /, "");
    print = false; // commander already printed it
  } else if (error instanceof WikeeperError) {
    exitCode = error.exitCode;
    code = error.code;
    details = error.details ?? null;
  } else if (error instanceof Error && typeof (error as { code?: unknown }).code === "string") {
    code = (error as unknown as { code: string }).code;
  }

  if (ctx.json) {
    const envelope: ErrorEnvelope = { ok: false, command: ctx.command, error: { code, message, details } };
    ctx.stdout.write(JSON.stringify(envelope) + "\n");
  } else if (print) {
    ctx.stderr.write(exitCode === ExitCode.NEEDS_APPROVAL ? `${message}\n` : `error: ${message}\n`);
  }
  return exitCode;
}
