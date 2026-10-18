import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeFacts } from "../../src/ingest/facts.js";
import { readLogEvents, writeLogEvent } from "../../src/ingest/log.js";
import { registerSource } from "../../src/ingest/registry.js";
import { runCli } from "../../src/program.js";

// STORY-008-02 QA-Red: the conservation rule at `ingest finish` (three rules over pages/ and archive/).
const NOW = new Date("2026-10-18T10:00:00Z");
const T = 60_000;
const ID = "src-2026-10-18-cleanup";

const A0 = "- 2026-08-01 · tentative · Atlas ships 2026-09-30. [[src-2026-08-01-plan]]";
const A00 = "- 2026-08-20 · decided · Atlas beta opens 2026-09-01. [[src-2026-08-20-plan]]";
const A1 = "- 2026-09-01 · tentative · Atlas ships 2026-10-15. [[src-2026-09-01-plan]]";
const A2 = "- 2026-10-10 · decided · Atlas ships 2026-11-03. [[src-2026-10-10-review]]";
const B1 = "- 2026-09-15 · decided · The design lead runs the design reviews. [[src-2026-09-15-org]]";
const B2 = "- 2026-09-20 · decided · The design lead works remotely. [[src-2026-09-20-org]]";
const C1 = "- 2026-09-05 · decided · Beta shipped. [[src-2026-09-05-release]]";
const CITE = `\n[[${ID}]]\n`;

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
type Res = Awaited<ReturnType<typeof run>>;

interface Repo {
  root: string;
  paths: ResolvedPaths;
}
async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}
async function put(file: string, body: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}
const pagesFile = (r: Repo, rel: string) => path.join(r.paths.pagesDir, ...rel.split("/"));
const archiveRoot = (r: Repo) => path.join(r.root, ".wiki", "archive");
const archiveFile = (r: Repo, rel: string) => path.join(archiveRoot(r), ...rel.split("/"));
const snapRoot = (r: Repo) => path.join(r.root, ".wiki", ".snapshots", ID);
const lockFile = (r: Repo) => path.join(r.root, ".wiki", ".lock");

const fm = (type: string) => `---\ntype: ${type}\n---\n`;
/** A page with a "## Facts" section; `cite` adds this ingest's citation. */
function page(type: string, title: string, lines: string[], cite = false): string {
  const facts = lines.length ? `## Facts\n\n${lines.join("\n")}\n` : "";
  return `${fm(type)}# ${title}\n\n${facts}${cite ? CITE : ""}`;
}

async function treeHash(dir: string): Promise<string> {
  const h = createHash("sha256");
  async function walk(d: string, rel: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((x, y) => (x.name < y.name ? -1 : 1));
    for (const e of entries) {
      const rr = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        h.update(`d:${rr}\n`);
        await walk(path.join(d, e.name), rr);
      } else if (e.isFile()) {
        h.update(`f:${rr}\n`);
        h.update(await readFile(path.join(d, e.name)));
      }
    }
  }
  await walk(dir, "");
  return h.digest("hex");
}

// Own fact identity for the census: date, status, NFC whitespace-collapsed text (citation included).
// Deliberately independent of src/ingest/validate.ts.
const FACT_RE = /^\s*(?:[-*+]\s+)?(\d{4}-\d{2}-\d{2})\s+·\s+(\w+)\s+·\s+(.*\S)\s*$/u;
function keyOf(line: string): string | null {
  const m = FACT_RE.exec(line.replace(/^﻿/, ""));
  if (!m) return null;
  return `${m[1]}|${m[2]}|${m[3]!.normalize("NFC").replace(/\s+/g, " ")}`;
}
async function walkMd(dir: string, rel = ""): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(dir, rel), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const rr = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkMd(dir, rr)));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(rr);
  }
  return out;
}
async function treeKeys(dir: string): Promise<Map<string, Set<string>>> {
  const m = new Map<string, Set<string>>();
  for (const rel of await walkMd(dir)) {
    const keys = new Set<string>();
    for (const line of (await readFile(path.join(dir, rel), "utf8")).split(/\r?\n/)) {
      const k = keyOf(line);
      if (k) keys.add(k);
    }
    m.set(rel, keys);
  }
  return m;
}
interface Census {
  pages: Map<string, Set<string>>;
  archive: Map<string, Set<string>>;
}
async function census(r: Repo): Promise<Census> {
  return { pages: await treeKeys(r.paths.pagesDir), archive: await treeKeys(archiveRoot(r)) };
}
function union(c: Census): Set<string> {
  const all = new Set<string>();
  for (const s of [...c.pages.values(), ...c.archive.values()]) for (const k of s) all.add(k);
  return all;
}
/** Every fact key present at apply time is somewhere in pages/ or archive/ afterwards. */
function expectNoLoss(before: Census, after: Census): void {
  const held = union(after);
  for (const k of union(before)) expect(held.has(k), `fact lost: ${k}`).toBe(true);
}

