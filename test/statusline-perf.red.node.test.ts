import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "../src/program.js";
import { generateWiki } from "./fixtures/search/generate-wiki.js";

// STORY-007-06 scenario 2 (red): the status line stays within its performance budget and writes nothing. Own file = own worker.
let root = "";
beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-slperf-"));
  await generateWiki(root, { seed: 1, pages: 500 });
}, 120_000);
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true, maxRetries: 3 });
});

async function tree(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string): Promise<void> => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const abs = path.join(d, e.name);
      if (e.isDirectory()) await walk(abs);
      else {
        const s = await stat(abs);
        out.push(`${path.relative(dir, abs)}|${s.size}|${s.mtimeMs}`);
      }
    }
  };
  await walk(dir);
  return out.sort();
}

async function once(): Promise<{ ms: number; stdout: string; stderr: string; code: number }> {
  const out: string[] = [];
  const err: string[] = [];
  const stdin = Object.assign(Readable.from([Buffer.from(JSON.stringify({ workspace: { current_dir: root } }))]), { isTTY: false });
  const t0 = performance.now();
  const code = await runCli(["statusline"], {
    io: { cwd: os.tmpdir(), stdout: { write: (c: string) => out.push(c) }, stderr: { write: (c: string) => err.push(c) }, stdin },
  } as never);
  return { ms: performance.now() - t0, stdout: out.join(""), stderr: err.join(""), code: code as number };
}

describe("Scenario: The status line stays within its performance budget and writes nothing", () => {
  it("p95 of 30 in-process runs (after one warm-up) on 500 pages is under 300 ms; one line each; no file changed", async () => {
    const before = await tree(root);
    const warm = await once();
    expect(warm.code).toBe(0);
    expect(warm.stdout.startsWith("wiki ≈")).toBe(true);
    const times: number[] = [];
    for (let i = 0; i < 30; i++) {
      const r = await once();
      expect(r.code).toBe(0);
      expect(r.stderr).toBe("");
      expect(r.stdout.split("\n").filter((l) => l !== "")).toHaveLength(1);
      expect(r.stdout.startsWith("wiki ≈")).toBe(true);
      expect(r.stdout).toContain(" · 500 pages · largest page ");
      times.push(r.ms);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(0.95 * times.length) - 1]!;
    expect(p95).toBeLessThan(300);
    expect(await tree(root)).toEqual(before);
  }, 120_000);
});
