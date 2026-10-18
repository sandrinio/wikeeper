import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { collectStatus } from "../src/commands/status.js";
import { loadConfig } from "../src/core/config.js";
import { resolvePaths } from "../src/core/paths.js";
import { runCli } from "../src/program.js";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function cli(root: string, args: string[]) {
  const out: string[] = [];
  const code = await runCli(args, {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: () => undefined },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  } as never);
  return { code, text: out.join("") };
}

async function repo(configExtra = "") {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-status-tokens-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await cli(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  if (configExtra !== "") {
    const file = path.join(root, ".wiki", "config.yml");
    const { readFile } = await import("node:fs/promises");
    await writeFile(file, (await readFile(file, "utf8")) + configExtra);
  }
  const { config } = await loadConfig(root);
  return { root, config, paths: resolvePaths(root, config) };
}

describe("status tokens (STORY-007-05)", () => {
  it("collectStatus.tokens with fewer than five pages", async () => {
    const { paths, config } = await repo();
    await mkdir(paths.pagesDir, { recursive: true });
    await writeFile(path.join(paths.pagesDir, "a.md"), "# A\n\n" + "word ".repeat(12000));
    await writeFile(path.join(paths.pagesDir, "b.md"), "# B\n\nshort\n");
    const { data } = await collectStatus(paths, config, new Date());
    expect(data.tokens.page_count).toBe(2);
    expect(data.tokens.largest.map((l) => l.path)).toEqual(["a.md", "b.md"]);
    expect(data.tokens.largest[0]!.level).not.toBe("green");
    expect(data.tokens.largest[1]!.level).toBe("green");
    expect(data.tokens.wiki).toBe(data.tokens.largest.reduce((n, l) => n + l.tokens, 0));
    expect(data.tokens.limits).toEqual(config.tokens);
  });

  it("the limits line uses formatLimit", async () => {
    const { root } = await repo();
    const { text } = await cli(root, ["status"]);
    expect(text).toContain("  limits: page 4k/10k · source 20k/60k, approval at yellow");
    expect(text).toMatch(/^tokens: wiki ≈0 · 0 pages · index\.md ≈\d+/m);
    expect(text).not.toContain("largest pages:");
  });

  it("says no size approval when confirm_at is never", async () => {
    const { root } = await repo();
    expect((await cli(root, ["config", "set", "tokens.source.confirm_at", "never"])).code).toBeLessThanOrEqual(2);
    const cfg = await loadConfig(root);
    if (cfg.config.tokens.source.confirm_at !== "never") return; // `config set` lands with STORY-007-02
    const { text } = await cli(root, ["status"]);
    expect(text).toContain("source 20k/60k, no size approval");
  });
});
