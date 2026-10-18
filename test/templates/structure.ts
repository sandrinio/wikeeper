// Structural checker for the templates tree (STORY-006-06). Imported by test/templates.test.ts and the QA-Red file;
// every check takes the templates directory and returns findings as { file, line, message }.
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { parse as parseYaml } from "yaml";
import { ANTIGRAVITY_ENFORCE } from "../../src/agents/enforce/antigravity.js";
import { CLAUDE_ENFORCE } from "../../src/agents/enforce/claude.js";
import { CODEX_ENFORCE } from "../../src/agents/enforce/codex.js";
import { GUARD_REASON } from "../../src/agents/hook-protocols.js";
import { listTemplateFiles } from "../../src/core/templates.js";
import { parseSourceKinds } from "../../src/ingest/kind-rules.js";
import { parseInstructions } from "../../src/kb/parse-instructions.js";
import { PAGE_CHECKS, RULE_CHECKS } from "../../src/lint/checks.js";
import { createProgram, runCli } from "../../src/program.js";
import { parsePage } from "../../src/wiki/parse-page.js";

export interface Finding { file: string; line: number; message: string }
export interface CommandTree {
  rootOptions: Set<string>;
  commands: Map<string, { options: Set<string>; subcommands: Map<string, Set<string>> }>;
}
export interface CommandRef { line: number; words: string[]; flags: string[]; wildcard?: true }

export function formatFinding(f: Finding): string {
  return `${f.file}:${f.line} — ${f.message}`;
}

const norm = (s: string): string => s.replace(/\r\n/g, "\n");

async function files(dir: string): Promise<string[]> {
  return (await listTemplateFiles("", dir)).map((p) => p.replace(/^\//, ""));
}
async function read(dir: string, rel: string): Promise<string> {
  return norm(await readFile(path.join(dir, ...rel.split("/")), "utf8"));
}
function lineAt(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

// ---------- command tree ----------

export function commandTree(): CommandTree {
  const program = createProgram();
  const longs = (c: { options: readonly { long?: string }[] }): Set<string> =>
    new Set(c.options.map((o) => o.long).filter((l): l is string => typeof l === "string"));
  const rootOptions = longs(program);
  rootOptions.add("--version");
  rootOptions.add("--help");
  const commands: CommandTree["commands"] = new Map();
  for (const c of program.commands) {
    const subcommands = new Map<string, Set<string>>();
    for (const s of c.commands) subcommands.set(s.name(), longs(s));
    commands.set(c.name(), { options: longs(c), subcommands });
  }
  return { rootOptions, commands };
}

// ---------- reference extraction ----------

const REF_RE = /(?:npx\s+)?wikeeper\s+([a-z][a-z-]*)(?:\s+([a-z][a-z-]*))?/g;

/** Rewrites Codex `prefix_rule(pattern=["a","b"], …)` into the words it matches. */
function expandPrefixRules(unit: string): string {
  return unit.replace(/prefix_rule\(\s*pattern=\[([^\]]*)\][^)]*\)/g, (_m, tokens: string) =>
    [...tokens.matchAll(/"([^"]*)"/g)].map((t) => t[1]).join(" "),
  );
}

function refsInUnit(unit: string, line: number): CommandRef[] {
  const text = expandPrefixRules(unit);
  const matches = [...text.matchAll(REF_RE)];
  return matches.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1]!.index ?? text.length) : text.length;
    const flags = [...text.slice(start, end).matchAll(/--[a-z][a-z-]*/g)].map((f) => f[0]);
    const words = [m[1]!];
    if (m[2] !== undefined) words.push(m[2]);
    const ref: CommandRef = { line, words, flags };
    if (m[2] === undefined && /^\s+\*/.test(text.slice(start))) ref.wildcard = true;
    return ref;
  });
}

