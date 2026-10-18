// STORY-008-06 QA-Red: archive instructions and docs. Immutable after QA-Red.
// Text rows read templates/, architecture.md and README.md; live rows run the clean-up the text describes in-process
// through runCli in temp git repos (real finished ingests seed the pages, so page hashes are recorded). No network.
// Group A rows depend on this story's own text; Group B rows (status lines, scenarios 2-4) also need STORY-008-02..008-05.
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createStatusCommand } from "../../src/commands/status.js";
import { setConfigValue } from "../../src/core/config.js";
import { templatesDir } from "../../src/core/templates.js";
import { runCli } from "../../src/program.js";
import { DOCUMENTED_FORMS, checkCommands, checkCoverage, formatFinding } from "./structure.js";

const T = 60_000;

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});
async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

// ---------- text readers ----------
const lf = (s: string) => s.replace(/\r\n/g, "\n");
async function readTemplate(rel: string): Promise<string> {
  try {
    return lf(await readFile(path.join(templatesDir(), ...rel.split("/")), "utf8"));
  } catch (e) {
    throw new Error(`not yet implemented: templates/${rel} (${(e as Error).message})`);
  }
}
async function readRoot(rel: string): Promise<string> {
  return lf(await readFile(path.resolve(rel), "utf8"));
}
function splitSections(text: string): Array<{ name: string; text: string }> {
  const sections: Array<{ name: string; text: string }> = [];
  let cur: { name: string; text: string } | null = null;
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      if (cur) cur.text += line + "\n";
      continue;
    }
    const m = !fenced ? /^## (.+)$/.exec(line) : null;
    if (m) {
      cur = { name: m[1]!.trim(), text: "" };
      sections.push(cur);
      continue;
    }
    if (cur) cur.text += line + "\n";
  }
  return sections;
}
async function wikiSection(name: string): Promise<string> {
  const s = splitSections(await readTemplate("system/WIKI.md")).find((x) => x.name === name);
  if (!s) throw new Error(`not yet implemented: section "${name}"`);
  return s.text;
}
async function skillBody(): Promise<string> {
  const raw = await readTemplate("skills/wiki-search/SKILL.md");
  const m = /^---\n[\s\S]*?\n---\n/.exec(raw);
  return m ? raw.slice(m[0].length) : raw;
}
/** Text of `## <n>. ...` (with its `###` subsections) in architecture.md. */
async function archSection(n: number): Promise<string> {
  const lines = (await readRoot("architecture.md")).split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## ${n}. `));
  if (start < 0) throw new Error(`not yet implemented: architecture.md §${n}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) if (/^## \d+\. /.test(lines[i]!)) { end = i; break; }
  return lines.slice(start, end).join("\n");
}
const flat = (s: string) => s.replace(/\s+/g, " ");
function expectPhrases(text: string, phrases: string[]): void {
  const f = flat(text);
  for (const p of phrases) expect(f, `missing: ${p}`).toContain(p);
}
const lineStarting = (text: string, start: string): string => {
  const l = text.split("\n").find((x) => x.startsWith(start));
  if (l === undefined) throw new Error(`not yet implemented: line starting ${start}`);
  return l;
};
function statusFields(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^- `([a-z_]+)`(?: and `([a-z_]+)`)?: /.exec(line);
    if (m) out.push(m[1]!, ...(m[2] ? [m[2]] : []));
  }
  return out;
}
async function allTemplateFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await allTemplateFiles(dir, r)));
    else out.push(r);
  }
  return out;
}

// ---------- S1: each instruction lands in its file and part ----------
describe("STORY-008-06 S1: each archive instruction lands in its file and part", () => {
  const wiki: Array<[string, string, string[]]> = [
    ["clean-up (R1)", "Write phase", ["only when the user asks", "never start one yourself", "move only what they approve", "wikeeper ingest start -", "`facts` list is empty", "a `wiki-writer` writes only under `pages/`"]],
    ["moving (R1)", "Write phase", ["`archive/<path>`", "unchanged", "`archive:: [[archive/<path>]]`", "`sources`", "oldest first"]],
    ["whole page (R1)", "Write phase", ["To move a whole page", "Links to it still resolve", "`archived N fact lines · M pages`"]],
    ["deleting (R2)", "Write phase", ["Before you delete a page", "the page it merges into", "nowhere else in `pages/` or `archive/`"]],
    ["ordinary (R3)", "Write phase", ["an ordinary ingest moves nothing to `archive/`", "except `archive/` in a clean-up"]],
    ["ordinary (R3)", "Page format", ["A replaced fact stays in the list", "Only a clean-up the user asks for"]],
    ["refusals (R4)", "Write phase", ["`fact lines dropped`", "`archived fact lines dropped`", "exactly as it was", "no line ever leaves `archive/`", "change nothing under `pages/` or `archive/`"]],
    ["telling (R5), this story's phrases", "Lint and status", ["offer both choices", "or they ask for a clean-up", "never change a limit or start a clean-up yourself"]],
    ["telling (R5), STORY-008-05's bullet", "Lint and status", ["`final_status`", "Never start a clean-up yourself"]],
    ["status lines (R5)", "Lint and status", ["- `archive`: ", "- `archive_candidates`: ", "`reason`", "`lint.stale_after_days`"]],
    ["broken link (R5)", "Lint and status", ["On a page under `archive/`, never edit the line", "add the old name to `aliases`"]],
    ["search (R6)", "Search", ["`--archive`", "`archived: true`", "`--since`", "`--entity`"]],
    ["answering (R6)", "Answering questions", ["about the past", "`--archive`"]],
  ];
  it.each(wiki)("WIKI.md %s: section %s", async (_item, section, phrases) => {
    const text = await wikiSection(section);
    if (section === "Lint and status" && phrases[0]!.startsWith("- `")) {
      lineStarting(text, "- `archive`: ");
      lineStarting(text, "- `archive_candidates`: ");
    }
    expectPhrases(text, phrases);
  });

  it("wiki-search skill (R7): --archive, about the past, page_tokens; still no --no-miss", async () => {
    const body = await skillBody();
    expectPhrases(body, ["`--archive`", "about the past", "`page_tokens`"]);
    expect(body).not.toContain("--no-miss");
  });

  it("architecture.md (R8): §4, §4.1 and §8 name archive/ and the clean-up", async () => {
    const f = flat((await archSection(4)) + (await archSection(8)));
    for (const p of ["archive/", "`archive/**`", "clean-up"]) expect(f, p).toContain(p);
    expect(flat(await archSection(7))).toContain("archive");
  });
  it("architecture.md (R8): §13 holds D-37", async () => {
    const f = flat(await archSection(13));
    expect(f).toContain("D-37");
    expect(f).toContain("only in a clean-up the user asks for");
  });
  it("architecture.md (R8): §10 search row has --archive and remove keeps archive/; §11 lists archive/", async () => {
    const s10 = await archSection(10);
    expect(flat(lineStarting(s10, "| `search")), "search row").toContain("--archive");
    expect(flat(s10.split("\n").find((l) => l.startsWith("| `remove")) ?? "")).toContain("archive/");
    expect(await archSection(11)).toContain("archive/");
  });
  it("README (R8): .wiki/archive/, --archive, D-37, raw is kept not archived, update and remove have their own rows", async () => {
    const readme = await readRoot("README.md");
    for (const p of [".wiki/archive/", "--archive", "D-37", "`D-01`–`D-37`", "**Fact archive.**", "keeps the immutable original in `.wiki/raw/`"]) {
      expect(readme, p).toContain(p);
    }
    expect(readme).not.toContain("archives the immutable original");
    const rows = readme.split("\n").filter((l) => l.startsWith("|"));
    expect(rows.some((r) => r.startsWith("| `wikeeper update` |")), "update row").toBe(true);
    const remove = rows.find((r) => r.startsWith("| `wikeeper remove [--purge]` |"));
    expect(remove, "remove row").toBeDefined();
    expect(remove).toContain("archive");
    expect(rows.some((r) => r.includes("`wikeeper update` / `wikeeper remove"))).toBe(false);
  });
});

