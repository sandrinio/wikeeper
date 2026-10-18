// STORY-008-05 QA-Red: `status` archive size and candidates; `private:`, `remove` and `--purge` cover archive/.
// Immutable after QA-Red. Fixtures are built in temp git repositories; text rows come first (text-before-live).
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetIntegrations } from "../src/core/integrations.js";
import { templatesDir } from "../src/core/templates.js";
import { estimateTokens } from "../src/core/tokens.js";
import { hashTree } from "../src/ingest/snapshot.js";
import { runCli } from "../src/program.js";

const T = 60_000;
const execFileP = promisify(execFile);
const NOW = new Date("2026-10-18T12:00:00Z");
const START = "# >>> wikeeper >>>";
const END = "# <<< wikeeper <<<";
const SRC = "[[src-2026-08-01-notes]]";

async function load<R = any>(spec: string): Promise<R> {
  try {
    return (await import(/* @vite-ignore */ spec)) as R;
  } catch (e) {
    throw new Error(`not yet implemented: ${spec} (${(e as Error).message})`);
  }
}

const tmpDirs: string[] = [];
beforeEach(() => resetIntegrations());
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function tmpRepo(git = true): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-archst-"));
  tmpDirs.push(root);
  if (git) await execFileP("git", ["init", "-q"], { cwd: root });
  else await mkdir(path.join(root, ".git"), { recursive: true });
  return root;
}

async function put(root: string, rel: string, text: string): Promise<void> {
  const abs = path.join(root, ...rel.split("/"));
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, text);
}