async function repo(): Promise<Repo> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-conserve-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  return { root, paths: resolvePaths(root, DEFAULT_CONFIG) };
}
async function register(r: Repo): Promise<string> {
  await put(path.join(r.root, "docs", "cleanup.md"), "clean-up\n");
  const meta = await registerSource(r.paths, {
    originType: "file",
    origin: "docs/cleanup.md",
    label: "cleanup",
    originalPath: path.join(r.root, "docs", "cleanup.md"),
    text: null,
    kind: "status-report",
    providedBy: "user",
    ruleVersion: null,
    reingestOf: null,
    permission: { mode: "ai", approved: false, matched: null, kind_pending: false },
    now: NOW,
  });
  await writeFacts(r.paths, {
    source_id: meta.id,
    kind: "status-report",
    rule_version: 2,
    facts: [
      {
        entity: "project:atlas",
        field: "status",
        value: "clean-up agreed",
        status: "decided",
        as_of: "2026-10-18",
        anchor: "Status",
        page: "projects/atlas.md",
        exists: true,
      },
    ],
    uncovered: [],
  } as never);
  return meta.id;
}
/** Seed `pages` and `archive` (rel -> text), register the source, apply. */
async function applied(
  pages: Record<string, string>,
  archive: Record<string, string> = {},
): Promise<{ r: Repo; before: Census }> {
  const r = await repo();
  for (const [rel, body] of Object.entries(pages)) await put(pagesFile(r, rel), body);
  for (const [rel, body] of Object.entries(archive)) await put(archiveFile(r, rel), body);
  expect(await register(r)).toBe(ID);
  expect((await run(r.root, ["ingest", "apply", ID, "--json"])).code).toBe(0);
  return { r, before: await census(r) };
}

const finish = (r: Repo, json = true) => run(r.root, json ? ["ingest", "finish", ID, "--json"] : ["ingest", "finish", ID]);

/** A refusal: the exact lists, the lock and snapshot kept, nothing logged, pages/ and archive/ untouched by finish. */
async function refused(r: Repo, dropped: unknown[], archivedDropped: unknown[]): Promise<Res> {
  const pagesBefore = await treeHash(r.paths.pagesDir);
  const archiveBefore = await treeHash(archiveRoot(r));
  const res = await finish(r);
  expect(res.code).toBe(1);
  expect(res.json.ok).toBe(false);
  expect(res.json.command).toBe("ingest finish");
  expect(res.json.error.code).toBe("validation_failed");
  expect(res.json.error.details.dropped).toEqual(dropped);
  expect(res.json.error.details.archived_dropped).toEqual(archivedDropped);
  expect(JSON.parse(await readFile(lockFile(r), "utf8")).source_id).toBe(ID);
  expect(await exists(snapRoot(r))).toBe(true);
  expect((await readLogEvents(r.paths, { type: "ingest", sourceId: ID })).events).toHaveLength(0);
  expect(await treeHash(r.paths.pagesDir)).toBe(pagesBefore);
  expect(await treeHash(archiveRoot(r))).toBe(archiveBefore);
  return res;
}
async function snapshotMissing(r: Repo, ...mentions: string[]): Promise<void> {
  const res = await finish(r);
  expect(res.code).toBe(1);
  expect(res.json.command).toBe("ingest finish");
  expect(res.json.error.code).toBe("snapshot_missing");
  for (const m of mentions) expect(res.json.error.message).toContain(m);
  expect(res.json.error.message).toContain("wikeeper ingest abort");
  expect(await exists(lockFile(r))).toBe(true);
}
const entry = (p: string, line: string) => ({ path: p, line });

