// STORY-009-03 QA-Red: upgrade instructions and docs. Immutable after QA-Red.
// Text rows read WIKI.md, architecture.md and README.md; the live half runs the default program in-process in a
// temp git repository. No network (vitest.config.ts turns the version check off). CRLF is normalised on every read.
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { availableMessage } from "../../src/core/update-check.js";
import { templatesDir } from "../../src/core/templates.js";
import { runCli } from "../../src/program.js";
import { DOCUMENTED_FORMS, checkCommands, checkCoverage, checkDoctorIds, doctorCheckIds, formatFinding, runAllChecks } from "./structure.js";

const T = 60_000;
const PKG = path.resolve(import.meta.dirname, "..", "..");

const SECTIONS = [
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
];
const VERBS = new Set(["start", "plan", "facts", "apply", "finish", "abort"]);

const tmpDirs: string[] = [];
afterAll(async () => {
  while (tmpDirs.length) await rm(tmpDirs.pop()!, { recursive: true, force: true });
});
async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

// ---------- text readers ----------
const lf = (s: string): string => s.replace(/\r\n/g, "\n");
const readWiki = async (): Promise<string> => lf(await readFile(path.join(templatesDir(), "system", "WIKI.md"), "utf8"));

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
  const s = splitSections(await readWiki()).find((x) => x.name === name);
  if (!s) throw new Error(`not yet implemented: section "${name}"`);
  return s.text;
}

/** architecture.md blocks: `## ` headings outside fenced code; level-3 blocks end at the next `### ` or `## ` line. */
async function archText(): Promise<string> {
  return lf(await readFile(path.join(PKG, "architecture.md"), "utf8"));
}
function archBlock(text: string, start: string, level: 2 | 3): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let fenced = false;
  let inside = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      fenced = !fenced;
      if (inside) out.push(line);
      continue;
    }
    if (!fenced && (line.startsWith("## ") || (level === 3 && line.startsWith("### ")))) {
      if (inside) break;
      if (line.startsWith(start)) inside = true;
    }
    if (inside) out.push(line);
  }
  if (!inside) throw new Error(`not yet implemented: architecture.md block "${start}"`);
  return out.join("\n");
}
async function arch(which: "2" | "3" | "7.7" | "10" | "11" | "13"): Promise<string> {
  const t = await archText();
  return which === "7.7" ? archBlock(t, "### 7.7 ", 3) : archBlock(t, `## ${which}. `, 2);
}
// README detail moved to docs/reference.md in CR-005, so the readme place reads both.
const readme = async (): Promise<string> =>
  lf(await readFile(path.join(PKG, "README.md"), "utf8")) + "\n" + lf(await readFile(path.join(PKG, "docs", "reference.md"), "utf8"));

/** Field names that open a column-0 status bullet: "- `a`: " or "- `a` and `b`: ". */
function statusFields(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^- `([a-z_]+)`(?: and `([a-z_]+)`)?: /.exec(line);
    if (m) out.push(m[1]!, ...(m[2] ? [m[2]] : []));
  }
  return out;
}

/** Every `wikeeper <word>` and `wikeeper ingest <verb>` outside the command vocabulary. */
function checkVocabulary(text: string, commands: Set<string>): Array<{ ref: string; line: number }> {
  const out: Array<{ ref: string; line: number }> = [];
  text.split("\n").forEach((l, i) => {
    for (const m of l.matchAll(/\bwikeeper\s+([a-z][a-z-]*)/g)) {
      if (!commands.has(m[1]!)) out.push({ ref: `wikeeper ${m[1]}`, line: i + 1 });
    }
    for (const m of l.matchAll(/\bwikeeper ingest ([a-z]+)/g)) {
      if (!VERBS.has(m[1]!)) out.push({ ref: `wikeeper ingest ${m[1]}`, line: i + 1 });
    }
  });
  return out;
}

