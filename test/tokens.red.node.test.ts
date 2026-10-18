import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { initialConfigText } from "../src/commands/init.js";
import { DEFAULT_CONFIG, formatConfigIssue, loadConfig } from "../src/core/config.js";
import { resolvePaths } from "../src/core/paths.js";
import {
  estimateTokens,
  formatLimit,
  formatTokens,
  levelMark,
  levelOf,
  measureWiki,
  PDF_TOKENS_PER_PAGE,
} from "../src/core/tokens.js";
import { runCli } from "../src/program.js";

const T = 30_000;
const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});
async function tmp(): Promise<string> {
  const d = await mkdtemp(path.join(os.tmpdir(), "wk-tok-red-"));
  tmpDirs.push(d);
  return d;
}
async function run(root: string, args: string[]) {
  const out: string[] = [];
  const input = Object.assign(Readable.from([]), { isTTY: false });
  const code = await runCli(args, {
    io: { cwd: root, stdout: { write: (c: string) => out.push(c) }, stderr: { write: () => {} }, stdin: input },
  } as never);
  const text = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(text.trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code, json, text };
}
async function gitRepo(): Promise<string> {
  const root = await tmp();
  await mkdir(path.join(root, ".git"), { recursive: true });
  return root;
}
async function snapshotTree(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) out.push(...(await snapshotTree(p, base)));
    else out.push(`${path.relative(base, p)}:${(await readFile(p)).toString("base64")}`);
  }
  return out.sort();
}

const FIX = {
  en: "The quick brown fox jumps over the lazy dog.",
  ru: "Концерт в 2030 году — 1 500 мест в зале.",
  ka: "კონცერტი 2030 წელს: 1500 ადგილი კლუბში.",
  form: "Name: " + "_".repeat(12) + " Date: " + "_".repeat(10),
  table: "| Item | Cost |\n|---|---|",
  other: "Café ☕ 10€",
  emoji: "👍".repeat(5),
  half: "€1?1",
  empty: "",
};

describe("S1 estimateTokens follows SPIKE-003's weights (red)", () => {
  it.each([
    ["en", 16],
    ["ru", 19],
    ["ka", 27],
    ["form", 6],
    ["table", 11],
    ["other", 4],
    ["emoji", 2],
    ["half", 3],
    ["empty", 0],
  ] as const)("fixture %s -> %i", (name, tokens) => {
    expect(estimateTokens(FIX[name])).toBe(tokens);
  });
});

describe("S2 levels and display (red)", () => {
  const limits = { yellow: 4000, red: 10000 };
  it.each([
    [0, "green", "🟢", "≈0"],
    [870, "green", "🟢", "≈870"],
    [3999, "green", "🟢", "≈4k"],
    [4000, "yellow", "🟡", "≈4k"],
    [6300, "yellow", "🟡", "≈6.3k"],
    [9999, "yellow", "🟡", "≈10k"],
    [10000, "red", "🔴", "≈10k"],
    [66042, "red", "🔴", "≈66k"],
    [1234567, "red", "🔴", "≈1.2M"],
    [-1200, "green", "🟢", "≈-1.2k"],
  ] as const)("%i", (n, level, mark, text) => {
    expect(levelOf(n, limits)).toBe(level);
    expect(levelMark(levelOf(n, limits))).toBe(mark);
    expect(formatTokens(n)).toBe(text);
  });
  it("PDF_TOKENS_PER_PAGE and formatLimit", () => {
    expect(PDF_TOKENS_PER_PAGE).toBe(1600);
    expect(formatLimit(4000)).toBe("4k");
    expect(formatLimit(10000)).toBe("10k");
    expect(formatLimit(1500)).toBe("1.5k");
    expect(formatLimit(20000)).toBe("20k");
    expect(formatLimit(1234)).toBe("1234");
    expect(formatLimit(999)).toBe("999");
  });
});

