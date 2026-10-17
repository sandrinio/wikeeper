import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createReadCommand } from "../../src/commands/read.js";
import { runCli } from "../../src/program.js";
import { makeReportDocx, makeScannedPdf } from "../fixtures/read/make-fixtures.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function run(files: Record<string, Uint8Array>, args: string[]) {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "wk-read-docs-"));
  dirs.push(cwd);
  for (const [n, c] of Object.entries(files)) await writeFile(path.join(cwd, n), c);
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
  return { code, stdout: out.join(""), stderr: err.join("") };
}

describe("read: DOCX and PDF in human mode", () => {
  it("prints the DOCX markdown on stdout and the image warning on stderr", async () => {
    const r = await run({ "report.docx": makeReportDocx() }, ["report.docx"]);
    expect(r.code).toBe(0);
    expect(r.stdout.startsWith("# Q4 status\n")).toBe(true);
    expect(r.stderr).toContain("warning: 1 image(s) were not converted");
  });
  it("keeps the text of a scanned PDF's page numbers and warns", async () => {
    const r = await run({ "scan.pdf": makeScannedPdf({ pages: 2, imageOnlyPages: [1, 2] }) }, ["scan.pdf"]);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("warning: likely scanned: 2 of 2 pages");
  });
});
