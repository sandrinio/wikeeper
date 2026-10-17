import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { hashTree } from "../../src/ingest/snapshot.js";
import { PAGE_CHECKS } from "../../src/lint/checks.js";
import { createLintCommand } from "../../src/commands/lint.js";
import { runCli } from "../../src/program.js";

const T = 30_000;
const NOW = () => new Date("2026-11-20T12:00:00Z");
const ATLAS = ".wiki/pages/projects/atlas.md";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[], withLint = false) {
  const out: string[] = [];
  const err: string[] = [];
  const input = Object.assign(Readable.from([]), { isTTY: false });
  const opts: any = {
    io: { cwd: root, stdout: { write: (c: string) => out.push(c) }, stderr: { write: (c: string) => err.push(c) }, stdin: input },
  };
  if (withLint) opts.commands = [createLintCommand({ now: NOW })];
  const code = await runCli(args, opts);
  const text = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(text.trim().split("\n")[0]!);
  } catch {
    /* human output */
  }
  return { code, json, text, err: err.join("") };
}

interface AtlasOpts {
  fmStatus?: string;
  status?: string[];
  facts?: string[];
}

function atlasPage(o: AtlasOpts): string {
  const lines = ["---", "type: project", "title: Atlas"];
  if (o.fmStatus) lines.push(`status: ${o.fmStatus}`);
  lines.push("---", "# Atlas", ...(o.status ?? []));
  if (o.facts && o.facts.length) lines.push("", "## Facts", "", ...o.facts);
  return lines.join("\n") + "\n";
}

const lineOf = (text: string, needle: string, nth = 1): number => {
  let seen = 0;
  const ls = text.split("\n");
  for (let i = 0; i < ls.length; i++) if (ls[i]!.includes(needle) && ++seen === nth) return i + 1;
  throw new Error(`no line with ${needle}`);
};

async function repo(page: string, config = ""): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-stale-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  expect((await run(root, ["init", "--yes", "--agents", "claude", "--json"])).code).toBe(0);
  if (config) {
    const cfg = path.join(root, ".wiki", "config.yml");
    await writeFile(cfg, (await readFile(cfg, "utf8")) + (config.startsWith("\n") ? "" : "\n") + config);
  }
  const file = path.join(root, ".wiki", "pages", "projects", "atlas.md");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, page);
  return root;
}

async function stale(root: string) {
  const res = await run(root, ["lint", "--check", "stale-fact", "--json"], true);
  expect(res.json?.ok, `lint --check stale-fact: ${res.text} ${res.err}`).toBe(true);
  return { ...res, findings: (res.json.data.findings as any[]).filter((f) => f.id === "stale-fact") };
}

const STATUS = "status:: In progress";
const SRC = "[[src-2026-10-01-hr]]";
const fact = (date: string, kind: string, text: string, src = SRC) => `- ${date} · ${kind} · ${text} ${src}`;
const cfgDays = (n: number) => `lint:\n  stale_after_days: ${n}\n`;