// ---------------------------------------------------------------- S1
describe("STORY-008-02 S1: a dropped line is refused, and accepted once it is in its page's archive file", () => {
  it("refused without archive/, accepted once archive/<same path> holds the line", async () => {
    const { r, before } = await applied({ "projects/atlas.md": page("project", "Atlas", [A1, A2]) });
    await put(pagesFile(r, "projects/atlas.md"), page("project", "Atlas", [A2], true));
    const res = await refused(r, [entry("projects/atlas.md", A1)], []);
    expect(res.json.error.message).toContain("fact lines dropped");
    expect(res.json.error.message).toContain("a clean-up moves it unchanged to archive/<same path>");
    expect(res.json.error.message).toContain("projects/atlas.md");

    await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A1}\n`);
    const ok = await finish(r);
    expect(ok.code).toBe(0);
    expect(ok.json.data.updated).toEqual(["projects/atlas.md"]);
    expect(ok.json.data.archived).toEqual({ facts: 1, pages: 0 });
    expect((ok.json.warnings as string[]).join("\n")).toContain(".wiki/pages/sources/src-2026-10-18-cleanup.md is missing");
    expectNoLoss(before, await census(r));
  }, T);
});

// ---------------------------------------------------------------- S2
describe("STORY-008-02 S2: a deleted page's fact lines must survive in pages/ or archive/", () => {
  const LEAD = page("person", "Design lead", [B1, B2]);
  const base = (designer: string[]) => ({
    "people/design-lead.md": LEAD,
    "people/designer.md": page("person", "Designer", designer),
  });
  const designerWith = (lines: string[]) => page("person", "Designer", lines, true);

  it("row 1: merged into another page", async () => {
    const { r, before } = await applied(base([]));
    await rm(pagesFile(r, "people/design-lead.md"));
    await put(pagesFile(r, "people/designer.md"), designerWith([B1, B2]));
    const res = await finish(r);
    expect(res.code).toBe(0);
    expect(res.json.data.deleted).toEqual(["people/design-lead.md"]);
    expect(res.json.data.archived).toEqual({ facts: 0, pages: 0 });
    expectNoLoss(before, await census(r));
  }, T);

  it("row 2: renamed within pages/", async () => {
    const { r, before } = await applied(base([]));
    await rm(pagesFile(r, "people/design-lead.md"));
    await put(pagesFile(r, "people/design-l.md"), `${LEAD}${CITE}`);
    const res = await finish(r);
    expect(res.code).toBe(0);
    expect(res.json.data.created).toEqual(["people/design-l.md"]);
    expect(res.json.data.deleted).toEqual(["people/design-lead.md"]);
    expect(res.json.data.archived).toEqual({ facts: 0, pages: 0 });
    expectNoLoss(before, await census(r));
  }, T);

  it("row 3: moved whole to archive/<same path>", async () => {
    const { r, before } = await applied(base([]));
    await rm(pagesFile(r, "people/design-lead.md"));
    await put(archiveFile(r, "people/design-lead.md"), LEAD);
    const res = await finish(r);
    expect(res.code).toBe(0);
    expect(res.json.data.archived).toEqual({ facts: 2, pages: 1 });
    expectNoLoss(before, await census(r));
  }, T);

  it("row 4: split between a live page and the archive", async () => {
    const { r, before } = await applied(base([]));
    await rm(pagesFile(r, "people/design-lead.md"));
    await put(pagesFile(r, "people/designer.md"), designerWith([B1]));
    await put(archiveFile(r, "people/design-lead.md"), `${fm("person")}${B2}\n`);
    const res = await finish(r);
    expect(res.code).toBe(0);
    expect(res.json.data.archived).toEqual({ facts: 1, pages: 1 });
    expectNoLoss(before, await census(r));
  }, T);

  it("row 5: the lines were already on another live page", async () => {
    const { r, before } = await applied(base([B1, B2]));
    await rm(pagesFile(r, "people/design-lead.md"));
    const res = await finish(r);
    expect(res.code).toBe(0);
    expect(res.json.data.archived).toEqual({ facts: 0, pages: 0 });
    expectNoLoss(before, await census(r));
  }, T);

  it("row 6: one line survives, one does not: refused with the other", async () => {
    const { r } = await applied(base([]));
    await rm(pagesFile(r, "people/design-lead.md"));
    await put(pagesFile(r, "people/designer.md"), designerWith([B1]));
    await refused(r, [entry("people/design-lead.md", B2)], []);
  }, T);

  it("row 7: no line survives: refused with both, in snapshot order", async () => {
    const { r } = await applied(base([]));
    await rm(pagesFile(r, "people/design-lead.md"));
    const res = await refused(r, [entry("people/design-lead.md", B1), entry("people/design-lead.md", B2)], []);
    expect(res.json.error.message).toContain("fact lines dropped");
    expect(res.json.error.message).toContain("people/design-lead.md");
  }, T);

  it("row 8: a deleted page without its snapshot copy throws snapshot_missing", async () => {
    const { r } = await applied(base([]));
    await rm(pagesFile(r, "people/design-lead.md"));
    await put(pagesFile(r, "people/designer.md"), designerWith([B1, B2]));
    await rm(path.join(snapRoot(r), "pages", "people", "design-lead.md"));
    await snapshotMissing(r, "people/design-lead.md");
  }, T);
});

// ---------------------------------------------------------------- S3
describe("STORY-008-02 S3: no fact line leaves archive/", () => {
  const FILES = {
    pages: { "projects/atlas.md": page("project", "Atlas", [A1, A2]) },
    archive: {
      "projects/atlas.md": `${fm("project")}${A0}\n${A00}\n`,
      "notes/kickoff.md": `${fm("meeting")}# Kickoff\n`,
    },
  };
  const seed = () => applied(FILES.pages, FILES.archive);

  it("row 1: a line removed from an archive page", async () => {
    const { r } = await seed();
    await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A00}\n`);
    const res = await refused(r, [], [entry("projects/atlas.md", A0)]);
    expect(res.json.error.message).toContain("archived fact lines dropped");
    expect(res.json.error.message).toContain("archive/projects/atlas.md");
  }, T);

  it("row 2: an archive page deleted", async () => {
    const { r } = await seed();
    await rm(archiveFile(r, "projects/atlas.md"));
    await refused(r, [], [entry("projects/atlas.md", A0), entry("projects/atlas.md", A00)]);
  }, T);

  it("row 3: a line moved from the archive back to a live page", async () => {
    const { r } = await seed();
    await put(pagesFile(r, "projects/atlas.md"), page("project", "Atlas", [A0, A1, A2], true));
    await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A00}\n`);
    await refused(r, [], [entry("projects/atlas.md", A0)]);
  }, T);

  it("row 4: an archive page renamed", async () => {
    const { r } = await seed();
    await rm(archiveFile(r, "projects/atlas.md"));
    await put(archiveFile(r, "projects/atlas-platform.md"), `${fm("project")}${A0}\n${A00}\n`);
    await refused(r, [], [entry("projects/atlas.md", A0), entry("projects/atlas.md", A00)]);
  }, T);

  it("row 5: a fact-less archive page deleted", async () => {
    const { r } = await seed();
    await rm(archiveFile(r, "notes/kickoff.md"));
    const res = await refused(r, [], [entry("notes/kickoff.md", "")]);
    expect(res.json.error.message).toContain("archive/notes/kickoff.md (page deleted)");
  }, T);

  it("row 6: a copy kept in the archive and on a live page, and a line appended to an archive page: accepted", async () => {
    const { r, before } = await seed();
    await put(pagesFile(r, "projects/atlas.md"), page("project", "Atlas", [A0, A1, A2], true));
    await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A0}\n${A00}\n${A1}\n`);
    const res = await finish(r);
    expect(res.code).toBe(0);
    expect(res.json.data.archived).toEqual({ facts: 0, pages: 0 });
    expectNoLoss(before, await census(r));
  }, T);

  it("row 7: an archive line removed and its snapshot copy missing: snapshot_missing", async () => {
    const { r } = await seed();
    await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A00}\n`);
    await rm(path.join(snapRoot(r), "archive", "projects", "atlas.md"));
    await snapshotMissing(r, "archive/projects/atlas.md");
  }, T);

  it("row 8: an older snapshot has no archive copy to compare with", async () => {
    const { r } = await seed();
    const file = path.join(snapRoot(r), "snapshot.json");
    const snap = JSON.parse(await readFile(file, "utf8"));
    delete snap.archive;
    await writeFile(file, JSON.stringify(snap, null, 2));
    await rm(path.join(snapRoot(r), "archive"), { recursive: true, force: true });
    await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A00}\n`);
    const res = await finish(r);
    expect(res.code).toBe(0);
    expect(res.json.data.archived).toEqual({ facts: 0, pages: 0 });
  }, T);
});

// ---------------------------------------------------------------- S4
describe("STORY-008-02 S4: the archive file must hold the identical line and valid frontmatter, not this ingest's citation", () => {
  const seed = () => applied({ "projects/atlas.md": page("project", "Atlas", [A1, A2]) });
  const trimmed = (cites: boolean) => page("project", "Atlas", [A2], cites);

  it("row 1: BOM, CRLF, '*' marker and doubled spaces are layout, not identity", async () => {
    const { r, before } = await seed();
    await put(pagesFile(r, "projects/atlas.md"), trimmed(true));
    const messy = "*   2026-09-01  ·  tentative ·  Atlas  ships 2026-10-15.   [[src-2026-09-01-plan]]";
    await put(archiveFile(r, "projects/atlas.md"), `﻿---\r\ntype: project\r\n---\r\n${messy}\r\n`);
    const res = await finish(r);
    expect(res.code).toBe(0);
    expect(res.json.data.archived).toEqual({ facts: 1, pages: 0 });
    expectNoLoss(before, await census(r));
  }, T);

  it("row 2: an archive page without frontmatter", async () => {
    const { r, before } = await seed();
    await put(pagesFile(r, "projects/atlas.md"), trimmed(true));
    await put(archiveFile(r, "projects/atlas.md"), `${A1}\n`);
    const res = await finish(r);
    expect(res.code).toBe(0);
    expect(res.json.data.archived).toEqual({ facts: 1, pages: 0 });
    expectNoLoss(before, await census(r));
  }, T);

  it("row 3: the line in another archive path is still dropped", async () => {
    const { r } = await seed();
    await put(pagesFile(r, "projects/atlas.md"), trimmed(true));
    await put(archiveFile(r, "projects/old-atlas.md"), `${fm("project")}${A1}\n`);
    await refused(r, [entry("projects/atlas.md", A1)], []);
  }, T);

  it("row 4: the archive copy changed (tentative to decided) is dropped", async () => {
    const { r } = await seed();
    await put(pagesFile(r, "projects/atlas.md"), trimmed(true));
    await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A1.replace("tentative", "decided")}\n`);
    await refused(r, [entry("projects/atlas.md", A1)], []);
  }, T);

  it("row 5: an archive YAML error is invalid with the archive/ path", async () => {
    const { r } = await seed();
    await put(pagesFile(r, "projects/atlas.md"), trimmed(true));
    await put(archiveFile(r, "projects/atlas.md"), `---\nsummary: a: b\n---\n${A1}\n`);
    const res = await refused(r, [], []);
    const d = res.json.error.details;
    expect(d.invalid).toHaveLength(1);
    expect(d.invalid[0].path).toBe("archive/projects/atlas.md");
    expect(d.invalid[0].message.startsWith("line 2: invalid frontmatter YAML: ")).toBe(true);
    expect(d.uncited).toEqual([]);
  }, T);

  it("row 6: an archive field of the wrong type is invalid", async () => {
    const { r } = await seed();
    await put(pagesFile(r, "projects/atlas.md"), trimmed(true));
    await put(archiveFile(r, "projects/atlas.md"), `---\ntitle: 1\n---\n${A1}\n`);
    const res = await refused(r, [], []);
    expect(res.json.error.details.invalid).toEqual([
      { path: "archive/projects/atlas.md", message: 'frontmatter field "title" must be a string or null' },
    ]);
  }, T);

  it("row 7: a live page that lost its citation is uncited; the archive page needs none", async () => {
    const { r } = await seed();
    await put(pagesFile(r, "projects/atlas.md"), trimmed(false));
    await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A1}\n`);
    const res = await refused(r, [], []);
    expect(res.json.error.details.uncited).toEqual(["projects/atlas.md"]);
    expect(res.json.error.details.invalid).toEqual([]);
  }, T);
});

// ---------------------------------------------------------------- S5
describe("STORY-008-02 S5: the finish report counts what moved to the archive", () => {
  const PAGES = {
    "projects/atlas.md": page("project", "Atlas", [A1, A2]),
    "projects/beta.md": page("project", "Beta", [C1]),
    "notes/kickoff.md": `${fm("meeting")}# Kickoff\n`,
    "team.md": "# Team\n",
  };
  const TEAM_FACT = `- 2026-10-18 · decided · The team grows. [[${ID}]]`;
  type Edit = (r: Repo) => Promise<void>;
  const rows: Array<{
    name: string;
    edit: Edit;
    archived: { facts: number; pages: number };
    line: string | null;
    logged?: boolean;
  }> = [
    {
      name: "row 1: nothing archived",
      edit: async (r) => put(pagesFile(r, "team.md"), `# Team\n\n## Facts\n\n${TEAM_FACT}\n`),
      archived: { facts: 0, pages: 0 },
      line: null,
    },
    {
      name: "row 2: one line moved",
      edit: async (r) => {
        await put(pagesFile(r, "projects/atlas.md"), page("project", "Atlas", [A2], true));
        await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A1}\n`);
      },
      archived: { facts: 1, pages: 0 },
      line: "   archived 1 fact line · 0 pages",
    },
    {
      name: "row 3: lines moved and a page moved whole",
      edit: async (r) => {
        await put(pagesFile(r, "projects/atlas.md"), page("project", "Atlas", [], true));
        await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A1}\n${A2}\n`);
        await rm(pagesFile(r, "projects/beta.md"));
        await put(archiveFile(r, "projects/beta.md"), PAGES["projects/beta.md"]);
      },
      archived: { facts: 3, pages: 1 },
      line: "   archived 3 fact lines · 1 page",
    },
    {
      name: "row 4: a fact-less page moved whole",
      edit: async (r) => {
        await rm(pagesFile(r, "notes/kickoff.md"));
        await put(archiveFile(r, "notes/kickoff.md"), PAGES["notes/kickoff.md"]);
      },
      archived: { facts: 0, pages: 1 },
      line: "   archived 0 fact lines · 1 page",
    },
    {
      name: "row 5: the ingest was already logged: zero counts, no line",
      edit: async (r) => {
        await put(pagesFile(r, "projects/atlas.md"), page("project", "Atlas", [A2], true));
        await put(archiveFile(r, "projects/atlas.md"), `${fm("project")}${A1}\n`);
        await writeLogEvent(r.paths, {
          type: "ingest",
          at: "2026-10-18T11:00:00.000Z",
          source_id: ID,
          kind: "status-report",
          rule_version: 2,
          permission: "ai",
          origin: "docs/cleanup.md",
          created: [],
          updated: [],
          deleted: [],
          contradictions: 0,
          rule_suggestions: 0,
        } as never);
      },
      archived: { facts: 0, pages: 0 },
      line: null,
      logged: true,
    },
  ];

  for (const row of rows) {
    it(row.name, async () => {
      const { r, before } = await applied(PAGES);
      await row.edit(r);
      const res = await finish(r);
      expect(res.code).toBe(0);
      expect(res.json.data.archived).toEqual(row.archived);
      if (row.logged) expect((res.json.warnings as string[]).join("\n")).toContain("already recorded");
      else expectNoLoss(before, await census(r));

      const second = await applied(PAGES);
      await row.edit(second.r);
      const human = await finish(second.r, false);
      expect(human.code).toBe(0);
      const lines = human.text.split("\n");
      if (row.line === null) {
        expect(lines.some((l) => l.startsWith("   archived"))).toBe(false);
      } else {
        const i = lines.findIndex((l) => l.startsWith("   created "));
        expect(i).toBeGreaterThanOrEqual(0);
        expect(lines[i + 1]).toBe(row.line);
      }
    }, T);
  }
});
