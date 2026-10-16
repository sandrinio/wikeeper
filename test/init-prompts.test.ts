import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import type { IntegrationContext } from "../src/core/integrations.js";
import { registerIntegration, resetIntegrations, runIntegrations } from "../src/core/integrations.js";
import { agentsIntegration } from "../src/agents/index.js";
import { resolvePaths } from "../src/core/paths.js";
import { templatesDir } from "../src/core/templates.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wk-prep-"));
  resetIntegrations();
});
afterEach(async () => {
  resetIntegrations();
  await rm(root, { recursive: true, force: true });
});

function ctx(flags: Record<string, unknown>): IntegrationContext {
  const config = structuredClone(DEFAULT_CONFIG);
  const sink = { write: () => true } as unknown as NodeJS.WritableStream;
  return {
    root,
    paths: resolvePaths(root, config),
    config,
    options: {
      flags,
      json: true,
      interactive: false,
      io: { cwd: root, stdout: sink, stderr: sink, stdin: process.stdin } as never,
      manifest: { package_version: "0", files: [] },
      templatesDir: templatesDir(),
      packageVersion: "0",
    },
  };
}

describe("runIntegrations prepare", () => {
  it("awaits prepare handlers in registration order and returns the empty result", async () => {
    const order: string[] = [];
    registerIntegration({ name: "a", prepare: async () => void order.push("a") });
    registerIntegration({ name: "b", prepare: async () => void order.push("b"), init: () => ({ created: ["x"] }) });
    const r = await runIntegrations("prepare", ctx({}));
    expect(order).toEqual(["a", "b"]);
    expect(r).toEqual({ created: [], replaced: [], skipped: [], removed: [], kept: [], warnings: [], checks: [] });
  });
});

describe("agents integration init without a prior prepare", () => {
  it("still resolves the agents from the flag", async () => {
    const c = ctx({ agents: "claude" });
    await expect(agentsIntegration.prepare(c)).resolves.toBeUndefined();
    const c2 = ctx({ agents: "claude" });
    const report = await agentsIntegration.init(c2);
    expect(c2.config.agents).toEqual(["claude"]);
    expect(JSON.stringify(report)).toContain(".claude/");
  });
});
