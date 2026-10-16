import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerIntegration, resetIntegrations } from "../src/core/integrations.js";
import { GITIGNORE_BLOCK_END, GITIGNORE_BLOCK_START } from "../src/core/gitignore.js";

// Red tests import not-yet-existing modules dynamically (flashcard: load() helper).
async function load<T = Record<string, any>>(spec: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ spec)) as T;
  } catch (e) {
    throw new Error(`not yet implemented: ${spec} (${(e as Error).message})`);
  }
}

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const BLOCK = `${GITIGNORE_BLOCK_START}\n.wiki/me.md\n${GITIGNORE_BLOCK_END}\n`;

let root: string;
beforeEach(async () => {
  resetIntegrations();
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-rm-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(rel: string, text: string) {
  const abs = path.join(root, ...rel.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, text);
}

interface FixtureOpts {
  contentDir?: string; // value of content_dir; omitted => default
  gitignore?: string;
  gitignoreCreated?: boolean;
  noManifest?: boolean;
}

async function fixture(o: FixtureOpts = {}) {
  await mkdir(path.join(root, ".git"), { recursive: true });
  const cd = o.contentDir;
  await put(".wiki/config.yml", (cd ? `content_dir: ${cd}\n` : "") + "ingest:\n  permission: ai\n");
  await put(".wiki/kb_instructions.md", "kb\n");
  await put(".wiki/me.md", "me\n");
  await put(".wiki/system/SETUP.md", "v1\n");
  await put(".wiki/system/WIKI.md", "v1 edited locally\n");
  await put(".wiki/system/profiles/management.md", "mgmt\n");
  await put("AGENTS.md", "agents user text\n");
  const base = cd && cd !== "." ? cd : ".wiki";
  const content = cd === "." ? "" : base + "/";
  await put(`${content}index.md`, "index\n");
  await put(`${content}pages/a.md`, "page\n");
  await put(`${content}raw/x.txt`, "raw\n");
  await put(`${content}log/1.md`, "log\n");
  const files: Record<string, unknown>[] = [
    { path: ".wiki/system/SETUP.md", sha256: sha("v1\n"), kind: "system" },
    { path: ".wiki/system/WIKI.md", sha256: sha("v1\n"), kind: "system" },
    { path: ".wiki/system/profiles/management.md", sha256: sha("mgmt\n"), kind: "system" },
    { path: "AGENTS.md", sha256: null, kind: "block" },
  ];
  if (o.gitignore !== undefined) {
    await put(".gitignore", o.gitignore);
    files.push({ path: ".gitignore", sha256: null, kind: "gitignore", created: o.gitignoreCreated ?? false });
  }
  if (!o.noManifest) {
    await put(".wiki/system/manifest.json", JSON.stringify({ package_version: "0.0.1", files }, null, 2) + "\n");
  } else {
    await rm(path.join(root, ".wiki", "system", "manifest.json"), { force: true });
  }
}

async function listing(dir = root): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  async function walk(d: string) {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (e.isDirectory()) {
        out[rel + "/"] = "";
        await walk(abs);
      } else out[rel] = sha(await readFile(abs, "utf8"));
    }
  }
  await walk(dir);
  return out;
}

const exists = (rel: string) =>
  stat(path.join(root, ...rel.split("/"))).then(
    () => true,
    () => false,
  );

async function runRemove(args: string[], stdin?: Readable) {
  const { runCli } = await load<any>("../src/program.js");
  const { removeCommand } = await load<any>("../src/commands/remove.js");
  const out: string[] = [];
  const err: string[] = [];
  const code: number = await runCli(["remove", ...args], {
    commands: [removeCommand],
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: stdin ?? Readable.from([]),
    },
  });
  const text = out.join("");
  let json: any;
  try {
    json = JSON.parse(text.trim().split("\n").pop() ?? "");
  } catch {
    json = undefined;
  }
  return { code, json, text, err: err.join("") };
}

