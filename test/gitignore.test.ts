import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { applyManagedBlock, managedIgnoreEntries } from "../src/core/gitignore.js";
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
});

describe("applyManagedBlock", () => {
  it("uses LF when the text has no newline", () => {
    expect(applyManagedBlock("x", ["a"])).toBe("x\n# >>> wikeeper >>>\na\n# <<< wikeeper <<<\n");
  });
});
