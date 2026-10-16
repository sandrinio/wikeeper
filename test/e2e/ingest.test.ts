import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { packCli } from "./pack.js";

// Goal Acceptance Check item 1 (SPRINT-02): start -> facts -> apply -> finish for a file, a directory, a chat excerpt
// and a URL with agent-supplied text, under ai, ask and whitelist, against the packed package.
let cli = "";
let cleanup: () => Promise<void> = async () => {};
const roots: string[] = [];

beforeAll(async () => {
  const packed = await packCli();
  cli = packed.cli;
  cleanup = packed.cleanup;
}, 180_000);

afterAll(async () => {
  await cleanup();
  for (const r of roots) await rm(r, { recursive: true, force: true, maxRetries: 3 });
}, 120_000);

function wk(cwd: string, args: string[], input?: string) {
  const r = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", input });
  let json: any = null;
  try {
    json = JSON.parse((r.stdout ?? "").trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "", json };
}
async function put(root: string, rel: string, content: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), content);
}
async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
async function repo(config: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-e2e-ingest-"));
  roots.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect(wk(root, ["init", "--yes", "--agents", "claude", "--json"]).code).toBe(0);
  await writeFile(path.join(root, ".wiki", "config.yml"), config);
  return root;
}

const written: string[] = [];

function agentRun(root: string, id: string, slug: string): void {
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
  expect(wk(root, ["ingest", "facts", id, "--json"], JSON.stringify(facts)).code).toBe(0);
  expect(wk(root, ["ingest", "apply", id, "--json"]).code).toBe(0);
}

async function finishIngest(root: string, id: string, slug: string): Promise<void> {
  agentRun(root, id, slug);
  await put(
    root,
    `.wiki/pages/projects/${slug}.md`,
    `---\ntype: project\ntitle: ${slug}\nsummary: ${slug} project\n---\n# ${slug}\n\n## Facts\n\n- 2026-10-16 · decided · ${slug} is green [[${id}]]\n`,
  );
  await put(root, `.wiki/pages/sources/${id}.md`, `---\ntype: source\ntitle: ${slug}\nsources: [${id}]\n---\n# ${slug}\n`);
  const fin = wk(root, ["ingest", "finish", id, "--json"]);
  expect(fin.code, fin.out + fin.err).toBe(0);
  expect(fin.json.data.created).toEqual([`projects/${slug}.md`, `sources/${id}.md`]);
  expect(fin.json.data.updated).toEqual([]);
  expect(fin.json.data.deleted).toEqual([]);
  expect(fin.json.data.rule_suggestions).toBe(1);
  written.push(`projects/${slug}.md`, `sources/${id}.md`);
  const mine = (await ingestEvents(root)).filter((e) => e.source_id === id);
  expect(mine).toHaveLength(1);
  expect(mine[0]!.created).toEqual([`projects/${slug}.md`, `sources/${id}.md`]);
  expect(await readFile(path.join(root, ".wiki", "index.md"), "utf8")).toContain(`(pages/projects/${slug}.md)`);
  expect(await exists(path.join(root, ".wiki", ".lock"))).toBe(false);
}

async function ingestEvents(root: string): Promise<any[]> {
  const dir = path.join(root, ".wiki", "log");
  const events: any[] = [];
  for (const f of await readdir(dir)) {
    if (f.startsWith(".") || !f.endsWith(".md")) continue;
    const text = (await readFile(path.join(dir, f), "utf8")).replace(/\r\n/g, "\n");
    const end = text.indexOf("\n---", 4);
    const ev = YAML.parse(text.slice(4, end + 1));
    if (ev?.type === "ingest") events.push(ev);
  }
  return events;
}

async function everyPageLoggedOnce(root: string): Promise<void> {
  const events = await ingestEvents(root);
  for (const page of written) {
    const n = events.filter((e) => [...e.created, ...e.updated, ...e.deleted].includes(page)).length;
    expect(n, page).toBe(1);
  }
}

describe("STORY-003-09 end to end from the packed package", () => {
  it("ai / the file notes.md", async () => {
    written.length = 0;
    const root = await repo("ingest:\n  permission: ai\n");
    await put(root, "notes.md", "# Notes\natlas is green\n");
    const s = wk(root, ["ingest", "start", "notes.md", "--json"]);
    expect(s.code).toBe(0);
    await finishIngest(root, s.json.data.id, "atlas");
    await everyPageLoggedOnce(root);
  }, 120_000);

  it("ask / a chat excerpt on stdin", async () => {
    written.length = 0;
    const root = await repo("ingest:\n  permission: ask\n");
    const first = wk(root, ["ingest", "start", "-", "--json"], "We decided atlas is green");
    expect(first.code).toBe(3);
    expect(first.json.error.code).toBe("needs_approval");
    const s = wk(root, ["ingest", "start", "-", "--approved", "--json"], "We decided atlas is green");
    expect(s.code).toBe(0);
    await finishIngest(root, s.json.data.id, "chat");
    await everyPageLoggedOnce(root);
  }, 120_000);

  it("whitelist / the directory docs/meetings with two files", async () => {
    written.length = 0;
    const root = await repo(
      "ingest:\n  permission: whitelist\n  whitelist:\n    origins:\n      - docs/meetings/**\n    kinds: []\n",
    );
    await put(root, "docs/meetings/kickoff.md", "kickoff notes\n");
    await put(root, "docs/meetings/review.md", "review notes\n");
    const plan = wk(root, ["ingest", "plan", "docs/meetings", "--json"]);
    expect(plan.code).toBe(0);
    const entries = plan.json.data.entries as any[];
    expect(entries).toHaveLength(2);
    for (const e of entries) {
      expect(e.status).toBe("new");
      const s = wk(root, ["ingest", "start", e.path, "--json"]);
      expect(s.code).toBe(0);
      await finishIngest(root, s.json.data.id, path.basename(e.path, ".md"));
    }
    await everyPageLoggedOnce(root);
  }, 120_000);

  it("whitelist / a URL with agent-supplied text", async () => {
    written.length = 0;
    const root = await repo(
      "ingest:\n  permission: whitelist\n  whitelist:\n    origins:\n      - '*.example.com'\n    kinds: []\n",
    );
    await put(root, "q4.md", "Q4 status text\n");
    const s = wk(root, ["ingest", "start", "https://intranet.example.com/q4", "--text-file", "q4.md", "--json"]);
    expect(s.code).toBe(0);
    await finishIngest(root, s.json.data.id, "q4");
    await everyPageLoggedOnce(root);
  }, 120_000);
});
