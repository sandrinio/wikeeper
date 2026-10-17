import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeReportDocx, makeReportPdf } from "../fixtures/read/make-fixtures.js";
import { traceCli } from "./module-trace.js";
import { packCli } from "./pack.js";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "read");
let cli = "";
let cleanup: () => Promise<void> = async () => {};
let cwd = "";

const resolvedPaths = (r: { resolved: string[] }): string[] => r.resolved.map((u) => u.replace(/\\/g, "/"));
const loads = (r: { resolved: string[] }, pkg: string): boolean => resolvedPaths(r).some((p) => p.includes(`node_modules/${pkg}/`));

beforeAll(async () => {
  const packed = await packCli();
  cli = packed.cli;
  cleanup = packed.cleanup;
  cwd = await mkdtemp(path.join(os.tmpdir(), "wk-e2e-docs-"));
  await writeFile(path.join(cwd, "report.docx"), makeReportDocx());
  await writeFile(path.join(cwd, "report.pdf"), makeReportPdf());
  await copyFile(path.join(FIXTURES, "article.html"), path.join(cwd, "article.html"));
}, 180_000);

afterAll(async () => {
  await cleanup();
  await rm(cwd, { recursive: true, force: true, maxRetries: 3 });
}, 120_000);

describe("STORY-003-11 S4: each document library loads only in its branch", () => {
  it("read report.docx loads mammoth, turndown and the GFM plugin, not unpdf or linkedom", async () => {
    const r = await traceCli(cli, ["read", "report.docx"], cwd);
    expect(r.code).toBe(0);
    for (const p of ["mammoth", "turndown", "@joplin/turndown-plugin-gfm"]) expect(loads(r, p), p).toBe(true);
    for (const p of ["unpdf", "linkedom"]) expect(loads(r, p), p).toBe(false);
  }, 120_000);

  it("read report.pdf loads unpdf and none of mammoth, turndown or linkedom; stdout is clean", async () => {
    const r = await traceCli(cli, ["read", "report.pdf"], cwd);
    expect(r.code).toBe(0);
    expect(loads(r, "unpdf")).toBe(true);
    for (const p of ["mammoth", "turndown", "linkedom"]) expect(loads(r, p), p).toBe(false);
    expect(r.stdout.startsWith("# Q4 status\n")).toBe(true);
    expect(r.stderr.split("\n").some((l) => l.includes("Warning:"))).toBe(false);
  }, 120_000);

  it("read article.html and --help load neither mammoth nor unpdf", async () => {
    for (const args of [["read", "article.html"], ["--help"]]) {
      const r = await traceCli(cli, args, cwd);
      expect(r.code).toBe(0);
      for (const p of ["mammoth", "unpdf"]) expect(loads(r, p), `${args.join(" ")} loaded ${p}`).toBe(false);
    }
  }, 120_000);

  it("the packed package.json lists the three libraries under dependencies", async () => {
    const pkg = JSON.parse(await readFile(path.join(path.dirname(cli), "..", "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toMatchObject({ mammoth: "^1.13.0", "@joplin/turndown-plugin-gfm": "^1.0.68", unpdf: "^1.9.0" });
  });
});
