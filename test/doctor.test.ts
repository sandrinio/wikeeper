import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/program.js";

const tmpDirs: string[] = [];
afterEach(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});

describe("doctor against a real init (acceptance probe)", () => {
  it("init --json --yes then doctor --json both exit 0", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-probe-"));
    tmpDirs.push(root);
    await mkdir(path.join(root, ".git"), { recursive: true });
    const run = async (argv: string[]) => {
      const out: string[] = [];
      const err: string[] = [];
      const code = await runCli(argv, {
        io: {
          cwd: root,
          stdout: { write: (c: string) => out.push(c) },
          stderr: { write: (c: string) => err.push(c) },
          stdin: Readable.from([]),
        },
      } as never);
      return { code, out: out.join(""), err: err.join("") };
    };
    const init = await run(["init", "--json", "--yes", "--agents", "claude"]);
    expect(init.code, init.out + init.err).toBe(0);
    const doc = await run(["doctor", "--json"]);
    expect(doc.code, doc.out + doc.err).toBe(0);
  });
});
