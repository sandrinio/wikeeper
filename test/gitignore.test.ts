import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { applyManagedBlock, managedIgnoreEntries, stripManagedBlock } from "../src/core/gitignore.js";
import { resolvePaths } from "../src/core/paths.js";

const root = process.platform === "win32" ? "C:\\repo" : "/repo";

describe("managedIgnoreEntries", () => {
  it("uses /log.md when content_dir is the repo root", () => {
    const config = { ...structuredClone(DEFAULT_CONFIG), content_dir: "." };
    const { entries } = managedIgnoreEntries(resolvePaths(root, config), { private: [] });
    expect(entries).toContain("/log.md");
  });

  it("warns on a private entry outside pages/ and escapes # and !", () => {
    const paths = resolvePaths(root, DEFAULT_CONFIG);
    const r = managedIgnoreEntries(paths, { private: ["../x.md", "b.md", "a.md", "a.md"] });
    expect(r.warnings).toEqual(['private entry "../x.md" is outside pages/; not ignored']);
    expect(r.entries.slice(-2)).toEqual([".wiki/pages/a.md", ".wiki/pages/b.md"]);
    expect(path.sep).toBeTruthy();
  });

  it("mirrors each private entry under archive/, sorted before the pages/ entries", () => {
    const r = managedIgnoreEntries(resolvePaths(root, DEFAULT_CONFIG), { private: ["team.md", "../x.md"] });
    expect(r.warnings).toHaveLength(1);
    expect(r.entries.slice(-2)).toEqual([".wiki/archive/team.md", ".wiki/pages/team.md"]);
  });
});

describe("applyManagedBlock", () => {
  const entries = ["a", "b"];
  it("inserts at the top when the text has no final newline", () => {
    expect(applyManagedBlock("x", ["a"])).toBe("# >>> wikeeper >>>\na\n# <<< wikeeper <<<\nx");
  });
  it.each([
    ["LF", "node_modules\n*.log"],
    ["CRLF", "node_modules\r\n*.log"],
    ["BOM", "\uFEFFnode_modules"],
    ["final newline", "node_modules\n*.log\n"],
  ])("round-trips %s through strip", (_n, t) => {
    expect(stripManagedBlock(applyManagedBlock(t, entries)).text).toBe(t);
  });
});
