import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PDF_TOKENS_PER_PAGE, estimateTokens, formatTokens, levelMark } from "../../src/core/tokens.js";
import { describeTokens, sourceTokens } from "../../src/ingest/source-size.js";
import { readSource } from "../../src/read/index.js";
import { readPdf } from "../../src/read/pdf.js";
import { makeBrokenPdf, makeReportDocx, makeReportPdf, makeScannedPdf } from "../fixtures/read/make-fixtures.js";

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});
async function file(name: string, content: string | Uint8Array): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wk-srcsize-"));
  dirs.push(dir);
  const p = path.join(dir, name);
  await writeFile(p, content);
  return p;
}
const WORDS = Array.from({ length: 1000 }, () => "word").join(" ");

describe("sourceTokens", () => {
  it("counts given text exactly, without reading the original", async () => {
    expect(await sourceTokens({ text: WORDS, originalPath: null, format: null })).toEqual({
      tokens: estimateTokens(WORDS),
      rough: false,
    });
  });
  it("counts a markdown original through read", async () => {
    const p = await file("notes.md", WORDS + "\n");
    expect(await sourceTokens({ text: null, originalPath: p, format: "markdown" })).toEqual({
      tokens: estimateTokens(WORDS),
      rough: false,
    });
  });
  it("counts a DOCX original as read extracts it", async () => {
    const p = await file("report.docx", makeReportDocx());
    const r = await readSource(p, { cwd: path.dirname(p) });
    expect(await sourceTokens({ text: null, originalPath: p, format: "docx" })).toEqual({ tokens: r.tokens, rough: false });
  });
  it("estimates a likely-scanned PDF by its pages, marked rough", async () => {
    const p = await file("scan.pdf", makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }));
    expect(await sourceTokens({ text: null, originalPath: p, format: "pdf" })).toEqual({
      tokens: 3 * PDF_TOKENS_PER_PAGE,
      rough: true,
    });
  });
  it("returns null for a format read refuses", async () => {
    const p = await file("deck.pptx", Buffer.from([1, 2, 3, 4]));
    expect(await sourceTokens({ text: null, originalPath: p, format: null })).toBeNull();
  });
  it("returns null when read fails with conversion_failed", async () => {
    const p = await file("q4.pdf", makeBrokenPdf());
    expect(await sourceTokens({ text: null, originalPath: p, format: "pdf" })).toBeNull();
  });
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)("lets an error that is not a WikeeperError propagate", async () => {
    const p = await file("locked.txt", "x");
    await chmod(p, 0o000);
    await expect(sourceTokens({ text: null, originalPath: p, format: "text" })).rejects.toThrow();
  });
});

describe("readSource tokens and readPdf pages", () => {
  it("sets tokens_rough only for a likely-scanned PDF", async () => {
    const text = await file("report.pdf", makeReportPdf());
    const scan = await file("scan.pdf", makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }));
    const a = await readSource(text, { cwd: path.dirname(text) });
    const b = await readSource(scan, { cwd: path.dirname(scan) });
    expect(a.tokens_rough).toBe(false);
    expect(a.tokens).toBe(estimateTokens(a.markdown));
    expect(b.tokens_rough).toBe(true);
    expect(b.tokens).toBe(4800);
  });
  it("readPdf reports the page count", async () => {
    expect((await readPdf(makeScannedPdf({ pages: 3, imageOnlyPages: [1, 2, 3] }))).pages).toBe(3);
  });
});

describe("describeTokens", () => {
  it("builds the estimate from formatTokens and levelMark", () => {
    expect(describeTokens(1800, "yellow", false)).toBe(`${formatTokens(1800)} tokens ${levelMark("yellow")}`);
  });
  it("prefixes a rough count", () => {
    expect(describeTokens(4800, "green", true)).toBe(`rough ${formatTokens(4800)} tokens ${levelMark("green")}`);
  });
});
