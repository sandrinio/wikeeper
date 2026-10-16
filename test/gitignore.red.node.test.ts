import { describe, expect, it } from "vitest";

const load = () => import("../src/core/gitignore.js");
const S = "# >>> wikeeper >>>";
const E = "# <<< wikeeper <<<";

describe("STORY-001-04 gitignore (red)", () => {
  it("creates a block from empty text", async () => {
    const { applyManagedBlock } = await load();
    expect(applyManagedBlock("", ["a", "b"])).toBe(`${S}\na\nb\n${E}\n`);
  });

  it("appends after existing text, adding an EOL when missing", async () => {
    const { applyManagedBlock } = await load();
    expect(applyManagedBlock("node_modules/\n", ["a"])).toBe(`node_modules/\n${S}\na\n${E}\n`);
    expect(applyManagedBlock("node_modules/", ["a"])).toBe(`node_modules/\n${S}\na\n${E}\n`);
  });

  it("replaces an existing block in place and preserves surrounding text", async () => {
    const { applyManagedBlock } = await load();
    const text = `top/\n${S}\nold\n${E}\nbottom/\n`;
    expect(applyManagedBlock(text, ["new1", "new2"])).toBe(`top/\n${S}\nnew1\nnew2\n${E}\nbottom/\n`);
  });

  it("is idempotent", async () => {
    const { applyManagedBlock } = await load();
    const once = applyManagedBlock("x/\n", ["a"]);
    expect(applyManagedBlock(once, ["a"])).toBe(once);
  });

  it("preserves CRLF line endings", async () => {
    const { applyManagedBlock } = await load();
    expect(applyManagedBlock("x/\r\n", ["a"])).toBe(`x/\r\n${S}\r\na\r\n${E}\r\n`);
    const text = `x/\r\n${S}\r\nold\r\n${E}\r\ny/\r\n`;
    expect(applyManagedBlock(text, ["a"])).toBe(`x/\r\n${S}\r\na\r\n${E}\r\ny/\r\n`);
  });

  it("keeps a leading BOM", async () => {
    const { applyManagedBlock } = await load();
    expect(applyManagedBlock("\uFEFFx/\n", ["a"])).toBe(`\uFEFFx/\n${S}\na\n${E}\n`);
    const text = `\uFEFF${S}\nold\n${E}\n`;
    expect(applyManagedBlock(text, ["a"])).toBe(`\uFEFF${S}\na\n${E}\n`);
  });

  it("throws on a start marker without an end marker", async () => {
    const { applyManagedBlock } = await load();
    expect(() => applyManagedBlock(`${S}\nold\n`, ["a"])).toThrowError(/end marker/);
  });

  it("exports the frozen marker constants", async () => {
    const m = await load();
    expect(m.GITIGNORE_BLOCK_START).toBe(S);
    expect(m.GITIGNORE_BLOCK_END).toBe(E);
  });

  it("managedIgnoreEntries lists the default entries in fixed order", async () => {
    const { managedIgnoreEntries } = await load();
    const { resolvePaths } = await import("../src/core/paths.js");
    const { DEFAULT_CONFIG } = await import("../src/core/config.js");
    const root = process.platform === "win32" ? "C:\\repo" : "/repo";
    const config = structuredClone(DEFAULT_CONFIG);
    const { entries, warnings } = managedIgnoreEntries(resolvePaths(root, config), { private: ["team.md"] });
    expect(warnings).toEqual([]);
    expect(entries).toEqual([
      ".wiki/me.md",
      ".wiki/.lock",
      ".wiki/.snapshots/",
      ".wiki/.cache/",
      ".wiki/log.md",
      ".wiki/pages/team.md",
    ]);
  });
});
