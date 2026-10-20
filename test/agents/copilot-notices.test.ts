import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCopilotTrust } from "../../src/agents/doctor-checks.js";
import { resetIntegrations } from "../../src/core/integrations.js";
import { runCli } from "../../src/program.js";

// CR-009: what users are told about enforce in Copilot.

const cleanup: string[] = [];
beforeEach(() => resetIntegrations());
afterEach(async () => {
  vi.unstubAllEnvs();
  resetIntegrations();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function tmp(prefix: string): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(d);
  return d;
}
async function repo(): Promise<string> {
  vi.stubEnv("PATH", await tmp("wikeeper-empty-"));
  const root = await tmp("wikeeper-cr009-");
  await mkdir(path.join(root, ".git"), { recursive: true });
  return root;
}
async function drive(root: string, args: string[]): Promise<{ code: number; out: string; json: any }> {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
  const last = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = last ? JSON.parse(last) : null; } catch { json = null; }
  return { code, out, json };
}
const HOOK_FILE = ".github/hooks/wikeeper.json";
const exists = async (root: string, rel: string) => lstat(path.join(root, rel)).then(() => true, () => false);

describe("the Copilot trust note covers any change to the hook file", () => {
  it("says to start a new session whenever update changes this file", async () => {
    const [c] = await checkCopilotTrust({ agents: ["copilot"], config: { enforce: true } } as never);
    expect(c!.message).toContain("start a new session whenever wikeeper update changes this file");
    expect(c!.message).not.toContain("guard command");
  });
});

describe("doctor counts only real hooks", () => {
  it("reports the Copilot file with 1 hook and 1 rule, human and --json", async () => {
    const root = await repo();
    expect((await drive(root, ["init", "--json", "--yes", "--agents", "claude,copilot", "--enforce"])).code).toBe(0);
    const human = await drive(root, ["doctor"]);
    expect(human.out).toContain(`copilot: ${HOOK_FILE} (1 hook, 1 rule)`);
    const j = await drive(root, ["doctor", "--json"]);
    const copilot = j.json.data.state.enforce.agents.find((a: any) => a.agent === "copilot");
    expect(copilot.files).toEqual([{ file: HOOK_FILE, hooks: ["hooks.PreToolUse[guard:copilot]"], rules: ["hooks.PreToolUse[permit:copilot]"] }]);
  });

  it("still reports a deleted version key as missing, and removal still deletes the hook file", async () => {
    const root = await repo();
    expect((await drive(root, ["init", "--json", "--yes", "--agents", "claude,copilot", "--enforce"])).code).toBe(0);
    const file = path.join(root, HOOK_FILE);
    const doc = JSON.parse(await readFile(file, "utf8"));
    delete doc.version;
    await writeFile(file, JSON.stringify(doc, null, 2) + "\n");
    const j = await drive(root, ["doctor", "--json"]);
    const missing = (j.json.data.checks as any[]).find((c) => c.id === "enforce-entry-missing" && c.file === HOOK_FILE);
    expect(missing, "enforce-entry-missing for the hook file").toBeDefined();
    expect(JSON.stringify(missing)).toContain("version");
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    expect(JSON.parse(await readFile(file, "utf8")).version).toBe(1);
    expect((await drive(root, ["init", "--json", "--yes", "--agents", "claude"])).code).toBe(0);
    expect(await exists(root, HOOK_FILE)).toBe(false);
  });
});

describe("the docs say what enforce does without wikeeper", () => {
  it("docs/reference.md's Copilot note says the hooks step aside and lint still reports page edits", async () => {
    const reference = await readFile(path.join(process.cwd(), "docs", "reference.md"), "utf8");
    expect(reference).toContain(
      "On a machine where wikeeper can't run, the hooks step aside: Copilot asks before each command as usual and page edits aren't blocked, and `wikeeper lint` still reports them.",
    );
  });
});
