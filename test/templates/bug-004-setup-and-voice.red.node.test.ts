import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { normaliseBlock } from "../../src/agents/inject.js";
import { SHIPPED_BLOCKS } from "../../src/agents/shipped-blocks.js";
import { templatesDir } from "../../src/core/templates.js";
import { runCli } from "../../src/program.js";

// Red tests for BUG-004: setup measures a named document before reading it, gives only measured sizes,
// the agent speaks in plain words (one pointer per instruction file, one step numbering), line 4 puts the
// size line before any text, and init/update write the new block.
// Texts are plans/M7.md section 1 verbatim. No hash literal of the new block or of a template file here:
// the re-scoped red files and test/agents/shipped-blocks.test.ts pin those.

const PKG = path.resolve(import.meta.dirname, "..", "..");
const LINE_4_BUG_004 =
  "Once set up, start each session with `wikeeper statusline` and write its line before any other step or text; on 🔴 follow WIKI.md \"Lint and status\".";
const VOICE = "Talk to the user in plain words: `.wiki/system/WIKI.md`, section \"Talking to the user\".";
const TALK_Q3 =
  "The commands, flags, codes, JSON and settings keys and wikeeper's own file names in these instructions are for you, not for the user. Never say one to the user, and never ask the user to run a command: run it yourself, after their yes where one is needed, and tell them in plain words what you did or found. You may name the user's own files (`me.md`, `project.md`, `config.yml`, `kb_instructions.md`) when you show or change one. The one exception is a step only the user can take, such as a command you must never run (section \"Lint and status\"): show that one command in a code span and say why you can't run it.";
const DOCTOR =
  "When the user says you did not use their name, their preferences or the project brief, run `wikeeper doctor` yourself, tell them in plain words what it found, and fix it with their approval.";
const SHA_SPRINT_03 = "c6fc17d0ef7079d7cf7e6f88f6e5c28e8152cdb74880118167bb29eaf333e168";
const SHA_BUG_003 = "74d67dd01401ffe3477d331f98c57512e51056fd5557b37775c79663d2d2ba06";
const TEAM = "# Team rules\n\nKeep it short.\n";
const START_RE = /^<!-- WIKI:START\b.*-->$/m;
const END = "<!-- WIKI:END -->";

