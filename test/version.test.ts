import { Readable, Writable } from "node:stream";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentsIntegration } from "../src/agents/index.js";
import { registerIntegration, resetIntegrations } from "../src/core/integrations.js";
import { guardCommand } from "../src/agents/enforce/guard-command.js";
import { buildCommit, fullVersion, npmVersion, versionString } from "../src/core/version.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wk-ver-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("version helpers", () => {
  it("versionString joins version and commit or +dev", () => {
    expect(versionString("0.3.0", "a0f0550")).toBe("0.3.0+a0f0550");
    expect(versionString("0.3.0", null)).toBe("0.3.0+dev");
  });

  it("buildCommit accepts a valid stamp and rejects missing, malformed and invalid ones", async () => {
    const f = path.join(dir, "build-info.json");
    expect(buildCommit(pathToFileURL(f))).toBeNull();
    await writeFile(f, '{"commit":"a0f0550"}\n');
    expect(buildCommit(pathToFileURL(f))).toBe("a0f0550");
    await writeFile(f, "{ not json");
    expect(buildCommit(pathToFileURL(f))).toBeNull();
    await writeFile(f, '{"commit":"../../x"}');
    expect(buildCommit(pathToFileURL(f))).toBeNull();
  });

  it("fullVersion is +dev when running from source", () => {
    expect(fullVersion()).toMatch(/^\d+\.\d+\.\d+\+dev$/);
  });

  it("npmVersion drops the build part", () => {
    expect(npmVersion("0.3.0+a0f0550")).toBe("0.3.0");
    expect(npmVersion("0.3.0+dev")).toBe("0.3.0");
    expect(npmVersion("1.0.0")).toBe("1.0.0");
  });

  it("guardCommand pins the npx form without the build part", () => {
    expect(guardCommand("npx", "claude", "0.3.0+a0f0550")).toBe("npx -y wikeeper@0.3.0 hook guard --agent claude");
  });
});

describe("init and update record the full version but pin npx without the build part", () => {
  let savedPath: string | undefined;
  beforeEach(() => {
    savedPath = process.env["PATH"];
    resetIntegrations();
    registerIntegration({ name: "agents", ...agentsIntegration } as never);
  });
  afterEach(() => {
    process.env["PATH"] = savedPath;
    resetIntegrations();
  });

  it("manifest keeps the string as given; guard hook stays unchanged across update", async () => {
    const { runInit } = await import("../src/commands/init.js");
    const { runUpdate } = await import("../src/commands/update.js");
    const root = path.join(dir, "repo");
    await mkdir(path.join(root, ".git"), { recursive: true });
    const emptyBin = path.join(dir, "bin");
    await mkdir(emptyBin);
    process.env["PATH"] = emptyBin;
    const settings = path.join(root, ".claude", "settings.json");
    const manifestFile = path.join(root, ".wiki", "system", "manifest.json");
    const run = (flags: Record<string, unknown>) => ({
      flags,
      json: true,
      interactive: false,
      io: {
        cwd: root,
        stdout: new Writable({ write: (_c, _e, cb) => cb() }),
        stderr: new Writable({ write: (_c, _e, cb) => cb() }),
        stdin: Readable.from([]) as never,
      },
    });
    await runInit(root, run({ agents: "claude", enforce: true }), { packageVersion: "0.3.0+a0f0550" });
    expect(JSON.parse(await readFile(manifestFile, "utf8")).package_version).toBe("0.3.0+a0f0550");
    const s1 = await readFile(settings, "utf8");
    expect(s1).toContain("npx -y wikeeper@0.3.0 hook guard --agent claude");
    expect(s1).not.toContain("+a0f0550");
    await runUpdate(root, run({}), { packageVersion: "0.3.0+b1c2d3e" });
    expect(JSON.parse(await readFile(manifestFile, "utf8")).package_version).toBe("0.3.0+b1c2d3e");
    expect(await readFile(settings, "utf8")).toBe(s1);
  });
});
