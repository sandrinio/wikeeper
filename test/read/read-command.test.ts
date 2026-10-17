import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createReadCommand, readCommand } from "../../src/commands/read.js";
import { runCli } from "../../src/program.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 3 });
});

async function drive(cwd: string, args: string[]) {
  const out: string[] = [];
  const code = await runCli(args, {
    commands: [createReadCommand()],
    io: {
      cwd,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: () => undefined },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  } as never);
  return { code, json: JSON.parse(out.join("").trim().split("\n")[0]!) };
}

describe("STORY-003-10: stub formats and --out acceptance", () => {
  it.each([[".doc"], [".pptx"], [".xlsx"]])("%s fails with its hint", async (ext) => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "wk-read-cmd-"));
    dirs.push(cwd);
    await writeFile(path.join(cwd, `a${ext}`), "x");
    const r = await drive(cwd, ["read", `a${ext}`, "--json"]);
    expect(r.code).toBe(2);
    expect(r.json.error.message).toContain(ext);
  });

  it("accepts an absolute path under the temp dir and a ../ path", async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), "wk-read-cmd-"));
    const other = await mkdtemp(path.join(os.tmpdir(), "wk-read-out-"));
    dirs.push(cwd, other);
    await mkdir(path.join(cwd, "sub"));
    await writeFile(path.join(cwd, "sub", "n.md"), "hi\n");
    const abs = await drive(cwd, ["read", path.join("sub", "n.md"), "--out", path.join(other, "a.md"), "--json"]);
    expect(abs.code).toBe(0);
    const rel = await drive(path.join(cwd, "sub"), ["read", "n.md", "--out", path.relative(path.join(cwd, "sub"), path.join(other, "b.txt")), "--json"]);
    expect(rel.code).toBe(0);
  });

  it("the default instance exists", () => {
    expect(typeof readCommand.register).toBe("function");
  });
});
