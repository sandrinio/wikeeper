import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { parseSourceKinds } from "../../src/ingest/kind-rules.js";
import { parsePage } from "../../src/wiki/parse-page.js";

// Red tests for STORY-006-03: profile suggestions, kb_instructions seed, source page template.
const PKG = path.resolve(import.meta.dirname, "..", "..");
const PROFILE = path.join(PKG, "templates", "system", "profiles", "management.md");
const SEED = path.join(PKG, "templates", "kb_instructions.management.md");
const SOURCE_TPL = path.join(PKG, "templates", "system", "templates", "source.md");

const read = (p: string) => readFile(p, "utf8");

function headings(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => /^## /.test(l))
    .map((l) => l.replace(/^## /, "").trim());
}
/** Lines of the "## <heading>" section (after the heading, until the next "## "), with 1-based line numbers. */
function section(text: string, heading: string): { line: number; text: string }[] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) throw new Error(`section not found: ${heading}`);
  const out: { line: number; text: string }[] = [];
  for (let i = start + 1; i < lines.length && !/^## /.test(lines[i]!); i++) out.push({ line: i + 1, text: lines[i]! });
  return out;
}
const body = (text: string, heading: string) => section(text, heading).map((l) => l.text).join("\n");

/** Source-kind check: every non-blank, non-comment line of "## Source kinds" must produce a rule. Returns failures. */
function sourceKindFailures(text: string): { line: number; text: string }[] {
  const rules = parseSourceKinds(text);
  const ruleLines = new Set(rules.map((r) => r.line));
  return section(text, "Source kinds").filter(
    (l) => l.text.trim() !== "" && !l.text.trim().startsWith("<!--") && !ruleLines.has(l.line),
  );
}

describe("STORY-006-03 seed", () => {
  it("keeps purpose and the seven headings in order", async () => {
    const t = await read(SEED);
    expect(t).toMatch(/^purpose: management$/m);
    expect(headings(t)).toEqual([
      "Questions this wiki must answer",
      "Entities",
      "Capture signals",
      "Source kinds",
      "Write policy",
      "Never capture",
      "Rule changelog",
    ]);
  });

  it("drafted sections hold only an HTML comment naming SETUP.md step 3, and no kinds parse", async () => {
    const t = await read(SEED);
    for (const h of ["Questions this wiki must answer", "Entities", "Source kinds"]) {
      const lines = section(t, h).map((l) => l.text.trim()).filter(Boolean);
      expect(lines, h).toHaveLength(1);
      expect(lines[0], h).toMatch(/^<!--.*SETUP\.md.*step 3.*-->$/);
    }
    expect(parseSourceKinds(t)).toEqual([]);
  });

  it("holds general defaults: capture signals, write policy, never capture", async () => {
    const t = await read(SEED);
    const sig = body(t, "Capture signals").toLowerCase();
    for (const w of ["decision", "owner", "status", "deadline", "risk", "term"]) expect(sig).toContain(w);
    const pol = body(t, "Write policy").toLowerCase();
    expect(pol).toMatch(/tentative/);
    expect(pol).toMatch(/contradiction/);
    expect(pol).toMatch(/both sources/);
    const nev = body(t, "Never capture").toLowerCase();
    for (const w of ["compensation", "health", "personal life", "performance"]) expect(nev).toContain(w);
  });

  it("rule changelog has exactly one line", async () => {
    const t = await read(SEED);
    const lines = section(t, "Rule changelog").map((l) => l.text.trim()).filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/management/i);
    expect(lines[0]).toMatch(/v1/);
  });
});

interface EntityLine {
  entity: string;
  fields: string[];
  page: string;
  refs: string[];
}
function parseEntityLine(line: string): EntityLine | null {
  const m = /^(\S+)\s+(.+?)\s*(?:→|->)\s*(\S+)((?:\s+Q\d+)*)\s*$/.exec(line.trim());
  if (!m) return null;
  return {
    entity: m[1]!,
    fields: m[2]!.split(",").map((s) => s.trim()).filter(Boolean),
    page: m[3]!,
    refs: m[4]!.trim().split(/\s+/).filter(Boolean),
  };
}

