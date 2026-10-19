import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initialConfigText } from "../src/commands/init.js";
import { DEFAULT_CONFIG, loadConfig, setConfigValue, tokenLimitIssues } from "../src/core/config.js";

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});
async function withConfig(text: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-cfgtok-"));
  dirs.push(root);
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  await writeFile(path.join(root, ".wiki", "config.yml"), text);
  return root;
}

describe("token-count leaf", () => {
  it.each([
    ["20000", 20000],
    ["20k", 20000],
    ["1.5k", 1500],
    ["'25000'", 25000],
    ["12K", 12000],
  ])("accepts %s", async (v, n) => {
    const r = await loadConfig(await withConfig(`tokens: { page: { yellow: ${v}, red: 999999 } }\n`));
    expect(r.errors).toEqual([]);
    expect(r.config.tokens.page.yellow).toBe(n);
  });
  it.each(["0", "-5", "1.2345k", "abc", "1.5", "true"])("refuses %s", async (v) => {
    const r = await loadConfig(await withConfig(`tokens: { page: { yellow: ${v} } }\n`));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.key).toBe("tokens.page.yellow");
    expect(r.config.tokens.page.yellow).toBe(4000);
  });
});

describe("tokenLimitIssues", () => {
  it("reports both groups", () => {
    const t = { page: { yellow: 5, red: 5 }, source: { yellow: 9, red: 3, confirm_at: "yellow" as const } };
    expect(tokenLimitIssues(t).map((i) => i.key)).toEqual(["tokens.page.yellow", "tokens.source.yellow"]);
    expect(tokenLimitIssues(DEFAULT_CONFIG.tokens)).toEqual([]);
  });
  it("loadConfig skips a group that already has an error", async () => {
    const r = await loadConfig(await withConfig("tokens: { page: { yellow: nope, red: 1k } }\n"));
    expect(r.errors.map((e) => e.key)).toEqual(["tokens.page.yellow"]);
  });
  it("loadConfig reports yellow >= red for the untouched group", async () => {
    const r = await loadConfig(await withConfig("tokens: { source: { yellow: 70k } }\n"));
    expect(r.errors.map((e) => e.key)).toEqual(["tokens.source.yellow"]);
  });
});

describe("initialConfigText", () => {
  it("loads clean and equals the defaults", async () => {
    const r = await loadConfig(await withConfig(initialConfigText("management")));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.config.tokens).toEqual(DEFAULT_CONFIG.tokens);
  });
  it("setConfigValue changes only the agents line", async () => {
    const seed = initialConfigText("management");
    const root = await withConfig(seed);
    await setConfigValue(root, "agents", ["claude"]);
    const after = await readFile(path.join(root, ".wiki", "config.yml"), "utf8");
    expect(after).toBe(seed.replace("agents: []", "agents:\n  - claude"));
  });
});
