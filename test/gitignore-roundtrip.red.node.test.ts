import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetIntegrations } from "../src/core/integrations.js";
import { runCli } from "../src/program.js";

// BUG-001: .gitignore without a final newline must round-trip byte-for-byte through init -> remove.

let root: string;
beforeEach(async () => {
  resetIntegrations();
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-bug001-"));
  await mkdir(path.join(root, ".git"), { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
});

async function drive(args: string[]) {
  let out = "";
  const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
  const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
  const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
  const line = out.trim().split("\n").filter(Boolean).pop();
  let json: any = null;
  try { json = line ? JSON.parse(line) : null; } catch { json = null; }
  return { code, json };
}
const gi = () => path.join(root, ".gitignore");
const writeGi = (text: string) => writeFile(gi(), Buffer.from(text, "utf8"));
const readGi = () => readFile(gi());

describe("BUG-001 .gitignore round-trip (red)", () => {
  const originals: Array<[string, string]> = [
    ["LF, no final newline", "node_modules\n*.log"],
    ["CRLF, no final newline", "node_modules\r\n*.log"],
    ["BOM, single line, no final newline", "﻿node_modules"],
    ["LF, final newline (regression guard)", "node_modules\n*.log\n"],
  ];

  for (const [label, original] of originals) {
    it(`init then remove restores the original bytes: ${label}`, async () => {
      await writeGi(original);
      expect((await drive(["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
      expect((await drive(["remove", "--json"])).code).toBe(0);
      expect((await readGi()).equals(Buffer.from(original, "utf8"))).toBe(true);
    });
  }

  it("remove --purge also restores the original bytes", async () => {
    const original = "node_modules\n*.log";
    await writeGi(original);
    expect((await drive(["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
    expect((await drive(["remove", "--purge", "--confirm", "wikeeper", "--json"])).code).toBe(0);
    expect((await readGi()).equals(Buffer.from(original, "utf8"))).toBe(true);
  });

  it("a second init changes 0 bytes", async () => {
    await writeGi("node_modules\n*.log");
    expect((await drive(["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
    const first = await readGi();
    expect((await drive(["init", "--json", "--agents", "claude", "--yes"])).code).toBe(0);
    expect((await readGi()).equals(first)).toBe(true);
  });

  it("Error: a malformed managed block is still refused and .gitignore is unchanged", async () => {
    const bad = "# >>> wikeeper >>>\nfoo";
    await writeGi(bad);
    const r = await drive(["init", "--json", "--agents", "claude", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.json?.error?.code).toBe("gitignore_malformed");
    expect((await readGi()).equals(Buffer.from(bad, "utf8"))).toBe(true);
  });
});
