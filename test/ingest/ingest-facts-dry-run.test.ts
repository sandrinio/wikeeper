import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../../src/program.js";

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true });
});

async function run(root: string, args: string[], stdin?: string) {
  const out: string[] = [];
  const input = Object.assign(Readable.from(stdin === undefined ? [] : [Buffer.from(stdin)]), { isTTY: false });
  const code = await runCli(args, {
    io: { cwd: root, stdout: { write: (c: string) => out.push(c) }, stderr: { write: () => true }, stdin: input },
  } as never);
  return { code, text: out.join("") };
}

describe("ingest facts --dry-run", () => {
  it("previews against stored facts and stores nothing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "wk-dry-dev-"));
    dirs.push(root);
    await mkdir(path.join(root, ".git"), { recursive: true });
    expect((await run(root, ["init", "--yes", "--agents", "claude"])).code).toBe(0);
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(path.join(root, "docs", "q4.md"), "hello\n");
    const start = await run(root, ["ingest", "start", "docs/q4.md", "--kind", "status-report", "--approved", "--json"]);
    const id = JSON.parse(start.text.trim().split("\n")[0]!).data.id as string;
    const doc = (value: string) =>
      JSON.stringify({
        source_id: id,
        kind: "status-report",
        rule_version: null,
        new_entities: [],
        uncovered: [],
        facts: [
          { entity: "project:atlas", field: "status", value, status: "decided", as_of: "2026-10-15", anchor: "p.1", page: "projects/atlas.md", exists: true },
        ],
      });
    const put = async (value: string) => {
      await writeFile(path.join(root, "f.json"), doc(value));
      return ["--file", "f.json"];
    };
    const st = await run(root, ["ingest", "facts", id, "--json", ...(await put("on track"))]);
    expect(st.text).toContain("\"ok\":true");
    const before = (await readdir(path.join(root, ".wiki", "raw"))).sort();
    const r = await run(root, ["ingest", "facts", id, "--dry-run", ...(await put("late"))]);
    expect(r.code).toBe(0);
    expect(r.text).toContain(`dry run for ${id}: nothing stored`);
    expect(r.text).toContain('~ project:atlas status: value "on track" → "late"');
    expect(r.text).toContain("added 0 · removed 0 · changed 1 · unchanged 0");
    expect((await readdir(path.join(root, ".wiki", "raw"))).sort()).toEqual(before);
  });
});
