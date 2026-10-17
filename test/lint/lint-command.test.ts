import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import type { ResolvedPaths } from "../../src/core/paths.js";
import { writeIndex } from "../../src/ingest/index-builder.js";
import { acquireLock } from "../../src/ingest/lock.js";
import { hashTree } from "../../src/ingest/snapshot.js";
import { runCli } from "../../src/program.js";

const T = 30_000;
const Q4 = "src-2026-10-16-q4";
const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

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

/** Initialised wiki + fixture files. Keys are relative to the content directory ("pages/team.md", "index.md"). */
async function lintWiki(
  files: Record<string, string>,
  opts: { contentDir?: string; index?: boolean } = {},
): Promise<{ root: string; paths: ResolvedPaths }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-lintcmd-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  if (opts.contentDir) {
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), `content_dir: ${opts.contentDir}\n`);
  }
  expect((await run(root, ["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
  const paths = resolvePaths(root, (await loadConfig(root)).config);
  for (const [rel, body] of Object.entries(files)) {
    const file = path.join(paths.contentDir, ...rel.split("/"));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  if (opts.index !== false) await writeIndex(paths);
  return { root, paths };
}

const fm = (type: string, title: string, extra = "") => `---\ntype: ${type}\ntitle: ${title}\nsummary: ${title} page\n${extra}---\n`;
const SRC = fm("source", "Q4 notes", `sources: [${Q4}]\n`) + "# Q4 notes\n";
const TEAM =
  fm("team", "Team") +
  "# Team\n\n" +
  `Platform team notes. [[${Q4}]]\n\n` +
  "## Facts\n\n" +
  "- 2026-10-15 · decided · Ana leads QA.\n\n" +
  `See [[Nobody Here]] [[${Q4}]].\n`;
const S1 = { "pages/team.md": TEAM, [`pages/sources/${Q4}.md`]: SRC };
const LUKA = { "pages/people/luka.md": fm("person", "Luka") + `# Luka\n\nLuka joined. [[${Q4}]]\n` };

describe("wikeeper lint (command)", () => {
  it("finds an uncited claim and a broken link at repository-relative paths", async () => {
    const r = await lintWiki(S1);
    const res = await run(r.root, ["lint", "--json"]);
    expect(res.code).toBe(1);
    expect(res.json.data.scope).toBe("pages");
    expect(res.json.data.counts.error).toBe(2);
    expect(res.json.data.findings).toContainEqual(expect.objectContaining({ id: "uncited-claim", severity: "error", path: ".wiki/pages/team.md", line: 12 }));
    expect(res.json.data.findings).toContainEqual(expect.objectContaining({ id: "broken-link", severity: "error", path: ".wiki/pages/team.md", line: 14 }));
  }, T);

  it("follows content_dir in finding paths", async () => {
    const r = await lintWiki(S1, { contentDir: "docs/wiki" });
    const res = await run(r.root, ["lint", "--json"]);
    expect(res.json.data.findings.every((f: any) => f.path === "docs/wiki/pages/team.md")).toBe(true);
    expect(res.json.data.findings.filter((f: any) => f.severity === "error")).toHaveLength(2);
  }, T);

  it("--check narrows the run; human output names file and line", async () => {
    const r = await lintWiki({ ...S1, ...LUKA });
    const one = await run(r.root, ["lint", "--check", "broken-link"]);
    expect(one.text).toContain("[error] broken-link .wiki/pages/team.md:14: [[Nobody Here]] does not resolve to a page");
    expect(one.text).not.toContain("uncited-claim");
    expect(one.text).not.toContain("orphan-page");
    const lines = one.text.trimEnd().split("\n");
    expect(lines[0]).toBe("checked 3 pages with 1 check");
    expect(lines[lines.length - 1]).toBe("1 error, 0 warnings, 0 info");
    expect((await run(r.root, ["lint"])).text).toContain("[warn] orphan-page .wiki/pages/people/luka.md: no other page links to it");
    const two = await run(r.root, ["lint", "--check", "orphan-page", "--check", "broken-link", "--json"]);
    const ids = two.json.data.findings.map((f: any) => `${f.id}:${f.path}`);
    expect(ids.indexOf("orphan-page:.wiki/pages/people/luka.md")).toBeLessThan(ids.indexOf("broken-link:.wiki/pages/team.md"));
    const rules = await run(r.root, ["lint", "--rules", "--json"]);
    expect(rules.json.data.scope).toBe("rules");
    expect(rules.json.data.findings.filter((f: any) => ["broken-link", "orphan-page"].includes(f.id))).toEqual([]);
  }, T);

  it.each([false, true])("is read-only (lock held: %s)", async (locked) => {
    const r = await lintWiki({ ...S1, ...LUKA, "index.md": "# stale\n" }, { index: false });
    if (locked) await acquireLock(r.paths, Q4);
    const snap = async (): Promise<string[]> => (await readdir(r.root, { recursive: true })).sort();
    const before = await hashTree(r.root);
    const names = await snap();
    await run(r.root, ["lint"]);
    await run(r.root, ["lint", "--json"]);
    expect(await hashTree(r.root)).toEqual(before);
    expect(await snap()).toEqual(names);
  }, T);

  it("exits 1 on an error, 0 on warnings or an empty wiki, 2 on usage, 1 when not initialised", async () => {
    const broken = await lintWiki({
      "pages/a.md": fm("project", "Alpha") + `# Alpha\n\nSee [[b]] [[${Q4}]] [[Missing Thing]].\n`,
      "pages/b.md": fm("project", "Beta") + `# Beta\n\nSee [[a]] [[${Q4}]].\n`,
      [`pages/sources/${Q4}.md`]: SRC,
    });
    const one = await run(broken.root, ["lint", "--json"]);
    expect([one.code, one.json.ok, one.json.data.counts]).toEqual([1, true, { error: 1, warning: 0, info: 0 }]);

    const orphan = await lintWiki({ "pages/solo.md": fm("project", "Solo") + `# Solo\n\nAlone. [[${Q4}]]\n`, [`pages/sources/${Q4}.md`]: SRC });
    const o = await run(orphan.root, ["lint", "--json"]);
    expect(o.code).toBe(0);
    expect(o.json.data.counts.warning).toBe(1);

    const empty = await lintWiki({});
    const e = await run(empty.root, ["lint", "--json"]);
    expect([e.code, e.json.data.findings]).toEqual([0, []]);

    const bad = await run(empty.root, ["lint", "--check", "no-such-check", "--json"]);
    expect(bad.code).toBe(2);
    expect(bad.json.error.code).toBe("usage");
    expect(bad.json.error.message).toContain("no-such-check");
    expect(bad.json.error.message).toContain("broken-link");
    expect((await run(empty.root, ["lint", "--rules", "--check", "broken-link", "--json"])).json.error.code).toBe("usage");

    const bare = await mkdtemp(path.join(os.tmpdir(), "wk-lintbare-"));
    tmpDirs.push(bare);
    await mkdir(path.join(bare, ".git"));
    const n = await run(bare, ["lint", "--json"]);
    expect([n.code, n.json.error.code]).toEqual([1, "not_initialised"]);
  }, T);
});