// ---------- the binding wording (exact sentences of R1-R7) ----------
describe("STORY-008-06 wording: the story's sentences, verbatim", () => {
  const write: string[] = [
    "6. Flag a contradiction", // anchor only; the appended sentence is checked below
    "Only merging a duplicate page and a clean-up move lines off a page (below).",
    "7. Write nothing outside `pages/`, except `archive/` in a clean-up (below).",
    "A clean-up moves facts the user no longer needs on a page into `archive/`, which keeps them. Run one only when the user asks for it, and never start one yourself; an ordinary ingest moves nothing to `archive/`. In a clean-up:",
    "Show the user the lines and pages, and move only what they approve.",
    "Run `wikeeper ingest start -` with the user's decision on stdin, adding `--kind <kind>` as section \"Ambient offers\" says, then `wikeeper ingest facts <id>` with a facts file whose `facts` list is empty, then the write phase. Do it yourself: a `wiki-writer` writes only under `pages/`.",
    "On the page, put the typed line `archive:: [[archive/<path>]]` with its typed links, `<path>` written without `.md` (for example `archive:: [[archive/projects/atlas]]`)",
    "To move a whole page, create `archive/<path>` with all of its text and delete `pages/<path>`. Links to it still resolve.",
    "Its report adds `archived N fact lines · M pages`. When a page is still 🔴, tell the user.",
    "A later source about an archived entity gets a new page in `pages/`; leave its archive page as it is.",
    "Before you delete a page, for example to merge a duplicate into another page, copy each of its fact lines unchanged to the page it merges into; in a clean-up you may move them to `archive/` instead. `finish` refuses a deleted page whose fact lines are nowhere else in `pages/` or `archive/`, with `fact lines dropped`, naming the page and its lines.",
    "When `finish` refuses with `fact lines dropped`, put each named line back exactly as it was or, in a clean-up, add it unchanged to `archive/<path>`; then run `wikeeper ingest finish <id>` again; the lock is still held. When it refuses with `archived fact lines dropped`, put each named line back in its archive page exactly as it was, or restore the deleted archive page: no line ever leaves `archive/`.",
    "change nothing under `pages/` or `archive/`.",
  ];
  it("section Write phase carries the R1-R4 sentences", async () => {
    const text = flat(await wikiSection("Write phase"));
    for (const s of write.slice(1)) expect(text, s).toContain(s);
    expect(text).not.toContain("Deleting a whole page stays allowed");
    // R11 (d): phrases that survive
    for (const p of ["fact lines dropped", "new dated line", "exactly as it was", "wikeeper ingest start -", "correction", "change nothing under `pages/`"]) expect(text, p).toContain(p);
  });
  it("section Page format ends the replaced-fact sentence with the clean-up sentence (R3 (c))", async () => {
    expect(flat(await wikiSection("Page format"))).toContain(
      'A replaced fact stays in the list; the newer line carries the change. Only a clean-up the user asks for moves facts to `archive/` (section "Write phase").',
    );
  });
  it("section Search and Answering questions carry R6", async () => {
    expect(flat(await wikiSection("Search"))).toContain(
      '- `--archive`: also search `archive/`, where clean-ups keep replaced and finished facts, as in `wikeeper search "launch date" --archive`; its hits carry `archived: true`. `--since` and `--entity` always include archived facts, marked `archived: true`.',
    );
    expect(flat(await wikiSection("Answering questions"))).toContain(
      "When a question is about the past, such as an earlier plan, date or owner, and the pages do not answer it, search again with `--archive`.",
    );
  });
  it("section Lint and status: red-page paragraph, oversized-page row and broken-link row (R5)", async () => {
    const text = await wikiSection("Lint and status");
    const f = flat(text);
    expect(f).toContain(
      "offer both choices in plain words: you raise the page limit for them (on a yes, `wikeeper config set tokens.page.red <n>`), or they ask for a clean-up, which moves replaced and finished facts to `archive/` and keeps them (section \"Write phase\").",
    );
    expect(f).toContain("never change a limit or start a clean-up yourself");
    for (const p of ["once in the session", "`wikeeper config set tokens.page.red <n>`"]) expect(f, p).toContain(p);
    expect(lineStarting(text, "| `oversized-page` |")).toBe(
      "| `oversized-page` | A page is at or above `tokens.page.red`. Tell the user once in the session, as said above: they raise the limit or ask for a clean-up; an ordinary ingest never shrinks a page. |",
    );
    expect(lineStarting(text, "| `broken-link` |")).toBe(
      "| `broken-link` | A `[[…]]` link resolves to no page, entity or alias. Fix the link in a write phase. On a page under `archive/`, never edit the line: add the old name to `aliases` of the live page that now has the entity. |",
    );
  });
  it("the wiki-search skill carries the R7 sentence", async () => {
    expect(flat(await skillBody())).toContain('When a question about the past finds no answer, search again with `--archive` (section "Search").');
  });
  it("R10: no template writes .wiki/archive/ and none names wikeeper search --archived", async () => {
    for (const f of await allTemplateFiles(templatesDir())) {
      if (!/\.(md|toml|json)$/.test(f)) continue;
      const t = lf(await readFile(path.join(templatesDir(), ...f.split("/")), "utf8"));
      expect(t, f).not.toContain(".wiki/archive");
    }
    // the red-now-green guard: the text exists at all
    expect(flat(await wikiSection("Write phase"))).toContain("archive/");
  });
});