// ---------- S1: the text says what the version check and upgrade do ----------
type Place = "wiki" | "arch2" | "arch3" | "arch77" | "arch10-11" | "arch13" | "readme";
async function placeText(place: Place): Promise<string> {
  switch (place) {
    case "wiki":
      return wikiSection("Lint and status");
    case "arch2":
      return arch("2");
    case "arch3":
      return arch("3");
    case "arch77":
      return arch("7.7");
    case "arch10-11":
      return (await arch("10")) + "\n" + (await arch("11"));
    case "arch13":
      return arch("13");
    case "readme":
      return readme();
  }
}
const ROWS: Array<[string, Place, string[]]> = [
  ["notice (R1)", "wiki", ["at most once a day", "`wikeeper ingest plan`", "`wikeeper ingest start`", "`version.latest`", "the `update-available` check"]],
  ["asking (R1)", "wiki", ["Tell the user once in the session and ask whether to upgrade", "on a yes, run `wikeeper upgrade`", "Never upgrade unasked", "do not bring it up again in that session"]],
  ["one question (R1)", "wiki", ["ask once, whether to upgrade", "it refreshes the files as well", "tell them in one message after the user's request is done", "then the version question"]],
  ["files (R1)", "wiki", ["`version.files`", "the `version-mismatch` check", "`wikeeper update` when the files are older", "`wikeeper upgrade` when the installed version is older", "Ask before `wikeeper update` too"]],
  ["failure (R1)", "wiki", ["tell the user in plain words", "starts with `sudo`", "`error.details.command`"]],
  ["principles (R3 a)", "arch2", ["daily version check", "runs npm only in `upgrade`"]],
  [
    "lifecycle (R3 b)",
    "arch3",
    ["`init`, `update`, `upgrade`, `remove`", "sends nothing about the wiki", "`update_check: false`", "`WIKEEPER_NO_UPDATE_CHECK`", "`NO_UPDATE_NOTIFIER`", "`CI`", "never runs `sudo`"],
  ],
  ["network (R3 c)", "arch77", ["`read` and the daily version check (§3) are wikeeper's only network uses"]],
  ["surface (R3 d, e)", "arch10-11", ["`upgrade [--check]`", "update_check: true"]],
  ["decision (R3 f)", "arch13", ["D-38", "never with `sudo`"]],
  [
    "README (R4)",
    "readme",
    [
      "wikeeper upgrade [--check]",
      "## ⬆️ Upgrading",
      "registry.npmjs.org/wikeeper/latest",
      "nothing about your wiki",
      "wikeeper config set update_check false",
      "WIKEEPER_NO_UPDATE_CHECK=1",
      "NO_UPDATE_NOTIFIER",
      "`D-01`–`D-38`",
    ],
  ],
];

describe("STORY-009-03 S1: the text says what the version check and upgrade do, where each reader looks", () => {
  it.each(ROWS)("%s", async (_part, place, phrases) => {
    const text = await placeText(place);
    for (const phrase of phrases) expect(text, `missing ${JSON.stringify(phrase)}`).toContain(phrase);
  });
});

// ---------- S2: the text matches what the CLI prints ----------
const W2_BULLET =
  "- `version`: `installed` is the version that ran this command; `latest` is a newer version on npm, from the check that ingest commands make at most once a day (null when none is known or the check is off); `files` is the version this project's files come from, as the manifest records it (null when it records none). Handle them as said above.";

async function run(root: string, args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(args, {
    io: {
      cwd: root,
      stdout: { write: (c: string) => out.push(c) },
      stderr: { write: (c: string) => err.push(c) },
      stdin: Object.assign(Readable.from([]), { isTTY: false }),
    },
  } as never);
  const text = out.join("");
  const lines = text.trim().split("\n").filter(Boolean);
  let json: any = null;
  try {
    json = JSON.parse(lines[lines.length - 1] ?? "");
  } catch {
    /* human output */
  }
  return { code, json, text, lines, err: err.join("") };
}