/** Units scanned for commands: code spans and fenced lines (md, json), developer_instructions lines (toml), or whole lines. */
function commandUnits(file: string, text: string): Array<{ line: number; unit: string }> {
  const lines = norm(text).split("\n");
  const out: Array<{ line: number; unit: string }> = [];
  if (/\.toml$/.test(file)) {
    let inBlock = false;
    lines.forEach((l, i) => {
      if (inBlock) {
        if (l.includes('"""')) inBlock = false;
        else out.push({ line: i + 1, unit: l });
      } else if (l.startsWith('developer_instructions = """')) inBlock = true;
    });
    return out;
  }
  if (/\.(md|json)$/.test(file)) {
    let fence: string | null = null;
    lines.forEach((l, i) => {
      const f = /^\s*(```+|~~~+)/.exec(l);
      if (f) {
        const marker = f[1]!.charAt(0);
        if (fence === null) fence = marker;
        else if (fence === marker) fence = null;
        return;
      }
      if (fence !== null) {
        out.push({ line: i + 1, unit: l });
        return;
      }
      for (const span of l.matchAll(/`([^`\n]+)`/g)) out.push({ line: i + 1, unit: span[1]! });
    });
    return out;
  }
  lines.forEach((l, i) => out.push({ line: i + 1, unit: l }));
  return out;
}

export function extractCommandRefs(file: string, text: string): CommandRef[] {
  return commandUnits(file, text).flatMap(({ line, unit }) => refsInUnit(unit, line));
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

const MODES = ["ai", "ask", "whitelist"] as const;
const GUARD_CMDS = { claude: "claude", codex: "codex", antigravity: "antigravity" } as const;

function enforceSources(): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = [];
  for (const mode of MODES) {
    const specs = [
      { agent: GUARD_CMDS.claude, items: (cmd: string) => CLAUDE_ENFORCE.items(cmd, mode) },
      { agent: GUARD_CMDS.codex, items: (cmd: string) => CODEX_ENFORCE.flatMap((s) => s.items(cmd, mode)) },
      { agent: GUARD_CMDS.antigravity, items: (cmd: string) => ANTIGRAVITY_ENFORCE.items(cmd, mode) },
    ];
    for (const s of specs) {
      const cmd = `wikeeper hook guard --agent ${s.agent}`;
      for (const item of s.items(cmd)) {
        for (const str of strings(item.value)) out.push({ file: `enforce:${mode}:${s.agent}`, text: str });
      }
    }
  }
  return out;
}

function checkRefs(file: string, refs: CommandRef[], tree: CommandTree): Finding[] {
  const out: Finding[] = [];
  for (const ref of refs) {
    const [cmdName, second] = ref.words;
    const cmd = tree.commands.get(cmdName!);
    if (cmd === undefined) {
      out.push({ file, line: ref.line, message: `unknown command "wikeeper ${cmdName}"` });
      continue;
    }
    let allowed = new Set([...tree.rootOptions, ...cmd.options]);
    if (cmd.subcommands.size > 0 && second !== undefined) {
      const sub = cmd.subcommands.get(second);
      if (sub === undefined) {
        out.push({ file, line: ref.line, message: `unknown subcommand "${cmdName} ${second}" (known: ${[...cmd.subcommands.keys()].join(", ")})` });
        continue;
      }
      allowed = new Set([...allowed, ...sub]);
    }
    if (ref.wildcard === true && cmd.subcommands.size > 0) {
      for (const sub of cmd.subcommands.values()) allowed = new Set([...allowed, ...sub]);
      for (const flag of ref.flags) {
        if (!allowed.has(flag)) out.push({ file, line: ref.line, message: `"${flag}" is not an option of "${cmdName}" or any of its subcommands` });
      }
      continue;
    }
    const shown = cmd.subcommands.size > 0 && second !== undefined ? `${cmdName} ${second}` : cmdName!;
    for (const flag of ref.flags) {
      if (!allowed.has(flag)) out.push({ file, line: ref.line, message: `"${flag}" is not an option of "${shown}"` });
    }
  }
  return out;
}

export async function checkCommands(dir: string, tree: CommandTree = commandTree()): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const file of await files(dir)) {
    out.push(...checkRefs(file, extractCommandRefs(file, await read(dir, file)), tree));
  }
  out.push(...checkRefs("GUARD_REASON", extractCommandRefs("GUARD_REASON", GUARD_REASON), tree));
  for (const src of enforceSources()) out.push(...checkRefs(src.file, extractCommandRefs(src.file, src.text), tree));
  return out;
}

