import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";

type Agent = "claude" | "codex" | "antigravity";
interface Mapping { model?: string; warning?: string }
interface TiersModule { mapModel(agent: Agent, value: string): Mapping }
interface SubModule {
  installSubagents(o: Record<string, unknown>): Promise<{ warnings: string[]; created: string[] }>;
  renderModelLine(template: string, model: string | undefined): string;
  SUBAGENT_NAMES: readonly string[];
  SUBAGENT_TARGETS: Record<Agent, { dir: string; ext: string }>;
}

async function loadTiers(): Promise<TiersModule> {
  return (await import("../../src/agents/model-tiers.js")) as unknown as TiersModule;
}
async function loadSub(): Promise<SubModule> {
  return (await import("../../src/agents/subagents.js")) as unknown as SubModule;
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-sub-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
});

function frontmatter(text: string): Record<string, unknown> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  expect(m).not.toBeNull();
  return parseYaml(m![1]) as Record<string, unknown>;
}
async function read(rel: string): Promise<string> {
  return readFile(path.join(root, ...rel.split("/")), "utf8");
}
const mk = () => ({ package_version: "0.0.0", files: [] as unknown[] });
const cfg = (extractor: string, writer = "medium") => ({ ingest: { extractor_model: extractor, writer_model: writer } });

describe("mapModel", () => {
  const rows: Array<[string, Mapping, Mapping, Mapping]> = [
    ["small", { model: "haiku" }, { model: "flash" }, {}],
    ["medium", { model: "sonnet" }, { model: "pro" }, {}],
  ];
  for (const [value, claude, anti, codex] of rows) {
    it(`maps tier ${value}`, async () => {
      const { mapModel } = await loadTiers();
      expect(mapModel("claude", value)).toEqual(claude);
      expect(mapModel("antigravity", value)).toEqual(anti);
      expect(mapModel("codex", value).model).toBeUndefined();
      expect(codex).toEqual({});
    });
  }
  it("explicit id: as-is for claude/codex, inherit + warning for antigravity", async () => {
    const { mapModel } = await loadTiers();
    expect(mapModel("claude", "gpt-6-luna")).toEqual({ model: "gpt-6-luna" });
    expect(mapModel("codex", "gpt-6-luna")).toEqual({ model: "gpt-6-luna" });
    const a = mapModel("antigravity", "gpt-6-luna");
    expect(a.model).toBe("inherit");
    expect(a.warning).toContain("gpt-6-luna");
  });
  it("empty value gives no model; unsafe id gives warning and no model", async () => {
    const { mapModel } = await loadTiers();
    expect(mapModel("claude", "  ")).toEqual({});
    const bad = mapModel("claude", 'x"\ny');
    expect(bad.model).toBeUndefined();
    expect(bad.warning).toContain("unsupported characters");
  });
});

describe("renderModelLine", () => {
  it("substitutes the placeholder", async () => {
    const { renderModelLine } = await loadSub();
    expect(renderModelLine("a\nmodel: {{model}}\nb\n", "haiku")).toBe("a\nmodel: haiku\nb\n");
  });
  it("removes the whole line when there is no value", async () => {
    const { renderModelLine } = await loadSub();
    expect(renderModelLine('a\nmodel = "{{model}}"\nb\n', undefined)).toBe("a\nb\n");
  });
});

describe("installSubagents model mapping (Scenario Outline)", () => {
  const rows: Array<[string, string, string, string | null]> = [
    ["small", "haiku", "flash", null],
    ["medium", "sonnet", "pro", null],
    ["gpt-6-luna", "gpt-6-luna", "inherit", 'model = "gpt-6-luna"'],
  ];
  for (const [value, claude, anti, codex] of rows) {
    it(`extractor_model ${value}`, async () => {
      const { installSubagents } = await loadSub();
      const res = await installSubagents({
        root, agents: ["claude", "codex", "antigravity"], config: cfg(value), manifest: mk(),
      });
      expect(frontmatter(await read(".claude/agents/wiki-extractor.md")).model).toBe(claude);
      const ag = await read(".agents/agents/wiki-extractor.md");
      expect(frontmatter(ag).model).toBe(anti);
      expect(frontmatter(ag).mainAgent).toBe(false);
      expect(ag).toContain("mainAgent: false");
      const toml = await read(".codex/agents/wiki-extractor.toml");
      if (codex === null) expect(toml).not.toMatch(/^model\s*=/m);
      else expect(toml).toContain(codex);
      expect(toml).not.toContain("{{model}}");
      if (value === "gpt-6-luna") expect(res.warnings.length).toBeGreaterThan(0);
      else expect(res.warnings).toEqual([]);
    });
  }

  it("writer uses writer_model independently", async () => {
    const { installSubagents } = await loadSub();
    await installSubagents({ root, agents: ["claude"], config: cfg("small", "medium"), manifest: mk() });
    expect(frontmatter(await read(".claude/agents/wiki-writer.md")).model).toBe("sonnet");
  });

  it("every rendered template parses (YAML frontmatter / TOML lines)", async () => {
    const { installSubagents, SUBAGENT_NAMES, SUBAGENT_TARGETS } = await loadSub();
    await installSubagents({ root, agents: ["claude", "codex", "antigravity"], config: cfg("small"), manifest: mk() });
    for (const agent of ["claude", "antigravity", "codex"] as Agent[]) {
      const { dir, ext } = SUBAGENT_TARGETS[agent];
      for (const n of SUBAGENT_NAMES) {
        const text = await read(`${dir}/${n}${ext}`);
        expect(text.endsWith("\n")).toBe(true);
        expect(text).not.toContain("\r");
        if (ext === ".md") {
          const fm = frontmatter(text);
          expect(fm.name).toBe(n);
          expect(typeof fm.description).toBe("string");
        } else {
          let inBlock = false;
          for (const line of text.split("\n")) {
            if (inBlock) { if (line.includes('"""')) inBlock = false; continue; }
            if (line === "" || line.startsWith("#")) continue;
            if (/^developer_instructions = """/.test(line)) { inBlock = !/"""\s*$/.test(line.slice(line.indexOf('"""') + 3)) ? true : false; continue; }
            expect(line).toMatch(/^[a-z_]+ = "[^"\n]*"$/);
          }
          expect(inBlock).toBe(false);
          expect(text).toContain(`name = "${n}"`);
        }
      }
    }
  });
});
