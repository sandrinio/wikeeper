import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CONFIG, formatConfigIssue, loadConfig, setConfigValue } from "../src/core/config.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wk-cfg-red-"));
  await mkdir(path.join(root, ".wiki"), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const cfgFile = () => path.join(root, ".wiki", "config.yml");
const write = (s: string) => writeFile(cfgFile(), s);

describe("config (red)", () => {
  it("DEFAULT_CONFIG has the documented R1 defaults", () => {
    expect(DEFAULT_CONFIG).toEqual({
      profile: "management",
      setup_completed_at: null,
      agents: [],
      content_dir: ".wiki",
      private: [],
      enforce: false,
      ingest: {
        permission: "ask",
        whitelist: { kinds: [], origins: [] },
        ambient_offers: true,
        delegate: "auto",
        extractor_model: "small",
        writer_model: "medium",
      },
      hooks: { pre_ingest: [], post_ingest: [] },
      lint: { stale_after_days: 30 },
    });
  });

  it("missing config yields the defaults with no warnings or errors", async () => {
    const r = await loadConfig(root);
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.warnings).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("empty config file yields the defaults", async () => {
    await write("");
    const r = await loadConfig(root);
    expect(r.config).toEqual(DEFAULT_CONFIG);
    expect(r.errors).toEqual([]);
  });

  it("partial config merges with defaults", async () => {
    await write("content_dir: wiki\ningest:\n  permission: ai\n");
    const r = await loadConfig(root);
    expect(r.errors).toEqual([]);
    expect(r.config.content_dir).toBe("wiki");
    expect(r.config.ingest.permission).toBe("ai");
    expect(r.config.ingest.ambient_offers).toBe(true);
    expect(r.config.lint.stale_after_days).toBe(30);
  });

  it.each([
    ["ingest.permission", "ingest:\n  permission: sometimes\n", "allowed: ai, ask, whitelist"],
    ["content_dir", "content_dir: ../outside\n", "must stay inside the repository"],
    ["lint.stale_after_days", "lint:\n  stale_after_days: -1\n", "must be a positive integer"],
  ])("invalid %s is reported with key path and rule", async (key, yaml, rule) => {
    await write(yaml);
    const r = await loadConfig(root);
    const hits = r.errors.filter((e) => e.key === key);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.message).toContain(rule);
    expect(r.errors).toHaveLength(1);
  });

  it("an invalid value keeps its default", async () => {
    await write("ingest:\n  permission: sometimes\n");
    const r = await loadConfig(root);
    expect(r.config.ingest.permission).toBe("ask");
  });

  it("non-integer stale_after_days is an error", async () => {
    await write("lint:\n  stale_after_days: 1.5\n");
    const r = await loadConfig(root);
    expect(r.errors.map((e) => e.key)).toEqual(["lint.stale_after_days"]);
  });

  it("type mismatch reports a rule message", async () => {
    await write("enforce: maybe\n");
    const r = await loadConfig(root);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.key).toBe("enforce");
    expect(r.errors[0]!.message).toContain("must be a boolean");
  });

  it("non-mapping root is an error with empty key", async () => {
    await write("- a\n- b\n");
    const r = await loadConfig(root);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.key).toBe("");
    expect(r.errors[0]!.message).toContain("must be a mapping");
  });

  it("unknown keys are warnings, not errors", async () => {
    await write("colour: blue\n");
    const r = await loadConfig(root);
    expect(r.warnings.map((w) => w.key)).toContain("colour");
    expect(r.warnings[0]!.message).toContain("unknown key");
    expect(r.errors).toEqual([]);
  });

  it("YAML syntax errors throw E_CONFIG_SYNTAX", async () => {
    await write("a: [unclosed\n");
    await expect(loadConfig(root)).rejects.toMatchObject({ code: "E_CONFIG_SYNTAX" });
  });

  it("formatConfigIssue renders key, JSON value and message", () => {
    expect(formatConfigIssue({ key: "ingest.permission", value: "sometimes", message: "allowed: ai, ask, whitelist" })).toBe(
      'ingest.permission: "sometimes" — allowed: ai, ask, whitelist',
    );
  });

  it("setConfigValue preserves the comment and the value reads back as a string", async () => {
    await write("# keep me\nsetup_completed_at: null\n");
    const wrote = await setConfigValue(root, "setup_completed_at", "2026-10-16T12:00:00Z");
    expect(wrote).toBe(true);
    const text = await readFile(cfgFile(), "utf8");
    expect(text).toContain("# keep me\n");
    const r = await loadConfig(root);
    expect(r.config.setup_completed_at).toBe("2026-10-16T12:00:00Z");
    expect(typeof r.config.setup_completed_at).toBe("string");
  });

  it("setConfigValue inserts an absent nested key and keeps comments", async () => {
    await write("# top comment\ncontent_dir: wiki\n");
    await setConfigValue(root, "ingest.permission", "ai");
    const text = await readFile(cfgFile(), "utf8");
    expect(text).toContain("# top comment");
    expect(text).toContain("content_dir: wiki");
    const r = await loadConfig(root);
    expect(r.config.ingest.permission).toBe("ai");
    expect(r.config.content_dir).toBe("wiki");
  });

  it("setConfigValue returns false and does not rewrite when the value is unchanged", async () => {
    await write("agents:\n  - claude\n");
    const wrote = await setConfigValue(root, "agents", ["claude"]);
    expect(wrote).toBe(false);
    expect(await readFile(cfgFile(), "utf8")).toBe("agents:\n  - claude\n");
  });

  it("setConfigValue creates the file and .wiki/ when missing", async () => {
    await rm(path.join(root, ".wiki"), { recursive: true, force: true });
    const wrote = await setConfigValue(root, "enforce", true);
    expect(wrote).toBe(true);
    const r = await loadConfig(root);
    expect(r.config.enforce).toBe(true);
  });

  it("setConfigValue preserves CRLF and a leading BOM", async () => {
    await write("﻿# c\r\nsetup_completed_at: null\r\n");
    await setConfigValue(root, "setup_completed_at", "2026-10-16T12:00:00Z");
    const text = await readFile(cfgFile(), "utf8");
    expect(text.startsWith("﻿")).toBe(true);
    expect(text).toContain("# c\r\n");
    expect(text.replace(/\r\n/g, "")).not.toContain("\n");
  });
});