export async function checkDoctorIds(dir: string, ids: readonly string[]): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const file of await files(dir)) {
    if (!/\.(md|toml|json)$/.test(file)) continue;
    norm(await read(dir, file)).split("\n").forEach((l, i) => {
      for (const m of l.matchAll(/`([a-z][a-z0-9-]*)` check\b/g)) {
        if (!ids.includes(m[1]!)) out.push({ file, line: i + 1, message: `doctor check "${m[1]}" is not reported by wikeeper doctor --json` });
      }
    });
  }
  return out;
}

export async function doctorCheckIds(): Promise<string[]> {
  const root = await mkdtemp(path.join(os.tmpdir(), "wikeeper-doctor-ids-"));
  try {
    await mkdir(path.join(root, ".git"), { recursive: true });
    const drive = async (args: string[]): Promise<{ code: number; out: string }> => {
      let out = "";
      const stdout = new Writable({ write(c, _e, cb) { out += String(c); cb(); } });
      const stderr = new Writable({ write(_c, _e, cb) { cb(); } });
      const code = await runCli(args, { io: { cwd: root, stdout, stderr, stdin: Readable.from([]) } as never });
      return { code, out };
    };
    await drive(["init", "--json", "--yes", "--agents", "claude"]);
    const { out } = await drive(["doctor", "--json"]);
    const last = out.trim().split("\n").filter(Boolean).pop() ?? "{}";
    const parsed = JSON.parse(last) as { data?: { checks?: Array<{ id: string }> } };
    return (parsed.data?.checks ?? []).map((c) => c.id);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}

// ---------- paths ----------

const RUNTIME_FILES = new Set([".wiki/me.md", ".wiki/project.md", ".wiki/kb_instructions.md", ".wiki/config.yml", ".wiki/index.md"]);
const CLI_FILES = new Set([".wiki", ".wiki/log.md", ".wiki/.lock", ".wiki/system/manifest.json"]);
const CLI_DIRS = [".wiki/pages", ".wiki/raw", ".wiki/log", ".wiki/.snapshots", ".wiki/.cache"];

export function classifyWikiPath(p: string, dir: string): "system" | "runtime" | "cli" | "unknown" {
  const clean = p.replace(/\/+$/, "");
  if (CLI_FILES.has(clean)) return "cli";
  if (RUNTIME_FILES.has(clean)) return "runtime";
  if (CLI_DIRS.some((d) => clean === d || clean.startsWith(`${d}/`))) return "cli";
  if (clean === ".wiki/system" || clean.startsWith(".wiki/system/")) {
    const rel = clean.slice(".wiki/system".length).replace(/^\//, "");
    return existsSync(path.join(dir, "system", ...rel.split("/").filter(Boolean))) ? "system" : "unknown";
  }
  return "unknown";
}

function pathFindings(file: string, text: string, dir: string): Finding[] {
  const out: Finding[] = [];
  norm(text).split("\n").forEach((l, i) => {
    for (const m of l.matchAll(/(?<![\w.])\.wiki(?![A-Za-z0-9_])(?:\/[A-Za-z0-9_.\-/]*)?/g)) {
      const p = m[0].replace(/[.,;:)]+$/, "");
      if (classifyWikiPath(p, dir) === "unknown") out.push({ file, line: i + 1, message: `"${p}" does not exist in the package or the CLI's layout` });
    }
  });
  return out;
}

export async function checkPaths(dir: string): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const file of await files(dir)) out.push(...pathFindings(file, await read(dir, file), dir));
  out.push(...pathFindings("GUARD_REASON", GUARD_REASON, dir));
  return out;
}

// ---------- sections ----------

const SECTION_RE = /(?:([A-Za-z0-9_./-]+\.md)`?,\s+)?\bsections?\b([^".\n]{0,40}?)((?:"[^"]+"(?:\s*,\s*and\s+|\s*,\s*|\s+and\s+)?)+)/g;
const PROTOCOL_FILES = ["WIKI.md", "SETUP.md", "ONBOARDING.md"];

function headings(text: string): Set<string> {
  const set = new Set<string>();
  let fence: string | null = null;
  for (const l of norm(text).split("\n")) {
    const f = /^\s*(```+|~~~+)/.exec(l);
    if (f) {
      const marker = f[1]!.charAt(0);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h = /^##\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) set.add(h[1]!);
  }
  return set;
}

