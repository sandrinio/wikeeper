// STORY-007-07 QA-Red: token instructions, allow rules for statusline and config get, docs and 0.4.0. Immutable after QA-Red.
// Written once for the merged sprint/S-04 tree (no skip, no existence probe). It imports only modules that exist on the
// sprint branch and reaches the new commands (config, statusline, size approval) through runCli's default program.
// Group A (own tree): scenario 1 except "status lines (R5)", scenario 3, scenario 4, scenario 5 rows 3-4, scenario 2's last step.
// Group B (needs 007-02 ... 007-06 merged): "status lines (R5)", scenario 2's live runs, scenario 5 rows 1-2.
// WIKI.md is checked by phrases, never whole sentences (STORY-008-06 rewrites paragraph 4 and the oversized-page row).
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import { CLAUDE_ENFORCE, READ_ONLY_COMMANDS } from "../../src/agents/enforce/claude.js";
import { CODEX_ENFORCE } from "../../src/agents/enforce/codex.js";
import { SHIPPED_BLOCKS } from "../../src/agents/shipped-blocks.js";
import { agentsIntegration } from "../../src/agents/index.js";
import { setConfigValue, type IngestPermission } from "../../src/core/config.js";
import { registerIntegration, resetIntegrations } from "../../src/core/integrations.js";
import { templatesDir } from "../../src/core/templates.js";
import { PAGE_CHECKS } from "../../src/lint/checks.js";
import { runCli } from "../../src/program.js";
import { claudeDecision, codexDecision, type ClaudePermissions } from "../agents/rule-match.js";
import { checkCaps, checkCommands, checkCoverage, DOCUMENTED_FORMS } from "./structure.js";

const T = 60_000;
const PKG = path.resolve(import.meta.dirname, "..", "..");

const tmpDirs: string[] = [];
beforeEach(() => {
  resetIntegrations();
  registerIntegration({ name: "agents", ...agentsIntegration } as never);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  resetIntegrations();
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true, maxRetries: 3 });
});
async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

// ---------- text readers ----------
const norm = (s: string): string => s.replace(/\r\n/g, "\n");
async function readPkg(...rel: string[]): Promise<string> {
  return norm(await readFile(path.join(PKG, ...rel), "utf8"));
}
const readTemplate = (rel: string): Promise<string> => readPkg("templates", ...rel.split("/"));

