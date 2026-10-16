import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPages } from "../src/wiki/parse-page.js";

async function load<T = Record<string, any>>(spec: string): Promise<T> {
  try {
    return (await import(/* @vite-ignore */ spec)) as T;
  } catch (e) {
    throw new Error(`not yet implemented: ${spec} (${(e as Error).message})`);
  }
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-idx-"));
  await mkdir(path.join(root, ".git"), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(rel: string, text: string) {
  const abs = path.join(root, ...rel.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, text);
}
const read = (rel: string) => readFile(path.join(root, ...rel.split("/")), "utf8").catch(() => null);

async function runIndex(args: string[]) {
  const { runCli } = await load<any>("../src/program.js");
  const { indexCommand } = await load<any>("../src/commands/index.js");
  const out: string[] = [];
  const err: string[] = [];
  const code: number = await runCli(["index", ...args], {
    commands: [indexCommand],
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Readable.from([]),
    },
  });
  const parse = (s: string) => {
    try {
      return JSON.parse(s.trim().split("\n").pop() ?? "");
    } catch {
      return undefined;
    }
  };
  const o = out.join("");
  const e = err.join("");
  return { code, json: parse(o) ?? parse(e), text: o, err: e };
}

const event = (at: string, id: string) =>
  `---\ntype: ingest\nat: "${at}"\nsource_id: ${id}\nkind: doc\nrule_version: null\npermission: ai\norigin: file:x\ncreated: []\nupdated: []\ndeleted: []\ncontradictions: 0\nrule_suggestions: 0\n---\nIngested ${id}.\n`;

describe("STORY-003-07 index rebuild (red)", () => {
  it("S4: recovers after a merge", async () => {
    await put(".wiki/config.yml", "ingest:\n  permission: ai\n");
    await put(".wiki/index.md", "<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> other\n");
    await put(".wiki/log/20261015T090000000Z-src-2026-10-15-a.md", event("2026-10-15T09:00:00.000Z", "src-2026-10-15-a"));
    await put(".wiki/log/20261016T080000000Z-src-2026-10-16-b.md", event("2026-10-16T08:00:00.000Z", "src-2026-10-16-b"));
    await put(".wiki/pages/broken.md", "---\ntitle: [unclosed\n");
    await put(".wiki/pages/team.md", "---\ntype: team\ntitle: Team\n---\n");
    const r = await runIndex(["rebuild", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json.ok).toBe(true);
    const { buildIndex } = await load<any>("../src/ingest/index-builder.js");
    const expected = buildIndex(await loadPages(path.join(root, ".wiki", "pages")));
    expect(await read(".wiki/index.md")).toBe(expected);
    expect(expected).toContain("## untyped");
    expect(expected).toContain("pages/broken.md");
    expect(r.json.data.index.pages).toBe(2);
    expect(r.json.data.index.changed).toBe(true);
    expect(r.json.data.index.file).toBe(".wiki/index.md");
    expect(r.json.data.log.events).toBe(2);
    expect(r.json.data.log.file).toBe(".wiki/log.md");
    expect(r.json.data.skipped).toEqual([]);
    expect(r.json.warnings.some((w: string) => w.includes("pages/broken.md"))).toBe(true);
    const log = (await read(".wiki/log.md")) as string;
    expect(log.indexOf("src-2026-10-16-b")).toBeGreaterThan(-1);
    expect(log.indexOf("src-2026-10-16-b")).toBeLessThan(log.indexOf("src-2026-10-15-a"));
  });

  it("S5 row 1: not_initialised without .wiki/config.yml", async () => {
    await put(".wiki/index.md", "keep\n");
    const r = await runIndex(["rebuild", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.ok).toBe(false);
    expect(r.json.error.code).toBe("not_initialised");
    expect(await read(".wiki/index.md")).toBe("keep\n");
    expect(await read(".wiki/log.md")).toBeNull();
  });

  it("S5 row 2: ingest_in_progress while .wiki/.lock exists", async () => {
    await put(".wiki/config.yml", "ingest:\n  permission: ai\n");
    await put(".wiki/.lock", "{}\n");
    await put(".wiki/index.md", "keep\n");
    await put(".wiki/pages/a.md", "---\ntype: team\n---\n");
    const r = await runIndex(["rebuild", "--json"]);
    expect(r.code).toBe(1);
    expect(r.json.error.code).toBe("ingest_in_progress");
    expect(await read(".wiki/index.md")).toBe("keep\n");
    expect(await read(".wiki/log.md")).toBeNull();
    await expect(stat(path.join(root, ".wiki", "log.md"))).rejects.toBeTruthy();
  });

  it("indexCommand is registered in the default program", async () => {
    const { defaultCommands } = await load<any>("../src/program.js");
    const { indexCommand } = await load<any>("../src/commands/index.js");
    expect(defaultCommands).toContain(indexCommand);
  });
});
