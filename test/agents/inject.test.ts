import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { injectBlock, injectIntoFile, stripBlock, stripFromFile, WIKI_END, WIKI_START_V1 } from "../../src/agents/inject.js";

const BLOCK = `${WIKI_START_V1}\nbody\n${WIKI_END}\n`;

describe("inject edge cases", () => {
  it("degenerate frontmatter: closing --- without EOL gains one and keeps it on strip", () => {
    const r = injectBlock("---\nt: 1\n---", BLOCK);
    expect(r.text).toBe(`---\nt: 1\n---\n${BLOCK}`);
    expect(stripBlock(r.text).text).toBe("---\nt: 1\n---\n");
  });

  it("only the first block is stripped", () => {
    const t = `${BLOCK}\n${BLOCK}`;
    expect(stripBlock(t).text).toBe(BLOCK);
  });

  it("original leading blank line survives round-trip", () => {
    const r = injectBlock("\nfoo\n", BLOCK);
    expect(stripBlock(r.text).text).toBe("\nfoo\n");
  });
});

describe("file helpers integration", () => {
  it("inject, re-inject (skipped), strip against a temp dir", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "wikeeper-inj2-"));
    try {
      const f = path.join(dir, "AGENTS.md");
      await writeFile(f, "# mine\n");
      expect((await injectIntoFile(f, BLOCK)).status).toBe("injected");
      const once = await readFile(f, "utf8");
      expect((await injectIntoFile(f, BLOCK)).status).toBe("skipped");
      expect(await readFile(f, "utf8")).toBe(once);
      expect((await stripFromFile(f)).status).toBe("stripped");
      expect(await readFile(f, "utf8")).toBe("# mine\n");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