/** Sections split on `## ` headings outside fenced code. */
function splitSections(text: string): Array<{ name: string; text: string }> {
  const sections: Array<{ name: string; text: string }> = [];
  let cur: { name: string; text: string } | null = null;
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      if (cur) cur.text += line + "\n";
      continue;
    }
    const m = !fenced ? /^## (.+)$/.exec(line) : null;
    if (m) {
      cur = { name: m[1]!.trim(), text: "" };
      sections.push(cur);
      continue;
    }
    if (cur) cur.text += line + "\n";
  }
  return sections;
}
async function wikiSection(name: string): Promise<string> {
  const s = splitSections(await readTemplate("system/WIKI.md")).find((x) => x.name === name);
  if (!s) throw new Error(`not yet implemented: WIKI.md section "${name}"`);
  return s.text;
}
async function skillBody(): Promise<string> {
  const raw = await readTemplate("skills/wiki-search/SKILL.md");
  const m = /^---\n[\s\S]*?\n---\n/.exec(raw);
  return m ? raw.slice(m[0].length) : raw;
}
/** architecture.md §7.8 (from its "### 7.8" heading to the next heading of level 2 or 3). */
async function architecture78(): Promise<string> {
  const lines = (await readPkg("architecture.md")).split("\n");
  const start = lines.findIndex((l) => /^### 7\.8\b/.test(l));
  if (start < 0) throw new Error('not yet implemented: architecture.md section "### 7.8"');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s|^###\s/.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}
/** architecture.md §10 and §11 (from "## 10." to "## 12."). */
async function architecture1011(): Promise<string> {
  const lines = (await readPkg("architecture.md")).split("\n");
  const start = lines.findIndex((l) => /^## 10\./.test(l));
  const end = lines.findIndex((l) => /^## 12\./.test(l));
  if (start < 0 || end < 0) throw new Error("not yet implemented: architecture.md sections 10 and 11");
  return lines.slice(start, end).join("\n");
}
function firstTable(text: string, header: string): string[][] {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith(header));
  if (start < 0) throw new Error(`not yet implemented: table ${header}`);
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()));
  }
  return rows;
}
/** Field names that open a column-0 status bullet: "- `a`: " or "- `a` and `b`: ". */
function statusFields(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^- `([a-z_]+)`(?: and `([a-z_]+)`)?: /.exec(line);
    if (m) out.push(m[1]!, ...(m[2] ? [m[2]] : []));
  }
  return out;
}
function form(text: string, prefix: string): string {
  for (const m of text.matchAll(/`([^`\n]+)`/g)) if (m[1]!.startsWith(prefix)) return m[1]!;
  throw new Error(`not yet implemented: form ${prefix}`);
}
function argv(span: string): string[] {
  const tokens = span.match(/"[^"]*"|\S+/g) ?? [];
  const out = tokens.map((t) => (t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t));
  expect(out[0]).toBe("wikeeper");
  return out.slice(1);
}
function expectPhrases(part: string, phrases: string[], label: string): void {
  for (const p of phrases) expect(part.includes(p), `${label}: missing ${JSON.stringify(p)}`).toBe(true);
}
const sha = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

// ---------- scenario 1: each size instruction lands in its file and part ----------
describe("STORY-007-07 S1: each size instruction lands in its file and part", () => {
  const wiki: Array<[string, string, string[]]> = [
    ["read size (R2)", "Register", ["`≈4.6k tokens 🟡`", "`data.tokens`", "`data.level`"]],
    [
      "approval (R2)",
      "Register",
      ["`error.details.cause`", "`both`", "`error.details.size`", "`tokens.source.confirm_at`", "every permission mode", "`rough`", "nothing was stored"],
    ],
    ["red source (R2)", "Register", ["A 🔴 source", "`wiki-extractor`", "only the facts", "the parts the user picks"]],
    ["plan (R2)", "Register", ["each file's estimate", "rough", "`needs_approval`", "exits 3 for `size`"]],
    ["scanned PDF (R2, Q7)", "Register", ["`data.tokens_rough`", "1,600 tokens a page", "ask before you read the PDF"]],
    ["finish (R3)", "Write phase", ["`wiki ≈… tokens`", "the largest page"]],
    ["search (R4)", "Search", ["`page_tokens`", "Of a 🔴 page"]],
    [
      "allowed (R5)",
      "Lint and status",
      ["`wikeeper config get`", "`wikeeper statusline`", "`wikeeper statusline --install`", "`wikeeper config set`", "`wikeeper config unset`"],
    ],
    ["sizes (R5)", "Lint and status", ["`≈`", "±15%", "`tokens.source`", "`tokens.page`", "no level"]],
    [
      "session (R5)",
      "Lint and status",
      ["`wiki ≈66k tokens · 43 pages · largest page ≈6.3k 🟡`", "Run it first in every session", "`.claude/settings.local.json`", "never replaces"],
    ],
    [
      "limits (R5)",
      "Lint and status",
      ["`wikeeper config get tokens`", "only when the user asks", "`wikeeper config set tokens.page.red 12k`", "`20k`", "`never`"],
    ],
    ["red page (R5)", "Lint and status", ["once in the session", "`wikeeper config set tokens.page.red <n>`", "never change a limit"]],
    ["finish findings (R5)", "Lint and status", ["`unlogged-change` and `oversized-page` findings for the pages it changed"]],
  ];
  for (const [item, section, phrases] of wiki) {
    it(`${item}: WIKI.md section "${section}" holds its phrases`, async () => {
      expectPhrases(await wikiSection(section), phrases, item);
    });
  }

  it("session (R1): line 4 of templates/agent-block.md holds its phrases and the block stays at 14 lines of at most 200 characters", async () => {
    const lines = (await readTemplate("agent-block.md")).replace(/\n$/, "").split("\n");
    expectPhrases(lines[3]!, ["Once set up", "start each session", "`wikeeper statusline`"], "session (R1)");
    expect(lines).toHaveLength(14);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(200);
  });

  it("status lines (R5): the tokens bullet and the oversized-page row hold their phrases [group B: 007-05's text]", async () => {
    const section = await wikiSection("Lint and status");
    expectPhrases(section, ["- `tokens`: ", "`largest`", "`oversized-page`", "an ordinary ingest never shrinks a page"], "status lines (R5)");
  });

  it("skill (R6): wiki-search names page_tokens and section \"Search\"", async () => {
    expectPhrases(await skillBody(), ["`page_tokens`", 'section "Search"'], "skill (R6)");
  });

  it("architecture (R11): §7.8 holds its phrases", async () => {
    expectPhrases(await architecture78(), ["±15%", "`confirm_at`", "1,600", "`wikeeper statusline --install`"], "architecture §7.8");
  });

  it("architecture (R11): §10 and §11 hold their phrases", async () => {
    expectPhrases(
      await architecture1011(),
      ["`config get [key] / set <key> <value> / unset <key>`", "`statusline [--install]`", "tokens:"],
      "architecture §10 and §11",
    );
  });

  it("README (R11): the body holds its phrases", async () => {
    // README detail moved to docs/reference.md in CR-005, so the row reads both.
    expectPhrases((await readPkg("README.md")) + "\n" + (await readPkg("docs", "reference.md")), ["±15%", "wikeeper config", "wikeeper statusline"], "README");
  });

  it("the status-line example in section \"Lint and status\" has the form wikeeper statusline prints", async () => {
    const example = form(await wikiSection("Lint and status"), "wiki ≈");
    expect(example).toMatch(/^wiki ≈\S+ tokens · \d+ pages? · largest page ≈\S+ (🟢|🟡|🔴)$/);
  });
});

// ---------- scenario 2: the size guidance matches what the commands report ----------
describe("STORY-007-07 S2: the size guidance matches what the commands report", () => {
  async function run(root: string, args: string[]) {
    let out = "";
    let err = "";
    const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
    const stderr = new Writable({ write(c, _e, cb) { err += String(c); cb(); } });
    const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Object.assign(Readable.from([]), { isTTY: false }) } as never });
    let json: any = null;
    try {
      json = JSON.parse(out.trim().split("\n")[0]!);
    } catch {
      /* human output */
    }
    return { code, json, text: out, err };
  }
  async function repo(mode: IngestPermission = "ai"): Promise<string> {
    const root = await tmp("wk-s04tok-");
    await mkdir(path.join(root, ".git"), { recursive: true });
    const init = await run(root, ["init", "--yes", "--agents", "claude", "--json"]);
    expect(init.code, `${init.text} ${init.err}`).toBe(0);
    await setConfigValue(root, "ingest.permission", mode);
    return root;
  }
  const page = (title: string, body: string) => `---\ntype: project\ntitle: ${title}\nsummary: ${title} project\n---\n# ${title}\n\n${body}\n`;

  it("ingest start asks for a size approval with the names the text uses; --approved reruns it [group B: 007-03]", async () => {
    const root = await repo("ai");
    const prose = "The product team reviewed the roadmap and agreed to ship the first release after the security review. ";
    await writeFile(path.join(root, "notes.txt"), prose.repeat(Math.ceil(120_000 / prose.length)).slice(0, 120_000));
    const first = await run(root, ["ingest", "start", "notes.txt", "--json"]);
    expect(first.code, `${first.text} ${first.err}`).toBe(3);
    expect(first.json.ok).toBe(false);
    expect(first.json.error.code).toBe("needs_approval");
    expect(first.json.error.details.cause).toBe("size");
    const size = first.json.error.details.size;
    for (const k of ["tokens", "rough", "level", "limit", "confirm_at"]) expect(size, `details.size.${k}`).toHaveProperty(k);
    expect(size.rough).toBe(false);
    expect(size.level).toBe("yellow");
    expect(size.confirm_at).toBe("yellow");
    expect(size.tokens).toBeGreaterThanOrEqual(20_000);
    expect(size.tokens).toBeLessThan(60_000);
    const again = await run(root, ["ingest", "start", "notes.txt", "--approved", "--json"]);
    expect(again.code, `${again.text} ${again.err}`).toBe(0);
    expect(again.json.ok).toBe(true);
  }, T);

  it("statusline prints one line of the documented form with empty stdin [group B: 007-06]", async () => {
    const root = await repo("ai");
    await mkdir(path.join(root, ".wiki", "pages"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "pages", "atlas.md"), page("atlas", "Atlas is green. ".repeat(300)));
    await writeFile(path.join(root, ".wiki", "pages", "notes.md"), page("notes", "Notes are kept. ".repeat(40)));
    const res = await run(root, ["statusline"]);
    expect(res.code, `${res.text} ${res.err}`).toBe(0);
    expect(res.text.trim().split("\n")).toHaveLength(1);
    expect(res.text.trim()).toMatch(/^wiki ≈\S+ tokens · \d+ pages? · largest page ≈\S+ (🟢|🟡|🔴)$/);
  }, T);

  it("the section's config set / get / unset forms change config.yml and report defaults [group B: 007-02]", async () => {
    const root = await repo("ai");
    const section = await wikiSection("Lint and status");
    const setArgs = argv(form(section, "wikeeper config set tokens.page.red 12k"));
    const set = await run(root, [...setArgs, "--json"]);
    expect(set.code, `${set.text} ${set.err}`).toBe(0);
    expect(set.json.ok).toBe(true);
    const cfg = parseYaml(await readFile(path.join(root, ".wiki", "config.yml"), "utf8")) as any;
    expect(cfg.tokens.page.red).toBe(12000);
    const got = await run(root, ["config", "get", "tokens.page.red", "--json"]);
    expect(got.code).toBe(0);
    expect(got.json.data.entries[0]).toMatchObject({ key: "tokens.page.red", value: 12000, from_default: false });
    const unset = await run(root, ["config", "unset", "tokens.page.red", "--json"]);
    expect(unset.code, `${unset.text} ${unset.err}`).toBe(0);
    expect(unset.json.ok).toBe(true);
    const human = await run(root, ["config", "get", "tokens.page.red"]);
    expect(human.code).toBe(0);
    expect(human.text.trim()).toBe("10000 (default)");
    const json = await run(root, ["config", "get", "tokens.page.red", "--json"]);
    expect(json.json.data.entries[0]).toMatchObject({ key: "tokens.page.red", value: 10000, from_default: true });
  }, T);

  it("config get tokens exits 0 and marks its values as defaults [group B: 007-02]", async () => {
    const root = await repo("ai");
    const setRes = await run(root, ["config", "set", "tokens.page.red", "12k"]);
    expect(setRes.code, `${setRes.text} ${setRes.err}`).toBe(0);
    const unsetRes = await run(root, ["config", "unset", "tokens.page.red"]);
    expect(unsetRes.code, `${unsetRes.text} ${unsetRes.err}`).toBe(0);
    const res = await run(root, ["config", "get", "tokens"]);
    expect(res.code, `${res.text} ${res.err}`).toBe(0);
    const lines = res.text.trim().split("\n");
    expect(lines.length).toBe(5);
    for (const l of lines) {
      if (l.includes("tokens.page.red")) expect(l.endsWith(" (default)"), l).toBe(true);
      else expect(l.endsWith(" (default)"), l).toBe(false);
    }
    const json = await run(root, ["config", "get", "tokens", "--json"]);
    expect(json.json.data.entries.map((e: any) => e.key)).toEqual([
      "tokens.page.yellow",
      "tokens.page.red",
      "tokens.source.yellow",
      "tokens.source.red",
      "tokens.source.confirm_at",
    ]);
    for (const e of json.json.data.entries) expect(e.from_default).toBe(e.key === "tokens.page.red");
  }, T);

  it("the fields that open a status bullet are exactly the keys of status --json, tokens among them [group B: 007-05]", async () => {
    const section = await wikiSection("Lint and status");
    const root = await repo("ai");
    const st = await run(root, ["status", "--json"]);
    expect(st.json?.ok, `${st.text} ${st.err}`).toBe(true);
    expect(Object.keys(st.json.data)).toContain("tokens");
    expect([...new Set(statusFields(section))].sort()).toEqual(Object.keys(st.json.data).sort());
  }, T);

  it("the finding table has one row per PAGE_CHECKS id, oversized-page among them [group B: 007-05]", async () => {
    const ids = PAGE_CHECKS.map((c) => c.id);
    expect(ids).toContain("oversized-page");
    const rows = firstTable(await wikiSection("Lint and status"), "| Finding | What to do |");
    const cells = rows.map((r) => /^`([^`]*)`$/.exec(r[0]!)?.[1] ?? r[0]!);
    expect([...cells].sort()).toEqual([...ids].sort());
  });

  it("WIKI.md keeps its fourteen sections in order and at most 400 lines, and R14 (e) files are unchanged", async () => {
    const text = await readTemplate("system/WIKI.md");
    expect(text.replace(/\n$/, "").split("\n").length).toBeLessThanOrEqual(400);
    expect(splitSections(text).map((s) => s.name)).toEqual([
      "Talking to the user",
      "Ingest",
      "Register",
      "Triage and extract",
      "Write phase",
      "Facts file",
      "Brief",
      "Page format",
      "Delegation",
      "Ambient offers",
      "Search",
      "Answering questions",
      "Proposing rule changes",
      "Lint and status",
      "Log and index",
    ]);
  });

  it("R14 (e): files 007-07 must not touch are unchanged (SPRINT-04 pins)", async () => {
    const PINS: Array<[string, string]> = [
      ["agents/antigravity/wiki-extractor.md", "da3dce3faffc413b6139440b87d184362d2f98ee0d7e3c6903c1e29d528cb0c9"],
      ["agents/antigravity/wiki-writer.md", "f587776bbae123c90f0ac9e3066bcac5baa71d572314d69403a6bab33746f20b"],
      ["agents/claude/wiki-extractor.md", "1ef88fd2aa1a3cf42255b7ec9548be3d87dd92582ba76499672a7dcbe9b53977"],
      ["agents/claude/wiki-writer.md", "090e6b4f6bb1bfe0aa4dd25118253e826f3bee160aacf51b161f82b60018cd83"],
      ["agents/codex/wiki-extractor.toml", "58c660375153c9d9cef0dc4674b2eef4f682e5083480bc12e53638ec12ab6407"],
      ["agents/codex/wiki-writer.toml", "e4c5b865f48e8e6c5203452d5d523ad21649df857029c306e7c6a79150087cbd"],
      ["skills/wiki-ingest/SKILL.md", "91eebe0479df04b61f6cc7f48c10eb9b47dea4ecf487ed0bbcb34494a96287c0"],
      ["system/ONBOARDING.md", "5cc0dea373e130bdc2cb467a27c330aa2aafb759420fd38b2ab4f292ca5ecfc4"],
    ];
    for (const [rel, pin] of PINS) expect(sha(await readTemplate(rel)), rel).toBe(pin);
    const setup = (await readTemplate("system/SETUP.md"))
      .split("\n")
      .filter((l) => !/^\| `(ai|ask|whitelist)` \|/.test(l))
      .join("\n");
    expect(sha(setup), "system/SETUP.md without its three step-4 rows").toBe("577cedaaad08f54c9480622669186f60afd560366b7b356a4bdd7dd6d4fe67ed");
  });
});

// ---------- scenario 3: statusline and config get run without a prompt in every mode ----------
describe("STORY-007-07 S3: statusline and config get run without a prompt in every mode; config set and unset do not", () => {
  function claudePerms(mode: IngestPermission): ClaudePermissions {
    const perms: { allow: string[]; ask: string[] } = { allow: [], ask: [] };
    for (const i of CLAUDE_ENFORCE.items("CMD", mode)) {
      const m = /^permissions\.(allow|ask)\[/.exec(i.identity);
      if (i.kind === "rule" && m !== null) perms[m[1] as "allow" | "ask"].push(i.value as string);
    }
    return perms;
  }
  const codexLines = (mode: IngestPermission): string[] => CODEX_ENFORCE[1]!.items("CMD", mode).map((i) => i.value as string);
  const words = (c: string): string[] => c.split(/\s+/);
  const rows: Array<[string, string, string]> = [
    ["wikeeper statusline", "allow", "allow"],
    ["npx wikeeper statusline", "allow", "allow"],
    ["wikeeper statusline --install", "allow", "allow"],
    ["wikeeper config get", "allow", "allow"],
    ["npx wikeeper config get tokens --json", "allow", "allow"],
    ["wikeeper config set tokens.page.red 12k", "default", "default"],
    ["wikeeper config unset tokens.page.red", "default", "default"],
  ];
  for (const mode of ["ai", "ask", "whitelist"] as const) {
    for (const [command, claude, codex] of rows) {
      it(`${mode}: ${command} is ${claude} for Claude Code and ${codex} for Codex`, () => {
        expect(claudeDecision(claudePerms(mode), command)).toBe(claude);
        expect(codexDecision(codexLines(mode), words(command))).toBe(codex);
      });
    }
  }

  it("READ_ONLY_COMMANDS is exactly lint, status, rules list, statusline and config get", () => {
    expect([...READ_ONLY_COMMANDS]).toEqual(["lint", "status", "rules list", "statusline", "config get"]);
  });

  it("each mode's SETUP.md step-4 row names the four Claude rules and the four Codex lines", async () => {
    const setup = await readTemplate("system/SETUP.md");
    const claude = [
      "Bash(npx wikeeper statusline *)",
      "Bash(wikeeper statusline *)",
      "Bash(npx wikeeper config get *)",
      "Bash(wikeeper config get *)",
    ];
    const codex = [
      'prefix_rule(pattern=["npx","wikeeper","statusline"], decision="allow")',
      'prefix_rule(pattern=["wikeeper","statusline"], decision="allow")',
      'prefix_rule(pattern=["npx","wikeeper","config","get"], decision="allow")',
      'prefix_rule(pattern=["wikeeper","config","get"], decision="allow")',
    ];
    for (const mode of ["ai", "ask", "whitelist"]) {
      const row = setup.split("\n").find((l) => l.startsWith(`| \`${mode}\` |`));
      expect(row, `step-4 row ${mode}`).toBeDefined();
      for (const r of [...claude, ...codex]) expect(row!.includes(`\`${r}\``), `${mode} row: ${r}`).toBe(true);
    }
  });

  it("DOCUMENTED_FORMS holds the five SPRINT-04 forms", () => {
    for (const f of ["statusline", "statusline --install", "config get", "config set", "config unset"]) {
      expect(DOCUMENTED_FORMS, f).toContain(f);
    }
  });
});

