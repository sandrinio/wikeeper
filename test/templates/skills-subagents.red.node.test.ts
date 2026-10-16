import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { templatesDir } from "../../src/core/templates.js";

const norm = (s: string): string => s.replace(/\r\n/g, "\n").trim();
const SUBAGENTS = ["wiki-extractor", "wiki-writer"] as const;
const AGENTS = ["claude", "antigravity", "codex"] as const;
const VERBS = new Set(["start", "plan", "facts", "apply", "finish", "abort"]);

function splitFrontmatter(text: string): { fm: Record<string, unknown>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("no frontmatter");
  return { fm: parseYaml(m[1]) as Record<string, unknown>, body: m[2] };
}

/** Top-level `key = "value"` lines plus one `developer_instructions = """..."""` block. */
export function readTomlLines(text: string): { fields: Record<string, string>; instructions: string } {
  const fields: Record<string, string> = {};
  let instructions = "";
  let inBlock = false;
  const block: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (inBlock) {
      if (line.includes('"""')) { inBlock = false; continue; }
      block.push(line);
      continue;
    }
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith('developer_instructions = """')) { inBlock = true; fields.developer_instructions = ""; continue; }
    const m = /^([a-z_]+) = "([^"\n]*)"$/.exec(line);
    if (m) fields[m[1]] = m[2];
  }
  instructions = block.join("\n");
  return { fields, instructions };
}

function instructionText(dir: string, agent: (typeof AGENTS)[number], name: string): string {
  if (agent === "codex") {
    return norm(readTomlLines(readFileSync(path.join(dir, "agents", "codex", `${name}.toml`), "utf8")).instructions);
  }
  return norm(splitFrontmatter(readFileSync(path.join(dir, "agents", agent, `${name}.md`), "utf8")).body);
}

export function compareSubagentTexts(dir: string): Array<{ subagent: string; agent: string }> {
  const out: Array<{ subagent: string; agent: string }> = [];
  for (const name of SUBAGENTS) {
    const ref = instructionText(dir, "claude", name);
    for (const agent of ["antigravity", "codex"] as const) {
      if (ref === "" || instructionText(dir, agent, name) !== ref) out.push({ subagent: name, agent });
    }
  }
  return out;
}

function allFiles(dir: string): string[] {
  const files: string[] = [];
  for (const s of ["wiki-ingest", "wiki-search"]) files.push(path.join(dir, "skills", s, "SKILL.md"));
  for (const a of AGENTS) for (const n of SUBAGENTS) files.push(path.join(dir, "agents", a, `${n}${a === "codex" ? ".toml" : ".md"}`));
  return files;
}

const tmps: string[] = [];
afterEach(() => { while (tmps.length) rmSync(tmps.pop()!, { recursive: true, force: true }); });