async function run(root: string, args: string[], commands?: unknown[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    ...(commands ? { commands } : {}),
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

/** Text whose estimateTokens is exactly n (asserted). */
function pad(head: string, n: number): string {
  let text = head;
  while (estimateTokens(text + "word ") <= n) text += "word ";
  while (estimateTokens(text) < n) text += "a";
  expect(estimateTokens(text), `padding to ${n} tokens`).toBe(n);
  return text + "\n";
}

const lines = (text: string) => text.split("\n").map((l) => l.trim());

// ---------- status ----------
const CONFIG = "tokens:\n  page:\n    yellow: 50\n    red: 100\nlint:\n  stale_after_days: 30\n";

async function statusRepo(): Promise<string> {
  const root = await tmpRepo();
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  await put(root, ".wiki/config.yml", CONFIG);
  return root;
}

async function status(root: string, human = false) {
  const { createStatusCommand } = await load("../src/commands/status.js");
  const cmd = createStatusCommand({ now: () => NOW });
  const res = await run(root, human ? ["status"] : ["status", "--json"], [cmd]);
  if (!human) expect(res.json?.command, `${res.text} ${res.err}`).toBe("status");
  return res;
}

const beta = (fm: string, facts: string[], body: string[] = []) =>
  ["---", "type: project", "title: Beta", ...(fm ? [fm] : []), "---", "# Beta", ...body, "", "## Facts", "", ...facts, ""].join("\n");
const fact = (date: string, text = "Beta moved.") => `- ${date} · decided · ${text} ${SRC}`;

describe("STORY-008-05 S3 text: the two WIKI.md status bullets (red)", () => {
  it("templates/system/WIKI.md section 'Lint and status' has the R8 bullets after the tokens bullet", async () => {
    const wiki = (await readFile(path.join(templatesDir(), "system", "WIKI.md"), "utf8")).replace(/\r\n/g, "\n");
    const a =
      "- `archive`: the size of `archive/`: its `pages` and estimated `tokens`. They are not counted in `tokens`, and a search skips them unless it runs with `--archive`.";
    const b =
      "- `archive_candidates`: pages a clean-up could shrink, each with its `reason`: `size` (at or above `tokens.page.red`) or `final_status` (an entity with a final status whose newest fact is older than `lint.stale_after_days`). Tell the user about them once in the session: for `size`, the red-page notice above, told once with it; for `final_status`, a clean-up that moves that entity's fact lines to `archive/` (the whole page when the entity is the page), or leaving it. Never start a clean-up yourself.";
    const section = wiki.slice(wiki.indexOf("## Lint and status"));
    const ls = section.split("\n");
    expect(ls, "archive bullet").toContain(a);
    expect(ls, "archive_candidates bullet").toContain(b);
    const iTokens = ls.findIndex((l) => l.startsWith("- `tokens`: "));
    expect(iTokens).toBeGreaterThan(-1);
    expect(ls.indexOf(a)).toBeGreaterThan(iTokens);
    expect(ls.indexOf(b)).toBeGreaterThan(ls.indexOf(a));
    expect(ls.filter((l) => l.startsWith("- `archive`: "))).toHaveLength(1);
    expect(ls.filter((l) => l.startsWith("- `archive_candidates`: "))).toHaveLength(1);
  });
});

describe("STORY-008-05 R3: staleness helpers are exported (red)", () => {
  it("isFinalStatus, entityStatus and daysSince", async () => {
    const m = await load("../src/lint/staleness.js");
    expect(typeof m.isFinalStatus, "isFinalStatus").toBe("function");
    expect(typeof m.entityStatus, "entityStatus").toBe("function");
    expect(typeof m.daysSince, "daysSince").toBe("function");
    expect(m.isFinalStatus("Done — merged")).toBe(true);
    expect(m.isFinalStatus("SHIPPED")).toBe(true);
    expect(m.isFinalStatus("active")).toBe(false);
    expect(m.daysSince("2026-09-17", NOW)).toBe(31);
    expect(m.daysSince("2026-09-18", NOW)).toBe(30);
    expect(m.daysSince("2026-10-18", NOW)).toBe(0);
  });
});

describe("STORY-008-05 S1: archive size and pages at or above the red limit (red)", () => {
  const rows: Array<{
    name: string;
    files: Array<[string, number]>;
    archive: { pages: number; tokens: number };
    candidates: unknown[];
    line: string;
  }> = [
    { name: "no archive", files: [["pages/team.md", 20]], archive: { pages: 0, tokens: 0 }, candidates: [], line: "archive: none" },
    {
      name: "one archive page",
      files: [["pages/team.md", 20], ["archive/projects/atlas.md", 40]],
      archive: { pages: 1, tokens: 40 },
      candidates: [],
      line: "archive: ≈40 tokens · 1 page",
    },
    {
      name: "page at red",
      files: [["pages/projects/atlas.md", 100], ["archive/projects/atlas.md", 40]],
      archive: { pages: 1, tokens: 40 },
      candidates: [{ path: "projects/atlas.md", reason: "size", tokens: 100 }],
      line: "projects/atlas.md ≈100 🔴 (tokens.page.red is 100)",
    },
    {
      name: "page at red minus one",
      files: [["pages/projects/atlas.md", 99]],
      archive: { pages: 0, tokens: 0 },
      candidates: [],
      line: "archive candidates: none",
    },
    {
      name: "big archive page is never a candidate",
      files: [["pages/team.md", 20], ["archive/projects/big.md", 500]],
      archive: { pages: 1, tokens: 500 },
      candidates: [],
      line: "archive candidates: none",
    },
  ];
  it.each(rows)("$name", async (row) => {
    const root = await statusRepo();
    for (const [rel, n] of row.files) await put(root, `.wiki/${rel}`, pad("# Page\n\n", n));
    const res = await status(root);
    expect(res.code, res.err).toBe(0);
    expect(res.json.ok).toBe(true);
    expect(res.json.data.archive).toEqual(row.archive);
    expect(res.json.data.archive_candidates).toEqual(row.candidates);
    const human = await status(root, true);
    expect(human.code).toBe(0);
    expect(lines(human.text)).toContain(row.line);
  }, T);
});

describe("STORY-008-05 S2: entities with a final status and no recent fact (red)", () => {
  const rows: Array<{ name: string; files: Array<[string, string]>; candidates: unknown[]; config?: string }> = [
    {
      name: "shipped, newest fact 31 days ago",
      files: [["pages/projects/beta.md", beta("status: shipped", [fact("2026-09-17")])]],
      candidates: [{ path: "projects/beta.md", reason: "final_status", status: "shipped", entity: "Beta", last_dated: "2026-09-17" }],
    },
    {
      name: "shipped, newest fact 30 days ago",
      files: [["pages/projects/beta.md", beta("status: shipped", [fact("2026-09-18")])]],
      candidates: [],
    },
    {
      name: "typed-link status active is not final",
      files: [["pages/projects/beta.md", beta("", [fact("2026-06-01")], ["status:: active"])]],
      candidates: [],
    },
    {
      name: "typed-link status wins over a final frontmatter status",
      files: [["pages/projects/beta.md", beta("status: shipped", [fact("2026-06-01")], ["status:: active"])]],
      candidates: [],
    },
    {
      name: "section entity with a final status",
      // the page measures 109 tokens; a higher red limit keeps the row on final_status alone
      config: CONFIG.replace("red: 100", "red: 200"),
      files: [
        [
          "pages/roadmap.md",
          [
            "# Roadmap",
            "",
            "## Gamma",
            "type:: project",
            "status:: Done — merged",
            "",
            fact("2026-08-15", "Gamma merged."),
            "",
            "## Delta",
            "type:: project",
            "status:: active",
            "",
            fact("2026-10-01", "Delta started."),
            "",
          ].join("\n"),
        ],
      ],
      candidates: [{ path: "roadmap.md", reason: "final_status", status: "Done — merged", entity: "Gamma", last_dated: "2026-08-15" }],
    },
    {
      name: "final status with no fact lines",
      files: [["pages/projects/beta.md", beta("status: shipped", [])]],
      candidates: [],
    },
    {
      name: "archive page is never a candidate",
      files: [["archive/projects/delta.md", beta("status: shipped", [fact("2026-01-01")])]],
      candidates: [],
    },
  ];
  it.each(rows)("$name", async (row) => {
    const root = await statusRepo();
    if (row.config) await put(root, ".wiki/config.yml", row.config);
    for (const [rel, text] of row.files) await put(root, `.wiki/${rel}`, text);
    const res = await status(root);
    expect(res.code, res.err).toBe(0);
    expect(res.json.ok).toBe(true);
    expect(res.json.data.archive_candidates).toEqual(row.candidates);
  }, T);

  it("a size entry sorts first on its page, and pages sort by path", async () => {
    const root = await statusRepo();
    const body = pad(beta("status: shipped", [fact("2026-08-01")]), 120);
    await put(root, ".wiki/pages/projects/beta.md", body);
    await put(root, ".wiki/pages/a.md", pad("# A\n\n", 110));
    const res = await status(root);
    expect(res.json.data.archive_candidates.map((c: any) => `${c.path}:${c.reason}`)).toEqual([
      "a.md:size",
      "projects/beta.md:size",
      "projects/beta.md:final_status",
    ]);
  }, T);
});

describe("STORY-008-05 S3: status prints the archive and its candidates, and writes nothing (red)", () => {
  it("human lines, hint and read-only", async () => {
    const root = await statusRepo();
    await put(root, ".wiki/pages/projects/atlas.md", pad("# Atlas\n\n", 100));
    const betaText = beta("status: shipped", [fact("2026-09-01")]);
    expect(estimateTokens(betaText)).toBeLessThan(100);
    await put(root, ".wiki/pages/projects/beta.md", betaText);
    await put(root, ".wiki/archive/projects/atlas.md", pad("# Atlas\n\n", 40));
    const before = await hashTree(root);
    const res = await status(root, true);
    const after = await hashTree(root);
    expect(res.code, res.err).toBe(0);
    const out = res.text.split("\n");
    expect(out).toContain("archive: ≈40 tokens · 1 page");
    expect(out).toContain("archive candidates: 2");
    expect(out).toContain("  projects/atlas.md ≈100 🔴 (tokens.page.red is 100)");
    expect(out).toContain("  projects/beta.md · Beta: status shipped, last dated 2026-09-01 (lint.stale_after_days is 30)");
    expect(out).toContain(
      "  nothing moves to the archive until the user asks for a clean-up; to raise the page limit instead, run wikeeper config set tokens.page.red <n>",
    );
    expect(after).toEqual(before);
  }, T);

  it("the hint's second part appears only with a size entry", async () => {
    const root = await statusRepo();
    await put(root, ".wiki/pages/projects/beta.md", beta("status: shipped", [fact("2026-09-01")]));
    const res = await status(root, true);
    expect(res.code, res.err).toBe(0);
    const out = res.text.split("\n");
    expect(out).toContain("archive candidates: 1");
    expect(out).toContain("  nothing moves to the archive until the user asks for a clean-up");
    expect(res.text).not.toContain("to raise the page limit instead");
  }, T);
});

// ---------- private: mirror ----------
function blockLines(gi: string): string[] {
  const ls = gi.split(/\r?\n/);
  const s = ls.indexOf(START);
  const e = ls.indexOf(END);
  return s >= 0 && e > s ? ls.slice(s + 1, e) : [];
}

async function initWith(config: string) {
  const root = await tmpRepo();
  await put(root, ".wiki/config.yml", config);
  const res = await run(root, ["init", "--yes", "--agents", "claude", "--json"]);
  expect(res.code, `${res.text} ${res.err}`).toBe(0);
  return { root, res };
}
const gitignore = (root: string) => readFile(path.join(root, ".gitignore"), "utf8");

describe("STORY-008-05 S4: a private entry also keeps its archive file out of git (red)", () => {
  it("row 1: .wiki, entries team.md and people/ (ends with the mirrors, git ignores the archive file)", async () => {
    const { root } = await initWith("private: [team.md, people/]\n");
    const block = blockLines(await gitignore(root));
    expect(block.slice(-4)).toEqual([
      ".wiki/archive/people",
      ".wiki/archive/team.md",
      ".wiki/pages/people",
      ".wiki/pages/team.md",
    ]);
    await put(root, ".wiki/archive/team.md", "# Team\n");
    await expect(execFileP("git", ["check-ignore", "-q", ".wiki/archive/team.md"], { cwd: root })).resolves.toBeDefined();
  }, T);

  it("row 2: content_dir wiki", async () => {
    const { root } = await initWith("content_dir: wiki\nprivate: [team.md]\n");
    const block = blockLines(await gitignore(root));
    expect(block).toContain("wiki/archive/team.md");
    expect(block).toContain("wiki/pages/team.md");
  }, T);

  it("row 3: content_dir .", async () => {
    const { root } = await initWith("content_dir: .\nprivate: [team.md]\n");
    const block = blockLines(await gitignore(root));
    expect(block).toContain("archive/team.md");
    expect(block).toContain("pages/team.md");
  }, T);

  it("row 4: update adds the mirror to an install whose block lists only the pages/ entry", async () => {
    const { root } = await initWith("private: [team.md]\n");
    const gi = (await gitignore(root)).split("\n").filter((l) => l !== ".wiki/archive/team.md").join("\n");
    await writeFile(path.join(root, ".gitignore"), gi);
    expect(blockLines(gi)).toContain(".wiki/pages/team.md");
    expect(blockLines(gi)).not.toContain(".wiki/archive/team.md");
    const res = await run(root, ["update", "--json"]);
    expect(res.code, `${res.text} ${res.err}`).toBe(0);
    expect(blockLines(await gitignore(root))).toContain(".wiki/archive/team.md");
  }, T);

  it("row 5: an entry outside pages/ gets no line and one warning", async () => {
    const { root, res } = await initWith("private: [../x.md]\n");
    const block = blockLines(await gitignore(root));
    expect(block.some((l) => l.includes("x.md"))).toBe(false);
    const msg = 'private entry "../x.md" is outside pages/; not ignored';
    expect(res.json.warnings.filter((w: string) => w === msg)).toHaveLength(1);
  }, T);
});

// ---------- remove ----------
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

async function removeFixture(dir: string): Promise<string> {
  const root = await tmpRepo(false);
  await put(root, ".wiki/config.yml", (dir === ".wiki" ? "" : `content_dir: ${dir}\n`) + "ingest:\n  permission: ai\n");
  await put(root, ".wiki/kb_instructions.md", "kb\n");
  await put(root, ".wiki/me.md", "me\n");
  await put(root, ".wiki/system/SETUP.md", "v1\n");
  await put(root, "AGENTS.md", "agents user text\n");
  await put(root, `${dir}/index.md`, "index\n");
  await put(root, `${dir}/pages/a.md`, "page\n");
  await put(root, `${dir}/raw/x.txt`, "raw\n");
  await put(root, `${dir}/log/1.md`, "log\n");
  await put(root, `${dir}/archive/projects/atlas.md`, "# Atlas\narchived\n");
  const files = [{ path: ".wiki/system/SETUP.md", sha256: sha("v1\n"), kind: "system" }];
  await put(root, ".wiki/system/manifest.json", JSON.stringify({ package_version: "0.0.1", files }, null, 2) + "\n");
  return root;
}
const exists = (root: string, rel: string) =>
  stat(path.join(root, ...rel.split("/"))).then(
    () => true,
    () => false,
  );

describe("STORY-008-05 S5: remove keeps archive/; --purge deletes it (red)", () => {
  const PURGE = ["--purge", "--confirm", "wikeeper"];
  it.each([".wiki", "wiki"])("remove keeps %s/archive and lists it as kept", async (dir) => {
    const root = await removeFixture(dir);
    const res = await run(root, ["remove", "--json"]);
    expect(res.code, `${res.text} ${res.err}`).toBe(0);
    expect(res.json.ok).toBe(true);
    expect(await readFile(path.join(root, ...dir.split("/"), "archive", "projects", "atlas.md"), "utf8")).toBe("# Atlas\narchived\n");
    expect(res.json.data.kept).toContain(`${dir}/archive`);
  }, T);

  it.each([".wiki", "wiki"])("--purge removes %s/ with its archive", async (dir) => {
    const root = await removeFixture(dir);
    const res = await run(root, ["remove", ...PURGE, "--json"]);
    expect(res.code, `${res.text} ${res.err}`).toBe(0);
    expect(await exists(root, dir)).toBe(false);
    expect(await exists(root, "AGENTS.md")).toBe(true);
  }, T);

  it("--purge with a content_dir holding a user file removes archive/ and keeps the file", async () => {
    const root = await removeFixture("wiki");
    await put(root, "wiki/mine.txt", "user\n");
    const res = await run(root, ["remove", ...PURGE, "--json"]);
    expect(res.code, `${res.text} ${res.err}`).toBe(0);
    expect(await exists(root, "wiki/archive")).toBe(false);
    expect(await readFile(path.join(root, "wiki", "mine.txt"), "utf8")).toBe("user\n");
  }, T);

  it("remove --help names archive/ in the --purge description", async () => {
    const root = await removeFixture(".wiki");
    const res = await run(root, ["remove", "--help"]);
    expect(res.text.replace(/\s+/g, " ")).toContain(
      "also delete .wiki/ (config.yml, kb_instructions.md, me.md) and the wiki content: pages/, archive/, raw/, index.md, log/, in .wiki/ or content_dir (needs confirmation)",
    );
  }, T);
});
