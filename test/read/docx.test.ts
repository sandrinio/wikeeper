import { describe, expect, it } from "vitest";
import { htmlToMarkdown, promoteFirstRows } from "../../src/read/docx.js";

describe("promoteFirstRows", () => {
  it("promotes the first row of a headerless table", () => {
    const html = "<table><tr><td><p>A</p></td><td><p>B</p></td></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>";
    expect(promoteFirstRows(html)).toBe(
      "<table><tr><th><p>A</p></th><th><p>B</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>",
    );
  });
  it("leaves tables with a <thead> or <th> alone", () => {
    const a = "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>";
    const b = "<table><tr><th>A</th></tr><tr><td>1</td></tr></table>";
    expect(promoteFirstRows(a)).toBe(a);
    expect(promoteFirstRows(b)).toBe(b);
  });
});

describe("htmlToMarkdown", () => {
  it("turns a headerless table into a GFM table with a header", async () => {
    const md = await htmlToMarkdown(
      promoteFirstRows("<table><tr><td>Item</td><td>Owner</td></tr><tr><td>Contract</td><td>Ana</td></tr></table>"),
    );
    const lines = md.split("\n");
    expect(lines[0]).toBe("| Item | Owner |");
    expect(lines[1]).toMatch(/^\| -+ \| -+ \|$/);
    expect(lines[2]).toMatch(/Contract.*Ana/);
  });
  it("writes a one-row table as one header line and one separator line", async () => {
    const md = await htmlToMarkdown(promoteFirstRows("<table><tr><td>Left</td><td>Right</td></tr></table>"));
    expect(md.split("\n")).toHaveLength(2);
    expect(md.split("\n")[0]).toBe("| Left | Right |");
  });
  it("marks images with their alt text, or without", async () => {
    expect(await htmlToMarkdown('<p><img alt="Org chart" src="" /></p>')).toBe("[image: Org chart]");
    expect(await htmlToMarkdown('<p><img src="" /></p>')).toBe("[image]");
  });
  it("writes list items with one space and nests by tab", async () => {
    const md = await htmlToMarkdown("<ul><li>One<ul><li>Inner</li></ul></li><li>Two</li></ul><ol><li>A</li><li>B</li></ol>");
    const lines = md.split("\n");
    expect(lines).toContain("- One");
    expect(lines).toContain("\t- Inner");
    expect(lines).toContain("- Two");
    expect(lines).toContain("1. A");
    expect(lines).toContain("2. B");
  });
  it("removes the Joplin wrapper around an HTML-kept table", async () => {
    const md = await htmlToMarkdown("<table><tr><th>A</th></tr><tr><td><ul><li>x</li></ul></td></tr></table>");
    expect(md).toContain("<table");
    expect(md).not.toContain("joplin-table-wrapper");
  });
});