// ---------- R11: invariants ----------
const SECTIONS = [
  "Ingest", "Register", "Triage and extract", "Write phase", "Facts file", "Brief", "Page format",
  "Delegation", "Ambient offers", "Search", "Answering questions", "Proposing rule changes", "Lint and status", "Log and index",
];
describe("STORY-008-06 R11: invariants", () => {
  it("WIKI.md keeps its 14 sections in order and at most 400 lines; Delegation keeps four rows (after the new text exists)", async () => {
    expect(flat(await wikiSection("Write phase"))).toContain("a clean-up"); // fails until the text lands
    const wiki = await readTemplate("system/WIKI.md");
    expect(splitSections(wiki).map((s) => s.name)).toEqual(SECTIONS);
    expect(wiki.split("\n").length).toBeLessThanOrEqual(400);
    const rows = (await wikiSection("Delegation"))
      .split("\n")
      .filter((l) => l.startsWith("|"))
      .map((l) => l.split("|").slice(1, -1).map((c) => c.trim()))
      .filter((c) => c.length === 3 && c[0] !== "Case" && !/^-+$/.test(c[0]!));
    expect(rows.length).toBe(4);
  });

  const PINS: Record<string, string> = {
    "agent-block.md": "81f6e0fd2bd51023be421d3c7db671fe7b2b36689a1f85fbf7ac2bffa07792de",
    "system/SETUP.md": "87f321a9452adda202e917ef4b312d56b5df761839710f7fa4d53fce4e4259c9",
    "agents/claude/wiki-extractor.md": "1ef88fd2aa1a3cf42255b7ec9548be3d87dd92582ba76499672a7dcbe9b53977",
    "agents/claude/wiki-writer.md": "090e6b4f6bb1bfe0aa4dd25118253e826f3bee160aacf51b161f82b60018cd83",
    "agents/antigravity/wiki-extractor.md": "da3dce3faffc413b6139440b87d184362d2f98ee0d7e3c6903c1e29d528cb0c9",
    "agents/antigravity/wiki-writer.md": "f587776bbae123c90f0ac9e3066bcac5baa71d572314d69403a6bab33746f20b",
    "agents/codex/wiki-extractor.toml": "58c660375153c9d9cef0dc4674b2eef4f682e5083480bc12e53638ec12ab6407",
    "agents/codex/wiki-writer.toml": "e4c5b865f48e8e6c5203452d5d523ad21649df857029c306e7c6a79150087cbd",
    "skills/wiki-ingest/SKILL.md": "f2e8d6625acdd33b784aa0b8d9bfc773c7bbe8a3ac45fe741e3cc10a11882a08",
  };
  it("R11 (e): files 008-06 must not touch are unchanged (SPRINT-04 pins)", async () => {
    for (const [rel, sha] of Object.entries(PINS)) {
      const text = await readTemplate(rel);
      expect(createHash("sha256").update(text).digest("hex"), rel).toBe(sha);
    }
  });
});

