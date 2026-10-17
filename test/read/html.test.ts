import { describe, expect, it } from "vitest";
import { countWords, decodeHtml, NEEDS_BROWSER_MIN_WORDS, readHtml } from "../../src/read/html.js";
import {
  formatFromContentType,
  formatFromExtension,
  UNSUPPORTED_HINTS,
  withHeader,
  type Converted,
} from "../../src/read/index.js";

const conv = (o: Partial<Converted>): Converted => ({ body: "", title: null, author: null, date: null, warnings: [], ...o });

describe("withHeader (R5)", () => {
  it("keeps a first heading equal to the title", () => {
    expect(withHeader(conv({ title: "Plan", author: "Product", date: "2026-10-01", body: "# plan\n\ntext" }))).toBe(
      "# plan\n\nAuthor: Product · Date: 2026-10-01\n\ntext",
    );
  });
  it("adds the title when the body does not start with it", () => {
    expect(withHeader(conv({ title: "Plan", body: "text" }))).toBe("# Plan\n\ntext");
  });
  it("writes only the known author or date", () => {
    expect(withHeader(conv({ title: "T", author: "Product", body: "b" }))).toBe("# T\n\nAuthor: Product\n\nb");
    expect(withHeader(conv({ title: "T", date: "2026-01-02", body: "b" }))).toBe("# T\n\nDate: 2026-01-02\n\nb");
  });
  it("adds nothing when nothing is known", () => {
    expect(withHeader(conv({ body: "b" }))).toBe("b");
  });
});

describe("decodeHtml", () => {
  const bytes = Buffer.from("<html><head>%META%</head><body>Café</body></html>".replace("%META%", '<meta charset="windows-1252">'), "latin1");
  it("uses the Content-Type charset first", () => {
    expect(decodeHtml(Buffer.from("Café", "latin1"), "text/html; charset=ISO-8859-1")).toBe("Café");
  });
  it("falls back to a meta charset", () => {
    expect(decodeHtml(bytes, null)).toContain("Café");
  });
  it("falls back to utf-8 for an unknown label", () => {
    expect(decodeHtml(Buffer.from("héllo", "utf8"), "text/html; charset=nonsense-9")).toBe("héllo");
  });
});

describe("countWords and data: images", () => {
  it("counts runs of letters or digits", () => {
    expect(countWords("a bb, 12 ... Привет")).toBe(4);
    expect(NEEDS_BROWSER_MIN_WORDS).toBe(20);
  });
  it("replaces data: images", async () => {
    const big = "A".repeat(2000);
    const html = `<html><head><title>T</title></head><body><article><p>${"word ".repeat(40)}</p><img src="data:image/png;base64,${big}" alt="Chart"></article></body></html>`;
    const r = await readHtml(Buffer.from(html), { url: "file:///x.html", contentType: null });
    expect(r.body).not.toContain("data:image");
  });
});

describe("format helpers", () => {
  it("maps content types with parameters and case", () => {
    expect(formatFromContentType("Text/HTML; charset=utf-8")).toBe("html");
    expect(formatFromContentType("text/csv")).toBe("text");
    expect(formatFromContentType("text/tab-separated-values")).toBe("text");
    expect(formatFromContentType("application/pdf")).toBe("pdf");
    expect(formatFromContentType("application/octet-stream")).toBeNull();
    expect(formatFromContentType(null)).toBeNull();
  });
  it("maps extensions", () => {
    expect(formatFromExtension(".CSV")).toBe("text");
    expect(formatFromExtension(".tsv")).toBe("text");
    expect(formatFromExtension(".htm")).toBe("html");
    expect(formatFromExtension(".markdown")).toBe("markdown");
    expect(formatFromExtension(".xyz")).toBeNull();
  });
  it("has the three unsupported hints", () => {
    expect(UNSUPPORTED_HINTS[".doc"]).toContain("save it as .docx");
    expect(UNSUPPORTED_HINTS[".pptx"]).toContain("export it to PDF");
    expect(UNSUPPORTED_HINTS[".xlsx"]).toContain("export the sheet as CSV");
  });
});