// ---------- scenario 4: update brings a 0.3.0 install up to date ----------
describe("STORY-007-07 S4: update brings a 0.3.0 install up to date", () => {
  const START_RE = /^<!-- WIKI:START\b.*-->$/m;
  const END = "<!-- WIKI:END -->";
  async function drive(root: string, args: string[]) {
    let out = "";
    const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
    const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
    const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
    const line = out.trim().split("\n").filter(Boolean).pop();
    let json: any = null;
    try {
      json = line ? JSON.parse(line) : null;
    } catch {
      json = null;
    }
    return { code, json };
  }
  const read = (root: string, rel: string) => readFile(path.join(root, ...rel.split("/")), "utf8");
  function withBlock(text: string, block: string): string {
    const m = START_RE.exec(text)!;
    const end = text.indexOf(END, m.index) + END.length;
    return text.slice(0, m.index) + block + text.slice(end);
  }
  /** sha256 of every regular file under root, skipping .git and .wiki/.cache. */
  async function treeHash(root: string): Promise<string> {
    const h = createHash("sha256");
    const walk = async (rel: string): Promise<void> => {
      const entries = await readdir(path.join(root, rel), { withFileTypes: true });
      for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
        const r = rel === "" ? e.name : `${rel}/${e.name}`;
        if (r === ".git" || r === ".wiki/.cache") continue;
        if (e.isDirectory()) await walk(r);
        else if (e.isFile()) h.update(`F ${r} ${createHash("sha256").update(await readFile(path.join(root, r))).digest("hex")}\n`);
      }
    };
    await walk("");
    return h.digest("hex");
  }
  const NEW_RULE = /statusline|config get|"config","get"/;

  it("update adds the four rules, refreshes the unedited block, leaves the edited one, and is idempotent", async () => {
    // an executable wikeeper on PATH, so init --enforce writes the PATH form of the guard command
    const bin = await tmp("wk-s04bin-");
    if (process.platform === "win32") {
      await writeFile(path.join(bin, "wikeeper.cmd"), "@echo off\r\n");
      vi.stubEnv("PATHEXT", ".CMD");
    } else {
      await writeFile(path.join(bin, "wikeeper"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    }
    vi.stubEnv("PATH", bin);

    const root = await tmp("wk-s04upd-");
    await mkdir(path.join(root, ".git"), { recursive: true });
    await mkdir(path.join(root, ".wiki"), { recursive: true });
    await writeFile(path.join(root, ".wiki", "config.yml"), "agents: [claude, codex]\ningest:\n  permission: ask\n");
    await writeFile(path.join(root, "CLAUDE.md"), "# Team rules\n\nKeep it short.\n");
    await writeFile(path.join(root, "AGENTS.md"), "# Team rules\n\nKeep it short.\n");
    expect((await drive(root, ["init", "--json", "--enforce", "--yes"])).code).toBe(0);

    // hand-build the 0.3.0 install: SPRINT-03 rules only, the SPRINT-03 block in CLAUDE.md, an edited block in AGENTS.md
    const settingsFile = path.join(root, ".claude", "settings.json");
    const settings = JSON.parse(await readFile(settingsFile, "utf8"));
    const before = { allow: [...settings.permissions.allow] as string[] };
    settings.permissions.allow = settings.permissions.allow.filter((r: string) => !NEW_RULE.test(r));
    await writeFile(settingsFile, JSON.stringify(settings, null, 2) + "\n");
    const rulesFile = path.join(root, ".codex", "rules", "wikeeper.rules");
    const olderLines = (await readFile(rulesFile, "utf8")).split("\n").filter((l) => l !== "" && !NEW_RULE.test(l));
    await writeFile(rulesFile, olderLines.join("\n") + "\n");
    const manifestFile = path.join(root, ".wiki", "system", "manifest.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    manifest.files = manifest.files.filter((e: any) => !(e.kind === "rule" && NEW_RULE.test(String(e.identity ?? ""))));
    manifest.package_version = "0.3.0+abc1234";
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
    expect(SHIPPED_BLOCKS.length).toBeGreaterThanOrEqual(3);
    await writeFile(path.join(root, "CLAUDE.md"), withBlock(await read(root, "CLAUDE.md"), SHIPPED_BLOCKS[2]!));
    const edited = (await read(root, "AGENTS.md")).replace("## Project Wiki", "## Edited by the team");
    expect(edited).toContain("## Edited by the team");
    await writeFile(path.join(root, "AGENTS.md"), edited);

    const u = await drive(root, ["update", "--json"]);
    expect(u.code).toBe(0);
    expect(u.json.ok).toBe(true);

    const claudeRules = [
      "Bash(npx wikeeper statusline *)",
      "Bash(wikeeper statusline *)",
      "Bash(npx wikeeper config get *)",
      "Bash(wikeeper config get *)",
    ];
    const codexRules = [
      'prefix_rule(pattern=["npx","wikeeper","statusline"], decision="allow")',
      'prefix_rule(pattern=["wikeeper","statusline"], decision="allow")',
      'prefix_rule(pattern=["npx","wikeeper","config","get"], decision="allow")',
      'prefix_rule(pattern=["wikeeper","config","get"], decision="allow")',
    ];
    const allow: string[] = JSON.parse(await readFile(settingsFile, "utf8")).permissions.allow;
    for (const r of claudeRules) expect(allow, r).toContain(r);
    for (const r of before.allow.filter((x) => !NEW_RULE.test(x))) expect(allow, `kept ${r}`).toContain(r);
    const lines = (await readFile(rulesFile, "utf8")).split("\n").filter(Boolean);
    for (const r of codexRules) expect(lines, r).toContain(r);
    for (const r of olderLines) expect(lines, `kept ${r}`).toContain(r);
    const after = JSON.parse(await readFile(manifestFile, "utf8"));
    const ruleIds: string[] = after.files.filter((e: any) => e.kind === "rule").map((e: any) => e.identity);
    for (const r of claudeRules) expect(ruleIds).toContain(`permissions.allow[${r}]`);
    for (const r of codexRules) expect(ruleIds).toContain(r);

    // the blocks
    const tpl = (await readTemplate("agent-block.md")).replace(/\n+$/, "");
    expect(SHIPPED_BLOCKS.length).toBeGreaterThanOrEqual(4);
    expect(SHIPPED_BLOCKS[SHIPPED_BLOCKS.length - 1]).toBe(tpl);
    const claudeText = await read(root, "CLAUDE.md");
    const m = START_RE.exec(claudeText)!;
    expect(claudeText.slice(m.index, claudeText.indexOf(END, m.index) + END.length)).toBe(tpl);
    expect(await read(root, "AGENTS.md")).toBe(edited);
    expect(SHIPPED_BLOCKS.slice(0, 3).map(sha)).toEqual([
      "4f32351f65f803b265a2bbca697724e6f06738c71680622e8267efc23078fb1b",
      "9bc080837857cacb59c42db9907fad82a148e1c000973d5f08792a7d62295d66",
      "c6fc17d0ef7079d7cf7e6f88f6e5c28e8152cdb74880118167bb29eaf333e168",
    ]);

    // the version
    const pkg = JSON.parse(await readPkg("package.json"));
    const lock = JSON.parse(await readPkg("package-lock.json"));
    expect(pkg.version).toBe("0.4.0");
    expect(lock.version).toBe("0.4.0");
    expect(lock.packages[""].version).toBe("0.4.0");
    expect(after.package_version.startsWith("0.4.0+")).toBe(true);

    // idempotent
    const hash = await treeHash(root);
    expect((await drive(root, ["update", "--json"])).code).toBe(0);
    expect(await treeHash(root)).toBe(hash);
  }, T);
});

// ---------- scenario 5: a form the CLI does not have, or a missing one, fails the checks ----------
describe("STORY-007-07 S5: a form the CLI does not have, or a missing one, fails the checks", () => {
  async function templatesCopy(): Promise<string> {
    const dir = await tmp("wk-s04tpl-");
    await cp(templatesDir(), dir, { recursive: true });
    return dir;
  }
  /** Appends `line` to the end of WIKI.md section "Lint and status" (just before "## Log and index"); returns its 1-based line. */
  async function addToLintSection(dir: string, line: string): Promise<number> {
    const file = path.join(dir, "system", "WIKI.md");
    const text = norm(await readFile(file, "utf8"));
    const at = text.indexOf("\n## Log and index");
    expect(at).toBeGreaterThan(0);
    const next = `${text.slice(0, at)}\n${line}\n${text.slice(at)}`;
    await writeFile(file, next);
    return next.slice(0, at + 1).split("\n").length;
  }
  async function listFiles(dir: string, rel = ""): Promise<string[]> {
    const out: string[] = [];
    for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) out.push(...(await listFiles(dir, r)));
      else out.push(r);
    }
    return out;
  }

  it('WIKI.md "Lint and status" containing `wikeeper config show tokens` is reported as unknown subcommand "config show", with its line [group B: 007-02]', async () => {
    const dir = await templatesCopy();
    const line = await addToLintSection(dir, "`wikeeper config show tokens`");
    const findings = await checkCommands(dir);
    expect(findings.some((f) => f.file === "system/WIKI.md" && f.line === line && f.message.startsWith('unknown subcommand "config show"')), JSON.stringify(findings.slice(0, 5))).toBe(true);
  }, T);

  it('WIKI.md "Lint and status" containing `wikeeper statusline --json-out` is reported as "--json-out" is not an option of "statusline" [group B: 007-06]', async () => {
    const dir = await templatesCopy();
    const line = await addToLintSection(dir, "`wikeeper statusline --json-out`");
    const findings = await checkCommands(dir);
    expect(findings.some((f) => f.file === "system/WIKI.md" && f.line === line && f.message === '"--json-out" is not an option of "statusline"'), JSON.stringify(findings.slice(0, 5))).toBe(true);
  }, T);

  it('no template naming "wikeeper statusline --install" is reported as named by no template', async () => {
    const dir = await templatesCopy();
    for (const rel of await listFiles(dir)) {
      if (!/\.(md|toml|json)$/.test(rel)) continue;
      const file = path.join(dir, ...rel.split("/"));
      const text = await readFile(file, "utf8");
      if (text.includes("wikeeper statusline --install")) await writeFile(file, text.split("wikeeper statusline --install").join("wikeeper statusline"));
    }
    const findings = await checkCoverage(dir);
    expect(findings.map((f) => f.message)).toContain('"wikeeper statusline --install" is named by no template');
  }, T);

  it("agent-block.md with a fifteenth line is over the cap of 14", async () => {
    const dir = await templatesCopy();
    const file = path.join(dir, "agent-block.md");
    const text = norm(await readFile(file, "utf8")).replace(/\n+$/, "");
    expect(text.split("\n")).toHaveLength(14);
    await writeFile(file, `${text}\nA fifteenth line.\n`);
    const findings = await checkCaps(dir);
    expect(findings.some((f) => f.file === "agent-block.md" && f.message.includes("over the cap of 14"))).toBe(true);
  }, T);
});