async function sectionFindings(file: string, text: string, dir: string, cache: Map<string, Set<string> | null>): Promise<Finding[]> {
  const out: Finding[] = [];
  const t = norm(text);
  for (const m of t.matchAll(SECTION_RE)) {
    const index = m.index ?? 0;
    const line = lineAt(t, index);
    let target: string | null = m[1] !== undefined ? path.posix.basename(m[1]) : null;
    if (target === null) {
      const own = /^system\/([A-Za-z0-9_-]+\.md)$/.exec(file);
      if (own) target = own[1]!;
      else {
        const before = t.slice(0, index);
        const named = [...before.matchAll(/\b(WIKI|SETUP|ONBOARDING)\.md\b/g)].pop();
        if (named) target = named[0];
      }
    }
    if (target === null) {
      out.push({ file, line, message: `section reference ${m[3]!.trim()} names no protocol file` });
      continue;
    }
    if (!cache.has(target)) {
      cache.set(target, existsSync(path.join(dir, "system", target)) ? headings(await read(dir, `system/${target}`)) : null);
    }
    const heads = cache.get(target);
    if (heads === null || heads === undefined) {
      out.push({ file, line, message: `section reference names ${target}, which is not under system/` });
      continue;
    }
    for (const q of m[3]!.matchAll(/"([^"]+)"/g)) {
      if (!heads.has(q[1]!)) out.push({ file, line, message: `section "${q[1]}" is not a "## " heading in ${target}` });
    }
  }
  return out;
}

export async function checkSections(dir: string): Promise<Finding[]> {
  const cache = new Map<string, Set<string> | null>();
  const out: Finding[] = [];
  for (const file of await files(dir)) out.push(...(await sectionFindings(file, await read(dir, file), dir, cache)));
  out.push(...(await sectionFindings("GUARD_REASON", GUARD_REASON, dir, cache)));
  return out;
}

// ---------- formats ----------

function frontmatter(text: string): Record<string, unknown> | null {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(norm(text));
  if (!m) return null;
  const v = parseYaml(m[1]!.replace(/\{\{model\}\}/g, "MODEL")) as unknown;
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/** Top-level `key = "value"` lines plus one `developer_instructions = """…"""` block. */
function readTomlKeys(text: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let inBlock = false;
  for (const line of norm(text).split("\n")) {
    if (inBlock) {
      if (line.includes('"""')) inBlock = false;
      continue;
    }
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith('developer_instructions = """')) { inBlock = true; fields.developer_instructions = ""; continue; }
    const m = /^([a-z_]+) = "([^"\n]*)"$/.exec(line);
    if (m) fields[m[1]!] = m[2]!;
  }
  return fields;
}

const same = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().join(",") === [...b].sort().join(",");

export async function checkFormats(dir: string): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const file of await files(dir)) {
    const text = await read(dir, file);
    const add = (message: string): void => void out.push({ file, line: 1, message });
    let m: RegExpExecArray | null;
    if ((m = /^skills\/([^/]+)\/SKILL\.md$/.exec(file))) {
      const fm = frontmatter(text);
      if (fm === null) { add("no YAML frontmatter"); continue; }
      if (!same(Object.keys(fm), ["name", "description"])) add(`frontmatter keys must be exactly name, description (got ${Object.keys(fm).join(", ")})`);
      if (fm.name !== m[1]) add(`name "${String(fm.name)}" must equal the folder "${m[1]}"`);
      if (typeof fm.description !== "string" || fm.description.trim() === "") add("description must be non-empty");
      else if (fm.description.length > 1024) add(`description is ${fm.description.length} characters, over 1024`);
    } else if ((m = /^agents\/(claude|antigravity)\/([^/]+)\.md$/.exec(file))) {
      const fm = frontmatter(text);
      if (fm === null) { add("no YAML frontmatter"); continue; }
      const keys = m[1] === "claude" ? ["name", "description", "model"] : ["name", "description", "model", "mainAgent"];
      if (!same(Object.keys(fm), keys)) add(`frontmatter keys must be exactly ${keys.join(", ")} (got ${Object.keys(fm).join(", ")})`);
      if (fm.name !== m[2]) add(`name "${String(fm.name)}" must equal the file name "${m[2]}"`);
      if (m[1] === "antigravity" && fm.mainAgent !== false) add("mainAgent must be false");
      if (!/^model: \{\{model\}\}$/m.test(text)) add("the line `model: {{model}}` is missing");
    } else if ((m = /^agents\/codex\/([^/]+)\.toml$/.exec(file))) {
      const fields = readTomlKeys(text);
      const keys = ["name", "description", "model", "developer_instructions"];
      if (!same(Object.keys(fields), keys)) add(`keys must be exactly ${keys.join(", ")} (got ${Object.keys(fields).join(", ")})`);
      if (fields.name !== m[1]) add(`name "${String(fields.name)}" must equal the file name "${m[1]}"`);
      if (!/^model = "\{\{model\}\}"$/m.test(text)) add('the line `model = "{{model}}"` is missing');
    }
  }
  return out;
}

