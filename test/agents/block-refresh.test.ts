import { describe, expect, it } from "vitest";
import { normaliseBlock, refreshBlock } from "../../src/agents/inject.js";

const S = "<!-- WIKI:START v1 — managed by wikeeper -->";
const E = "<!-- WIKI:END -->";
const OLD = [S, "old", E].join("\n");
const NEW = [S, "new", E].join("\n");
const shipped = [OLD];

describe("normaliseBlock", () => {
  it("drops a BOM, CRLF and trailing line breaks but keeps trailing spaces", () => {
    expect(normaliseBlock("﻿a \r\nb\r\n\r\n")).toBe("a \nb");
  });
});

describe("refreshBlock", () => {
  it("current", () => {
    const t = `x\n\n${NEW}\n`;
    expect(refreshBlock(t, NEW, shipped)).toEqual({ text: t, status: "current" });
  });
  it("refreshed (LF)", () => {
    expect(refreshBlock(`team\n\n${OLD}\n\ntail\n`, NEW, shipped)).toEqual({ text: `team\n\n${NEW}\n\ntail\n`, status: "refreshed" });
  });
  it("refreshed (CRLF with a BOM)", () => {
    const crlf = (s: string) => s.replace(/\n/g, "\r\n");
    const r = refreshBlock("﻿" + crlf(`team\n${OLD}\ntail\n`), NEW, shipped);
    expect(r).toEqual({ text: "﻿" + crlf(`team\n${NEW}\ntail\n`), status: "refreshed" });
  });
  it("refreshed after YAML frontmatter", () => {
    const r = refreshBlock(`---\na: 1\n---\n${OLD}\nrest\n`, NEW, shipped);
    expect(r.text).toBe(`---\na: 1\n---\n${NEW}\nrest\n`);
  });
  it("edited", () => {
    expect(refreshBlock(`${S}\nchanged\n${E}\n`, NEW, shipped).status).toBe("edited");
  });
  it("absent", () => {
    expect(refreshBlock("nothing\n", NEW, shipped).status).toBe("absent");
  });
  it("malformed: no END, two STARTs", () => {
    expect(refreshBlock(`${S}\nold\n`, NEW, shipped).status).toBe("malformed");
    expect(refreshBlock(`${OLD}\n${OLD}\n`, NEW, shipped).status).toBe("malformed");
  });
});
