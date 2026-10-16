import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const loadSetup = () => import("../src/commands/setup.js");
const loadInteg = () => import("../src/core/integrations.js");
const loadProgram = () => import("../src/program.js");

const tmpDirs: string[] = [];
beforeEach(async () => {
  const { resetIntegrations } = await loadInteg();
  resetIntegrations();
});
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function repo(config: string | null): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-set-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  if (config !== null) {
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), config);
  }
  return root;
}

async function run(root: string, args: string[], now?: () => Date) {
  const { createSetupCommand } = await loadSetup();
  const { runCli } = await loadProgram();
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    commands: [createSetupCommand(now ? { now } : undefined)],
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Readable.from([]),
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

const CFG = "# keep this comment\nprofile: management\nsetup_completed_at: null\n";

describe("STORY-001-07 setup (red)", () => {
  it("S3: --done stamps once, preserves comment, setup reports it", async () => {
    const root = await repo(CFG);
    const t1 = new Date(Date.UTC(2026, 9, 16, 12, 0, 0));
    const t2 = new Date(Date.UTC(2026, 9, 17, 8, 30, 0));
    const a = await run(root, ["setup", "--done", "--json"], () => t1);
    const b = await run(root, ["setup", "--done", "--json"], () => t2);
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(a.json.data.setup_completed_at).toBe(t1.toISOString());
    expect(b.json.data.setup_completed_at).toBe(t1.toISOString());
    const text = await readFile(path.join(root, ".wiki", "config.yml"), "utf8");
    expect(text).toContain("# keep this comment");
    expect(text).toContain(t1.toISOString());
    const c = await run(root, ["setup", "--json"]);
    expect(c.code).toBe(0);
    expect(c.json.data).toEqual({ setup_completed_at: t1.toISOString(), profile: "management" });
  });

  it("plain setup is read-only and reports null when not done", async () => {
    const root = await repo(CFG);
    const r = await run(root, ["setup", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data).toEqual({ setup_completed_at: null, profile: "management" });
    expect(await readFile(path.join(root, ".wiki", "config.yml"), "utf8")).toBe(CFG);
  });

  it("plain setup with no config reports defaults", async () => {
    const root = await repo(null);
    const r = await run(root, ["setup", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data).toEqual({ setup_completed_at: null, profile: "management" });
  });

  it("--done on an uninitialised repo exits 1 and creates nothing", async () => {
    const root = await repo(null);
    const r = await run(root, ["setup", "--done", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.ok).toBe(false);
    await expect(readFile(path.join(root, ".wiki", "config.yml"))).rejects.toThrow();
  });

  it("CRLF config keeps CRLF through --done", async () => {
    const root = await repo("# c\r\nprofile: management\r\nsetup_completed_at: null\r\n");
    const r = await run(root, ["setup", "--done", "--json"], () => new Date(Date.UTC(2026, 9, 16, 12)));
    expect(r.code).toBe(0);
    const text = await readFile(path.join(root, ".wiki", "config.yml"), "utf8");
    expect(text).toContain("2026-10-16T12:00:00.000Z");
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
  });
});
