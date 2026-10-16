import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG, loadConfig, setConfigValue } from "../src/core/config.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wk-cfg-"));
  await mkdir(path.join(root, ".wiki"), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const cfg = () => path.join(root, ".wiki", "config.yml");

describe("config", () => {
  it("a missing config yields the defaults", async () => {
    const r = await loadConfig(root);
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.warnings).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("partial config merges with defaults", async () => {
    await writeFile(cfg(), "content_dir: wiki\ningest:\n  permission: ai\n");
    const r = await loadConfig(root);
    expect(r.config.content_dir).toBe("wiki");
    expect(r.config.ingest.permission).toBe("ai");
    expect(r.config.ingest.ambient_offers).toBe(true);
  });

  it.each([
    ["ingest.permission", "ingest:\n  permission: sometimes\n", "allowed: ai, ask, whitelist"],
    ["content_dir", "content_dir: ../outside\n", "must stay inside the repository"],
    ["lint.stale_after_days", "lint:\n  stale_after_days: -1\n", "must be a positive integer"],
  ])("invalid %s is an error naming the rule", async (key, yml, rule) => {
    await writeFile(cfg(), yml);
    const r = await loadConfig(root);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.key).toBe(key);
    expect(r.errors[0]!.message).toContain(rule);
  });

  it("a legal directory named ..foo stays inside", async () => {
    await writeFile(cfg(), "content_dir: ..foo\n");
    expect((await loadConfig(root)).errors).toEqual([]);
  });

  it("unknown keys are warnings", async () => {
    await writeFile(cfg(), "colour: blue\n");
    const r = await loadConfig(root);
    expect(r.warnings.map((w) => w.key)).toContain("colour");
    expect(r.errors).toEqual([]);
  });

  it("nested unknown keys use the dotted path", async () => {
    await writeFile(cfg(), "ingest:\n  bogus: 1\n");
    expect((await loadConfig(root)).warnings.map((w) => w.key)).toEqual(["ingest.bogus"]);
  });

  it("setConfigValue keeps the comment (key present)", async () => {
    await writeFile(cfg(), "# note\nsetup_completed_at: null\n");
    await setConfigValue(root, "setup_completed_at", "2026-10-16T12:00:00Z");
    expect(await readFile(cfg(), "utf8")).toContain("# note\n");
    expect((await loadConfig(root)).config.setup_completed_at).toBe("2026-10-16T12:00:00Z");
  });

  it("setConfigValue inserts an absent nested key", async () => {
    await writeFile(cfg(), "# note\ncontent_dir: wiki\n");
    await setConfigValue(root, "ingest.permission", "ai");
    expect(await readFile(cfg(), "utf8")).toContain("# note");
    expect((await loadConfig(root)).config.ingest.permission).toBe("ai");
  });
});