// ---------- live helpers ----------
async function run(root: string, args: string[], o: { stdin?: string; commands?: unknown[] } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    ...(o.commands ? { commands: o.commands } : {}),
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Object.assign(Readable.from(o.stdin === undefined ? [] : [Buffer.from(o.stdin)]), { isTTY: false }),
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
async function repo(): Promise<string> {
  const root = await tmp("wk-archive-ins-");
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  await setConfigValue(root, "ingest.permission", "ai");
  return root;
}
async function put(root: string, rel: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), text);
}
async function read(root: string, rel: string): Promise<string> {
  return lf(await readFile(path.join(root, rel), "utf8"));
}
async function exists(root: string, rel: string): Promise<boolean> {
  try {
    await stat(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}
const pagesRel = (rel: string) => `.wiki/pages/${rel}`;
const archiveRel = (rel: string) => `.wiki/archive/${rel}`;

interface PageSpec {
  type?: string;
  title: string;
  sources: string[];
  head?: string[];
  lines: string[];
}
function pageText(p: PageSpec): string {
  return [
    "---",
    `type: ${p.type ?? "project"}`,
    `title: ${p.title}`,
    `summary: ${p.title} page`,
    `sources: [${p.sources.join(", ")}]`,
    "---",
    `# ${p.title}`,
    ...(p.head ?? []),
    "",
    "## Facts",
    "",
    ...p.lines,
    "",
  ].join("\n");
}
const sourcePage = (id: string) => `---\ntype: source\ntitle: ${id}\nsources: [${id}]\n---\n# ${id}\n`;

/** start - (chat excerpt) -> facts -> apply. Returns the id; the write phase is open. */
async function openIngest(root: string, stdin: string, facts: Array<{ page: string; exists: boolean; anchor: string }>): Promise<string> {
  const s = await run(root, ["ingest", "start", "-", "--kind", "chat-excerpt", "--json"], { stdin });
  expect(s.code, `${s.text} ${s.err}`).toBe(0);
  const id = s.json.data.id as string;
  const dir = await tmp("wk-archive-facts-");
  const file = path.join(dir, "facts.json");
  await writeFile(
    file,
    JSON.stringify({
      source_id: id,
      kind: "chat-excerpt",
      rule_version: null,
      facts: facts.map((f) => ({
        entity: `project:${path.basename(f.page, ".md")}`,
        field: "status",
        value: "recorded",
        status: "decided",
        as_of: "2026-10-17",
        anchor: f.anchor,
        page: f.page,
        exists: f.exists,
      })),
    }),
  );
  const f = await run(root, ["ingest", "facts", id, "--file", file, "--json"]);
  expect(f.code, `${f.text} ${f.err}`).toBe(0);
  const a = await run(root, ["ingest", "apply", id, "--json"]);
  expect(a.code, `${a.text} ${a.err}`).toBe(0);
  return id;
}
/** A clean-up as the text says: `ingest start -` with the user's decision, an empty facts list, apply. */
async function openCleanup(root: string, decision: string): Promise<string> {
  const s = await run(root, ["ingest", "start", "-", "--kind", "chat-excerpt", "--json"], { stdin: decision });
  expect(s.code, `${s.text} ${s.err}`).toBe(0);
  const id = s.json.data.id as string;
  const dir = await tmp("wk-archive-facts-");
  const file = path.join(dir, "facts.json");
  await writeFile(file, JSON.stringify({ source_id: id, kind: "chat-excerpt", rule_version: null, facts: [] }));
  const f = await run(root, ["ingest", "facts", id, "--file", file, "--json"]);
  expect(f.code, `${f.text} ${f.err}`).toBe(0);
  const a = await run(root, ["ingest", "apply", id, "--json"]);
  expect(a.code, `${a.text} ${a.err}`).toBe(0);
  return id;
}
/** Seed finished pages (and archive pages, written in the same write phase). `build` receives the seed id. */
async function seed(
  root: string,
  pages: Record<string, (id: string) => string>,
  archive: Record<string, (id: string) => string> = {},
): Promise<string> {
  const rels = Object.keys(pages);
  const id = await openIngest(
    root,
    `Seed: ${rels.map((r) => `seed ${r}`).join(" and ")}`,
    rels.map((r) => ({ page: r, exists: false, anchor: `seed ${r}` })),
  );
  for (const [rel, build] of Object.entries(pages)) await put(root, pagesRel(rel), build(id));
  for (const [rel, build] of Object.entries(archive)) await put(root, archiveRel(rel), build(id));
  await put(root, pagesRel(`sources/${id}.md`), sourcePage(id));
  const fin = await run(root, ["ingest", "finish", id, "--json"]);
  expect(fin.code, `${fin.text} ${fin.err}`).toBe(0);
  return id;
}
async function lintIds(root: string): Promise<string[]> {
  const res = await run(root, ["lint", "--json"]);
  expect(res.json?.ok, `${res.text} ${res.err}`).toBe(true);
  return (res.json.data.findings as any[]).map((f) => f.id as string);
}
async function searchPaths(root: string, term: string, archive: boolean) {
  const res = await run(root, ["search", term, ...(archive ? ["--archive"] : []), "--json"]);
  expect(res.json?.ok, `${res.text} ${res.err}`).toBe(true);
  return res.json.data.results as any[];
}

const L1 = (id: string) => `- 2026-09-01 · tentative · atlas ships 2026-10-15. [[${id}]]`;
const L2 = (id: string) => `- 2026-10-10 · decided · atlas ships 2026-11-03. [[${id}]]`;

// ---------- S2: a clean-up run as the text says is accepted ----------
describe("STORY-008-06 S2: a clean-up run as the text says is accepted", () => {
  it("one replaced fact line moves to archive/projects/atlas.md; archived 1 fact line · 0 pages", async () => {
    expect(flat(await wikiSection("Write phase"))).toContain("A clean-up moves facts"); // text first
    const root = await repo();
    await seed(root, { "projects/atlas.md": (id) => pageText({ title: "Atlas", sources: [id], lines: [L1(id), L2(id)] }) });
    const seedId = (await read(root, pagesRel("projects/atlas.md"))).match(/\[\[(src-[^\]]+)\]\]/)![1]!;
    const id = await openCleanup(root, "Archive the replaced Atlas launch date.");
    await put(root, pagesRel("projects/atlas.md"), pageText({ title: "Atlas", sources: [seedId, id], head: ["archive:: [[archive/projects/atlas]]"], lines: [L2(seedId)] }));
    await put(root, archiveRel("projects/atlas.md"), pageText({ title: "Atlas", sources: [seedId, id], lines: [L1(seedId)] }).replace("Atlas page", "archived facts of Atlas"));
    await put(root, pagesRel(`sources/${id}.md`), sourcePage(id));
    const fin = await run(root, ["ingest", "finish", id]);
    expect(fin.code, `${fin.text} ${fin.err}`).toBe(0);
    expect(fin.text).toContain("archived 1 fact line · 0 pages");
    const ids = await lintIds(root);
    for (const bad of ["broken-link", "uncited-claim", "unlogged-change"]) expect(ids, bad).not.toContain(bad);
    expect((await searchPaths(root, "2026-10-15", false)).filter((h) => String(h.path).startsWith("archive/"))).toEqual([]);
    const hits = (await searchPaths(root, "2026-10-15", true)).filter((h) => h.path === "archive/projects/atlas.md");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.archived === true)).toBe(true);
  }, T);

  it("a shipped page moves whole to archive/projects/beta.md; archived 2 fact lines · 1 page; the [[Beta]] link still resolves", async () => {
    expect(flat(await wikiSection("Write phase"))).toContain("To move a whole page"); // text first
    const root = await repo();
    const betaPage = (id: string) =>
      pageText({
        title: "Beta",
        sources: [id],
        head: ["status:: shipped"],
        lines: [`- 2026-08-01 · decided · beta kicked off. [[${id}]]`, `- 2026-09-01 · decided · beta shipped. [[${id}]]`],
      });
    await seed(root, {
      "projects/beta.md": betaPage,
      "projects/portfolio.md": (id) => pageText({ title: "Portfolio", sources: [id], head: ["related:: [[Beta]]"], lines: [`- 2026-10-01 · decided · portfolio reviewed. [[${id}]]`] }),
    });
    const original = await read(root, pagesRel("projects/beta.md"));
    const id = await openCleanup(root, "Archive the finished Beta project.");
    await put(root, archiveRel("projects/beta.md"), original);
    await rm(path.join(root, pagesRel("projects/beta.md")));
    await put(root, pagesRel(`sources/${id}.md`), sourcePage(id));
    const fin = await run(root, ["ingest", "finish", id]);
    expect(fin.code, `${fin.text} ${fin.err}`).toBe(0);
    expect(fin.text).toContain("archived 2 fact lines · 1 page");
    const ids = await lintIds(root);
    for (const bad of ["broken-link", "uncited-claim", "unlogged-change"]) expect(ids, bad).not.toContain(bad);
    expect((await searchPaths(root, "beta", false)).filter((h) => String(h.path).startsWith("archive/"))).toEqual([]);
    const hits = (await searchPaths(root, "beta", true)).filter((h) => h.path === "archive/projects/beta.md");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.archived === true)).toBe(true);
  }, T);
});