const lf = (s: string): string => s.replace(/\r\n/g, "\n");
const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const cleanup: string[] = [];
afterEach(async () => {
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

const shippedBy = (pin: string): string => {
  const b = SHIPPED_BLOCKS.find((x) => sha(x) === pin);
  expect(b, `SHIPPED_BLOCKS lost the entry ${pin}`).toBeDefined();
  return b!;
};

async function readTemplateRaw(...rel: string[]): Promise<string> {
  return lf(await readFile(path.join(templatesDir(), ...rel), "utf8"));
}
async function expectedBlock(): Promise<string> {
  return normaliseBlock(await readTemplateRaw("agent-block.md"));
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

interface Step { n: number; title: string; body: string }

/** Splits SETUP.md or ONBOARDING.md on "## N. " headings outside fences. */
function steps(text: string): { opening: string; steps: Step[] } {
  const out: Step[] = [];
  let opening = "";
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^```/.test(line)) fenced = !fenced;
    const m = !fenced ? /^## (\d+)\. (.+?)\s*$/.exec(line) : null;
    if (m) out.push({ n: Number(m[1]), title: m[2]!, body: "" });
    else if (out.length > 0) out[out.length - 1]!.body += line + "\n";
    else opening += line + "\n";
  }
  return { opening, steps: out };
}
function stepBody(text: string, n: number): string {
  const s = steps(text).steps.find((x) => x.n === n);
  expect(s, `no step ${n}`).toBeDefined();
  return s!.body;
}
function sectionText(text: string, name: string): string {
  const s = splitSections(text).find((x) => x.name === name);
  expect(s, `no section "${name}"`).toBeDefined();
  return s!.text;
}
const skillBody = (raw: string): string => raw.replace(/^---\n[\s\S]*?\n---\n/, "");

async function drive(root: string, args: string[]) {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, json, out };
}
const file = (root: string, rel: string) => path.join(root, ...rel.split("/"));
const readText = (root: string, rel: string) => readFile(file(root, rel), "utf8");

async function repoWith(teamFile: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-bug004-"));
  cleanup.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await writeFile(file(root, teamFile), TEAM);
  return root;
}

function span(text: string): { start: number; end: number } {
  const m = START_RE.exec(text);
  if (!m) throw new Error("no START line");
  const endIdx = text.indexOf(END, m.index);
  if (endIdx < 0) throw new Error("no END line");
  return { start: m.index, end: endIdx + END.length };
}
function withBlock(text: string, block: string): string {
  const s = span(text);
  return text.slice(0, s.start) + block + text.slice(s.end);
}

/** SHIPPED_BLOCKS ends with the block (appended, not edited), the pin test holds its sha256, and line 4 is Q6's (the canary). */
async function staticAsserts(expected: string): Promise<void> {
  expect(SHIPPED_BLOCKS.at(-1)).toBe(expected);
  shippedBy(SHA_BUG_003);
  shippedBy(SHA_SPRINT_03);
  const pinTest = lf(await readFile(path.resolve(PKG, "test", "agents", "shipped-blocks.test.ts"), "utf8"));
  expect(pinTest).toContain(`"${sha(expected)}"`);
  expect(expected.split("\n")[3]).toBe(LINE_4_BUG_004);
}

/** WIKI.md has the section "Talking to the user" right after the opening paragraph, holding Q3's text. */
async function talkingSection(): Promise<void> {
  const sections = splitSections(await readTemplateRaw("system", "WIKI.md"));
  expect(sections.filter((s) => s.name === "Talking to the user")).toHaveLength(1);
  expect(sections[0]!.name).toBe("Talking to the user");
  expect(sections[0]!.text).toContain(TALK_Q3);
  const own = /own files \(([^)]*)\)/.exec(TALK_Q3);
  expect(own, "TALK_Q3 names no own files").not.toBeNull();
  const named = [...own![1]!.matchAll(/`([^`]+)`/g)].map((m) => m[1]!).sort();
  const blockLines = (await readTemplateRaw("agent-block.md")).split("\n");
  const edit = blockLines.find((l) => l.startsWith("You may edit"));
  expect(edit, "pointer block has no 'You may edit' line").toBeDefined();
  const allowed = [...edit!.matchAll(/`\.wiki\/([^`]+)`/g)].map((m) => m[1]!).sort();
  expect(named).toEqual(allowed);
}

describe("BUG-004: setup measures a document before reading it, and the agent speaks in plain words", () => {
  it(
    "S1: SETUP.md step 2 measures a named document with read before reading it, step 7 and WIKI.md give only printed sizes",
    { timeout: 60_000 },
    async () => {
      // Live half: read measures and stores nothing (Q1's premise).
      const root = await repoWith("CLAUDE.md");
      expect((await drive(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
      await mkdir(file(root, "docs"), { recursive: true });
      await writeFile(file(root, "docs/brief.md"), "# Brief\n\nThe project ships a small report tool for the finance team.\n\n- Owner: the product lead\n- Launch: next quarter\n");
      await writeFile(file(root, "docs/owners.csv"), "area,owner\npayments,the product lead\nreports,the data lead\n");
      const outDir = await mkdtemp(path.join(os.tmpdir(), "wk-bug004-out-"));
      cleanup.push(outDir);
      const cases: Array<[string, string, string]> = [
        ["docs/brief.md", "markdown", "read-1.md"],
        ["docs/owners.csv", "text", "read-2.md"],
      ];
      for (const [src, format, outName] of cases) {
        const r = await drive(root, ["read", file(root, src), "--out", path.join(outDir, outName)]);
        expect(r.code, r.out).toBe(0);
        const re = new RegExp(`^wrote .+ \\(≈\\S+ tokens (🟢|🟡|🔴) · .+ · ${format}\\)$`, "u");
        expect(r.out.trim()).toMatch(re);
      }
      const st = await drive(root, ["status", "--json"]);
      expect(st.json.data.unfinished_sources).toEqual([]);
      expect(await readdir(file(root, ".wiki/raw"))).toEqual([".gitkeep"]);

      // Text half.
      const setup = await readTemplateRaw("system", "SETUP.md");
      const step2 = stepBody(setup, 2);
      for (const phrase of [
        "`wikeeper read <file|url> --out <file>`",
        "markdown, text and CSV files too",
        "a new file in the system temp directory",
        "`likely_scanned`",
        "Tell the user the size and its level",
        "`tokens.source.confirm_at`",
        "ask before you read the text",
        "the parts the user picks",
        "Draft from the file `read` wrote",
      ]) {
        expect(step2, phrase).toContain(phrase);
      }
      expect(stepBody(setup, 7)).toContain(
        "Give a document's size only as wikeeper printed it; until then, say nothing about its size.",
      );
      const wiki = await readTemplateRaw("system", "WIKI.md");
      expect(sectionText(wiki, "Lint and status")).toContain(
        "Give the user only sizes the CLI printed; never estimate one yourself.",
      );
    },
  );

  const rows: Array<[string, string]> = [
    ["S2 row 1: SETUP.md points to \"Talking to the user\"", "system/SETUP.md"],
    ["S2 row 2: ONBOARDING.md points to \"Talking to the user\"", "system/ONBOARDING.md"],
    ["S2 row 3: wiki-ingest points to \"Talking to the user\"", "skills/wiki-ingest/SKILL.md"],
    ["S2 row 4: wiki-search points to \"Talking to the user\"", "skills/wiki-search/SKILL.md"],
    ["S2 row 5: wiki-setup points to \"Talking to the user\"", "skills/wiki-setup/SKILL.md"],
  ];
  for (const [name, rel] of rows) {
    it(name, async () => {
      const raw = await readTemplateRaw(...rel.split("/"));
      const where = rel.startsWith("system/") ? steps(raw).opening : skillBody(raw);
      expect(where).toContain(VOICE);
      await talkingSection();
    });
  }

  it("S3: setup and onboarding ask the user to run nothing, explain the modes in plain words and number steps once", async () => {
    const setup = await readTemplateRaw("system", "SETUP.md");
    const onboarding = await readTemplateRaw("system", "ONBOARDING.md");
    const wiki = await readTemplateRaw("system", "WIKI.md");

    // 1. doctor is the agent's, not the user's
    for (const text of [setup, onboarding]) {
      expect(text).not.toContain("they should run `wikeeper doctor`");
      expect(text).toContain("they can tell you and you will check the setup");
    }
    // 2. the human's addition
    expect(sectionText(wiki, "Talking to the user")).toContain(DOCTOR);
    // 3. step 4: the modes in plain words
    const setup4 = stepBody(setup, 4);
    expect(setup4).toContain("Explain the three modes of `ingest.permission` to the user in plain words, one sentence each");
    expect(setup4).toContain("This table, for you, lists what each mode installs when `enforce` is on.");
    expect(setup4).toContain("only if the user asks what changes in their agent's settings, and then say it in plain words");
    // 4.
    expect(setup).not.toContain("Show this table");
    // 5. one numbering
    expect(steps(setup).opening).toContain("use this file's step numbers: all of ONBOARDING.md is step 1");
    expect(steps(onboarding).opening).toContain("these steps are all its step 1: do not number them to the user");

    // 6. gone
    for (const f of [
      "show the user its report",
      "show the user what `wikeeper ingest start` returned",
      "tell the user the reason;",
      "show the plan with each file's estimate",
      "Show that diff with the proposal.",
      "the re-ingest needs the kind in `ingest.whitelist.kinds` of `.wiki/config.yml`",
    ]) {
      expect(wiki, f).not.toContain(f);
    }
    for (const f of [
      "agree `ingest.whitelist.kinds` and `ingest.whitelist.origins` with the user",
      "quote it to the user",
    ]) {
      expect(setup, f).not.toContain(f);
    }
    expect(onboarding).not.toContain("quote the finding");

    // 7. present, each in its own section or step
    const has = (where: string, phrases: string[]) => {
      for (const p of phrases) expect(where, p).toContain(p);
    };
    has(sectionText(wiki, "Write phase"), [
      "pass on its figures to the user in plain words: pages created and updated, contradictions, rule suggestions and sizes",
      "Never paste the report, and leave out its sha, rule version and permission mode.",
    ]);
    has(sectionText(wiki, "Register"), [
      "ask in chat, telling the user in plain words what needs their yes, never the command's raw output or codes",
      "tell the user in plain words why it was refused; nothing was stored",
      "show the user the plan in plain words, not the command's raw output, with each file's estimate and the total",
    ]);
    has(sectionText(wiki, "Proposing rule changes"), [
      "tell the user in plain words which facts would be added, removed and changed",
    ]);
    has(sectionText(wiki, "Lint and status"), [
      "tell the user in plain words that the re-ingest needs this kind of document",
      "add it to `ingest.whitelist.kinds` only with their approval",
    ]);
    has(stepBody(setup, 3), ["go through its findings with the user in plain words"]);
    has(setup4, [
      "agree with the user, in plain words, which kinds of documents and which places are added without asking",
      "Agree with the user, in plain words, which source kinds chat captures use",
    ]);
    has(stepBody(setup, 6), [
      "tell the user in plain words what doctor found, and follow its `fix:` line yourself with their approval",
      "is yours to run, not the user's",
      "Never run `git rm` or edit `.gitignore` without the user's approval.",
    ]);
    has(stepBody(onboarding, 5), [
      "tell the user in plain words what doctor found and not to commit `me.md`",
      "is yours to run, not the user's",
      "never remove a file from git or edit `.gitignore` without it",
    ]);
  });

  it("S4: line 4 is Q6's text, the block keeps its shape, and WIKI.md says first text", async () => {
    const raw = await readTemplateRaw("agent-block.md");
    const lines = raw.replace(/\n$/, "").split("\n");
    expect(lines).toHaveLength(14);
    for (const l of lines) expect(l.length, `line over 200 UTF-16 units: ${l}`).toBeLessThanOrEqual(200);
    expect(raw).not.toMatch(/wikeeper status(?!line)/);
    expect(lines[3]).toBe(LINE_4_BUG_004);
    for (const phrase of ["Once set up", "start each session", "`wikeeper statusline`", "before any other step or text", "🔴"]) {
      expect(lines[3], phrase).toContain(phrase);
    }
    expect(lines[3]).not.toContain("first reply");
    const wiki = await readTemplateRaw("system", "WIKI.md");
    const sections = splitSections(wiki);
    expect(sectionText(wiki, "Lint and status")).toContain(
      "Run it first in every session and write its line to the user at once, before any other command or text; then go on with the request.",
    );
    expect(wiki).not.toContain("first reply of every session");
    const m = /WIKI\.md "([^"]+)"/.exec(lines[3]!);
    expect(m, "line 4 names no WIKI.md section").not.toBeNull();
    expect(sections.map((s) => s.name)).toContain(m![1]);
  });

  it("S5 row 1: init --agents claude writes the new block into CLAUDE.md", { timeout: 60_000 }, async () => {
    const expected = await expectedBlock();
    const root = await repoWith("CLAUDE.md");
    expect((await drive(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
    expect(await readText(root, "CLAUDE.md")).toBe(expected + "\n\n" + TEAM);
    await staticAsserts(expected);
  });

  it("S5 row 2: init --agents codex writes the new block into AGENTS.md", { timeout: 60_000 }, async () => {
    const expected = await expectedBlock();
    const root = await repoWith("AGENTS.md");
    expect((await drive(root, ["init", "--yes", "--agents", "codex", "--json"])).code).toBe(0);
    expect(await readText(root, "AGENTS.md")).toBe(expected + "\n\n" + TEAM);
    await staticAsserts(expected);
  });

  it("S5 row 3: update replaces the 0.3.0 block in CLAUDE.md", { timeout: 60_000 }, async () => {
    const expected = await expectedBlock();
    const root = await repoWith("CLAUDE.md");
    expect((await drive(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
    const planted = withBlock(await readText(root, "CLAUDE.md"), shippedBy(SHA_SPRINT_03));
    await writeFile(file(root, "CLAUDE.md"), planted, "utf8");
    const s = span(planted);
    const before = planted.slice(0, s.start);
    const after = planted.slice(s.end);
    const u = await drive(root, ["update", "--json"]);
    expect(u.code).toBe(0);
    expect(u.json.data.replaced).toContain("CLAUDE.md#wiki-block");
    expect(await readText(root, "CLAUDE.md")).toBe(before + expected + after);
    await staticAsserts(expected);
  });

  it("S5 row 4: update replaces the BUG-003 block in AGENTS.md", { timeout: 60_000 }, async () => {
    const expected = await expectedBlock();
    const root = await repoWith("AGENTS.md");
    expect((await drive(root, ["init", "--yes", "--agents", "codex", "--json"])).code).toBe(0);
    const planted = withBlock(await readText(root, "AGENTS.md"), shippedBy(SHA_BUG_003));
    await writeFile(file(root, "AGENTS.md"), planted, "utf8");
    const s = span(planted);
    const before = planted.slice(0, s.start);
    const after = planted.slice(s.end);
    const u = await drive(root, ["update", "--json"]);
    expect(u.code).toBe(0);
    expect(u.json.data.replaced).toContain("AGENTS.md#wiki-block");
    expect(await readText(root, "AGENTS.md")).toBe(before + expected + after);
    await staticAsserts(expected);
  });
});
