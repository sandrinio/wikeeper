import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONFIG_SYNTAX_FIX,
  checkConfigKey,
  configLeafKeys,
  getConfigLeaf,
  loadConfig,
  parseConfigValue,
  setConfigValue,
  unsetConfigValue,
} from "../src/core/config.js";

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});
async function repo(config?: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-cfg-"));
  dirs.push(root);
  if (config !== undefined) {
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), config);
  }
  return root;
}
const read = (root: string) => readFile(path.join(root, ".wiki", "config.yml"), "utf8");
const errOf = (fn: () => unknown): any => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("did not throw");
};

describe("getConfigLeaf / configLeafKeys", () => {
  it("returns leaves by type, null for groups and unknown keys", () => {
    expect(getConfigLeaf("profile")?.type).toBe("string");
    expect(getConfigLeaf("enforce")?.type).toBe("boolean");
    expect(getConfigLeaf("lint.stale_after_days")?.type).toBe("integer");
    expect(getConfigLeaf("agents")?.type).toBe("string[]");
    expect(getConfigLeaf("setup_completed_at")?.type).toBe("string|null");
    expect(getConfigLeaf("content_dir")?.type).toBe("content_dir");
    expect(getConfigLeaf("tokens.page.red")).toEqual({ type: "token-count", default: 10000 });
    expect(getConfigLeaf("ingest.permission")?.allowed).toEqual(["ai", "ask", "whitelist"]);
    expect(getConfigLeaf("tokens")).toBeNull();
    expect(getConfigLeaf("nope")).toBeNull();
  });
  it("lists leaves in SCHEMA order, by prefix, and [] for unknown", () => {
    const all = configLeafKeys();
    expect(all[0]).toBe("profile");
    expect(configLeafKeys("tokens")).toHaveLength(5);
    expect(configLeafKeys("tokens.page")).toEqual(["tokens.page.yellow", "tokens.page.red"]);
    expect(configLeafKeys("profile")).toEqual(["profile"]);
    expect(configLeafKeys("zzz")).toEqual([]);
  });
});

describe("checkConfigKey", () => {
  it("gives every R3 message", () => {
    expect(errOf(() => checkConfigKey("tokens.pages.red", "get")).message).toContain(
      'unknown config key "tokens.pages.red"; keys under tokens: tokens.page.yellow',
    );
    expect(errOf(() => checkConfigKey("colour", "get")).message).toContain('unknown config key "colour"; known keys: profile');
    expect(errOf(() => checkConfigKey("tokens", "set")).message).toContain("tokens is a group of settings; keys under tokens:");
    expect(() => checkConfigKey("tokens", "get")).not.toThrow();
    const agents = errOf(() => checkConfigKey("agents", "set"));
    expect(agents.code).toBe("config_key_not_settable");
    expect(agents.message).toBe("agents is a list setting: edit .wiki/config.yml by hand, or run wikeeper init --agents <list>");
    expect(errOf(() => checkConfigKey("hooks.pre_ingest", "set")).message).toBe(
      "hooks.pre_ingest is a list setting: edit .wiki/config.yml by hand",
    );
    expect(errOf(() => checkConfigKey("content_dir", "set")).message).toContain("move pages/, archive/, raw/, log/ and index.md");
    expect(() => checkConfigKey("content_dir", "get")).not.toThrow();
  });
});

describe("parseConfigValue", () => {
  it("accepts and refuses forms per type", () => {
    expect(parseConfigValue("enforce", "TRUE")).toBe(true);
    expect(parseConfigValue("lint.stale_after_days", "05")).toBe(5);
    expect(errOf(() => parseConfigValue("lint.stale_after_days", "1.5")).code).toBe("invalid_config_value");
    expect(errOf(() => parseConfigValue("lint.stale_after_days", "0")).message).toContain("must be a positive integer");
    expect(parseConfigValue("setup_completed_at", "null")).toBeNull();
    expect(parseConfigValue("tokens.page.red", "1.5k")).toBe(1500);
    expect(parseConfigValue("tokens.page.red", "20000")).toBe(20000);
    expect(errOf(() => parseConfigValue("tokens.page.red", "1.2345k")).code).toBe("invalid_config_value");
    expect(errOf(() => parseConfigValue("enforce", "yes")).message).toContain("must be a boolean");
    expect(parseConfigValue("ingest.permission", "ai")).toBe("ai");
    expect(errOf(() => parseConfigValue("agents", "x")).code).toBe("config_key_not_settable");
  });
});

describe("unsetConfigValue and setConfigValue", () => {
  it("removes emptied groups up to the top and keeps other comments", async () => {
    const root = await repo("# top\nprofile: management\ntokens:\n  page:\n    red: 12000 # r\n  source:\n    red: 70000 # s\n");
    expect(await unsetConfigValue(root, "tokens.page.red")).toBe(true);
    expect(await read(root)).toBe("# top\nprofile: management\ntokens:\n  source:\n    red: 70000 # s\n");
    expect(await unsetConfigValue(root, "tokens.source.red")).toBe(true);
    expect(await read(root)).toBe("# top\nprofile: management\n");
  });
  it("returns false without writing for an absent key or a missing file", async () => {
    const root = await repo("profile: management\n");
    expect(await unsetConfigValue(root, "tokens.page.red")).toBe(false);
    expect(await read(root)).toBe("profile: management\n");
    const none = await repo();
    expect(await unsetConfigValue(none, "profile")).toBe(false);
    await expect(read(none)).rejects.toThrow();
  });
  it("keeps BOM and CRLF", async () => {
    const root = await repo("﻿profile: management\r\nlint:\r\n  stale_after_days: 14\r\n");
    await unsetConfigValue(root, "lint.stale_after_days");
    expect(await read(root)).toBe("﻿profile: management\r\n");
  });
  it("writes nested keys into empty, comment-only and null-group files; refuses a non-map group", async () => {
    const empty = await repo("");
    await setConfigValue(empty, "tokens.page.red", 12000);
    expect(await read(empty)).toBe("tokens:\n  page:\n    red: 12000\n");
    const nullGroup = await repo("tokens:\n");
    await setConfigValue(nullGroup, "tokens.page.red", 12000);
    expect(await read(nullGroup)).toBe("tokens:\n  page:\n    red: 12000\n");
    const bad = await repo("tokens: 5\n");
    const e = await setConfigValue(bad, "tokens.page.red", 12000).catch((x) => x);
    expect(e.code).toBe("config_invalid");
    expect(e.message).toBe("tokens must be a mapping in .wiki/config.yml: fix it by hand");
    expect(await read(bad)).toBe("tokens: 5\n");
  });
});

describe("syntax error message (R11)", () => {
  it("is one line ending with the step, from loadConfig and setConfigValue", async () => {
    const root = await repo("tokens: [unclosed\n");
    const a = await loadConfig(root).catch((x) => x);
    const b = await setConfigValue(root, "tokens.page.red", 1).catch((x) => x);
    for (const e of [a, b]) {
      expect(e.code).toBe("E_CONFIG_SYNTAX");
      expect(e.message).toMatch(/^config\.yml syntax error at line 2: [^\n]+: fix the YAML syntax in \.wiki\/config\.yml$/);
      expect(e.message).not.toMatch(/ at line \d+, column/);
    }
    expect(a.message.endsWith(CONFIG_SYNTAX_FIX)).toBe(true);
  });
});
