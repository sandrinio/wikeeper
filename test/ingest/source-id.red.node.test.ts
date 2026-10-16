import { describe, expect, it } from "vitest";

async function load() {
  return await import("../../src/ingest/source-id.js");
}

describe("source-id (red, STORY-003-01)", () => {
  it("SOURCE_ID_PATTERN and isSourceId accept exactly the id shape", async () => {
    const m = await load();
    expect(m.SOURCE_ID_PATTERN.test("src-2026-10-16-q4-status")).toBe(true);
    expect(m.isSourceId("src-2026-10-16-notes-2")).toBe(true);
    expect(m.isSourceId("src-2026-10-16-")).toBe(false);
    expect(m.isSourceId("src-2026-10-16-Notes")).toBe(false);
    expect(m.isSourceId("src-2026-10-16-a--b")).toBe(false);
    expect(m.isSourceId("../x")).toBe(false);
    expect(m.isSourceId("src-2026-10-16-q4.md")).toBe(false);
  });

  it("slugify: diacritics, punctuation, empty", async () => {
    const m = await load();
    expect(m.slugify("Q4 Status")).toBe("q4-status");
    expect(m.slugify("Café Résumé!!")).toBe("cafe-resume");
    expect(m.slugify("  --Hello,   World--  ")).toBe("hello-world");
    expect(m.slugify("")).toBe("source");
    expect(m.slugify("日本語 ***")).toBe("source");
  });

  it("slugify cuts to at most 40 characters at a '-' boundary when possible", async () => {
    const m = await load();
    const out = m.slugify("alpha beta gamma delta epsilon zeta eta theta iota kappa");
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("-")).toBe(false);
    expect("alpha-beta-gamma-delta-epsilon-zeta-eta-theta-iota-kappa".startsWith(out)).toBe(true);
    expect(out).toBe("alpha-beta-gamma-delta-epsilon-zeta-eta");
    const long = m.slugify("x".repeat(100));
    expect(long).toBe("x".repeat(40));
  });

  it("formatIdDate uses the UTC calendar date", async () => {
    const m = await load();
    expect(m.formatIdDate(new Date("2026-10-16T23:59:59.999Z"))).toBe("2026-10-16");
    expect(m.formatIdDate(new Date("2026-10-17T00:00:00.000Z"))).toBe("2026-10-17");
    expect(m.formatIdDate(new Date("2026-01-05T00:30:00+05:00"))).toBe("2026-01-04");
  });

  it("makeSourceId builds src-date-slug and appends -2, -3 on collisions", async () => {
    const m = await load();
    const d = new Date("2026-10-16T12:00:00Z");
    expect(m.makeSourceId(d, "Q4 Status", () => false)).toBe("src-2026-10-16-q4-status");
    const taken = new Set(["src-2026-10-16-notes", "src-2026-10-16-notes-2"]);
    expect(m.makeSourceId(d, "notes", (id) => taken.has(id))).toBe("src-2026-10-16-notes-3");
    expect(m.makeSourceId(d, "", () => false)).toBe("src-2026-10-16-source");
    expect(m.isSourceId(m.makeSourceId(d, "Ünï cödé / label", () => false))).toBe(true);
  });
});