// ---------- caps ----------

const CAPS: Array<[string, number]> = [
  ["agent-block.md", 14],
  ["system/templates/me.md", 15],
  ["system/templates/project.md", 20],
];

export async function checkCaps(dir: string): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const [file, cap] of CAPS) {
    const lines = (await read(dir, file)).replace(/\n$/, "").split("\n").length;
    if (lines > cap) out.push({ file, line: cap + 1, message: `${lines} lines, over the cap of ${cap}` });
  }
  return out;
}

// ---------- parsers ----------

export async function checkParsers(dir: string): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const file of await files(dir)) {
    const text = await read(dir, file);
    if (/^system\/templates\/[^/]+\.md$/.test(file) && !/\/(me|project)\.md$/.test(file)) {
      for (const e of parsePage(text, file).errors) out.push({ file, line: e.line ?? 1, message: `parsePage: ${e.code} — ${e.message}` });
    }
    if (!file.endsWith(".md")) continue;
    const lines = text.split("\n");
    const start = lines.findIndex((l) => /^##\s+source\s+kinds\b/i.test(l));
    if (start < 0) continue;
    const ruleLines = new Set(parseSourceKinds(text).map((r) => r.line));
    let inComment = false;
    for (let i = start + 1; i < lines.length; i++) {
      let l = lines[i]!;
      if (!inComment && /^#{1,2}\s/.test(l)) break;
      let rest = "";
      while (l.length > 0) {
        if (inComment) {
          const end = l.indexOf("-->");
          if (end < 0) { l = ""; break; }
          inComment = false;
          l = l.slice(end + 3);
        } else {
          const open = l.indexOf("<!--");
          if (open < 0) { rest += l; l = ""; break; }
          rest += l.slice(0, open);
          inComment = true;
          l = l.slice(open + 4);
        }
      }
      if (rest.trim() !== "" && !ruleLines.has(i + 1)) out.push({ file, line: i + 1, message: `Source kinds line does not parse with parseSourceKinds: "${rest.trim()}"` });
    }
  }
  return out;
}

// ---------- placeholders ----------

export async function checkPlaceholders(dir: string): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const file of await files(dir)) {
    norm(await read(dir, file)).split("\n").forEach((l, i) => {
      if (l.includes("placeholder: real text arrives in EPIC-006")) out.push({ file, line: i + 1, message: "SPRINT-01 placeholder left in the template" });
    });
  }
  return out;
}

// ---------- SPRINT-03: coverage, lint ids, kb seeds (STORY-006-11) ----------

/** Command forms the templates must name at least once: "<words> [--flag]". Later sprints append to the list. */
export const DOCUMENTED_FORMS: readonly string[] = [
  "read --out",
  "lint",
  "lint --rules",
  "lint --check",
  "status",
  "rules list",
  "rules record --accepted",
  "rules record --rejected",
  "rules record --kind",
  "rules record --summary",
  "rules record --from",
  "ingest facts --dry-run",
  "search --no-miss",
  "search --mark",
  "statusline",
  "statusline --install",
  "config get",
  "config set",
  "config unset",
];

export async function checkCoverage(dir: string): Promise<Finding[]> {
  const refs: CommandRef[] = [];
  for (const file of await files(dir)) refs.push(...extractCommandRefs(file, await read(dir, file)));
  const out: Finding[] = [];
  for (const form of DOCUMENTED_FORMS) {
    const tokens = form.split(/\s+/);
    const words = tokens.filter((t) => !t.startsWith("--"));
    const flag = tokens.find((t) => t.startsWith("--"));
    const met = refs.some(
      (r) =>
        r.words.length === words.length &&
        r.words.every((w, i) => w === words[i]) &&
        (flag === undefined || r.flags.includes(flag)),
    );
    if (!met) out.push({ file: "templates/", line: 0, message: `"wikeeper ${form}" is named by no template` });
  }
  return out;
}

