import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

// Red tests for STORY-006-07: ONBOARDING.md and the me.md template.
const PKG = path.resolve(import.meta.dirname, "..", "..");
const ONBOARDING = path.join(PKG, "templates", "system", "ONBOARDING.md");
const ME_TPL = path.join(PKG, "templates", "system", "templates", "me.md");

const TITLES = [
  "Who the user is",
  "What they use the wiki for",
  "How they like answers",
  "Write me.md",
  "Check that me.md loads",
  "Continue",
];

async function read(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch (e) {
    throw new Error(`not yet implemented: ${path.relative(PKG, file)} (${(e as Error).message})`);
  }
}

interface Step { n: number; title: string; body: string }

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

/** Schema check for the me.md template; returns a list of problems. */
function checkMeSchema(text: string): string[] {
  const problems: string[] = [];
  const lines = text.replace(/\n$/, "").split("\n");
  if (lines.length > 15) problems.push(`too many lines: ${lines.length}`);
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) return [...problems, "no frontmatter"];
  const fm = (parseYaml(m[1]!) ?? {}) as Record<string, unknown>;
  const keys = Object.keys(fm);
  for (const k of keys) if (k !== "type") problems.push(`unexpected frontmatter key "${k}"`);
  if (fm["type"] !== "me") problems.push(`type must be "me"`);
  const body = m[2]!
    .split("\n")
    .filter((l) => l.trim() !== "" && !/^\s*<!--.*-->\s*$/.test(l))
    .map((l) => l.slice(0, l.indexOf(": ")));
  const want = ["name", "address as", "role", "uses the wiki for", "working on", "timezone", "language", "answer style"];
  if (JSON.stringify(body) !== JSON.stringify(want)) problems.push(`body keys ${JSON.stringify(body)}`);
  for (const w of text.match(/\[\[[^\]]*\]\]/g) ?? []) problems.push(`wikilink ${w}`);
  return problems;
}

/** Every `wikeeper <word>` in code or prose. */
function wikeeperCommands(text: string): string[] {
  return [...text.matchAll(/\bwikeeper\s+([a-z][a-z-]*)/g)].map((m) => m[1]!);
}

