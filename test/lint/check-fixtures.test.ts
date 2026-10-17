import { afterAll, describe, expect, it } from "vitest";
import { PAGE_CHECKS, RULE_CHECKS, runLint } from "../../src/lint/checks.js";
import { LINT_FIXTURES, cleanupLintFixtures } from "./check-fixtures.js";

afterAll(cleanupLintFixtures);

const registered = [...PAGE_CHECKS, ...RULE_CHECKS].map((c) => c.id);

describe("lint check fixtures (R8)", () => {
  it("has exactly one entry per registered check id", () => {
    const keys = Object.keys(LINT_FIXTURES);
    const missing = registered.filter((id) => !keys.includes(id));
    const extra = keys.filter((id) => !registered.includes(id));
    expect(missing, `registered check with no fixture: ${missing.join(", ")}`).toEqual([]);
    expect(extra, `fixture with no registered check: ${extra.join(", ")}`).toEqual([]);
  });

  it("each entry's scope is the scope of its registry", () => {
    for (const id of registered) {
      const scope = PAGE_CHECKS.some((c) => c.id === id) ? "pages" : "rules";
      expect(LINT_FIXTURES[id]?.scope, id).toBe(scope);
    }
  });

  it.each(registered)("%s: the trigger fixture gives a finding with its id and the pass fixture gives none", async (id) => {
    const fx = LINT_FIXTURES[id];
    expect(fx, `no fixture for "${id}"`).toBeDefined();
    const hits = await runLint(await fx!.trigger(), { scope: fx!.scope, checks: [id] });
    expect(hits.some((f) => f.id === id), `trigger for "${id}" gave ${JSON.stringify(hits)}`).toBe(true);
    const clean = await runLint(await fx!.pass(), { scope: fx!.scope, checks: [id] });
    expect(clean, `pass for "${id}"`).toEqual([]);
  }, 30_000);
});
