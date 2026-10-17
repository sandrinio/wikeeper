import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSourceKinds } from "../../src/ingest/kind-rules.js";
import { resolvePaths } from "../../src/core/paths.js";
import {
  KB_ISSUE_CODES,
  KB_PROPOSAL_SECTION_KEYS,
  KB_SECTION_KEYS,
  loadInstructions,
  parseInstructions,
} from "../../src/kb/parse-instructions.js";

const SEED = path.resolve("templates/kb_instructions.management.md");
const REAL = path.resolve("test/fixtures/kb/real-management.md");

async function readLf(file: string): Promise<string> {
  return (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
}

function replaceLine(text: string, n: number, value: string): string {
  const lines = text.split("\n");
  lines[n - 1] = value;
  return lines.join("\n");
}

const SEVEN = [
  "questions",
  "entities",
  "capture-signals",
  "source-kinds",
  "write-policy",
  "never-capture",
  "rule-changelog",
];

describe("frozen lists", () => {
  it("pins the section, proposal and issue lists", () => {
    expect([...KB_SECTION_KEYS]).toEqual(SEVEN);
    expect([...KB_PROPOSAL_SECTION_KEYS]).toEqual([
      "questions",
      "entities",
      "capture-signals",
      "write-policy",
      "never-capture",
    ]);
    expect([...KB_ISSUE_CODES]).toEqual([
      "unknown-question-ref",
      "malformed-question",
      "malformed-entity",
      "ambiguous-line",
      "missing-section",
    ]);
  });
});

describe("S1: the seed and a real file parse with no issues", () => {
  const rows: Array<{ name: string; load: () => Promise<string>; counts: number[] }> = [
    { name: "seed", load: () => readLf(SEED), counts: [0, 0, 0, 0, 0, 4] },
    { name: "real file", load: () => readLf(REAL), counts: [7, 6, 5, 3, 2, 6] },
    {
      name: "real file with CRLF and a BOM",
      load: async () => "﻿" + (await readLf(REAL)).replace(/\n/g, "\r\n"),
      counts: [7, 6, 5, 3, 2, 6],
    },
  ];
  it.each(rows)("$name", async ({ load, counts }) => {
    const text = await load();
    const kb = parseInstructions(text);
    expect(kb.purpose).toBe("management");
    expect(kb.sections.map((s) => s.key)).toEqual(SEVEN);
    expect(kb.sections).toHaveLength(7);
    expect([
      kb.questions.length,
      kb.entities.length,
      kb.kinds.length,
      kb.notes.length,
      kb.changelog.length,
      kb.neverCapture.length,
    ]).toEqual(counts);
    expect(kb.issues).toEqual([]);
    expect(kb.kinds).toEqual(parseSourceKinds(text));
    for (const s of kb.sections) expect(KB_SECTION_KEYS as readonly string[]).toContain(s.key);
  });
});

describe("S2: line format", () => {
  const text = [
    "# Knowledge Base Instructions",
    "",
    "purpose: management",
    "note: drafted with the user",
    "",
    "## Questions this wiki must answer",
    "",
    "Q1 What is initiative X for?",
    "Q04. What changed since <date>? (Dated facts)",
    "- Q5: What is planned next?",
    "",
    "## Entities",
    "",
    "### Planning",
    "milestone what, initiative, target date, status -> roadmap.md Q4, q5",
    "- term → glossary.md Q1",
    "",
    "## Capture signals",
    "",
    "- Decisions.",
    "",
    "## Source kinds",
    "",
    "roadmap (v2) → milestone",
    "note: a SPRINT-NN is a milestone → never an initiative",
    "",
    "## Write policy",
    "",
    "- Tentative facts never change the summary.",
    "",
    "## Never capture",
    "",
    "- Compensation.",
    "",
    "## Rule changelog",
    "",
    "- 2026-10-17: roadmap v2: sprints are milestones",
    "2026-10-16  meeting-notes v2: + attendees",
    "",
  ].join("\n");

  it("parses questions, entities, kinds, notes and changelog", () => {
    const kb = parseInstructions(text);
    expect(kb.issues).toEqual([]);
    expect(kb.questions.map((q) => q.id)).toEqual(["Q1", "Q4", "Q5"]);
    const q4 = kb.questions[1]!;
    expect(q4.datedFacts).toBe(true);
    expect(q4.text).toBe("What changed since <date>?");
    expect(kb.questions[0]!.datedFacts).toBe(false);
    expect(kb.questions[2]!.text).toBe("What is planned next?");
    const milestone = kb.entities.find((e) => e.name === "milestone")!;
    expect(milestone.fields).toEqual(["what", "initiative", "target date", "status"]);
    expect(milestone.page).toBe("roadmap.md");
    expect(milestone.questionRefs).toEqual(["Q4", "Q5"]);
    const term = kb.entities.find((e) => e.name === "term")!;
    expect(term.fields).toEqual([]);
    expect(term.page).toBe("glossary.md");
    expect(term.questionRefs).toEqual(["Q1"]);
    expect(kb.entities).toHaveLength(2);
    expect(kb.kinds).toHaveLength(1);
    expect(kb.kinds[0]!.id).toBe("roadmap");
    expect(kb.kinds[0]!.version).toBe(2);
    expect(kb.kinds).toEqual(parseSourceKinds(text));
    expect(kb.notes.map((n) => [n.section, n.text])).toEqual([
      ["", "drafted with the user"],
      ["source-kinds", "a SPRINT-NN is a milestone → never an initiative"],
    ]);
    expect(kb.changelog.map((c) => [c.date, c.text])).toEqual([
      ["2026-10-17", "roadmap v2: sprints are milestones"],
      ["2026-10-16", "meeting-notes v2: + attendees"],
    ]);
  });
});

describe("S3: lines the parser cannot read are reported as issues", () => {
  type Row = {
    base: "real" | "seed";
    line: number;
    value: string;
    code: string;
    at: number;
    names: string;
    check: (kb: ReturnType<typeof parseInstructions>, line: number) => void;
  };
  const nothingAt = (kb: ReturnType<typeof parseInstructions>, line: number) => {
    expect(kb.questions.some((q) => q.line === line)).toBe(false);
    expect(kb.entities.some((e) => e.line === line)).toBe(false);
    expect(kb.notes.some((n) => n.line === line)).toBe(false);
  };
  const rows: Row[] = [
    { base: "real", line: 14, value: "Q8", code: "malformed-question", at: 14, names: "Q8", check: nothingAt },
    {
      base: "real",
      line: 6,
      value: "See the roadmap → for dates",
      code: "ambiguous-line",
      at: 6,
      names: "note:",
      check: nothingAt,
    },
    {
      base: "real",
      line: 23,
      value: "risk owner, impact → risks.md Q6 and Q7",
      code: "malformed-entity",
      at: 23,
      names: "<page>",
      check: nothingAt,
    },
    {
      base: "real",
      line: 23,
      value: "risk owner, impact → risks.md Q6 Q9",
      code: "unknown-question-ref",
      at: 23,
      names: "Q9",
      check: (kb) => {
        const risk = kb.entities.find((e) => e.name === "risk")!;
        expect(risk.questionRefs).toEqual(["Q6", "Q9"]);
      },
    },
    {
      base: "real",
      line: 44,
      value: "Use roadmap → milestone for sprints",
      code: "ambiguous-line",
      at: 44,
      names: "note:",
      check: nothingAt,
    },
    {
      base: "seed",
      line: 9,
      value: "## Entity list",
      code: "missing-section",
      at: 0,
      names: "## Entities",
      check: nothingAt,
    },
  ];
  it.each(rows)("$code at line $at ($names)", async ({ base, line, value, code, at, names, check }) => {
    const text = replaceLine(await readLf(base === "real" ? REAL : SEED), line, value);
    const kb = parseInstructions(text);
    expect(kb.issues).toHaveLength(1);
    const issue = kb.issues[0]!;
    expect(issue.code).toBe(code);
    expect(issue.line).toBe(at);
    expect(issue.message).toContain(names);
    check(kb, line);
  });
});

describe("S4: code blocks, HTML comments and inline code are not rules", () => {
  const lines = [
    "# Knowledge Base Instructions",
    "",
    "purpose: management",
    "",
    "## Questions this wiki must answer",
    "",
    "Q1 What is initiative X for?",
    "",
    "## Entities",
    "",
    "```",
    "person role → people.md Q1",
    "```",
    "<!-- team role → team.md Q1 -->",
    "Each line reads `<entity> <fields> → <page> <question refs>`.",
    "",
    "## Source kinds",
    "",
    "<!--",
    "meeting-notes (v1) → decision",
    "--> note: kept after the comment",
    "",
  ];
  const text = lines.join("\n");
  it("reads none of them, and flags the commented kind line", () => {
    const kb = parseInstructions(text);
    const kindLine = lines.indexOf("meeting-notes (v1) → decision") + 1;
    expect(kb.entities).toEqual([]);
    expect(kb.notes.map((n) => [n.section, n.text])).toEqual([
      ["entities", "Each line reads `<entity> <fields> → <page> <question refs>`."],
      ["source-kinds", "kept after the comment"],
    ]);
    expect(kb.kinds).toEqual(parseSourceKinds(text));
    expect(kb.kinds).toHaveLength(1);
    expect(kb.kinds[0]!.id).toBe("meeting-notes");
    expect(kb.kinds[0]!.version).toBe(1);
    expect(kb.kinds[0]!.line).toBe(kindLine);
    const flagged = kb.issues.filter((i) => i.code === "ambiguous-line");
    expect(kb.issues).toHaveLength(1);
    expect(flagged[0]!.line).toBe(kindLine);
    expect(flagged[0]!.message).toContain("ingest still reads it");
  });
});

describe("S5: loadInstructions", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });
  async function fresh(contentDir: string) {
    const root = await mkdtemp(path.join(os.tmpdir(), "kbload-"));
    dirs.push(root);
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    return { root, paths: resolvePaths(root, { content_dir: contentDir }) };
  }

  it("reads the seed at .wiki/kb_instructions.md", async () => {
    const { root, paths } = await fresh(".wiki");
    const text = await readFile(SEED, "utf8");
    await writeFile(path.join(root, ".wiki", "kb_instructions.md"), text);
    const out = await loadInstructions(paths);
    expect(out).not.toBeNull();
    expect(out!.text).toBe(text);
    expect(out!.kb.questions).toHaveLength(0);
    expect(out!.kb.issues).toEqual([]);
  });

  it("reads the real file under a moved content_dir", async () => {
    const { root, paths } = await fresh("wiki");
    const text = await readFile(REAL, "utf8");
    await writeFile(path.join(root, ".wiki", "kb_instructions.md"), text);
    const out = await loadInstructions(paths);
    expect(out).not.toBeNull();
    expect(out!.text).toBe(text);
    expect(out!.kb.questions).toHaveLength(7);
    expect(out!.kb.issues).toEqual([]);
  });

  it("returns null when the file is missing", async () => {
    const { paths } = await fresh(".wiki");
    expect(await loadInstructions(paths)).toBeNull();
  });

  it("rejects with EISDIR when a directory sits at the path", async () => {
    const { root, paths } = await fresh(".wiki");
    await mkdir(path.join(root, ".wiki", "kb_instructions.md"));
    await expect(loadInstructions(paths)).rejects.toMatchObject({ code: "EISDIR" });
  });
});
