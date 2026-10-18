import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateFacts } from "../../src/ingest/facts.js";
import { pageEntities, parsePage } from "../../src/wiki/parse-page.js";

// Red tests for STORY-006-04: WIKI.md, the wiki protocol.
const PKG = path.resolve(import.meta.dirname, "..", "..");
const WIKI = path.join(PKG, "templates", "system", "WIKI.md");

const SECTIONS = [
  "Ingest",
  "Register",
  "Triage and extract",
  "Write phase",
  "Facts file",
  "Brief",
  "Page format",
  "Delegation",
  "Ambient offers",
  "Search",
  "Answering questions",
  "Proposing rule changes",
  "Lint and status",
  "Log and index",
];
const COMMANDS = new Set(["init", "update", "remove", "doctor", "setup", "hook", "ingest", "index", "search", "read", "lint", "status", "rules", "config", "statusline", "upgrade"]);
const VERBS = new Set(["start", "plan", "facts", "apply", "finish", "abort"]);

async function readWiki(): Promise<string> {
  let raw: string;
  try {
    raw = await readFile(WIKI, "utf8");
  } catch (e) {
    throw new Error(`not yet implemented: templates/system/WIKI.md (${(e as Error).message})`);
  }
  return raw.replace(/\r\n/g, "\n");
}

interface Fence { info: string; body: string }
interface Section { name: string; text: string; fences: Fence[] }

/** Split on `## ` headings outside fenced code; a fence opens on a line starting with ``` and closes on the next such line. */
function splitSections(text: string): { headings: string[]; sections: Section[] } {
  const sections: Section[] = [];
  let cur: Section | null = null;
  let fence: Fence | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      if (fence === null) {
        fence = { info: line.slice(3).trim(), body: "" };
      } else {
        cur?.fences.push(fence);
        fence = null;
      }
      if (cur) cur.text += line + "\n";
      continue;
    }
    if (fence !== null) {
      fence.body += line + "\n";
      if (cur) cur.text += line + "\n";
      continue;
    }
    const m = /^## (.+)$/.exec(line);
    if (m) {
      cur = { name: m[1]!.trim(), text: "", fences: [] };
      sections.push(cur);
      continue;
    }
    if (cur) cur.text += line + "\n";
  }
  return { headings: sections.map((s) => s.name), sections };
}

/** Every `wikeeper <word>` and `wikeeper ingest <verb>` that is outside the SPRINT-03 vocabulary. */
function checkVocabulary(text: string): Array<{ ref: string; line: number }> {
  const out: Array<{ ref: string; line: number }> = [];
  text.split("\n").forEach((l, i) => {
    for (const m of l.matchAll(/\bwikeeper\s+([a-z][a-z-]*)/g)) {
      if (!COMMANDS.has(m[1]!)) out.push({ ref: `wikeeper ${m[1]}`, line: i + 1 });
    }
    for (const m of l.matchAll(/\bwikeeper ingest ([a-z]+)/g)) {
      if (!VERBS.has(m[1]!)) out.push({ ref: `wikeeper ingest ${m[1]}`, line: i + 1 });
    }
  });
  return out;
}

async function section(name: string): Promise<Section> {
  const s = splitSections(await readWiki()).sections.find((x) => x.name === name);
  if (!s) throw new Error(`not yet implemented: section "${name}" is missing from WIKI.md`);
  return s;
}

async function fence(sectionName: string, info: string, nth = 0): Promise<string> {
  const f = (await section(sectionName)).fences.filter((x) => x.info === info)[nth];
  if (!f) throw new Error(`not yet implemented: no ${info} fence #${nth} in section "${sectionName}"`);
  return f.body;
}

const TERMS: Array<[string, string[]]> = [
  ["Ingest", ["shared", "directory", "link", "ambient"]],
  ["Register", ["wikeeper ingest start", "--kind", "--text-file", "--reingest", "--approved", "wikeeper ingest plan"]],
  ["Triage and extract", [".wiki/index.md", "wikeeper search", ".wiki/kb_instructions.md", "wikeeper ingest facts"]],
  [
    "Write phase",
    [
      "wikeeper ingest apply",
      "[[<id>]]",
      "sources/<id>.md",
      ".wiki/system/templates/source.md",
      "Page format",
      "wikeeper ingest finish",
      "wikeeper ingest abort",
    ],
  ],
  ["Facts file", [".wiki/system/schemas/facts.schema.json"]],
  ["Brief", ["user said", "resolved", "focus"]],
  ["Page format", ["aliases", "type::", "decided", "tentative"]],
  ["Delegation", ["wiki-extractor", "wiki-writer", "ingest.delegate"]],
  ["Ambient offers", ["wikeeper ingest start -", "ingest.ambient_offers"]],
  ["Search", ["--type", "--where", "--status", "--entity", "--since", "--misses"]],
  ["Answering questions", ["[[src-", "miss"]],
  [
    "Proposing rule changes",
    [".wiki/kb_instructions.md", "changelog", "version", "rejected", ".wiki/system/ONBOARDING.md"],
  ],
  ["Log and index", ["log/", "log.md", "gitignored", "index.md", "wikeeper index rebuild"]],
];