describe("STORY-009-03 S2: the text matches what the CLI prints", () => {
  it(
    "update-when-older, the quoted warning, the version bullet, then the live status and doctor",
    async () => {
      // text first
      const section = await wikiSection("Lint and status");
      expect(section).toContain("`wikeeper update` when the files are older");
      let quoted: string | undefined;
      for (const m of section.matchAll(/`([^`\n]+)`/g)) {
        if (m[1]!.startsWith("wikeeper ") && m[1]!.includes(" is available (installed ")) {
          quoted = m[1]!;
          break;
        }
      }
      expect(quoted, "the warning is quoted in a code span").toBe(availableMessage("0.4.1", "0.4.0"));
      expect(section.split("\n")).toContain(W2_BULLET);

      // then live
      const root = await tmp("wk-s04up-");
      await mkdir(path.join(root, ".git"), { recursive: true });
      const init = await run(root, ["init", "--json", "--yes", "--agents", "claude"]);
      expect(init.code, `${init.text} ${init.err}`).toBe(0);
      const manifestPath = path.join(root, ".wiki", "system", "manifest.json");
      const m = JSON.parse(await readFile(manifestPath, "utf8"));
      m.package_version = "0.0.1+abc1234";
      await writeFile(manifestPath, JSON.stringify(m, null, 2) + "\n");

      const human = await run(root, ["status"]);
      expect(human.code, `${human.text} ${human.err}`).toBe(0);
      const versionLine = human.lines.find((l) => l.startsWith("version: "));
      expect(versionLine, human.text).toBeDefined();
      expect(versionLine!.endsWith("run wikeeper update"), versionLine).toBe(true);

      const st = await run(root, ["status", "--json"]);
      expect(st.json?.ok, `${st.text} ${st.err}`).toBe(true);
      const keys = Object.keys(st.json.data);
      expect(keys).toContain("version");
      expect([...new Set(statusFields(section))].sort()).toEqual([...keys].sort());

      const doc = await run(root, ["doctor", "--json"]);
      const checks = doc.json?.data?.checks as Array<{ id: string; severity: string }>;
      expect(checks, `${doc.text} ${doc.err}`).toBeDefined();
      expect(checks).toContainEqual(expect.objectContaining({ id: "version-mismatch", severity: "warning" }));
      expect(checks.some((c) => c.id === "update-available")).toBe(true);
    },
    T,
  );
});

// ---------- S3: WIKI.md keeps its structure and every name in the new text exists ----------
describe("STORY-009-03 S3: WIKI.md keeps its structure and every name in the new text exists", () => {
  it("(a) fourteen sections in order, at most 400 lines, LF final newline", async () => {
    const wiki = await readWiki();
    expect(splitSections(wiki).map((s) => s.name)).toEqual(SECTIONS);
    expect(wiki.split("\n").length).toBeLessThanOrEqual(401);
    expect(wiki.endsWith("\n")).toBe(true);
  });

  it("(b) upgrade is in the red test's COMMANDS, WIKI.md names it, and the vocabulary check finds nothing", async () => {
    const src = lf(await readFile(path.join(PKG, "test", "templates", "wiki-protocol.red.node.test.ts"), "utf8"));
    const m = /const COMMANDS = new Set\(\[([^\]]*)\]\)/.exec(src);
    expect(m, "COMMANDS declaration").not.toBeNull();
    const commands = new Set([...m![1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!));
    expect(commands.has("upgrade")).toBe(true);
    const wiki = await readWiki();
    expect(wiki).toContain("`wikeeper upgrade`");
    expect(checkVocabulary(wiki, commands)).toEqual([]);
  });

  it(
    "(c) runAllChecks finds nothing, DOCUMENTED_FORMS has upgrade and coverage names wikeeper upgrade",
    async () => {
      const findings = await runAllChecks(templatesDir(), await doctorCheckIds());
      expect(findings.map(formatFinding)).toEqual([]);
      expect(DOCUMENTED_FORMS).toContain("upgrade");
      const cov = await checkCoverage(templatesDir());
      expect(cov.filter((f) => f.message.includes("wikeeper upgrade")).map(formatFinding)).toEqual([]);
    },
    T,
  );

  it("R2: files 009-03 must not touch are unchanged (SPRINT-04 pins)", async () => {
    const dir = templatesDir();
    const files = ["agent-block.md", "system/SETUP.md", "system/ONBOARDING.md"];
    const walk = async (rel: string): Promise<void> => {
      for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
        const r = `${rel}/${e.name}`;
        if (e.isDirectory()) await walk(r);
        else files.push(r);
      }
    };
    await walk("skills");
    await walk("agents");
    const actual: Record<string, string> = {};
    for (const f of files.sort()) {
      const text = lf(await readFile(path.join(dir, ...f.split("/")), "utf8"));
      actual[f] = createHash("sha256").update(text).digest("hex");
    }
    expect(actual).toEqual(PINS);
  });
});

const PINS: Record<string, string> = {
  "agent-block.md": "d27dd480747918b7bff9932fc7846689b0697dfa8bd3c94bfc461111e0e805de",
  "agents/antigravity/wiki-extractor.md": "da3dce3faffc413b6139440b87d184362d2f98ee0d7e3c6903c1e29d528cb0c9",
  "agents/antigravity/wiki-writer.md": "f587776bbae123c90f0ac9e3066bcac5baa71d572314d69403a6bab33746f20b",
  "agents/claude/wiki-extractor.md": "1ef88fd2aa1a3cf42255b7ec9548be3d87dd92582ba76499672a7dcbe9b53977",
  "agents/claude/wiki-writer.md": "090e6b4f6bb1bfe0aa4dd25118253e826f3bee160aacf51b161f82b60018cd83",
  "agents/codex/wiki-extractor.toml": "58c660375153c9d9cef0dc4674b2eef4f682e5083480bc12e53638ec12ab6407",
  "agents/codex/wiki-writer.toml": "e4c5b865f48e8e6c5203452d5d523ad21649df857029c306e7c6a79150087cbd",
  "agents/copilot/wiki-extractor.agent.md": "fcd65e2c133d8cbeda3697518b8b65cc947b85a49bd6d28f20cc4e3d065d959c",
  "agents/copilot/wiki-writer.agent.md": "919b25867679368ae781a8c228802cf1bac63fdfa8e0ea1ca778d87f0b6253ea",
  "skills/wiki-ingest/SKILL.md": "91eebe0479df04b61f6cc7f48c10eb9b47dea4ecf487ed0bbcb34494a96287c0",
  "skills/wiki-search/SKILL.md": "20c7fec470d7dab016baaf3e3b3395c156cb2747b80c88023a7256bee8a6ed45",
  "skills/wiki-setup/SKILL.md": "532e1a3a51410503e5b65ba2f37daea1c453be66653731fe33bf59e81683f1aa",
  "system/ONBOARDING.md": "5cc0dea373e130bdc2cb467a27c330aa2aafb759420fd38b2ab4f292ca5ecfc4",
  "system/SETUP.md": "bc1d236530370b5c1d0891d85c16c946d839bb5edb6269d61085150430f70913",
};

// ---------- S4: a wrong name in the text is reported with its line ----------
const PLANTED: Array<[string, "commands" | "ids", string]> = [
  ["`wikeeper upgrade --yes`", "commands", '"--yes" is not an option of "upgrade"'],
  ["`wikeeper upgrades`", "commands", 'unknown command "wikeeper upgrades"'],
  ["the `version-check` check", "ids", 'doctor check "version-check" is not reported by wikeeper doctor --json'],
];
describe("STORY-009-03 S4: a wrong name in the text is reported with its line", () => {
  it.each(PLANTED)(
    "%s",
    async (planted, kind, message) => {
      const copy = await tmp("wk-s04tpl-");
      await cp(templatesDir(), copy, { recursive: true });
      const file = path.join(copy, "system", "WIKI.md");
      const lines = lf(await readFile(file, "utf8")).split("\n");
      const h = lines.indexOf("## Lint and status");
      expect(h).toBeGreaterThanOrEqual(0);
      lines.splice(h + 1, 0, "", planted);
      await writeFile(file, lines.join("\n"));
      const findings = kind === "commands" ? await checkCommands(copy) : await checkDoctorIds(copy, await doctorCheckIds());
      expect(findings).toContainEqual({ file: "system/WIKI.md", line: h + 3, message });
    },
    T,
  );
});