describe("STORY-006-07 S1: onboarding asks, writes me.md, checks it loads", () => {
  it("has the six step headings in order", async () => {
    const { steps: s } = steps(await read(ONBOARDING));
    expect(s.map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(s.map((x) => x.title)).toEqual(TITLES);
  });

  it("step 1 asks name, address and role; only what the user says; suggestions after confirmation", async () => {
    const b = steps(await read(ONBOARDING)).steps.find((x) => x.n === 1)?.body.toLowerCase() ?? "";
    expect(b).toContain("name");
    expect(b).toMatch(/address|called/);
    expect(b).toContain("role");
    expect(b).toMatch(/only what the user says/);
    expect(b).toMatch(/suggest/);
    expect(b).toMatch(/confirm/);
  });

  it("step 4 names me.md paths and shows the file for approval", async () => {
    const b = steps(await read(ONBOARDING)).steps.find((x) => x.n === 4)?.body ?? "";
    expect(b).toContain(".wiki/me.md");
    expect(b).toContain(".wiki/system/templates/me.md");
    expect(b.toLowerCase()).toContain("approval");
  });

  it("step 5 names doctor and setup-files, follows fix only with approval, no git check-ignore", async () => {
    const b = steps(await read(ONBOARDING)).steps.find((x) => x.n === 5)?.body ?? "";
    expect(b).toContain("wikeeper doctor");
    expect(b).toContain("setup-files");
    expect(b).toContain("fix:");
    expect(b.toLowerCase()).toContain("approval");
    expect(b).not.toContain("git check-ignore");
  });

  it("names no team.md and no wikeeper command other than doctor", async () => {
    const text = await read(ONBOARDING);
    expect(text).not.toContain("team.md");
    const cmds = wikeeperCommands(text);
    expect(cmds.length).toBeGreaterThan(0);
    expect(new Set(cmds)).toEqual(new Set(["doctor"]));
  });

  describe("install", () => {
    let root: string;
    beforeEach(async () => {
      root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-onboarding-"));
      await mkdir(path.join(root, ".git"), { recursive: true });
    });
    afterEach(async () => {
      await rm(root, { recursive: true, force: true, maxRetries: 3 });
    });

    it("init --yes installs .wiki/system/ONBOARDING.md and .wiki/system/templates/me.md", async () => {
      const { runCli } = await import("../../src/program.js");
      const code = await runCli(["init", "--yes", "--agents", "claude", "--json"], {
        io: {
          cwd: root,
          stdout: { write: () => true },
          stderr: { write: () => true },
          stdin: Readable.from([]),
        } as never,
      });
      expect(code).toBe(0);
      const onb = await read(path.join(root, ".wiki", "system", "ONBOARDING.md"));
      expect(onb).toBe(await read(ONBOARDING));
      const me = await read(path.join(root, ".wiki", "system", "templates", "me.md"));
      expect(me).toBe(await read(ME_TPL));
    });
  });
});

describe("STORY-006-07 S2: questions are proposed, never written into the shared rules", () => {
  it("step 2 references Proposing rule changes, setup_completed_at, forbids direct edit, defers to SETUP step 3", async () => {
    const b = steps(await read(ONBOARDING)).steps.find((x) => x.n === 2)?.body ?? "";
    expect(b).toContain('.wiki/system/WIKI.md, section "Proposing rule changes"');
    expect(b).toContain("setup_completed_at");
    expect(b).toMatch(/not (to )?edit[^\n]*\.wiki\/kb_instructions\.md|never edit[^\n]*\.wiki\/kb_instructions\.md/i);
    expect(b).toMatch(/SETUP\.md step 3/);
  });
});

describe("STORY-006-07 S3: entry and ending", () => {
  it.each([
    {
      entry: ".wiki/system/SETUP.md",
      stepText: 'section "2. The project"',
      state: "setup_completed_at",
    },
    {
      entry: "missing `.wiki/me.md`",
      stepText: ".wiki/project.md",
      state: "setup_completed_at",
    },
  ])("opening names $entry; step 6 names $stepText", async ({ entry, stepText, state }) => {
    const parsed = steps(await read(ONBOARDING));
    const opening = parsed.opening;
    const six = parsed.steps.find((x) => x.n === 6)?.body ?? "";
    if (entry.startsWith(".wiki/system/SETUP.md")) {
      expect(opening).toContain(".wiki/system/SETUP.md");
      expect(opening).toMatch(/step 1/);
      expect(six).toContain('.wiki/system/SETUP.md, section "2. The project"');
    } else {
      expect(opening).toMatch(/missing `?\.wiki\/me\.md`?/);
      expect(opening).toContain("session start");
      expect(six).toContain(".wiki/project.md");
    }
    expect(six).toContain(state);
  });
});

describe("STORY-006-07 S4: me.md has a fixed schema and a cap", () => {
  it("shipped template passes the schema check", async () => {
    const text = await read(ME_TPL);
    expect(checkMeSchema(text)).toEqual([]);
    expect(text.replace(/\n$/, "").split("\n").length).toBeLessThanOrEqual(15);
    expect(text).toMatch(/leave[^\n]*out/i);
    expect(text).not.toContain("[[");
    expect(text).not.toContain("\r");
    for (const k of ["name", "address as", "role", "uses the wiki for", "working on", "timezone", "language", "answer style"]) {
      expect(text).toMatch(new RegExp(`^${k}: <.+>$`, "m"));
    }
  });
});

describe("STORY-006-07 S5: a template that links to a page or adds a key fails the check", () => {
  it("names the unexpected key person and the wikilink", async () => {
    const text = await read(ME_TPL);
    const bad = text.replace(/^type: me$/m, 'type: me\nperson: "[[Alex Morgan]]"');
    const problems = checkMeSchema(bad).join("\n");
    expect(problems).toContain('unexpected frontmatter key "person"');
    expect(problems).toContain("[[Alex Morgan]]");
  });
});