// ---------- S3: the refusals the text names, and the recovery it gives ----------
describe("STORY-008-06 S3: the refusals the text names, and the recovery it gives", () => {
  interface World {
    root: string;
    seedId: string;
    lines: { atlas: string[]; archive: string[]; beta: string[]; designer: string[]; lead: string[] };
  }
  async function world(): Promise<World> {
    const root = await repo();
    const mk = (n: string) => (id: string) => `- 2026-09-0${n} · decided · fact ${n}. [[${id}]]`;
    const seedId = await seed(
      root,
      {
        "projects/atlas.md": (id) => pageText({ title: "Atlas", sources: [id], lines: [L1(id), L2(id)] }),
        "projects/beta.md": (id) => pageText({ title: "Beta", sources: [id], head: ["status:: shipped"], lines: [mk("1")(id).replace("fact 1", "beta one"), mk("2")(id).replace("fact 2", "beta two")] }),
        "people/designer.md": (id) => pageText({ type: "person", title: "Designer", sources: [id], lines: [mk("3")(id).replace("fact 3", "designer one")] }),
        "people/design-lead.md": (id) => pageText({ type: "person", title: "Design Lead", sources: [id], lines: [mk("4")(id).replace("fact 4", "lead one"), mk("5")(id).replace("fact 5", "lead two")] }),
      },
      {
        "projects/atlas.md": (id) =>
          pageText({ title: "Atlas", sources: [id], lines: [`- 2026-07-01 · tentative · atlas ships 2026-09-30. [[${id}]]`, `- 2026-08-01 · tentative · atlas ships 2026-10-01. [[${id}]]`] }),
      },
    );
    const lines = async (rel: string, dir: "p" | "a") =>
      (await read(root, dir === "p" ? pagesRel(rel) : archiveRel(rel))).split("\n").filter((l) => l.startsWith("- "));
    return {
      root,
      seedId,
      lines: {
        atlas: await lines("projects/atlas.md", "p"),
        archive: await lines("projects/atlas.md", "a"),
        beta: await lines("projects/beta.md", "p"),
        designer: await lines("people/designer.md", "p"),
        lead: await lines("people/design-lead.md", "p"),
      },
    };
  }
  /** Rewrite a page so it keeps `lines` and cites the clean-up. */
  const withSource = (text: string, id: string) => text.replace(/^sources: \[(.*)\]$/m, (_m, s) => `sources: [${s}, ${id}]`);

  it("text first: the refusals and recovery are written down", async () => {
    expectPhrases(await wikiSection("Write phase"), ["`fact lines dropped`", "`archived fact lines dropped`", "no line ever leaves `archive/`"]);
  });

  it("a fact line deleted from pages/projects/atlas.md and not archived: fact lines dropped, lock kept; put back, then exit 0", async () => {
    expectPhrases(await wikiSection("Write phase"), ["put each named line back exactly as it was"]);
    const w = await world();
    const id = await openCleanup(w.root, "Tidy Atlas.");
    const original = await read(w.root, pagesRel("projects/atlas.md"));
    await put(w.root, pagesRel("projects/atlas.md"), withSource(original, id).replace(`${w.lines.atlas[0]}\n`, ""));
    await put(w.root, pagesRel(`sources/${id}.md`), sourcePage(id));
    const res = await run(w.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.ok).toBe(false);
    expect(res.json.command).toBe("ingest finish");
    expect(res.json.error.details.dropped).toEqual([{ path: "projects/atlas.md", line: w.lines.atlas[0] }]);
    expect(res.json.error.details.archived_dropped).toEqual([]);
    expect(await exists(w.root, ".wiki/.lock")).toBe(true);
    await put(w.root, pagesRel("projects/atlas.md"), withSource(original, id));
    const again = await run(w.root, ["ingest", "finish", id, "--json"]);
    expect(again.code, `${again.text} ${again.err}`).toBe(0);
  }, T);

  it("a line deleted from archive/projects/atlas.md: archived fact lines dropped, lock kept; put back, then exit 0", async () => {
    expectPhrases(await wikiSection("Write phase"), ["`archived fact lines dropped`"]);
    const w = await world();
    const id = await openCleanup(w.root, "Tidy the Atlas archive.");
    const original = await read(w.root, archiveRel("projects/atlas.md"));
    await put(w.root, archiveRel("projects/atlas.md"), original.replace(`${w.lines.archive[0]}\n`, ""));
    await put(w.root, pagesRel(`sources/${id}.md`), sourcePage(id));
    const res = await run(w.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.command).toBe("ingest finish");
    expect(res.json.error.details.archived_dropped).toEqual([{ path: "projects/atlas.md", line: w.lines.archive[0] }]);
    expect(res.json.error.details.dropped).toEqual([]);
    expect(await exists(w.root, ".wiki/.lock")).toBe(true);
    await put(w.root, archiveRel("projects/atlas.md"), original);
    const again = await run(w.root, ["ingest", "finish", id, "--json"]);
    expect(again.code, `${again.text} ${again.err}`).toBe(0);
  }, T);

  it("pages/projects/beta.md deleted with its lines nowhere else: fact lines dropped names the page and lines; archive them unchanged, then exit 0", async () => {
    expectPhrases(await wikiSection("Write phase"), ["Before you delete a page"]);
    const w = await world();
    const id = await openCleanup(w.root, "Remove Beta.");
    const original = await read(w.root, pagesRel("projects/beta.md"));
    await rm(path.join(w.root, pagesRel("projects/beta.md")));
    await put(w.root, pagesRel(`sources/${id}.md`), sourcePage(id));
    const res = await run(w.root, ["ingest", "finish", id, "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.command).toBe("ingest finish");
    expect(res.json.error.details.dropped).toEqual(w.lines.beta.map((line) => ({ path: "projects/beta.md", line })));
    expect(res.json.error.details.archived_dropped).toEqual([]);
    expect(await exists(w.root, ".wiki/.lock")).toBe(true);
    await put(w.root, archiveRel("projects/beta.md"), original);
    const again = await run(w.root, ["ingest", "finish", id, "--json"]);
    expect(again.code, `${again.text} ${again.err}`).toBe(0);
  }, T);

  it("every fact line of people/design-lead.md copied to people/designer.md, design-lead.md deleted: exit 0", async () => {
    expectPhrases(await wikiSection("Write phase"), ["copy each of its fact lines unchanged to the page it merges into"]);
    const w = await world();
    const id = await openCleanup(w.root, "Merge the duplicate design lead page into the designer page.");
    const designer = await read(w.root, pagesRel("people/designer.md"));
    await put(w.root, pagesRel("people/designer.md"), withSource(designer, id).replace(/\n$/, "") + "\n" + w.lines.lead.join("\n") + "\n");
    await rm(path.join(w.root, pagesRel("people/design-lead.md")));
    await put(w.root, pagesRel(`sources/${id}.md`), sourcePage(id));
    const res = await run(w.root, ["ingest", "finish", id, "--json"]);
    expect(res.code, `${res.text} ${res.err}`).toBe(0);
  }, T);
});

// ---------- S4: the status guidance matches what status reports ----------
describe("STORY-008-06 S4: the status guidance matches what status reports", () => {
  it("bullets equal the keys of status --json; archive_candidates lists the shipped page with reason final_status; the bullet names exactly size and final_status", async () => {
    const section = await wikiSection("Lint and status");
    const bullets = [...new Set(statusFields(section))].sort();
    expect(bullets).toContain("archive");
    expect(bullets).toContain("archive_candidates");
    const root = await repo();
    await seed(root, {
      "projects/gamma.md": (id) => pageText({ title: "Gamma", sources: [id], head: ["status:: shipped"], lines: [`- 2026-09-03 · decided · gamma shipped. [[${id}]]`] }),
    });
    const now = new Date("2026-10-18T10:00:00Z"); // 45 days after the newest fact; lint.stale_after_days defaults to 30
    const st = await run(root, ["status", "--json"], { commands: [createStatusCommand({ now: () => now })] });
    expect(st.json?.ok, `${st.text} ${st.err}`).toBe(true);
    expect(bullets).toEqual(Object.keys(st.json.data).sort());
    const cands = st.json.data.archive_candidates as Array<{ path: string; reason: string }>;
    expect(cands.find((c) => c.path === "projects/gamma.md")?.reason).toBe("final_status");
    const bullet = flat(lineStarting(section, "- `archive_candidates`: "));
    const after = bullet.slice(bullet.indexOf("`reason`"), bullet.indexOf("Tell the user"));
    const reasons = [...after.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!).filter((r) => r !== "reason");
    expect([...new Set(reasons)].sort()).toEqual(["final_status", "size"]);
  }, T);
});

// ---------- S5: a form the CLI does not have, or a missing one, fails the checks ----------
describe("STORY-008-06 S5: a form the CLI does not have, or a missing one, fails the checks", () => {
  async function copyTemplates(): Promise<string> {
    const d = await tmp("wk-archive-tpl-");
    await cp(templatesDir(), d, { recursive: true });
    return d;
  }
  it("WIKI.md section Search naming `wikeeper search --archived` is reported with its line", async () => {
    const d = await copyTemplates();
    const file = path.join(d, "system", "WIKI.md");
    const text = lf(await readFile(file, "utf8"));
    const marker = "## Search\n\n";
    const at = text.indexOf(marker);
    expect(at).toBeGreaterThan(0);
    const line = text.slice(0, at + marker.length).split("\n").length;
    await writeFile(file, text.replace(marker, `${marker}Try \`wikeeper search --archived\`.\n\n`));
    const findings = (await checkCommands(d)).map(formatFinding);
    expect(findings).toContain(`system/WIKI.md:${line} — "--archived" is not an option of "search"`);
  }, T);

  it("DOCUMENTED_FORMS holds search --archive, the templates name it, and a copy that does not is reported", async () => {
    expect(DOCUMENTED_FORMS).toContain("search --archive");
    expect((await checkCoverage(templatesDir())).map((f) => f.message)).not.toContain('"wikeeper search --archive" is named by no template');
    const d = await copyTemplates();
    for (const f of await allTemplateFiles(d)) {
      if (!/\.(md|toml|json)$/.test(f)) continue;
      const p = path.join(d, ...f.split("/"));
      const t = await readFile(p, "utf8");
      if (t.includes("--archive")) await writeFile(p, t.replace(/--archive(?![\w-])/g, "--arch"));
    }
    expect((await checkCoverage(d)).map((f) => f.message)).toContain('"wikeeper search --archive" is named by no template');
  }, T);
});
