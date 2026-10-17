import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { resolvePaths } from "../src/core/paths.js";
import { checkKbInstructions } from "../src/lint/rules-lint.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function paths(kb: string | null) {
  const root = await mkdtemp(path.join(os.tmpdir(), "kbdoc-"));
  dirs.push(root);
  await mkdir(path.join(root, ".wiki"), { recursive: true });
  const p = resolvePaths(root, DEFAULT_CONFIG);
  if (kb !== null) await writeFile(p.kbInstructions, kb);
  return p;
}

describe("checkKbInstructions", () => {
  it("missing file gives no check", async () => {
    expect(await checkKbInstructions(await paths(null))).toEqual([]);
  });

  it("a parsing file is ok", async () => {
    const r = await checkKbInstructions(await paths("## Questions\nQ1 x?\n## Entities\ne a → e.md Q1\n## Source kinds\nk (v1) → e\n"));
    expect(r).toEqual([{ id: "kb-instructions-valid", severity: "ok", message: "no parse issues", file: ".wiki/kb_instructions.md" }]);
  });

  it("issues give one warning naming the first line and code", async () => {
    const r = await checkKbInstructions(await paths("## Questions\nQ1 x?\n## Entities\ne a →\n## Source kinds\nk (v1) → e\n"));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severity: "warning", fix: "run wikeeper lint --rules" });
    expect(r[0]!.message).toMatch(/^\d+ parse issues? \(first: line 4, malformed-entity\)$/);
  });

  it("a whole-file issue prints the code alone", async () => {
    const r = await checkKbInstructions(await paths("## Questions\nQ1 x?\n## Source kinds\nk (v1) → e\n"));
    expect(r[0]!.message).toContain("(first: missing-section)");
  });
});
