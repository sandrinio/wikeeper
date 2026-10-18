import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/program.js";

// STORY-007-02 QA-Red: wikeeper config get / set / unset, K3 write fixes, doctor step once.
const T = 30_000;
const STEP = "fix the YAML syntax in .wiki/config.yml";
const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[]) {
  const out: string[] = [];
  const input = Object.assign(Readable.from([]), { isTTY: false });
  const code = await runCli(args, {
    io: { cwd: root, stdout: { write: (c: string) => out.push(c) }, stderr: { write: () => {} }, stdin: input },
  } as never);
  const text = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(text.trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code, json, text };
}

async function gitRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-cfgcmd-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  return root;
}
async function initWiki(): Promise<string> {
  const root = await gitRepo();
  expect((await run(root, ["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
  return root;
}
const cfgFile = (root: string) => path.join(root, ".wiki", "config.yml");
const readCfg = (root: string) => readFile(cfgFile(root), "utf8");

async function hashTree(root: string): Promise<string> {
  const rows: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const d of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, d.name);
      if (d.isDirectory()) await walk(abs);
      else if (d.isFile()) rows.push(`${path.relative(root, abs)}\0${createHash("sha256").update(await readFile(abs)).digest("hex")}`);
    }
  }
  await walk(root);
  return rows.sort().join("\n");
}

describe("STORY-007-02 config command (red)", () => {
  it("S1: set changes one setting and keeps the rest of config.yml", async () => {
    const rows: Array<{
      key: string; raw: string; value: unknown; previous: unknown; printed: string; warnings: string[];
      line?: [string, string]; append?: string;
    }> = [
      { key: "tokens.source.yellow", raw: "30k", value: 30000, previous: 20000, printed: "30000", warnings: [],
        line: ["    yellow: 20k # a document to ingest this size is yellow", "    yellow: 30000 # a document to ingest this size is yellow"] },
      { key: "tokens.page.red", raw: "12.5K", value: 12500, previous: 10000, printed: "12500", warnings: [],
        line: ["    red: 10k # and this size red", "    red: 12500 # and this size red"] },
      { key: "tokens.source.confirm_at", raw: "never", value: "never", previous: "yellow", printed: "never", warnings: [],
        line: [
          "    confirm_at: yellow # ingest start asks for approval from this level: yellow, red or never",
          "    confirm_at: never # ingest start asks for approval from this level: yellow, red or never",
        ] },
      { key: "ingest.permission", raw: "ai", value: "ai", previous: "ask", printed: "ai", warnings: [], append: "ingest:\n  permission: ai\n" },
      { key: "lint.stale_after_days", raw: "14", value: 14, previous: 30, printed: "14", warnings: [], append: "lint:\n  stale_after_days: 14\n" },
      { key: "enforce", raw: "true", value: true, previous: false, printed: "true",
        warnings: ["enforce takes effect once its entries are rewritten: run wikeeper update"], append: "enforce: true\n" },
    ];
    for (const r of rows) {
      const root = await initWiki();
      const before = await readCfg(root);
      const res = await run(root, ["config", "set", r.key, r.raw, "--json"]);
      expect(res.json?.ok, r.key).toBe(true);
      expect(res.json.command, r.key).toBe("config set");
      expect(res.code, r.key).toBe(0);
      expect(res.json.data, r.key).toEqual({ key: r.key, value: r.value, previous: r.previous, changed: true });
      expect(res.json.warnings ?? [], r.key).toEqual(r.warnings);
      const after = await readCfg(root);
      if (r.line) {
        expect(before.includes(r.line[0]), `${r.key}: seed line present`).toBe(true);
        expect(after, r.key).toBe(before.replace(r.line[0], r.line[1]));
      } else {
        expect(after.startsWith(before), r.key).toBe(true);
        expect(after.slice(before.length).replace(/^\n/, ""), r.key).toBe(r.append);
      }
      const got = await run(root, ["config", "get", r.key]);
      expect(got.code, r.key).toBe(0);
      expect(got.text.trim(), r.key).toBe(r.printed);
    }
  }, T);

  it("S2: get shows effective settings, marks defaults, in text and JSON, writing nothing", async () => {
    const root = await initWiki();
    await writeFile(cfgFile(root), "profile: management\nagents: [claude]\ningest:\n  permission: sometimes\n");
    const h0 = await hashTree(root);

    const t = await run(root, ["config", "get", "tokens"]);
    expect(t.code).toBe(0);
    expect(t.text.trimEnd()).toBe(
      [
        "tokens.page.yellow: 4000 (default)",
        "tokens.page.red: 10000 (default)",
        "tokens.source.yellow: 20000 (default)",
        "tokens.source.red: 60000 (default)",
        "tokens.source.confirm_at: yellow (default)",
      ].join("\n"),
    );

    const j = await run(root, ["config", "get", "--json"]);
    expect(j.json?.ok).toBe(true);
    expect(j.json.command).toBe("config get");
    expect(j.code).toBe(0);
    expect(j.json.data.key).toBeNull();
    const { configLeafKeys } = await import("../src/core/config.js");
    const keys = (j.json.data.entries as Array<{ key: string }>).map((e) => e.key);
    expect(keys).toEqual(configLeafKeys());
    expect(keys[0]).toBe("profile");
    const i = keys.indexOf("tokens.page.yellow");
    expect(keys.slice(i, i + 5)).toEqual([
      "tokens.page.yellow", "tokens.page.red", "tokens.source.yellow", "tokens.source.red", "tokens.source.confirm_at",
    ]);
    const entry = (k: string) => j.json.data.entries.find((e: { key: string }) => e.key === k);
    expect(entry("agents")).toEqual({ key: "agents", type: "string[]", value: ["claude"], default: [], from_default: false, settable: false });
    expect(entry("ingest.permission")).toMatchObject({
      value: "ask", default: "ask", from_default: true, settable: true, allowed: ["ai", "ask", "whitelist"],
    });
    expect(j.json.warnings).toContain('ingest.permission: "sometimes" — allowed: ai, ask, whitelist');

    const leaf = await run(root, ["config", "get", "tokens.page.red"]);
    expect(leaf.code).toBe(0);
    expect(leaf.text.trim()).toBe("10000 (default)");
    expect(await hashTree(root)).toBe(h0);
  }, T);

  it("S3: unset returns a setting to its default and removes the groups it empties", async () => {
    const root = await initWiki();
    expect((await run(root, ["config", "set", "tokens.source.yellow", "30k"])).code).toBe(0);
    const before = await readCfg(root);
    expect(before).toContain("yellow: 30000");

    const same = await run(root, ["config", "set", "tokens.source.yellow", "30000", "--json"]);
    expect(same.json?.ok).toBe(true);
    expect(same.json.data.changed).toBe(false);
    expect(await readCfg(root)).toBe(before);

    const un = await run(root, ["config", "unset", "tokens.source.yellow", "--json"]);
    expect(un.json?.ok).toBe(true);
    expect(un.json.command).toBe("config unset");
    expect(un.code).toBe(0);
    expect(un.json.data).toEqual({ key: "tokens.source.yellow", value: 20000, previous: 30000, changed: true });
    const after = await readCfg(root);
    const lines = before.split("\n");
    const idx = lines.findIndex((l) => l.startsWith("    yellow: 30000"));
    expect(idx).toBeGreaterThan(-1);
    expect(after).toBe([...lines.slice(0, idx), ...lines.slice(idx + 1)].join("\n"));
    expect((await run(root, ["config", "get", "tokens.source.yellow"])).text.trim()).toBe("20000 (default)");

    expect((await run(root, ["config", "unset", "tokens.page.yellow"])).code).toBe(0);
    expect((await run(root, ["config", "unset", "tokens.page.red"])).code).toBe(0);
    const emptied = await readCfg(root);
    expect(emptied).not.toMatch(/^\s*page:/m);
    expect(emptied).toMatch(/^tokens:/m);
    expect(emptied).toContain("# Token limits");
    expect(emptied).toContain("red: 60k #");
    expect(emptied).toContain("confirm_at: yellow #");

    const again = await run(root, ["config", "unset", "tokens.page.red", "--json"]);
    expect(again.json?.ok).toBe(true);
    expect(again.code).toBe(0);
    expect(again.json.data.changed).toBe(false);
    expect(await readCfg(root)).toBe(emptied);
  }, T);

  it("S4: unknown keys, refused values and list settings are refused, config.yml unchanged", async () => {
    const rows: Array<{ pre?: string[][]; args: string[]; code: string; message: string }> = [
      { args: ["set", "tokens.pages.red", "5k"], code: "invalid_config_key",
        message: 'unknown config key "tokens.pages.red"; keys under tokens: tokens.page.yellow, tokens.page.red, tokens.source.yellow, tokens.source.red, tokens.source.confirm_at' },
      { args: ["set", "tokens", "5"], code: "invalid_config_key", message: "tokens is a group of settings; keys under tokens:" },
      { args: ["get", "colour"], code: "invalid_config_key", message: 'unknown config key "colour"; known keys: profile, setup_completed_at, agents, content_dir' },
      { args: ["set", "ingest.permission", "sometimes"], code: "invalid_config_value", message: 'ingest.permission: "sometimes" — allowed: ai, ask, whitelist' },
      { args: ["set", "tokens.page.red", "abc"], code: "invalid_config_value",
        message: 'tokens.page.red: "abc" — must be a positive whole number, or a number with k (20000, 20k, 1.5k)' },
      { args: ["set", "tokens.page.yellow", "20k"], code: "invalid_config_value", message: "tokens.page.yellow: 20000 — must be below tokens.page.red (10000)" },
      { args: ["set", "tokens.page.red", "3k"], code: "invalid_config_value", message: "tokens.page.yellow: 4000 — must be below tokens.page.red (3000)" },
      { pre: [["set", "tokens.page.red", "30k"], ["set", "tokens.page.yellow", "15k"]], args: ["unset", "tokens.page.red"],
        code: "invalid_config_value", message: "tokens.page.yellow: 15000 — must be below tokens.page.red (10000)" },
      { args: ["set", "agents", "codex"], code: "config_key_not_settable",
        message: "agents is a list setting: edit .wiki/config.yml by hand, or run wikeeper init --agents" },
      { args: ["unset", "hooks.pre_ingest"], code: "config_key_not_settable", message: "hooks.pre_ingest is a list setting: edit .wiki/config.yml by hand" },
      { args: ["set", "content_dir", "wiki"], code: "config_key_not_settable", message: "move pages/, archive/, raw/, log/ and index.md to the new folder" },
    ];
    for (const r of rows) {
      const root = await initWiki();
      for (const p of r.pre ?? []) expect((await run(root, ["config", ...p])).code).toBe(0);
      const before = await readFile(cfgFile(root));
      const res = await run(root, ["config", ...r.args, "--json"]);
      const label = r.args.join(" ");
      expect(res.json?.ok, label).toBe(false);
      expect(res.json.command, label).toBe(`config ${r.args[0]}`);
      expect(res.code, label).toBe(2);
      expect(res.json.error.code, label).toBe(r.code);
      expect(res.json.error.message, label).toContain(r.message);
      expect((await readFile(cfgFile(root))).equals(before), label).toBe(true);
    }
  }, T);

  it("S5: set works on every config.yml shape loadConfig accepts", async () => {
    const BOM = "﻿";
    const rows: Array<{ before: string | null; key: string; raw: string; exit: number; after?: string; error?: string }> = [
      { before: "", key: "tokens.page.red", raw: "12k", exit: 0, after: "tokens:\n  page:\n    red: 12000\n" },
      { before: "# only a comment\n", key: "ingest.permission", raw: "ai", exit: 0, after: "# only a comment\n\ningest:\n  permission: ai\n" },
      { before: "profile: management\ntokens:\n", key: "tokens.page.red", raw: "12k", exit: 0, after: "profile: management\ntokens:\n  page:\n    red: 12000\n" },
      { before: `${BOM}# c\r\nprofile: management\r\n`, key: "lint.stale_after_days", raw: "14", exit: 0,
        after: `${BOM}# c\r\nprofile: management\r\nlint:\r\n  stale_after_days: 14\r\n` },
      { before: "tokens: 5\n", key: "tokens.page.red", raw: "12k", exit: 1, error: "config_invalid" },
      { before: null, key: "tokens.page.red", raw: "12k", exit: 1, error: "not_initialised" },
      { before: "tokens: [unclosed\n", key: "tokens.page.red", raw: "12k", exit: 1, error: "E_CONFIG_SYNTAX" },
    ];
    for (const r of rows) {
      const root = await gitRepo();
      if (r.before !== null) {
        await mkdir(path.join(root, ".wiki"), { recursive: true });
        await writeFile(cfgFile(root), r.before);
      }
      const label = `${JSON.stringify(r.before)} ${r.key}`;
      const res = await run(root, ["config", "set", r.key, r.raw, "--json"]);
      expect(res.json, label).not.toBeNull();
      expect(res.code, label).toBe(r.exit);
      if (r.exit === 0) {
        expect(res.json.ok, label).toBe(true);
        expect(await readCfg(root), label).toBe(r.after);
      } else {
        expect(res.json.ok, label).toBe(false);
        expect(res.json.error.code, label).toBe(r.error);
        if (r.before === null) {
          await expect(readFile(cfgFile(root))).rejects.toThrow();
        } else {
          expect(await readCfg(root), label).toBe(r.before);
        }
        if (r.error === "E_CONFIG_SYNTAX") {
          const m: string = res.json.error.message;
          expect(m.startsWith("config.yml syntax error at line 2: ")).toBe(true);
          expect(m.endsWith(`: ${STEP}`)).toBe(true);
          expect(/\n/.test(m)).toBe(false);
        }
      }
    }
  }, T);

  it("S6: doctor on a broken config.yml gives the step once", async () => {
    const root = await initWiki();
    await writeFile(cfgFile(root), "tokens: [unclosed\n");
    const before = await readFile(cfgFile(root));

    const human = await run(root, ["doctor"]);
    expect(human.code).toBe(1);
    const lines = human.text.split("\n");
    const i = lines.findIndex((l) => l.startsWith("[error] config-valid: config.yml syntax error at line 2: "));
    expect(i).toBeGreaterThan(-1);
    expect(lines[i]!.endsWith(STEP)).toBe(false);
    expect(lines[i + 1]).toBe(`  fix: ${STEP}`);
    expect(human.text.split(STEP).length).toBe(2);

    const j = await run(root, ["doctor", "--json"]);
    expect(j.json).not.toBeNull();
    const check = j.json.data.checks.find((c: { id: string }) => c.id === "config-valid");
    expect(check.severity).toBe("error");
    expect(check.file).toBe(".wiki/config.yml");
    expect(check.fix).toBe(STEP);
    expect(check.message.startsWith("config.yml syntax error at line 2: ")).toBe(true);
    expect(/\n/.test(check.message)).toBe(false);
    expect(check.message).not.toContain("fix the YAML syntax");
    expect((await readFile(cfgFile(root))).equals(before)).toBe(true);
  }, T);
});
