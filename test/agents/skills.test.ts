import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { installSkills } from "../../src/agents/skills.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-skills-unit-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
});

describe("installSkills copy mode", () => {
  it("win32 uses copy and a re-run is a no-op", async () => {
    const manifest = { package_version: "0.0.0", files: [] };
    await installSkills({ root, agents: ["claude"], manifest, platform: "win32" });
    expect((await lstat(path.join(root, ".claude", "skills", "wiki-ingest"))).isDirectory()).toBe(true);
    const snapshot = JSON.stringify(manifest);
    const again = await installSkills({ root, agents: ["claude"], manifest, platform: "win32" });
    expect(again.created).toEqual([]);
    expect(again.replaced).toEqual([]);
    expect(JSON.stringify(manifest)).toBe(snapshot);
  });
});