describe("S3 measureWiki counts pages, not index.md, largest first (red)", () => {
  it(
    "sizes pages and writes nothing",
    async () => {
      const root = await gitRepo();
      expect((await run(root, ["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
      const paths = resolvePaths(root, (await loadConfig(root)).config);
      const put = async (rel: string, body: string) => {
        const f = path.join(paths.contentDir, ...rel.split("/"));
        await mkdir(path.dirname(f), { recursive: true });
        await writeFile(f, body);
      };
      await put("pages/b.md", FIX.en);
      await put("pages/c.md", FIX.en);
      await put("pages/people/a.md", FIX.ka);
      await put("pages/.drafts/x.md", FIX.ru);
      await put("pages/notes.txt", FIX.ru);
      await writeFile(paths.indexFile, FIX.ru);

      const before = await snapshotTree(root);
      const size = await measureWiki(paths);
      expect(size.pages).toEqual([
        { path: "people/a.md", tokens: 27 },
        { path: "b.md", tokens: 16 },
        { path: "c.md", tokens: 16 },
      ]);
      expect(size.total).toBe(59);
      expect(size.page_count).toBe(3);
      expect(size.index).toBe(19);
      expect(await snapshotTree(root)).toEqual(before);

      await rm(paths.pagesDir, { recursive: true, force: true });
      await rm(paths.indexFile, { force: true });
      expect(await measureWiki(paths)).toEqual({ total: 0, page_count: 0, index: 0, pages: [] });
    },
    T,
  );
});

describe("S4 token limits in config.yml are normalised and checked (red)", () => {
  const TK = "must be a positive whole number, or a number with k (20000, 20k, 1.5k)";
  const PD = { yellow: 4000, red: 10000 };
  const SD = { yellow: 20000, red: 60000, confirm_at: "yellow" };
  it.each([
    ["profile: management", "page", PD, []],
    ["tokens: { page: { yellow: 2.5k, red: 12K } }", "page", { yellow: 2500, red: 12000 }, []],
    [
      "tokens: { source: { yellow: '25000', red: 90000, confirm_at: never } }",
      "source",
      { yellow: 25000, red: 90000, confirm_at: "never" },
      [],
    ],
    ["tokens: { page: { yellow: 1.2345k } }", "page", PD, [`tokens.page.yellow: "1.2345k" — ${TK}`]],
    ["tokens: { page: { red: 0 } }", "page", PD, [`tokens.page.red: 0 — ${TK}`]],
    [
      "tokens: { page: { yellow: 20k, red: 10k } }",
      "page",
      { yellow: 20000, red: 10000 },
      ["tokens.page.yellow: 20000 — must be below tokens.page.red (10000)"],
    ],
    [
      "tokens: { page: { red: 3k } }",
      "page",
      { yellow: 4000, red: 3000 },
      ["tokens.page.yellow: 4000 — must be below tokens.page.red (3000)"],
    ],
    [
      "tokens: { source: { confirm_at: sometimes } }",
      "source",
      SD,
      ['tokens.source.confirm_at: "sometimes" — allowed: yellow, red, never'],
    ],
  ] as const)("%s", async (yaml, group, effective, errors) => {
    const root = await tmp();
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), yaml + "\n");
    const r = await loadConfig(root);
    expect((r.config as any).tokens[group]).toEqual(effective);
    expect(r.errors.map(formatConfigIssue)).toEqual(errors);
  });
});

describe("S5 a new wiki gets the limits written out; an existing wiki gets them from code (red)", () => {
  it(
    "init writes the seed; update and init leave an existing file alone",
    async () => {
      const root = await gitRepo();
      expect((await run(root, ["init", "--yes", "--agents", "claude"])).code).toBe(0);
      const file = path.join(root, ".wiki", "config.yml");
      expect(await readFile(file, "utf8")).toBe(
        initialConfigText("management").replace("agents: []", "agents:\n  - claude"),
      );
      const loaded = await loadConfig(root);
      expect(loaded.errors).toEqual([]);
      expect(loaded.warnings).toEqual([]);
      expect(loaded.config.tokens).toEqual(DEFAULT_CONFIG.tokens);
      const doc = await run(root, ["doctor", "--json"]);
      expect(doc.json.data.state.permission.default).toBe(true);
      const cfg = doc.json.data.checks.find((c: any) => c.id === "config-valid");
      expect(cfg.severity).toBe("ok");

      const other = await gitRepo();
      await mkdir(path.join(other, ".wiki"), { recursive: true });
      const mine = "# mine\nprofile: management\nagents:\n  - claude\n";
      const f2 = path.join(other, ".wiki", "config.yml");
      await writeFile(f2, mine);
      expect((await run(other, ["init", "--yes"])).code).toBe(0);
      await run(other, ["update"]);
      await run(other, ["init", "--yes"]);
      expect(await readFile(f2, "utf8")).toBe(mine);
      const l2 = await loadConfig(other);
      expect(l2.config.tokens).toEqual(DEFAULT_CONFIG.tokens);
      expect(l2.errors).toEqual([]);
      expect(l2.warnings).toEqual([]);
      await stat(f2);
    },
    T,
  );
});
