import { describe, expect, it } from "vitest";
import { RULE_CHECKS } from "../../src/lint/checks.js";
import { RULES_LINT_CHECKS } from "../../src/lint/rules-lint.js";

// The CLI scenarios live in the QA-Red file test/lint/lint-rules.red.node.test.ts; this file pins the registry.
describe("lint --rules registry", () => {
  it("RULE_CHECKS carries every rules check in order", () => {
    expect(RULE_CHECKS.slice(0, RULES_LINT_CHECKS.length).map((c) => c.id)).toEqual(RULES_LINT_CHECKS.map((c) => c.id));
  });
});
