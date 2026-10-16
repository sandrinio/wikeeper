import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { readLogEvents } from "../../src/ingest/log.js";
import { runCli } from "../../src/program.js";

const T = 60_000;
const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[], stdin?: string) {
  const out: string[] = [];
  const err: string[] = [];
  const input = Object.assign(Readable.from(stdin === undefined ? [] : [Buffer.from(stdin)]), { isTTY: false });
  const code = await runCli(args, {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: input,
    },
  } as never);
  const text = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(text.trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code, json, text, err: err.join("") };
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
async function put(root: string, rel: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content);
}

async function repo(config: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-flow-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  await writeFile(path.join(root, ".wiki", "config.yml"), config);
  return root;
}

const written: string[] = [];

async function ingest(root: string, id: string, slug: string, viaStdin: boolean): Promise<void> {
  const facts = {
    source_id: id,
    kind: "meeting-notes",
    rule_version: null,
    facts: [
      {
        entity: `project:${slug}`,
        field: "status",
        value: "green",
        status: "decided",
        as_of: "2026-10-16",
        anchor: "Status",
        page: `projects/${slug}.md`,
        exists: false,
      },
    ],
    uncovered: ["budget"],
  };
  if (viaStdin) {
    expect((await run(root, ["ingest", "facts", id, "--json"], JSON.stringify(facts))).code).toBe(0);
  } else {
    await put(root, "facts.json", JSON.stringify(facts));
    expect((await run(root, ["ingest", "facts", id, "--file", "facts.json", "--json"])).code).toBe(0);
  }
  expect((await run(root, ["ingest", "apply", id, "--json"])).code).toBe(0);
  await put(
    root,
    `.wiki/pages/projects/${slug}.md`,
    `---\ntype: project\ntitle: ${slug}\nsummary: ${slug} project\n---\n# ${slug}\n\n## Facts\n\n- 2026-10-16 · decided · ${slug} is green [[${id}]]\n`,
  );
  await put(root, `.wiki/pages/sources/${id}.md`, `---\ntype: source\ntitle: ${slug}\nsources: [${id}]\n---\n# ${slug}\n`);
  const fin = await run(root, ["ingest", "finish", id, "--json"]);
  expect(fin.code).toBe(0);
  expect(fin.json.data.created).toEqual([`projects/${slug}.md`, `sources/${id}.md`]);
  expect(fin.json.data.updated).toEqual([]);
  expect(fin.json.data.deleted).toEqual([]);
  expect(fin.json.data.rule_suggestions).toBe(1);
  written.push(`projects/${slug}.md`, `sources/${id}.md`);
  const paths = resolvePaths(root, DEFAULT_CONFIG);
  const events = (await readLogEvents(paths, { type: "ingest", sourceId: id })).events;
  expect(events).toHaveLength(1);
  expect((events[0]!.event as any).created).toEqual([`projects/${slug}.md`, `sources/${id}.md`]);
  expect(await readFile(path.join(root, ".wiki", "index.md"), "utf8")).toContain(`(pages/projects/${slug}.md)`);
  expect(await exists(path.join(root, ".wiki", ".lock"))).toBe(false);
}

async function everyPageLoggedOnce(root: string): Promise<void> {
  const paths = resolvePaths(root, DEFAULT_CONFIG);
  const events = (await readLogEvents(paths, { type: "ingest" })).events.map((e) => e.event as any);
  for (const page of written) {
    const n = events.filter((e) => [...e.created, ...e.updated, ...e.deleted].includes(page)).length;
    expect(n, page).toBe(1);
  }
}

describe("STORY-003-09 end to end, in-process (red)", () => {
  it("ai / the file notes.md", async () => {
    written.length = 0;
    const root = await repo("ingest:\n  permission: ai\n");
    await put(root, "notes.md", "# Notes\natlas is green\n");
    const s = await run(root, ["ingest", "start", "notes.md", "--json"]);
    expect(s.code).toBe(0);
    expect(s.json.data.status).toBe("registered");
    await ingest(root, s.json.data.id, "atlas", false);
    await everyPageLoggedOnce(root);
  }, T);

  it("ask / a chat excerpt on stdin", async () => {
    written.length = 0;
    const root = await repo("ingest:\n  permission: ask\n");
    const first = await run(root, ["ingest", "start", "-", "--json"], "We decided atlas is green");
    expect(first.code).toBe(3);
    expect(first.json.error.code).toBe("needs_approval");
    const rawDir = path.join(root, ".wiki", "raw");
    expect((await readdir(rawDir)).filter((n) => n !== ".gitkeep")).toEqual([]);
    const s = await run(root, ["ingest", "start", "-", "--approved", "--json"], "We decided atlas is green");
    expect(s.code).toBe(0);
    await ingest(root, s.json.data.id, "chat", true);
    await everyPageLoggedOnce(root);
  }, T);

  it("whitelist / the directory docs/meetings with two files", async () => {
    written.length = 0;
    const root = await repo(
      "ingest:\n  permission: whitelist\n  whitelist:\n    origins:\n      - docs/meetings/**\n    kinds: []\n",
    );
    await put(root, "docs/meetings/kickoff.md", "kickoff notes\n");
    await put(root, "docs/meetings/review.md", "review notes\n");
    const plan = await run(root, ["ingest", "plan", "docs/meetings", "--json"]);
    expect(plan.code).toBe(0);
    const entries = plan.json.data.entries as any[];
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e.status).toBe("new");
      expect(e.needs_approval).toBe(false);
    }
    for (const e of entries) {
      const s = await run(root, ["ingest", "start", e.path, "--json"]);
      expect(s.code).toBe(0);
      await ingest(root, s.json.data.id, path.basename(e.path, ".md"), false);
    }
    await everyPageLoggedOnce(root);
  }, T);

  it("whitelist / a URL with agent-supplied text", async () => {
    written.length = 0;
    const root = await repo(
      "ingest:\n  permission: whitelist\n  whitelist:\n    origins:\n      - '*.example.com'\n    kinds: []\n",
    );
    await put(root, "q4.md", "Q4 status text\n");
    const url = "https://intranet.example.com/q4";
    const s = await run(root, ["ingest", "start", url, "--text-file", "q4.md", "--json"]);
    expect(s.code).toBe(0);
    expect(s.json.data.source.origin).toBe(url);
    await ingest(root, s.json.data.id, "q4", false);
    await everyPageLoggedOnce(root);
  }, T);
});
