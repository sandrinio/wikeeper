import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createReadCommand } from "../../src/commands/read.js";
import { runCli } from "../../src/program.js";
import {
  makeBrokenPdf,
  makeNoDocumentDocx,
  makeReportDocx,
  makeReportPdf,
  makeScannedPdf,
} from "../fixtures/read/make-fixtures.js";
import { startFixtureServer, type FixtureServer } from "./http-server.js";

// Red tests for STORY-003-11 (SPRINT-03): `wikeeper read` for DOCX and PDF.
// Until the converters exist, DOCX and PDF answer the stub `unsupported` error, so S1-S4 and the
// DOCX/PDF rows of S5 fail. S4's module trace and the packed package.json belong to the Developer's e2e file.

const cleanup: string[] = [];
let server: FixtureServer;
beforeAll(async () => {
  server = await startFixtureServer();
});
afterAll(async () => {
  await server.close();
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const d of cleanup.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function workdir(files: Record<string, Uint8Array | string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "wikeeper-read-doc-"));
  cleanup.push(dir);
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(dir, name), content);
  return dir;
}

async function readCli(cwd: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(["read", ...args], {
    commands: [createReadCommand()],
    io: {
      cwd,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  } as never);
  const stdout = out.join("");
  let json: any = null;
  try {
    json = JSON.parse(stdout.trim().split("\n")[0]!);
  } catch {
    json = null;
  }
  return { code, stdout, stderr: err.join(""), json };
}

const SEPARATOR = /^\|(\s*:?-{3,}:?\s*\|)+$/;

describe("STORY-003-11 S1: a DOCX keeps its headings, lists and table, and marks its image", () => {
  it("converts report.docx", async () => {
    const cwd = await workdir({ "report.docx": makeReportDocx() });
    const r = await readCli(cwd, ["report.docx", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json?.data).toMatchObject({ format: "docx", title: "Q4 status", author: null, date: null });
    const md: string = r.json.data.markdown;
    expect(md.startsWith("# Q4 status")).toBe(true);
    const lines = md.split("\n");
    expect(lines.filter((l) => l === "# Q4 status")).toHaveLength(1);
    expect(md.split("# Q4 status").length - 1).toBe(1);
    for (const want of ["## Risks", "- Vendor delay", "- Hiring", "1. Sign contract", "2. Hire QA"]) {
      expect(lines).toContain(want);
    }
    const head = lines.indexOf("| Item | Owner | Due |");
    expect(head).toBeGreaterThanOrEqual(0);
    expect(lines[head + 1]).toMatch(SEPARATOR);
    expect(lines[head + 2]).toMatch(/^\|.*Contract.*Product.*2026-11-03.*\|$/);
    expect(lines[head + 3]).toMatch(/^\|.*Hire.*Recruiter.*2026-12-01.*\|$/);
    expect(md).toContain("[image: Org chart]");
    expect(md).not.toContain("data:");
    expect(md).not.toContain("<table");
    expect(r.json.data.warnings).toHaveLength(1);
    expect(r.json.data.warnings[0].code).toBe("unsupported");
    expect(r.json.data.warnings[0].message.startsWith("1 image(s) were not converted")).toBe(true);
  });
});

describe("STORY-003-11 S2: a text PDF keeps its headings, list items, pages and metadata", () => {
  it("converts report.pdf, JSON and human mode", async () => {
    const cwd = await workdir({ "report.pdf": makeReportPdf() });
    const r = await readCli(cwd, ["report.pdf", "--json"]);
    expect(r.code).toBe(0);
    expect(r.json?.data).toMatchObject({ format: "pdf", title: "Q4 status", author: "Product Lead", date: "2026-10-01", warnings: [] });
    const md: string = r.json.data.markdown;
    const lines = md.split("\n");
    expect(lines.slice(0, 3)).toEqual(["# Q4 status", "", "Author: Product Lead · Date: 2026-10-01"]);
    for (const want of [
      "## Risks",
      "- Vendor delay",
      "- Hiring",
      "1. Sign contract",
      "<!-- page 2 -->",
      "## Timeline",
      "Item Owner Due",
      "Sign contract Product Lead 2026-11-03",
    ]) {
      expect(lines).toContain(want);
    }

    // pdf.js writes through console.log; with verbosity 0 nothing may be printed
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const human = await readCli(cwd, ["report.pdf"]);
    const printed = [...log.mock.calls, ...warn.mock.calls].map((c) => c.join(" "));
    expect(human.code).toBe(0);
    expect(human.stdout).toBe(md + "\n");
    expect(human.stderr.split("\n").some((l) => l.includes("Warning:"))).toBe(false);
    expect(printed.some((t) => t.includes("Warning"))).toBe(false);
  });
});

describe("STORY-003-11 S3: a PDF whose pages have almost no letters is reported as likely scanned", () => {
  const rows = [
    { file: "scan.pdf", spec: { pages: 3, imageOnlyPages: [1, 2, 3] }, scanned: true, count: "3 of 3 pages", list: "(pages 1–3)" },
    { file: "half.pdf", spec: { pages: 4, imageOnlyPages: [2, 4] }, scanned: true, count: "2 of 4 pages", list: "(pages 2, 4)" },
    { file: "one.pdf", spec: { pages: 4, imageOnlyPages: [3] }, scanned: false, count: "", list: "" },
    { file: "deck.pdf", spec: { pages: 4, outlinedPages: [1, 2, 3] }, scanned: true, count: "3 of 4 pages", list: "(pages 1–3)" },
  ];
  it.each(rows)("$file", async (row) => {
    const cwd = await workdir({ [row.file]: makeScannedPdf(row.spec) });
    const j = await readCli(cwd, [row.file, "--json"]);
    expect(j.code).toBe(0);
    expect(j.json?.data.format).toBe("pdf");
    const codes = (j.json.data.warnings as Array<{ code: string }>).map((w) => w.code);
    if (row.scanned) {
      expect(codes).toEqual(["likely_scanned"]);
      const msg: string = j.json.data.warnings[0].message;
      expect(msg).toContain(row.count);
      expect(msg).toContain(row.list);
      expect(msg.startsWith("likely scanned: ")).toBe(true);
    } else {
      expect(codes).toEqual([]);
    }
    const h = await readCli(cwd, [row.file]);
    expect(h.code).toBe(0);
    if (row.scanned) {
      expect(h.stderr.split("\n").some((l) => l.startsWith(`warning: likely scanned: ${row.count}`))).toBe(true);
    } else {
      expect(h.stderr).toBe("");
    }
  });
});

describe("STORY-003-11 S4: documents behind a URL read the same as from disk", () => {
  it("reads the three routes", async () => {
    const cwd = await workdir({ "report.pdf": makeReportPdf(), "report.docx": makeReportDocx() });
    const pdf = await readCli(cwd, ["report.pdf", "--json"]);
    const docx = await readCli(cwd, ["report.docx", "--json"]);
    expect(pdf.code).toBe(0);
    expect(docx.code).toBe(0);
    const cases = [
      { path: "/report.pdf", format: "pdf", disk: pdf },
      { path: "/files/report.pdf", format: "pdf", disk: pdf },
      { path: "/report", format: "docx", disk: docx },
    ];
    for (const c of cases) {
      const r = await readCli(cwd, [server.url(c.path), "--json"]);
      expect(r.code, c.path).toBe(0);
      expect(r.json.data.format, c.path).toBe(c.format);
      expect(r.json.data.markdown, c.path).toBe(c.disk.json.data.markdown);
    }
  }, 60_000);
});

describe("STORY-003-11 S5: unsupported and unreadable documents fail cleanly", () => {
  const rows: Array<{ file: string; content: () => Uint8Array | string; exit: number; code: string; text: string }> = [
    { file: "old.doc", content: () => "x", exit: 2, code: "unsupported", text: "save it as .docx" },
    { file: "deck.pptx", content: () => "x", exit: 2, code: "unsupported", text: "export it to PDF" },
    { file: "sheet.xlsx", content: () => "x", exit: 2, code: "unsupported", text: "CSV" },
    { file: "notzip.docx", content: () => "this is plain text, not a zip\n", exit: 1, code: "conversion_failed", text: "not a readable DOCX" },
    { file: "nodoc.docx", content: () => makeNoDocumentDocx(), exit: 1, code: "conversion_failed", text: "not a readable DOCX" },
    { file: "empty.pdf", content: () => new Uint8Array(0), exit: 1, code: "conversion_failed", text: "not a readable PDF" },
    { file: "broken.pdf", content: () => makeBrokenPdf(), exit: 1, code: "conversion_failed", text: "not a readable PDF" },
  ];
  it.each(rows)("$file", async (row) => {
    const cwd = await workdir({ [row.file]: row.content() });
    const r = await readCli(cwd, [row.file, "--json"]);
    expect(r.code).toBe(row.exit);
    expect(r.json?.error?.code).toBe(row.code);
    expect(r.json.error.message).toContain(row.text);
    expect(r.json.command).toBe("read");
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
  });
});
