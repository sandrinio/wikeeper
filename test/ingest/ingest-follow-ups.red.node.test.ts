import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, setConfigValue } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { readLogEvents } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import { runCli } from "../../src/program.js";

// Red tests for STORY-003-12: dropped fact lines refused, needs_approval output, help text.
const NOW = new Date("2026-10-17T10:00:00Z");
const T = 30_000;
const ID = "src-2026-10-17-roadmap";
const OLD = "src-2026-10-16-roadmap";
const L1 = `- 2026-10-12 · decided · Atlas is the product name. [[${OLD}]]`;
const L2 = `- 2026-10-13 · decided · Template Studio ships in Q1. [[${OLD}]]`;
const L3 = `- 2026-10-14 · tentative · Hiring starts in Q2. [[${OLD}]]`;
const TL = `- 2026-10-13 · tentative · Launch targets 2026-11-17. [[${OLD}]]`;

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
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

interface Repo {
  root: string;
  paths: ResolvedPaths;
}
async function repo(permission = "ai", kb?: string): Promise<Repo> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-followups-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  await setConfigValue(root, "ingest.permission", permission);
  if (kb !== undefined) await writeFile(path.join(root, ".wiki", "kb_instructions.md"), kb);
  return { root, paths: resolvePaths(root, DEFAULT_CONFIG) };
}
async function putPage(r: Repo, rel: string, body: string): Promise<void> {
  const file = path.join(r.paths.pagesDir, ...rel.split("/"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}
async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
async function register(r: Repo): Promise<string> {
  await mkdir(path.join(r.root, "docs"), { recursive: true });
  await writeFile(path.join(r.root, "docs", "roadmap.md"), "roadmap content\n");
  const meta = await registerSource(r.paths, {
    originType: "file",
    origin: "docs/roadmap.md",
    label: "roadmap",
    originalPath: path.join(r.root, "docs", "roadmap.md"),
    text: null,
    kind: "status-report",
    providedBy: "user",
    ruleVersion: null,
    reingestOf: null,
    permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
    now: NOW,
  } as never);
  await writeFacts(r.paths, {
    source_id: meta.id,
    kind: "status-report",
    rule_version: 2,
    facts: [
      {
        entity: "project:atlas",
        field: "status",
        value: "green",
        status: "decided",
        as_of: "2026-10-17",
        anchor: "Status",
        page: "projects/atlas.md",
        exists: true,
      },
    ],
    uncovered: [],
  } as never);
  return meta.id;
}
/** Seed roadmap.md with `lines` under "## Facts", then register and apply. */
async function applied(r: Repo, lines: string[]): Promise<string> {
  await putPage(r, "roadmap.md", `# Roadmap\n\n## Facts\n\n${lines.join("\n")}\n`);
  const id = await register(r);
  expect(id).toBe(ID);
  expect((await run(r.root, ["ingest", "apply", id, "--json"])).code).toBe(0);
  return id;
}
const lockFile = (r: Repo) => path.join(r.root, ".wiki", ".lock");

describe("STORY-003-12 S1 finish refuses a dropped fact line", () => {
  it("S1: refused with the line named, lock kept; accepted once restored", async () => {
    const r = await repo();
    await applied(r, [L1, L2, L3]);
    const added = `- 2026-10-17 · decided · Roadmap reviewed. [[${ID}]]`;
    await putPage(r, "roadmap.md", `# Roadmap\n\n## Facts\n\n${L1}\n${L3}\n${added}\n`);
    const res = await run(r.root, ["ingest", "finish", ID, "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("validation_failed");
    expect(res.json.error.details.dropped).toEqual([{ path: "roadmap.md", line: L2 }]);
    expect(res.json.error.message).toContain("fact lines dropped");
    expect(res.json.error.message).toContain("roadmap.md");
    expect(JSON.parse(await readFile(lockFile(r), "utf8")).source_id).toBe(ID);
    expect(await exists(path.join(r.root, ".wiki", ".snapshots", ID))).toBe(true);
    expect((await readLogEvents(r.paths, { type: "ingest", sourceId: ID })).events).toHaveLength(0);

    await putPage(r, "roadmap.md", `# Roadmap\n\n## Facts\n\n${L1}\n${L2}\n${L3}\n${added}\n`);
    const ok = await run(r.root, ["ingest", "finish", ID, "--json"]);
    expect(ok.code).toBe(0);
    expect(ok.json.data.updated).toEqual(["roadmap.md"]);
  }, T);
});

describe("STORY-003-12 S2 which edits count as dropped", () => {
  const cite = `\n[[${ID}]]\n`;
  async function edit(page: string, extra?: Record<string, string>) {
    const r = await repo();
    await applied(r, [TL]);
    await putPage(r, "roadmap.md", page);
    for (const [rel, body] of Object.entries(extra ?? {})) await putPage(r, rel, body);
    return { r, res: await run(r.root, ["ingest", "finish", ID, "--json"]) };
  }
  function refused(res: Awaited<ReturnType<typeof run>>) {
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("validation_failed");
    expect(res.json.error.details.dropped).toEqual([{ path: "roadmap.md", line: TL }]);
  }

  it("moved under a new heading: accepted", async () => {
    const { res } = await edit(`# Roadmap\n\n## Facts\n\n## History\n\n${TL}\n${cite}`);
    expect(res.code).toBe(0);
  }, T);

  it("marker, indentation and spacing changed: accepted", async () => {
    const { res } = await edit(
      `# Roadmap\n\n## Facts\n\n  * 2026-10-13 · tentative · Launch  targets   2026-11-17. [[${OLD}]]\n${cite}`,
    );
    expect(res.code).toBe(0);
  }, T);

  it("deleted page: accepted and reported", async () => {
    const r = await repo();
    await applied(r, [TL]);
    await rm(path.join(r.paths.pagesDir, "roadmap.md"));
    await putPage(r, "other.md", `# Other\n${cite}`);
    const res = await run(r.root, ["ingest", "finish", ID, "--json"]);
    expect(res.code).toBe(0);
    expect(res.json.data.deleted).toEqual(["roadmap.md"]);
  }, T);

  it("status changed: dropped", async () => {
    const { res } = await edit(`# Roadmap\n\n## Facts\n\n${TL.replace("tentative", "decided")}\n${cite}`);
    refused(res);
  }, T);

  it("text corrected in place: dropped", async () => {
    const { res } = await edit(`# Roadmap\n\n## Facts\n\n${TL.replace("2026-11-17", "2026-11-18")}\n${cite}`);
    refused(res);
  }, T);

  it("contradicts part appended: dropped", async () => {
    const { res } = await edit(`# Roadmap\n\n## Facts\n\n${TL} · contradicts:: [[${ID}]]\n${cite}`);
    refused(res);
  }, T);

  it("moved to another page: dropped from the page it left", async () => {
    const { res } = await edit(`# Roadmap${cite}`, { "history.md": `# History\n\n## Facts\n\n${TL}\n${cite}` });
    refused(res);
  }, T);

  it("removed line plus invalid frontmatter: dropped and invalid both reported", async () => {
    const { res } = await edit(`---\nsummary: a: b\n---\n# Roadmap${cite}`);
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("validation_failed");
    expect(res.json.error.details.dropped).toEqual([{ path: "roadmap.md", line: TL }]);
    expect(res.json.error.details.invalid.map((f: { path: string }) => f.path)).toContain("roadmap.md");
  }, T);

  it("removed line plus removed citation: dropped and uncited both reported", async () => {
    const { res } = await edit(`# Roadmap\n`);
    expect(res.code).toBe(1);
    expect(res.json.error.code).toBe("validation_failed");
    expect(res.json.error.details.dropped).toEqual([{ path: "roadmap.md", line: TL }]);
    expect(res.json.error.details.uncited).toEqual(["roadmap.md"]);
  }, T);
});

describe("STORY-003-12 S3 approval request is a question", () => {
  const KB = "# KB\n\n## Source kinds\n\n- roadmap (v2) → initiative.status, decision\n";
  const rows: Array<[string, string[], string, string | null]> = [
    ["ruled kind", ["--kind", "roadmap"], "kind roadmap, rule roadmap v2", "roadmap"],
    ["unruled kind", ["--kind", "memo"], "kind memo, no rule for memo", "memo"],
    ["no kind", [], "no kind yet", null],
  ];
  for (const [name, kindArgs, named, jsonKind] of rows) {
    it(`${name}: one stderr line without the error label; JSON envelope unchanged`, async () => {
      const r = await repo("ask", KB);
      await writeFile(path.join(r.root, "notes.md"), "hello\n");
      const human = await run(r.root, ["ingest", "start", "notes.md", ...kindArgs]);
      expect(human.code).toBe(3);
      expect((await readdir(path.join(r.root, ".wiki", "raw"))).filter((f) => f !== ".gitkeep")).toEqual([]);
      expect(human.err).toBe(
        `notes.md needs approval (6 B, ${named}): ingest.permission is ask: show the user the source "notes.md" and rerun with --approved once they agree.\n`,
      );
      const j = await run(r.root, ["ingest", "start", "notes.md", ...kindArgs, "--json"]);
      expect(j.code).toBe(3);
      expect(j.json.ok).toBe(false);
      expect(j.json.error.code).toBe("needs_approval");
      expect(j.json.command).toBe("ingest start");
      expect(j.json.error.details.source.kind).toBe(jsonKind);
      expect(j.json.error.details.source.size).toBe(6);
    }, T);
  }
});

describe("STORY-003-12 S4 help text", () => {
  it("facts and abort help, and the ingest listing", async () => {
    const r = await repo();
    const facts = await run(r.root, ["ingest", "facts", "--help"]);
    const ft = (facts.text + facts.err).replace(/\s+/g, " ");
    expect(ft).toContain("Running it again before apply replaces the stored facts");
    expect(ft).toContain("facts_changed");
    const abort = await run(r.root, ["ingest", "abort", "--help"]);
    const at = (abort.text + abort.err).replace(/\s+/g, " ");
    expect(at).toContain("before or after apply");
    expect(at).toContain("also delete the registered source's files from raw/");
    expect(at).toContain("A finished ingest cannot be aborted");
    const list = await run(r.root, ["ingest", "--help"]);
    const lt = (list.text + list.err).replace(/\s+/g, " ");
    expect(lt).toContain("store the facts extracted from a source (JSON on stdin or --file); run it again before apply to replace them");
    expect(lt).toContain("stop an ingest that is not finished, before or after apply");
  }, T);

  it("abort --drop on a registered source frees it to be registered again", async () => {
    const r = await repo();
    await writeFile(path.join(r.root, "doc.md"), "some doc\n");
    const first = await run(r.root, ["ingest", "start", "doc.md", "--kind", "memo", "--json"]);
    expect(first.code).toBe(0);
    const id = first.json.data.id as string;
    const drop = await run(r.root, ["ingest", "abort", id, "--drop", "--json"]);
    expect(drop.code).toBe(0);
    const left = (await readdir(path.join(r.root, ".wiki", "raw"))).filter((f) => f.startsWith(id));
    expect(left).toEqual([]);
    expect((await readLogEvents(r.paths, { type: "abort", sourceId: id })).events).toHaveLength(1);
    const again = await run(r.root, ["ingest", "start", "doc.md", "--kind", "memo", "--json"]);
    expect(again.code).toBe(0);
    expect(again.json.data.status).toBe("registered");
  }, T);
});
