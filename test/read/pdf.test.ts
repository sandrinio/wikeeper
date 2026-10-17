import { describe, expect, it } from "vitest";
import {
  formatPageList,
  linesToMarkdown,
  NEAR_EMPTY_PAGE_LETTERS,
  pdfDate,
  scannedPages,
  type PdfLine,
} from "../../src/read/pdf.js";

const L = (text: string, fontSize = 11, y = 700): PdfLine => ({ text, fontSize, y });
const body = (y: number): PdfLine => L("Body text line that is long enough to set the body size", 11, y);

describe("linesToMarkdown", () => {
  it("ranks headings by size, largest first", () => {
    const md = linesToMarkdown([[L("Title", 24, 780), L("Section", 16, 740), body(700), body(686)]]);
    expect(md.split("\n")).toEqual(["# Title", "", "## Section", "", body(0).text, body(0).text]);
  });
  it("joins a heading wrapped over two lines", () => {
    const md = linesToMarkdown([[L("A long title", 24, 780), L("that wraps", 24, 752), body(700)]]);
    expect(md.split("\n")[0]).toBe("# A long title that wraps");
  });
  it("writes bullet and number markers", () => {
    const md = linesToMarkdown([[body(700), L("• One", 11, 686), L("● Two", 11, 672), L("1) First", 11, 658), L("12. Twelfth", 11, 644)]]);
    const lines = md.split("\n");
    expect(lines).toEqual([body(0).text, "", "- One", "- Two", "1. First", "12. Twelfth"]);
  });
  it("starts a paragraph at a gap above 1.5 x body size", () => {
    const md = linesToMarkdown([[body(700), body(686), body(650)]]);
    expect(md.split("\n")).toEqual([body(0).text, body(0).text, "", body(0).text]);
  });
  it("starts every page from page 2 with a page marker", () => {
    const md = linesToMarkdown([[body(700)], [body(700)], [body(700)]]);
    expect(md.split("\n")).toEqual([body(0).text, "", "<!-- page 2 -->", "", body(0).text, "", "<!-- page 3 -->", "", body(0).text]);
  });
});

describe("scannedPages", () => {
  it("NEAR_EMPTY_PAGE_LETTERS is 25", () => {
    expect(NEAR_EMPTY_PAGE_LETTERS).toBe(25);
  });
  it("counts letters, not characters", () => {
    expect(scannedPages([[L("1234567890 +995 555 010 203 49.00 / 100% 2026-10-01 !!")]])).toEqual([1]);
  });
  it("24 letters are near-empty, 25 are not", () => {
    expect(scannedPages([[L("a".repeat(24))], [L("a".repeat(25))]])).toEqual([1]);
  });
  it("counts Georgian letters", () => {
    expect(scannedPages([[L("ა".repeat(25))]])).toEqual([]);
  });
  it("lists the near-empty pages in order", () => {
    expect(scannedPages([[L("x")], [L("a".repeat(30))], [L("y")]])).toEqual([1, 3]);
  });
});

describe("formatPageList", () => {
  it("writes runs of two or more as a range", () => {
    expect(formatPageList([1, 2, 3, 7])).toBe("1–3, 7");
    expect(formatPageList([2, 4])).toBe("2, 4");
    expect(formatPageList([5, 6])).toBe("5–6");
    expect(formatPageList([])).toBe("");
  });
});

describe("pdfDate", () => {
  it("reads a PDF date", () => {
    expect(pdfDate("D:20261001090000Z")).toBe("2026-10-01");
  });
  it("returns null for missing or malformed values", () => {
    expect(pdfDate(undefined)).toBeNull();
    expect(pdfDate("yesterday")).toBeNull();
    expect(pdfDate("D:20261301")).toBeNull();
  });
});