describe("STORY-006-03 profile", () => {
  it("entity-line parser splits fields, page and refs", () => {
    expect(parseEntityLine("risk owner, likelihood, impact → risks.md Q2 Q4")).toEqual({
      entity: "risk",
      fields: ["owner", "likelihood", "impact"],
      page: "risks.md",
      refs: ["Q2", "Q4"],
    });
    expect(parseEntityLine("no arrow here")).toBeNull();
  });

  it("has the five headings in order, suggestion framing, and no team.md", async () => {
    const t = await read(PROFILE);
    expect(headings(t)).toEqual(["Questions", "Entity types", "Source kinds", "Never capture", "Private pages"]);
    const head = t.slice(0, t.indexOf("\n## ")).toLowerCase();
    expect(head).toContain("suggestion");
    expect(head).toContain(".wiki/project.md");
    expect(head).toContain("setup.md");
    expect(head).toContain("step 3");
    expect(head).toMatch(/no page exists until an ingest writes it/);
    expect(t).not.toContain("team.md");
  });

  it("Questions has at least five Q<n> lines", async () => {
    const t = await read(PROFILE);
    const qs = section(t, "Questions").filter((l) => /^Q\d+\s+\S/.test(l.text));
    expect(qs.length).toBeGreaterThanOrEqual(5);
  });

  it("Entity types covers six entities, each with a page, and questions/entities cross-reference", async () => {
    const t = await read(PROFILE);
    const qIds = section(t, "Questions")
      .map((l) => /^(Q\d+)\s+\S/.exec(l.text)?.[1])
      .filter((x): x is string => !!x);
    const entLines = section(t, "Entity types").filter((l) => l.text.trim() !== "" && !l.text.trim().startsWith("<!--"));
    const entities: EntityLine[] = [];
    for (const l of entLines) {
      const e = parseEntityLine(l.text);
      if (e) entities.push(e);
    }
    expect(entities.map((e) => e.entity).sort()).toEqual(["decision", "feature", "person", "project", "risk", "term"]);
    for (const e of entities) {
      expect(e.page, e.entity).toMatch(/\.md$/);
      expect(e.refs.length, e.entity).toBeGreaterThan(0);
      for (const r of e.refs) expect(qIds, `${e.entity} ref ${r}`).toContain(r);
    }
    const used = new Set(entities.flatMap((e) => e.refs));
    for (const q of qIds) expect(used.has(q), `${q} unreferenced`).toBe(true);
    // placeholder pages hold one entity per page; the profile says so
    expect(entities.some((e) => /<[^>]+>/.test(e.page))).toBe(true);
    expect(entities.some((e) => !/<[^>]+>/.test(e.page))).toBe(true);
    expect(body(t, "Entity types").toLowerCase()).toMatch(/one entity per page/);
    expect(body(t, "Entity types").toLowerCase()).toMatch(/one `?##`? entry per entity|entry per entity/);
  });

  it("Never capture and Private pages carry the privacy defaults", async () => {
    const t = await read(PROFILE);
    const nev = body(t, "Never capture").toLowerCase();
    for (const w of ["compensation", "health", "personal life", "performance"]) expect(nev).toContain(w);
    expect(nev).toContain("ask");
    const priv = body(t, "Private pages");
    expect(priv).toContain("private:");
    expect(priv).toContain("private: [people.md]");
    expect(priv).toContain(".wiki/config.yml");
  });

  it.each(["meeting-notes", "status-report", "prd", "contract", "email-thread", "chat-excerpt"])(
    "suggested source kind %s parses at version 1 with a target",
    async (kind) => {
      const rule = parseSourceKinds(await read(PROFILE)).find((r) => r.id === kind);
      expect(rule, kind).toBeDefined();
      expect(rule!.version).toBe(1);
      expect(rule!.targets.trim().length).toBeGreaterThan(0);
    },
  );

  it("every non-comment Source kinds line of the shipped profile parses", async () => {
    expect(sourceKindFailures(await read(PROFILE))).toEqual([]);
  });

  it("error: a non-parsing source-kind line fails naming the line and its number", async () => {
    const t = await read(PROFILE);
    const lines = t.split("\n");
    const at = lines.findIndex((l) => l.trim() === "## Source kinds");
    expect(at).toBeGreaterThanOrEqual(0);
    lines.splice(at + 1, 0, "Meeting Notes: decisions");
    const failures = sourceKindFailures(lines.join("\n"));
    expect(failures).toEqual([{ line: at + 2, text: "Meeting Notes: decisions" }]);
  });
});

describe("STORY-006-03 source page template", () => {
  it("parses cleanly and cites its source placeholder", async () => {
    const page = parsePage(await read(SOURCE_TPL), "sources/<source-id>.md");
    expect(page.errors).toEqual([]);
    const fm = page.frontmatter;
    expect(fm.type).toBe("source");
    expect(fm.title).toBeTruthy();
    expect(fm.summary).toBeTruthy();
    expect(fm.aliases).toEqual([]);
    expect(fm.sources).toEqual(["<source-id>"]);
    expect(fm.updated).toBeTruthy();
    const heads = page.sections.map((s) => s.heading);
    expect(heads).toContain("Summary");
    expect(heads).toContain("What this source changed");
    expect(page.facts).toEqual([]);
    const link = page.typedLinks.find((l) => l.key === "source");
    expect(link?.targets).toEqual(["<source-id>"]);
  });
});

describe("STORY-006-03 init installs the content", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
  });

  it("init --yes --agents claude installs profile, source template and the seed", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-006-03-"));
    dirs.push(root);
    await mkdir(path.join(root, ".git"));
    const { runCli } = await import("../../src/program.js");
    const code = await runCli(["init", "--yes", "--agents", "claude", "--json"], {
      io: {
        cwd: root,
        stdout: { write: () => true },
        stderr: { write: () => true },
        stdin: Readable.from([]),
      },
    } as never);
    expect(code).toBe(0);
    const profile = await read(path.join(root, ".wiki", "system", "profiles", "management.md"));
    expect(profile).toBe(await read(PROFILE));
    const tpl = await read(path.join(root, ".wiki", "system", "templates", "source.md"));
    expect(tpl).toBe(await read(SOURCE_TPL));
    const seeded = await read(path.join(root, ".wiki", "kb_instructions.md"));
    expect(seeded).toBe(await read(SEED));
    expect(seeded).not.toContain("placeholder");
  });
});