describe("STORY-006-04 S1: every section exists, in order, with its required terms", () => {
  it("has exactly the fourteen sections in order", async () => {
    expect(splitSections(await readWiki()).headings).toEqual(SECTIONS);
  });

  it.each(TERMS)("section %s contains its terms", async (name, terms) => {
    const s = await section(name);
    for (const t of terms) expect(s.text, `${name}: ${t}`).toContain(t);
  });
});

describe("STORY-006-04 S2: one SPRINT-03 vocabulary and the right phase order", () => {
  it("every wikeeper reference is in the vocabulary", async () => {
    const text = await readWiki();
    expect(text.length).toBeGreaterThan(200);
    expect(checkVocabulary(text)).toEqual([]);
  });

  it("apply appears before finish in the Write phase", async () => {
    const t = (await section("Write phase")).text;
    expect(t.indexOf("wikeeper ingest apply")).toBeGreaterThanOrEqual(0);
    expect(t.indexOf("wikeeper ingest finish")).toBeGreaterThan(t.indexOf("wikeeper ingest apply"));
  });

  it("Register names exit code 3 with --approved and exit code 4", async () => {
    const t = (await section("Register")).text;
    expect(t).toContain("exit code 3");
    expect(t).toContain("--approved");
    expect(t).toContain("exit code 4");
  });

  it("has an LF final newline and at most 400 lines", async () => {
    const text = await readWiki();
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n").length - 1).toBeGreaterThan(20);
    expect(text.split("\n").length - 1).toBeLessThanOrEqual(400);
  });
});

describe("STORY-006-04 S3: embedded examples are valid", () => {
  it("facts JSON is accepted by validateFacts", async () => {
    const r = validateFacts(JSON.parse(await fence("Facts file", "json")));
    expect(r.ok).toBe(true);
  });

  it("single-entity page parses with decided, tentative and contradiction facts and a typed link", async () => {
    const page = parsePage(await fence("Page format", "md", 0), "projects/atlas.md");
    expect(page.errors).toEqual([]);
    expect(page.facts.some((f) => f.status === "decided")).toBe(true);
    expect(page.facts.some((f) => f.status === "tentative" && !f.contradiction)).toBe(true);
    expect(page.facts.some((f) => f.contradiction)).toBe(true);
    expect(page.typedLinks.length).toBeGreaterThan(0);
    for (const f of page.facts) expect(f.sources.length).toBeGreaterThan(0);
    const ents = pageEntities(page);
    expect(ents.some((e) => e.kind === "page" && e.type === "project")).toBe(true);
  });

  it("multi-entry page has at least two section entities typed by their own type:: and aliases:: links", async () => {
    const page = parsePage(await fence("Page format", "md", 1), "risks.md");
    expect(page.errors).toEqual([]);
    const sections = pageEntities(page).filter((e) => e.kind === "section");
    expect(sections.length).toBeGreaterThanOrEqual(2);
    for (const e of sections) {
      const keys = e.typedLinks.map((l) => l.key);
      expect(keys).toContain("type");
      expect(keys).toContain("aliases");
    }
    expect(page.frontmatter.type).not.toBe("risk");
  });

  it("has exactly two md fences in Page format, one json in Facts file, one text in Brief", async () => {
    expect((await section("Page format")).fences.filter((f) => f.info === "md")).toHaveLength(2);
    expect((await section("Facts file")).fences.filter((f) => f.info === "json")).toHaveLength(1);
    expect((await section("Brief")).fences.filter((f) => f.info === "text")).toHaveLength(1);
  });

  it("brief has the fields ingest, facts, user said, resolved and focus", async () => {
    const lines = (await fence("Brief", "text")).split("\n").filter((l) => l.trim() !== "");
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => l.split(":")[0])).toEqual(["ingest", "user said", "resolved", "focus"]);
    expect(lines[0]).toContain("facts:");
  });
});

describe("STORY-006-04 S4: delegation covers every ingest case and the fallback", () => {
  it("table has the four rows", async () => {
    const t = (await section("Delegation")).text;
    const firstCells = t
      .split("\n")
      .filter((l) => l.trim().startsWith("|"))
      .map((l) => l.trim().split("|")[1]?.trim() ?? "");
    for (const c of ["File shared in chat", "Something said in chat", "Directory", "Link"]) {
      expect(firstCells, c).toContain(c);
    }
  });

  it("states the extractor/writer roles and the fallback", async () => {
    const t = (await section("Delegation")).text;
    for (const s of [
      "never writes pages",
      "wikeeper ingest apply",
      "wikeeper ingest finish",
      "main agent runs both phases",
      "ingest.delegate",
      "never",
      "cannot delegate",
    ]) {
      expect(t, s).toContain(s);
    }
  });
});

describe("STORY-006-04 S5: a command that does not exist fails the vocabulary check", () => {
  it("names wikeeper publish and its line number", async () => {
    const text = (await readWiki()) + "Run `wikeeper publish` after every ingest.\n";
    const lines = text.split("\n");
    const n = lines.findIndex((l) => l.includes("wikeeper publish")) + 1;
    expect(checkVocabulary(text)).toEqual([{ ref: "wikeeper publish", line: n }]);
  });

  it("flags a bad ingest verb", () => {
    expect(checkVocabulary("a\nwikeeper ingest read x\n")).toEqual([{ ref: "wikeeper ingest read", line: 2 }]);
  });
});
