// Shared harness for the STORY-009-01 red files (not a test file). No implementation file is read here.
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { expect } from "vitest";
import type { CommandModule } from "../src/program.js";

export const tmpDirs: string[] = [];
export async function cleanup(): Promise<void> {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
}

export const MSG = "wikeeper 0.4.1 is available (installed 0.4.0): run wikeeper upgrade";
export const START = new Date("2026-10-20T09:00:00Z");

export interface Reply {
  code: number;
  json: any;
  text: string;
  err: string;
}
export type Fetch = (url: unknown, init?: unknown) => Promise<Response>;
export interface Fake {
  fetch: Fetch;
  urls: string[];
  inits: unknown[];
}
export function fake(answer: () => Promise<Response>): Fake {
  const f: Fake = {
    urls: [],
    inits: [],
    fetch: (url, init) => {
      f.urls.push(String(url));
      f.inits.push(init);
      return answer();
    },
  };
  return f;
}
export const answers = (body: string, status = 200) => fake(() => Promise.resolve(new Response(body, { status })));
export const latest041 = () => answers(JSON.stringify({ version: "0.4.1" }));
export const never = () => fake(() => new Promise<Response>(() => {}));

export interface UpdateCheckOpts {
  env?: NodeJS.ProcessEnv;
  fetch?: Fetch;
  now?: () => Date;
  installed?: string;
  timeoutMs?: number;
}

async function runCliWith(root: string, args: string[], commands: CommandModule[] | undefined): Promise<Reply> {
  const { runCli } = await import("../src/program.js");
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    ...(commands ? { commands } : {}),
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  } as never);
  const text = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(text.trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code, json, text, err: err.join("") };
}

/** The default program (init, config). */
export const runDefault = (root: string, args: string[]) => runCliWith(root, args, undefined);

/** The ingest group with the given update-check deps; `start` uses a fixed clock so ids match between twins. */
export async function runIngest(root: string, args: string[], uc: UpdateCheckOpts): Promise<Reply> {
  const mod = await import("../src/commands/ingest.js");
  const { createIngestStartCommand } = await import("../src/commands/ingest-start.js");
  const makeIngest = mod.createIngestCommand as unknown as (...a: unknown[]) => CommandModule;
  const subs = [createIngestStartCommand({ now: () => START }), ...mod.ingestSubcommands.slice(1)];
  return runCliWith(root, args, [makeIngest(subs, { updateCheck: uc })]);
}

export async function runStatus(root: string, args: string[], deps: { installed?: string; env?: NodeJS.ProcessEnv }): Promise<Reply> {
  const { createStatusCommand } = await import("../src/commands/status.js");
  return runCliWith(root, args, [(createStatusCommand as unknown as (d: unknown) => CommandModule)(deps)]);
}

export async function runDoctor(root: string, args: string[], deps: { installed?: string; env?: NodeJS.ProcessEnv }): Promise<Reply> {
  const { createDoctorCommand } = await import("../src/commands/doctor.js");
  return runCliWith(root, args, [(createDoctorCommand as unknown as (d: unknown) => CommandModule)({ nodeVersion: "22.12.0", ...deps })]);
}

/** Temp git repo, `init` through the default program, ingest.permission: ai, notes.md and docs/new.md. */
export async function makeWiki(configExtra = ""): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-uc-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  const init = await runDefault(root, ["init", "--json", "--agents", "claude", "--yes"]);
  expect(init.code).toBe(0);
  const cfg = path.join(root, ".wiki", "config.yml");
  await writeFile(cfg, (await readFile(cfg, "utf8")) + "\ningest:\n  permission: ai\n" + configExtra);
  await writeFile(path.join(root, "notes.md"), "# Notes\n\nthe product lead owns the roadmap\n");
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(path.join(root, "docs", "new.md"), "# New\n\na new file\n");
  return root;
}

export const savedFile = (root: string) => path.join(root, ".wiki", ".cache", "update-check.json");
export async function readSaved(root: string): Promise<any | null> {
  try {
    return JSON.parse(await readFile(savedFile(root), "utf8"));
  } catch {
    return null;
  }
}

/** Replace the temp root (also its realpath) so twins in different folders compare equal. */
export async function norm(root: string, value: unknown): Promise<string> {
  let s = typeof value === "string" ? value : JSON.stringify(value);
  const real = await realpath(root).catch(() => root);
  for (const r of new Set([root, real])) s = s.split(r).join("<root>");
  return s;
}

export const OFF: NodeJS.ProcessEnv = { WIKEEPER_NO_UPDATE_CHECK: "1" };