describe("STORY-006-05 skills and sub-agent prompts", () => {
  const T = templatesDir();

  const rows = [
    { skill: "wiki-ingest", triggers: ["file", "link", "directory", "decision", "risk"], sections: ["Ingest", "Register", "Triage and extract", "Write phase", "Delegation", "Ambient offers"] },
    { skill: "wiki-search", triggers: ["owns", "risk", "decided", "changed since"], sections: ["Search", "Answering questions"] },
  ];
  for (const r of rows) {
    it(`S1 skill ${r.skill} loads at the right moment and leads to WIKI.md`, () => {
      const { fm, body } = splitFrontmatter(readFileSync(path.join(T, "skills", r.skill, "SKILL.md"), "utf8"));
      expect(Object.keys(fm).sort()).toEqual(["description", "name"]);
      expect(fm.name).toBe(r.skill);
      const desc = String(fm.description);
      expect(desc.length).toBeLessThanOrEqual(1024);
      for (const t of r.triggers) expect(desc).toContain(t);
      expect(body).toContain(".wiki/system/WIKI.md");
      for (const s of r.sections) expect(body).toContain(`"${s}"`);
      expect(desc.toLowerCase()).not.toContain("placeholder");
      expect(body.toLowerCase()).not.toContain("placeholder");
    });
  }

  it("S2 wiki-ingest tells every agent when to delegate", () => {
    const { body } = splitFrontmatter(readFileSync(path.join(T, "skills", "wiki-ingest", "SKILL.md"), "utf8"));
    for (const s of ["wiki-extractor", "wikeeper ingest plan", "wiki-writer", "ingest.delegate", "never"]) expect(body).toContain(s);
    expect(body.toLowerCase()).toMatch(/one at a time/);
    expect(body.toLowerCase()).toMatch(/facts file/);
  });

  const fieldRows = [
    { agent: "claude", fields: ["description", "model", "name"] },
    { agent: "antigravity", fields: ["description", "mainAgent", "model", "name"] },
    { agent: "codex", fields: ["description", "developer_instructions", "model", "name"] },
  ] as const;
  for (const r of fieldRows) {
    it(`S3 ${r.agent} sub-agents have exact fields and one shared text`, () => {
      for (const n of SUBAGENTS) {
        if (r.agent === "codex") {
          const raw = readFileSync(path.join(T, "agents", "codex", `${n}.toml`), "utf8");
          const { fields } = readTomlLines(raw);
          expect(Object.keys(fields).sort()).toEqual([...r.fields]);
          expect(fields.name).toBe(n);
          expect(raw.split(/\r?\n/)).toContain('model = "{{model}}"');
          expect(raw).not.toContain("placeholder");
        } else {
          const raw = readFileSync(path.join(T, "agents", r.agent, `${n}.md`), "utf8");
          const { fm } = splitFrontmatter(raw);
          expect(Object.keys(fm).sort()).toEqual([...r.fields]);
          expect(fm.name).toBe(n);
          expect(raw.split(/\r?\n/)).toContain("model: {{model}}");
          if (r.agent === "antigravity") expect(fm.mainAgent).toBe(false);
        }
      }
      expect(compareSubagentTexts(T)).toEqual([]);
    });
  }

  it("S4 extractor and writer keep to their roles", () => {
    const ext = instructionText(T, "claude", "wiki-extractor");
    const wr = instructionText(T, "claude", "wiki-writer");
    expect(ext).toContain("wikeeper ingest facts");
    expect(ext.toLowerCase()).toMatch(/never[^\n]*(edit|write)[^\n]*page/);
    expect(ext).toContain("wikeeper ingest apply");
    expect(ext).toContain("wikeeper ingest finish");
    expect(ext.toLowerCase()).toContain("never");
    for (const s of ["wikeeper ingest apply", "wikeeper ingest finish", "wikeeper ingest abort", "[[<id>]]", "sources/<id>.md"]) expect(wr).toContain(s);
    expect(wr.toLowerCase()).toMatch(/(not|never)[^\n]*(open|read)[^\n]*(original )?source/);
    expect(ext).not.toContain("{{model}}");
    expect(wr).not.toContain("{{model}}");
    for (const f of allFiles(T)) {
      const text = readFileSync(f, "utf8");
      expect(text.toLowerCase()).not.toContain("placeholder");
      for (const m of text.matchAll(/wikeeper ingest ([a-z]+)/g)) expect(VERBS.has(m[1]), `${f}: ${m[0]}`).toBe(true);
    }
    for (const a of ["antigravity", "codex"] as const) {
      expect(readdirSync(path.join(T, "agents", a)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("S5 error: drifted codex wiki-writer text fails the comparison naming wiki-writer and codex", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "wk-skills-"));
    tmps.push(tmp);
    cpSync(T, tmp, { recursive: true });
    expect(compareSubagentTexts(tmp)).toEqual([]);
    const f = path.join(tmp, "agents", "codex", "wiki-writer.toml");
    const before = readFileSync(f, "utf8");
    const after = before.split("\n").filter((l) => !l.includes("wikeeper ingest abort")).join("\n");
    expect(after).not.toBe(before);
    writeFileSync(f, after);
    expect(compareSubagentTexts(tmp)).toContainEqual({ subagent: "wiki-writer", agent: "codex" });
  });
});
