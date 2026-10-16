import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const loadDoctor = () => import("../src/commands/doctor.js");
const loadInteg = () => import("../src/core/integrations.js");
const loadProgram = () => import("../src/program.js");

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const tmpDirs: string[] = [];

beforeEach(async () => {
  const { resetIntegrations } = await loadInteg();
  resetIntegrations();
});
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

const FILES: Record<string, string> = {
  ".wiki/system/SETUP.md": "setup\n",
  ".wiki/system/WIKI.md": "wiki\n",
};

async function fixture(opts: { config?: string; initialised?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-doc-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  if (opts.initialised === false) return root;
  for (const [rel, text] of Object.entries(FILES)) {
    const abs = path.join(root, ...rel.split("/"));
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, text);
  }
  await writeFile(
    path.join(root, ".wiki", "config.yml"),
    opts.config ?? "# wikeeper config\nprofile: management\nsetup_completed_at: null\n",
  );
  const manifest = {
    package_version: "0.0.1",
    files: Object.keys(FILES)
      .sort()
      .map((p) => ({ path: p, sha256: sha(FILES[p]!), kind: "system" })),
  };
  await writeFile(path.join(root, ".wiki", "system", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return root;
}

async function runDoctorCli(root: string, nodeVersion?: string) {
  const { createDoctorCommand } = await loadDoctor();
  const { runCli } = await loadProgram();
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(["doctor", "--json"], {
    commands: [createDoctorCommand(nodeVersion ? { nodeVersion } : undefined)],
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Readable.from([]),
    },
  } as never);
  const text = out.join("");
  return { code, text, json: JSON.parse(text.trim().split("\n")[0]!) };
}

type Check = { id: string; severity: string; message: string; fix?: string };
const find = (checks: Check[], id: string) => checks.find((c) => c.id === id);

describe("STORY-001-07 doctor (red)", () => {
  it("S1: healthy install passes every check incl. integration check", async () => {
    const { registerIntegration } = await loadInteg();
    registerIntegration({
      name: "test",
      doctor: () => [{ id: "test-check", severity: "ok", message: "fine" }],
    });
    const root = await fixture();
    const { code, json } = await runDoctorCli(root, "22.12.0");
    const checks = json.data.checks as Check[];
    expect(checks.map((c) => c.id)).toEqual([
      "node-version",
      "wiki-initialised",
      "config-valid",
      "manifest-drift",
      "test-check",
    ]);
    expect(checks.every((c) => c.severity === "ok")).toBe(true);
    expect(json.data.errors).toBe(0);
    expect(json.data.warnings).toBe(0);
    expect(code).toBe(0);
  });

  it.each([
    ["edited", "warning", 0],
    ["deleted", "error", 1],
  ])("S2: manifest drift %s -> %s, exit %i", async (change, severity, exit) => {
    const root = await fixture();
    const target = path.join(root, ".wiki", "system", "WIKI.md");
    if (change === "edited") await writeFile(target, "edited by user\n");
    else await unlink(target);
    const { code, json } = await runDoctorCli(root, "22.12.0");
    const drift = find(json.data.checks, "manifest-drift")!;
    expect(drift.severity).toBe(severity);
    expect(drift.message).toContain("WIKI.md");
    expect(code).toBe(exit);
  });

  it("S4: old Node version is an error with a fix mentioning 22.12", async () => {
    const root = await fixture();
    const { code, json } = await runDoctorCli(root, "20.11.0");
    const node = find(json.data.checks, "node-version")!;
    expect(node.severity).toBe("error");
    expect(node.fix).toContain("22.12");
    expect(code).toBe(1);
  });

  it("S5: invalid config is reported naming key and allowed values", async () => {
    const root = await fixture({ config: "ingest:\n  permission: sometimes\n" });
    const { code, json } = await runDoctorCli(root, "22.12.0");
    const cfg = find(json.data.checks, "config-valid")!;
    expect(cfg.severity).toBe("error");
    expect(cfg.message).toContain("ingest.permission");
    expect(cfg.message).toContain("ai, ask, whitelist");
    expect(code).toBe(1);
  });

  it("U1: compareVersions", async () => {
    const { compareVersions } = await loadDoctor();
    expect(compareVersions("22.12.0", "22.12.0")).toBe(0);
    expect(compareVersions("22.12.0", "22.12.1")!).toBeLessThan(0);
    expect(compareVersions("23.0.0", "22.12.0")!).toBeGreaterThan(0);
    expect(compareVersions("v22.12.0", "22.12.0")).toBe(0);
    expect(compareVersions("banana", "22.12.0")).toBeNull();
  });

  it("U2: checkNodeVersion and MIN_NODE_VERSION", async () => {
    const { checkNodeVersion, MIN_NODE_VERSION } = await loadDoctor();
    expect(MIN_NODE_VERSION).toBe("22.12.0");
    expect(checkNodeVersion("22.12.0").severity).toBe("ok");
    expect(checkNodeVersion("20.11.0").severity).toBe("error");
    expect(checkNodeVersion("nonsense").severity).toBe("warning");
  });

  it("U3: not-initialised repo does not throw; reports run wikeeper init, exit 1", async () => {
    const root = await fixture({ initialised: false });
    const { code, json } = await runDoctorCli(root, "22.12.0");
    const checks = json.data.checks as Check[];
    expect(checks.map((c) => c.id).slice(0, 4)).toEqual([
      "node-version",
      "wiki-initialised",
      "config-valid",
      "manifest-drift",
    ]);
    for (const id of ["wiki-initialised", "manifest-drift"]) {
      const c = find(checks, id)!;
      expect(c.severity).toBe("error");
      expect(c.fix).toContain("run wikeeper init");
    }
    expect(code).toBe(1);
  });

  it("U4: throwing integration doctor handler becomes integration-<name>; others intact", async () => {
    const { registerIntegration } = await loadInteg();
    registerIntegration({
      name: "boom",
      doctor: () => {
        throw new Error("kaput");
      },
    });
    const root = await fixture();
    const { code, json } = await runDoctorCli(root, "22.12.0");
    const checks = json.data.checks as Check[];
    const b = find(checks, "integration-boom")!;
    expect(b.severity).toBe("error");
    expect(b.message).toContain("kaput");
    expect(find(checks, "node-version")!.severity).toBe("ok");
    expect(find(checks, "manifest-drift")!.severity).toBe("ok");
    expect(code).toBe(1);
  });

  it("U5: runDoctor returns counts", async () => {
    const { runDoctor } = await loadDoctor();
    const root = await fixture();
    await writeFile(path.join(root, ".wiki", "system", "WIKI.md"), "edited\n");
    const res = await runDoctor(
      root,
      { flags: {}, json: true, interactive: false, io: { cwd: root } as never },
      { nodeVersion: "22.12.0" },
    );
    expect(res.errors).toBe(0);
    expect(res.warnings).toBe(1);
    expect(res.checks.length).toBeGreaterThanOrEqual(4);
  });
});