/** The first table under WIKI.md "## Lint and status": one row per page check, the id in a code span in the first cell. */
function findingTableFindings(file: string, text: string): Finding[] {
  const pageIds = PAGE_CHECKS.map((c) => c.id);
  const lines = norm(text).split("\n");
  let fence: string | null = null;
  let inSection = false;
  let header = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const f = /^\s*(```+|~~~+)/.exec(l);
    if (f) {
      const marker = f[1]!.charAt(0);
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const h = /^##\s+(.+?)\s*#*\s*$/.exec(l);
    if (h) {
      if (inSection) break;
      inSection = h[1] === "Lint and status";
      continue;
    }
    if (inSection && l.startsWith("|")) {
      header = i;
      break;
    }
  }
  const out: Finding[] = [];
  const seen = new Set<string>();
  if (header >= 0) {
    for (let i = header + 2; i < lines.length && lines[i]!.startsWith("|"); i++) {
      const cell = (lines[i]!.split("|")[1] ?? "").trim();
      const id = /^`([^`]*)`$/.exec(cell)?.[1] ?? cell;
      if (!pageIds.includes(id)) out.push({ file, line: i + 1, message: `finding table: "${id}" is not a page check` });
      else if (seen.has(id)) out.push({ file, line: i + 1, message: `finding table: "${id}" has more than one row` });
      seen.add(id);
    }
  }
  for (const id of pageIds) {
    if (!seen.has(id)) out.push({ file, line: header >= 0 ? header + 1 : 0, message: `finding table: no row for "${id}"` });
  }
  return out;
}

export async function checkLintIds(dir: string, doctorIds: readonly string[]): Promise<Finding[]> {
  const lintIds = new Set([...PAGE_CHECKS, ...RULE_CHECKS].map((c) => c.id));
  const out: Finding[] = [];
  const unregistered = (file: string, line: number, id: string): void => {
    out.push({ file, line, message: `check "${id}" is not registered in lint or doctor` });
  };
  const all = await files(dir);
  for (const file of all) {
    const text = await read(dir, file);
    for (const { line, unit } of commandUnits(file, text)) {
      for (const m of unit.matchAll(/\blint(?:\s+--rules)?\s+--check\s+([a-z][a-z0-9-]*)/g)) {
        if (!lintIds.has(m[1]!)) unregistered(file, line, m[1]!);
      }
    }
    if (!/\.(md|toml|json)$/.test(file)) continue;
    text.split("\n").forEach((l, i) => {
      for (const m of l.matchAll(/`([a-z][a-z0-9-]*)` finding/g)) {
        if (!lintIds.has(m[1]!) && !doctorIds.includes(m[1]!)) unregistered(file, i + 1, m[1]!);
      }
    });
  }
  const wiki = "system/WIKI.md";
  out.push(...findingTableFindings(wiki, all.includes(wiki) ? await read(dir, wiki) : ""));
  return out;
}

export async function checkKbSeeds(dir: string): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const file of await files(dir)) {
    if (!/^kb_instructions\.[a-z0-9-]+\.md$/.test(file)) continue;
    for (const issue of parseInstructions(await read(dir, file)).issues) {
      out.push({ file, line: issue.line, message: `${issue.code}: ${issue.message}` });
    }
  }
  return out;
}

export async function runAllChecks(dir: string, doctorIds: readonly string[]): Promise<Finding[]> {
  return [
    ...(await checkCommands(dir)),
    ...(await checkDoctorIds(dir, doctorIds)),
    ...(await checkPaths(dir)),
    ...(await checkSections(dir)),
    ...(await checkFormats(dir)),
    ...(await checkCaps(dir)),
    ...(await checkParsers(dir)),
    ...(await checkPlaceholders(dir)),
    ...(await checkCoverage(dir)),
    ...(await checkLintIds(dir, doctorIds)),
    ...(await checkKbSeeds(dir)),
  ];
}

