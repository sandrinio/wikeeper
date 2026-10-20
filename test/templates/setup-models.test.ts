import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_NAMES } from "../../src/agents/agent-names.js";
import { mapModel } from "../../src/agents/model-tiers.js";
import { renderModelLine } from "../../src/agents/subagents.js";
import { templatesDir } from "../../src/core/templates.js";

const readTemplate = (name: string) => readFile(path.join(templatesDir(), "system", name), "utf8");

describe("setup-time ingest model consultation", () => {
  it("asks about both jobs before wiring verification and the first-source offer", async () => {
    const setup = await readTemplate("SETUP.md");
    const wiring = setup.split("## 5. Wiring\n")[1]!.split("## 6. Session start")[0]!;
    expect(wiring).toContain("which models will read documents and write wiki pages");
    expect(wiring).toContain("ingest.extractor_model");
    expect(wiring).toContain("ingest.writer_model");
    expect(wiring.indexOf("ask the user whether to keep")).toBeLessThan(wiring.indexOf("Run `wikeeper doctor`"));
    expect(setup.indexOf("## 5. Wiring")).toBeLessThan(setup.indexOf("## 7. First source"));
    expect(wiring).toContain("do not change the main chat model");
    expect(wiring).toContain("the main agent does both jobs instead");
  });

  it("requires approval before saving choices, then updates and inspects the rendered files", async () => {
    const setup = await readTemplate("SETUP.md");
    expect(setup).toContain("Wait for the user's approval of both choices before changing either setting");
    expect(setup).toContain("keep the current choices counts as approval; do not ask again");
    expect(setup).toContain("Run `wikeeper update` after saving the choices");
    expect(setup).toContain("inspect the installed helper files to confirm the choices were rendered as intended");
    expect(setup).toContain("never silently substitute another model");
    expect(setup).toContain("Do not invent model IDs, prices or availability");
  });

  it("explains the four harnesses, portability, inheritance and uncertain availability", async () => {
    const setup = await readTemplate("SETUP.md");
    expect(setup).toContain("Claude Code, Codex, Antigravity and Copilot");
    expect(setup).toContain("Antigravity accepts only the tiers, not arbitrary IDs");
    expect(setup).toContain("Codex leaves the model unset for either tier");
    expect(setup).toContain("Both settings are shared by all configured harnesses");
    expect(setup).toContain("save an empty string (`\"\"`)");
    expect(setup).toContain("Do not unset the key to request inheritance");
    expect(setup).toContain("if you cannot check it, say so and ask the user to confirm it in their model picker");
    for (const agent of AGENT_NAMES) {
      const mapped = mapModel(agent, "");
      expect(mapped).toEqual({});
      expect(renderModelLine("name: helper\nmodel: {{model}}\n", mapped.model)).toBe("name: helper\n");
    }
    expect(mapModel("codex", "small")).toEqual({});
    expect(mapModel("antigravity", "unsupported-model").warning).toBeDefined();
  });

  it("remembers approval and requires consultation for later changes without per-ingest prompts", async () => {
    const setup = await readTemplate("SETUP.md");
    const wiki = await readTemplate("WIKI.md");
    expect(setup).toContain("Remember the approved choices in configuration; do not ask again before every ingest");
    expect(wiki).toContain("Use the saved choices without asking again before every ingest");
    expect(wiki).toContain("If the user asks to change them, or a selected model becomes unavailable");
    expect(wiki).toContain("consultation and approval procedure before changing configuration");
    expect(wiki).toContain("Never silently switch models or treat a harness fallback as the user's approved choice");
    expect(wiki).toContain("`wiki-extractor` uses `ingest.extractor_model`");
    expect(wiki).toContain("`wiki-writer` uses `ingest.writer_model`");
  });
});
