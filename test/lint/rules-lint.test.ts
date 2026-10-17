import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import type { WikeeperConfig } from "../../src/core/config.js";
import { resolvePaths } from "../../src/core/paths.js";
import { parseInstructions } from "../../src/kb/parse-instructions.js";
import { RULES_LINT_CHECKS, RULES_LINT_CHECK_IDS, parseTarget } from "../../src/lint/rules-lint.js";
import type { LintContext } from "../../src/lint/checks.js";

const paths = resolvePaths("/repo", DEFAULT_CONFIG);

async function run(text: string | null, whitelist: string[] = []) {
  const config = structuredClone(DEFAULT_CONFIG) as WikeeperConfig;
  config.ingest.whitelist.kinds = whitelist;
  const ctx: LintContext = {
    paths,
    config,
    pages: [],
    kb: text === null ? null : parseInstructions(text),
    log: [],
    now: new Date(0),
  };
  const out = [];
  for (const c of RULES_LINT_CHECKS) out.push(...(await c.run(ctx)));
  return out;
}

const BASE = [
  "## Questions",
  "Q1 Who owns it?",
  "## Entities",
  "vendor name, target date → vendors.md Q1",
  "## Source kinds",
  "contract (v1) → vendor",
  "## Rule changelog",
  "",
].join("\n");

describe("rules-lint", () => {
  it("registers one rules-scope check per id, in order", () => {
    expect(RULES_LINT_CHECKS.map((c) => c.id)).toEqual([...RULES_LINT_CHECK_IDS]);
    expect(RULES_LINT_CHECKS.every((c) => c.scope === "rules")).toBe(true);
  });

  it("parseTarget splits at the first dot and normalises", () => {
    expect(parseTarget("Vendor")).toEqual({ entity: "vendor", field: null });
    expect(parseTarget("Vendor.Target_Date")).toEqual({ entity: "vendor", field: "target date" });
  });

  it("a clean file has no findings", async () => {
    expect(await run(BASE)).toEqual([]);
  });

  it("kb null gives only missing-file naming wikeeper init", async () => {
    const f = await run(null, ["x"]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: "missing-file", path: ".wiki/kb_instructions.md" });
    expect(f[0]!.message).toContain("wikeeper init");
  });

  it("duplicate kind names the first line; the first one is used by the other checks", async () => {
    const f = await run(BASE.replace("contract (v1) → vendor", "contract (v1) → vendor\ncontract (v1) → ghost"));
    expect(f.map((x) => x.id)).toEqual(["duplicate-rule"]);
    expect(f[0]!.message).toContain("line 6");
  });

  it("one unknown-entity finding per kind line naming all bad targets; field compare is normalised", async () => {
    const f = await run(BASE.replace("contract (v1) → vendor", "contract (v1) → vendor.target_date, a, b.x"));
    expect(f.map((x) => x.id)).toEqual(["unknown-entity"]);
    expect(f[0]!.message).toContain("a, b.x");
    const g = await run(BASE.replace("contract (v1) → vendor", "contract (v1) → vendor.owner, vendor.Target Date"));
    expect(g.map((x) => x.id)).toEqual(["unknown-field"]);
    expect(g[0]!.message).toContain("vendor.owner");
    expect(g[0]!.message).not.toContain("Target Date");
  });

  it("question-without-rule: both messages, and dated facts serve", async () => {
    const none = await run(BASE.replace("Q1 Who owns it?", "Q1 Who owns it?\nQ2 When?").replace(" Q1\n", " Q1\n"));
    expect(none.map((x) => x.id)).toEqual(["question-without-rule"]);
    expect(none[0]!.message).toContain('listed by no entity; add it to an entity line or end it with "(dated facts)"');
    const dated = await run(BASE.replace("Q1 Who owns it?", "Q1 Who owns it?\nQ2 When? (dated facts)"));
    expect(dated).toEqual([]);
    const unserved = await run(BASE.replace("contract (v1) → vendor", "contract (v1) → other"));
    expect(unserved.some((x) => x.id === "question-without-rule" && x.message.includes("listed by vendor, but no source kind targets them"))).toBe(true);
  });

  it("rule-without-question: entity with and without targeting kinds", async () => {
    const f = await run(BASE.replace(" Q1\n", "\n"));
    const r = f.filter((x) => x.id === "rule-without-question");
    expect(r).toHaveLength(1);
    expect(r[0]!.message).toContain("contract");
    const g = await run(BASE.replace(" Q1\n", "\n").replace("contract (v1) → vendor", ""));
    expect(g.find((x) => x.id === "rule-without-question")!.message).not.toContain("source kinds that target");
  });

  it("changelog mention boundaries: initiative vs initiative-doc, and the (v2) form", async () => {
    const text = BASE.replace("contract (v1)", "initiative (v2) → vendor\ninitiative-doc (v1)")+
      "- 2026-10-17: initiative-doc v2: x\n";
    // initiative v2 has no entry (initiative-doc v2 does not count); initiative-doc entry above its v1
    const f = (await run(text)).filter((x) => x.id === "changelog-version-mismatch");
    expect(f).toHaveLength(2);
    expect(f.some((x) => x.message.includes("initiative v2"))).toBe(true);
    const ok = await run(BASE.replace("contract (v1)", "contract (v2)") + "- 2026-10-17: contract (v2): x\n");
    expect(ok.filter((x) => x.id === "changelog-version-mismatch")).toEqual([]);
  });

  it("whitelist entries match version-insensitively; unknown ones give a line-less config finding", async () => {
    const f = await run(BASE, ["contract (v1)", "standup"]);
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ id: "unknown-whitelist-kind", path: ".wiki/config.yml" });
    expect(f[0]!.line).toBeUndefined();
    expect(f[0]!.message).toContain("standup");
  });
});
