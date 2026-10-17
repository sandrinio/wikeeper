import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { templatesDir } from "../../src/core/templates.js";

// Red tests for STORY-006-04 R6/R8/R9/R10/R12 and STORY-006-05 R2/R5 (walkthrough rows 8.2, 8.3, 8.4, 8.11).
const AGENTS = ["claude", "antigravity", "codex"] as const;
const read = (...p: string[]): string => readFileSync(path.join(templatesDir(), ...p), "utf8").replace(/\r\n/g, "\n");

interface Fence { info: string; body: string }
interface Section { name: string; text: string; fences: Fence[] }

function splitSections(text: string): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  let fence: Fence | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      if (fence === null) {
        fence = { info: line.slice(3).trim(), body: "" };
      } else {
        cur?.fences.push(fence);
        fence = null;
      }
      if (cur) cur.text += line + "\n";
      continue;
    }
    if (fence !== null) {
      fence.body += line + "\n";
      if (cur) cur.text += line + "\n";
      continue;
    }
    const m = /^## (.+)$/.exec(line);
    if (m) {
      cur = { name: m[1]!.trim(), text: "", fences: [] };
      sections.push(cur);
      continue;
    }
    if (cur) cur.text += line + "\n";
  }
  return sections;
}

function section(name: string): string {
  const s = splitSections(read("system", "WIKI.md")).find((x) => x.name === name);
  if (!s) throw new Error(`WIKI.md has no section "${name}"`);
  return s.text;
}

function readTomlLines(text: string): { fields: Record<string, string>; instructions: string } {
  const fields: Record<string, string> = {};
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
    if (m) fields[m[1]!] = m[2]!;
  }
  return { fields, instructions: block.join("\n") };
}

function splitFrontmatter(text: string): { fm: Record<string, unknown>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!m) throw new Error("no frontmatter");
  return { fm: parseYaml(m[1]!) as Record<string, unknown>, body: m[2]! };
}

function writerText(agent: (typeof AGENTS)[number]): string {
  if (agent === "codex") return readTomlLines(read("agents", "codex", "wiki-writer.toml")).instructions;
  return splitFrontmatter(read("agents", agent, "wiki-writer.md")).body;
}

describe("walkthrough fixes — WIKI.md", () => {
  it("C1 (8.11): --status is documented as built", () => {
    const line = section("Search").split("\n").find((l) => l.startsWith("- `--status"));
    expect(line).toBeDefined();
    expect(line).toContain("`status::`");
    expect(line).toContain("frontmatter");
    expect(line).not.toMatch(/only `decided` or `tentative`/);
  });

  it("C2 (8.4): Write phase names the file-edit tools and closes after finish", () => {
    const text = section("Write phase");
    for (const p of ["file-edit tools", "apply_patch", "write_to_file", "heredoc", "`sed`", "change nothing under `pages/`"]) {
      expect(text, p).toContain(p);
    }
  });

  it("C4 (8.2): Brief section says the main agent writes it into the writer's task", () => {
    const text = section("Brief");
    for (const p of ["main agent", "writer's task", "prints only the `ingest` line"]) expect(text, p).toContain(p);
    expect(text).not.toContain("what the extractor learned");
  });

  it("C5 (8.2): the apply step prints the brief's ingest line", () => {
    const line = section("Write phase").split("\n").find((l) => l.includes("Run `wikeeper ingest apply <id>`"));
    expect(line).toBeDefined();
    expect(line).toContain("the brief's `ingest` line");
    expect(line).not.toContain("prints the facts and the brief.");
  });

  it("C6 (8.2): Delegation says the main agent writes the brief into the writer's task", () => {
    expect(section("Delegation")).toContain("which the main agent writes into its task");
  });

  it("C9 (8.3): Page format requires valid YAML and quoting", () => {
    const text = section("Page format");
    expect(text).toContain("valid YAML");
    expect(text).toContain("quote");
  });
});

describe("walkthrough fixes — wiki-writer prompts and wiki-ingest skill", () => {
  for (const agent of AGENTS) {
    it(`C3 (8.4): ${agent} writer names the file-edit tools and stops after finish`, () => {
      const text = writerText(agent);
      for (const p of ["file-edit tools", "Write or Edit", "apply_patch", "write_to_file", "heredoc", " sed"]) {
        expect(text, p).toContain(p);
      }
      expect(text).toMatch(/after wikeeper ingest finish exits 0, change nothing under \.wiki\/pages/i);
    });

    it(`C7 (8.2): ${agent} writer takes the brief from its task`, () => {
      const text = writerText(agent);
      expect(text).toContain("written by the main agent");
      expect(text).toContain("brief in your task");
      expect(text).not.toContain("returns what the write phase must cover");
    });
  }

  it("C8 (8.2): the wiki-ingest skill tells the main agent to write the brief into the writer's task", () => {
    const body = splitFrontmatter(read("skills", "wiki-ingest", "SKILL.md")).body;
    expect(body).toContain("Write the brief");
    expect(body).toContain("into its task");
  });
});