describe("STORY-001-06 remove (red)", () => {
  it("S1: remove keeps knowledge, runs handler once, purged false", async () => {
    await fixture();
    const handler = vi.fn();
    registerIntegration({ name: "test", remove: handler });
    const before = await listing();
    const r = await runRemove(["--json"]);
    expect(r.code).toBe(0);
    expect(r.json.ok).toBe(true);
    expect(r.json.data.purged).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(await exists(".wiki/system")).toBe(false);
    for (const rel of [
      ".wiki/config.yml", ".wiki/kb_instructions.md", ".wiki/me.md", ".wiki/index.md",
      ".wiki/pages/a.md", ".wiki/raw/x.txt", ".wiki/log/1.md",
    ]) {
      expect(await readFile(path.join(root, ...rel.split("/")), "utf8")).toBeTypeOf("string");
      expect((await listing())[rel]).toBe(before[rel]);
    }
    // edited manifest-listed file is deleted too
    expect(r.json.data.removed).toEqual(expect.arrayContaining([".wiki/system/WIKI.md", ".wiki/system/SETUP.md"]));
    expect(r.json.data.removed).toEqual([...r.json.data.removed].sort());
    expect(r.json.data.kept).toEqual(expect.arrayContaining([".wiki/config.yml", ".wiki/pages", ".wiki/raw"]));
  });

  it("S1b: a block-kind manifest entry (AGENTS.md) is never unlinked by core", async () => {
    await fixture();
    await runRemove(["--json"]);
    expect(await readFile(path.join(root, "AGENTS.md"), "utf8")).toBe("agents user text\n");
  });

  it("S2: managed .gitignore block is stripped, user lines kept", async () => {
    await fixture({ gitignore: "node_modules/\n" + BLOCK + "dist/\n" });
    const r = await runRemove(["--json"]);
    expect(r.code).toBe(0);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe("node_modules/\ndist/\n");
  });

  it("S2b: a created-and-emptied .gitignore is deleted", async () => {
    await fixture({ gitignore: BLOCK, gitignoreCreated: true });
    const r = await runRemove(["--json"]);
    expect(r.code).toBe(0);
    expect(await exists(".gitignore")).toBe(false);
    expect(r.json.data.removed).toContain(".gitignore");
  });

  it("S2c: a not-created .gitignore that becomes empty is kept", async () => {
    await fixture({ gitignore: BLOCK, gitignoreCreated: false });
    await runRemove(["--json"]);
    expect(await readFile(path.join(root, ".gitignore"), "utf8")).toBe("");
  });

  it("S3: confirmed purge deletes .wiki/ and wiki/, keeps sibling notes.txt", async () => {
    await fixture({ contentDir: "wiki" });
    await put("notes.txt", "mine\n");
    const r = await runRemove(["--purge", "--confirm", "wikeeper", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.purged).toBe(true);
    expect(await exists(".wiki")).toBe(false);
    expect(await exists("wiki")).toBe(false);
    expect(await exists("notes.txt")).toBe(true);
    expect(await exists("AGENTS.md")).toBe(true);
  });

  it("S3b: purge never rm -rf's a content_dir holding user files", async () => {
    await fixture({ contentDir: "wiki" });
    await put("wiki/mine.txt", "user\n");
    await runRemove(["--purge", "--confirm", "wikeeper", "--json"]);
    expect(await exists(".wiki")).toBe(false);
    expect(await exists("wiki/mine.txt")).toBe(true);
    expect(await exists("wiki/pages")).toBe(false);
  });

  it("S3c: purge with content_dir '.' keeps the repo root and notes.txt", async () => {
    await fixture({ contentDir: "." });
    await put("notes.txt", "mine\n");
    await runRemove(["--purge", "--confirm", "wikeeper", "--json"]);
    expect(await exists(".")).toBe(true);
    expect(await exists("notes.txt")).toBe(true);
    expect(await exists("AGENTS.md")).toBe(true);
    expect(await exists(".wiki")).toBe(false);
  });

  it.each([
    [[], 5],
    [["--confirm", "yes"], 1],
  ] as [string[], number][])("S4: non-interactive purge flags %j -> exit %i, nothing deleted", async (flags, exit) => {
    await fixture({ gitignore: BLOCK });
    const handler = vi.fn();
    registerIntegration({ name: "test", remove: handler });
    const before = await listing();
    const r = await runRemove(["--purge", ...flags, "--json"]);
    expect(r.code).toBe(exit);
    expect(r.json.ok).toBe(false);
    expect(await listing()).toEqual(before);
    expect(handler).not.toHaveBeenCalled();
  });

  it("S4b: --confirm without --purge is ignored", async () => {
    await fixture();
    const r = await runRemove(["--confirm", "nope", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.data.purged).toBe(false);
  });

  it("S4c: interactive purge accepts the typed word", async () => {
    await fixture();
    const stdin = Object.assign(Readable.from(["wikeeper\n"]), { isTTY: true });
    const r = await runRemove(["--purge"], stdin);
    expect(r.code).toBe(0);
    expect(await exists(".wiki")).toBe(false);
  });

  it("S4d: interactive purge with a wrong word exits 1 and deletes nothing", async () => {
    await fixture();
    const before = await listing();
    const stdin = Object.assign(Readable.from(["nope\n"]), { isTTY: true });
    const r = await runRemove(["--purge"], stdin);
    expect(r.code).toBe(1);
    expect(await listing()).toEqual(before);
  });

  it("S5: remove before init exits 1 with 'not initialised'", async () => {
    await fixture({ noManifest: true });
    const r = await runRemove(["--json"]);
    expect(r.code).toBe(1);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.message).toContain("not initialised");
  });
});

describe("STORY-001-06 stripManagedBlock (red)", () => {
  const strip = async (t: string) => (await load<any>("../src/core/gitignore.js")).stripManagedBlock(t);
  const need = async () => {
    const m = await load<any>("../src/core/gitignore.js");
    if (typeof m.stripManagedBlock !== "function") throw new Error("not yet implemented: stripManagedBlock");
  };

  it("U1: strips a block between surrounding text", async () => {
    await need();
    expect(await strip("a\n" + BLOCK + "b\n")).toEqual({ text: "a\nb\n", status: "stripped" });
  });

  it("U2: block only -> empty string", async () => {
    await need();
    expect(await strip(BLOCK)).toEqual({ text: "", status: "stripped" });
  });

  it("U3: absent -> unchanged", async () => {
    await need();
    expect(await strip("a\nb\n")).toEqual({ text: "a\nb\n", status: "absent" });
  });

  it("U4: start without end -> malformed, unchanged", async () => {
    await need();
    const t = `a\n${GITIGNORE_BLOCK_START}\nx\n`;
    expect(await strip(t)).toEqual({ text: t, status: "malformed" });
  });

  it("U5: CRLF block is stripped with its terminators", async () => {
    await need();
    const t = `a\r\n${GITIGNORE_BLOCK_START}\r\nx\r\n${GITIGNORE_BLOCK_END}\r\nb\r\n`;
    expect(await strip(t)).toEqual({ text: "a\r\nb\r\n", status: "stripped" });
  });

  it("U6: leading BOM is preserved", async () => {
    await need();
    const t = `﻿${GITIGNORE_BLOCK_START}\nx\n${GITIGNORE_BLOCK_END}\nb\n`;
    expect(await strip(t)).toEqual({ text: "﻿b\n", status: "stripped" });
  });

  it("U7: repeated blocks are all removed", async () => {
    await need();
    expect((await strip(BLOCK + "m\n" + BLOCK)).text).toBe("m\n");
  });

  it("U8: round-trips applyManagedBlock (green only after STORY-001-04 merges)", async () => {
    await need();
    const m = await load<any>("../src/core/gitignore.js");
    for (const t of ["", "node_modules/\n", "a\r\nb\r\n"]) {
      expect(m.stripManagedBlock(m.applyManagedBlock(t, [".wiki/me.md"])).text).toBe(t);
    }
  });
});
