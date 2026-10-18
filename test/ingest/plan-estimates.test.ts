import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { docxDocumentBytes, estimateFile, pdfPageCount, planDirectory } from "../../src/ingest/plan.js";
import { sourceTokens } from "../../src/ingest/source-size.js";
import {
  makeBrokenPdf,
  makeNoDocumentDocx,
  makeReportDocx,
  makeReportPdf,
  makeScannedPdf,
} from "../fixtures/read/make-fixtures.js";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

async function repo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wk-pest-unit-"));
  tmpDirs.push(root);
  await mkdir(path.join(root, ".git"), { recursive: true });
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  return root;
}
async function put(root: string, rel: string, content: string | Uint8Array): Promise<string> {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
  return abs;
}
const config = { ...DEFAULT_CONFIG, ingest: { ...DEFAULT_CONFIG.ingest, permission: "ai" as const } };

describe("pdfPageCount", () => {
  it("counts the pages of the 2- and 3-page fixtures", async () => {
    expect(await pdfPageCount(makeReportPdf())).toBe(2);
    expect(await pdfPageCount(makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }))).toBe(3);
  });
  it("returns null for a broken PDF", async () => {
    expect(await pdfPageCount(makeBrokenPdf())).toBeNull();
  });
});

describe("docxDocumentBytes", () => {
  it("reads the compressed size of word/document.xml from the central directory", () => {
    expect(docxDocumentBytes(makeReportDocx())).toBe(2851);
  });
  it("returns null when there is no word/document.xml", () => {
    expect(docxDocumentBytes(makeNoDocumentDocx())).toBeNull();
  });
  it("returns null for a truncated zip", () => {
    expect(docxDocumentBytes(makeReportDocx().subarray(0, 100))).toBeNull();
  });
});

describe("estimateFile", () => {
  it("rounds HTML bytes / 3 and DOCX bytes / 2, both rough", async () => {
    const root = await repo();
    expect(await estimateFile(path.join(root, "x.html"), "html", 1225)).toEqual({ tokens: 408, rough: true });
    const docx = await put(root, "r.docx", makeReportDocx());
    expect(await estimateFile(docx, "docx", 0)).toEqual({ tokens: 1426, rough: true });
  });
  it("estimates a PDF at 1,600 tokens a page and returns null for unreadable or unknown files", async () => {
    const root = await repo();
    const pdf = await put(root, "r.pdf", makeReportPdf());
    expect(await estimateFile(pdf, "pdf", 0)).toEqual({ tokens: 3200, rough: true });
    const broken = await put(root, "b.pdf", makeBrokenPdf());
    expect(await estimateFile(broken, "pdf", 0)).toBeNull();
    expect(await estimateFile(path.join(root, "deck.pptx"), null, 4)).toBeNull();
  });
  it("counts text files exactly as sourceTokens does", async () => {
    const root = await repo();
    const md = await put(root, "n.md", "hello world");
    expect(await estimateFile(md, "markdown", 11)).toEqual(
      await sourceTokens({ text: null, originalPath: md, format: "markdown" }),
    );
  });
});

describe("planDirectory totals", () => {
  it("sums estimates, marks rough and counts the not estimated", async () => {
    const root = await repo();
    await put(root, "docs/report.pdf", makeReportPdf());
    await put(root, "docs/deck.pptx", new Uint8Array([1, 2, 3, 4]));
    const plan = await planDirectory(resolvePaths(root, config), config, path.join(root, "docs"), { kind: null });
    expect(plan.totals).toMatchObject({ new: 2, tokens: 3200, tokens_rough: true, not_estimated: 1 });
    const deck = plan.entries.find((e) => e.path === "docs/deck.pptx")!;
    expect([deck.tokens, deck.tokens_rough, deck.level]).toEqual([null, false, null]);
  });
});

describe("ingest plan human lines", () => {
  async function human(files: Record<string, Uint8Array>): Promise<string> {
    const root = await repo();
    await writeFile(path.join(root, ".wiki", "config.yml"), "agents: [claude]\ningest:\n  permission: ai\n");
    for (const [rel, bytes] of Object.entries(files)) await put(root, rel, bytes);
    const { ingestCommand } = await import("../../src/commands/ingest.js");
    const { runCli } = await import("../../src/program.js");
    const out: string[] = [];
    await runCli(["ingest", "plan", "docs"], {
      commands: [ingestCommand],
      io: {
        cwd: root,
        stdout: { write: (c: string) => out.push(c) },
        stderr: { write: () => true },
        stdin: Readable.from([]),
      },
    } as never);
    return out.join("");
  }
  it("prints the new files line with rough and with not estimated", async () => {
    const text = await human({ "docs/a.pdf": makeReportPdf(), "docs/deck.pptx": new Uint8Array([1, 2, 3, 4]) });
    expect(text).toContain("new files: rough ≈3.2k tokens in total; 1 not estimated");
  });
  it("prints the new files line without rough or not estimated for exact text", async () => {
    const text = await human({ "docs/a.md": new TextEncoder().encode("hello") });
    expect(text).toMatch(/new files: ≈\d+ tokens in total\n/);
  });
});