describe("STORY-005-08 stale-fact (red)", () => {
  describe("S1 outline: statuses and planned dates older than lint.stale_after_days", () => {
    it("row 1: 31 days old status -> one warning at the status line", async () => {
      const page = atlasPage({ status: [STATUS], facts: [fact("2026-10-20", "decided", "Atlas kicked off.")] });
      const { findings, code } = await stale(await repo(page));
      expect(code).toBe(0);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ id: "stale-fact", severity: "warning", path: ATLAS, line: lineOf(page, STATUS) });
      expect(findings[0].message).toContain("In progress");
      expect(findings[0].message).toContain("2026-10-20");
      expect(findings[0].message).toContain("31 days ago");
    }, T);

    it("row 2: exactly 30 days old -> no finding", async () => {
      const page = atlasPage({ status: [STATUS], facts: [fact("2026-10-21", "decided", "Atlas kicked off.")] });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);

    it("row 3: stale_after_days 60 -> no finding", async () => {
      const page = atlasPage({ status: [STATUS], facts: [fact("2026-10-20", "decided", "Atlas kicked off.")] });
      expect((await stale(await repo(page, cfgDays(60)))).findings).toEqual([]);
    }, T);

    it("row 4: fact dated in the future -> no finding", async () => {
      const page = atlasPage({ status: [STATUS], facts: [fact("2026-12-01", "decided", "Atlas kicked off.")] });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);

    it("row 5: status without fact lines -> no finding", async () => {
      const page = atlasPage({ status: ["status:: Draft"] });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);

    it("row 6: tentative fact naming a date, nothing newer -> one warning at the fact line", async () => {
      const page = atlasPage({
        facts: [fact("2026-10-15", "tentative", "Launch targets 2026-11-17.", "[[src-2026-10-15-plan]]")],
      });
      const { findings, code } = await stale(await repo(page));
      expect(code).toBe(0);
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ severity: "warning", path: ATLAS, line: lineOf(page, "Launch targets") });
      expect(findings[0].message).toContain("2026-10-15");
      expect(findings[0].message).toContain("2026-11-17");
    }, T);

    it("row 7: a later fact line on the same entity -> no finding", async () => {
      const page = atlasPage({
        facts: [
          fact("2026-10-15", "tentative", "Launch targets 2026-11-17.", "[[src-2026-10-15-plan]]"),
          fact("2026-11-01", "decided", "Atlas staffing agreed.", "[[src-2026-11-01-hr]]"),
        ],
      });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);

    it("row 8: tentative fact without a date in its text -> no finding", async () => {
      const page = atlasPage({ facts: [fact("2026-10-01", "tentative", "Hiring may slip.")] });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);

    it("row 9: impossible date in the text -> no finding", async () => {
      const page = atlasPage({ facts: [fact("2026-10-01", "tentative", "Review on 2026-02-30.")] });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);

    it("row 10: decided fact naming a date is not a plan -> no finding", async () => {
      const page = atlasPage({ facts: [fact("2026-10-01", "decided", "Launch on 2026-11-17.")] });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);
  });

  describe("S2 outline: which status counts, and which statuses are final", () => {
    const OLD = [fact("2026-10-01", "decided", "Atlas kicked off.")];

    it("row 1: Draft then Completed below -> no finding (last counts, final)", async () => {
      const page = atlasPage({ status: ["status:: Draft", "status:: Completed"], facts: OLD });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);

    it("row 2: Completed then Draft below -> one warning at the second line naming Draft", async () => {
      const page = atlasPage({ status: ["status:: Completed", "status:: Draft"], facts: OLD });
      const { findings } = await stale(await repo(page));
      expect(findings).toHaveLength(1);
      expect(findings[0].line).toBe(lineOf(page, "status:: Draft"));
      expect(findings[0].message).toContain("Draft");
    }, T);

    it("row 3: 'Done — shipped early' is final", async () => {
      const page = atlasPage({ status: ["status:: Done — shipped early"], facts: OLD });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);

    it("row 4: wikilinked '[[Cancelled]]' is final", async () => {
      const page = atlasPage({ status: ["status:: [[Cancelled]]"], facts: OLD });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);

    it("row 5: Approved is not final", async () => {
      const page = atlasPage({ status: ["status:: Approved"], facts: OLD });
      const { findings } = await stale(await repo(page));
      expect(findings).toHaveLength(1);
      expect(findings[0].message).toContain("Approved");
    }, T);

    it("row 6: frontmatter status Draft, no status:: line -> one warning without a line", async () => {
      const page = atlasPage({ fmStatus: "Draft", facts: OLD });
      const { findings } = await stale(await repo(page));
      expect(findings).toHaveLength(1);
      expect(findings[0].path).toBe(ATLAS);
      expect(findings[0].line).toBeUndefined();
      expect(findings[0].message).toContain("Draft");
    }, T);

    it("row 7: typed link wins over frontmatter -> warning at the status:: line naming Open", async () => {
      const page = atlasPage({ fmStatus: "Completed", status: ["status:: Open"], facts: OLD });
      const { findings } = await stale(await repo(page));
      expect(findings).toHaveLength(1);
      expect(findings[0].line).toBe(lineOf(page, "status:: Open"));
      expect(findings[0].message).toContain("Open");
    }, T);
  });

  describe("S3: human output, read-only warning, registry order", () => {
    const page = atlasPage({ status: [STATUS], facts: [fact("2026-10-20", "decided", "Atlas kicked off.")] });

    it("human output line, summary line, exit 0", async () => {
      const root = await repo(page);
      const res = await run(root, ["lint", "--check", "stale-fact"], true);
      expect(res.code).toBe(0);
      expect(page.split("\n")[5]).toBe(STATUS); // line 6
      expect(res.text).toContain(
        `[warn] stale-fact ${ATLAS}:6: Atlas: status "In progress" was last dated 2026-10-20, 31 days ago (lint.stale_after_days is 30)`,
      );
      const lines = res.text.trimEnd().split("\n");
      expect(lines[lines.length - 1]).toBe("0 errors, 1 warning, 0 info");
    }, T);

    it("plain lint --json holds the finding", async () => {
      const root = await repo(page);
      const res = await run(root, ["lint", "--json"], true);
      const f = (res.json?.data?.findings ?? []).filter((x: any) => x.id === "stale-fact");
      expect(f).toHaveLength(1);
      expect(f[0]).toMatchObject({ severity: "warning", path: ATLAS, line: 6 });
    }, T);

    it("no file in the repository changed", async () => {
      const root = await repo(page);
      const before = await hashTree(root);
      const a = await run(root, ["lint", "--check", "stale-fact", "--json"], true);
      expect(a.json?.ok).toBe(true);
      expect(a.json.data.findings.filter((f: any) => f.id === "stale-fact")).toHaveLength(1);
      expect((await run(root, ["lint", "--check", "stale-fact"], true)).code).toBe(0);
      expect(await hashTree(root)).toEqual(before);
    }, T);

    it("PAGE_CHECKS holds stale-fact once, after index-drift, as its last entry", () => {
      const ids = PAGE_CHECKS.map((c) => c.id);
      expect(ids.filter((i) => i === "stale-fact")).toHaveLength(1);
      expect(ids[ids.length - 1]).toBe("stale-fact");
      expect(ids.indexOf("stale-fact")).toBeGreaterThan(ids.indexOf("index-drift"));
    });
  });

  describe("S4 outline: bad input gives no false finding and no failure", () => {
    const FACTS = [fact("2026-10-20", "decided", "Atlas kicked off.")];

    it("row 1: stale_after_days 0 falls back to 30", async () => {
      const page = atlasPage({ status: [STATUS], facts: FACTS });
      const { findings, code } = await stale(await repo(page, cfgDays(0)));
      expect(code).toBe(0);
      expect(findings).toHaveLength(1);
      expect(findings[0].message.endsWith("(lint.stale_after_days is 30)")).toBe(true);
    }, T);

    it("row 2: bare 'status::' with no value -> no finding", async () => {
      const page = atlasPage({ status: ["status::"], facts: FACTS });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);

    it("row 3: only fact line removed -> no finding", async () => {
      const page = atlasPage({ status: [STATUS] });
      expect((await stale(await repo(page))).findings).toEqual([]);
    }, T);
  });
});
