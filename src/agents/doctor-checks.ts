import { lstat, readFile, stat } from "node:fs/promises";
import type { DoctorCheck } from "../core/integrations.js";
import type { WikeeperConfig } from "../core/config.js";
import type { Manifest } from "../core/manifest.js";
import { fromPosixRelative } from "../core/paths.js";
import type { AgentName } from "./agent-names.js";
import type { AgentFile } from "./detect.js";
import { resolveTargets } from "./detect.js";
import { WIKI_END, WIKI_START_PREFIX } from "./inject.js";

export const AGENT_CHECK_IDS = [
  "agent-wiring", "agent-block-missing", "agent-block-duplicated", "agent-block-markers-deleted",
  "claude-agents-md-only", "skill-link-broken", "codex-trust",
  // INSERTION POINT 3 (002-06): "antigravity-trust", "antigravity-ask-fallback",
  "antigravity-trust", "antigravity-ask-fallback",
] as const;
export type AgentCheckId = (typeof AGENT_CHECK_IDS)[number];
export interface BlockSignature { heading: string; reference: string }   // e.g. "## Project Wiki", ".wiki/system/WIKI.md"
export interface AgentCheckInput {
  root: string;
  config: WikeeperConfig;            // ctx.config (doctor: loaded config or DEFAULT_CONFIG clone)
  agents: readonly AgentName[];      // config.agents ∩ AGENT_NAMES, canonical order
  manifest: Manifest;                // read-only
  existing: readonly AgentFile[];    // detectAgentFiles(root)
  signature: BlockSignature;         // readBlockSignature(<templatesDir>/agent-block.md)
}
export type AgentCheck = (input: AgentCheckInput) => Promise<DoctorCheck[]>;   // [] = healthy

const REFERENCE = ".wiki/system/WIKI.md";
const START_LINE = /^<!-- WIKI:START\b.*-->\r?$/gm;

export function readBlockSignature(blockText: string): BlockSignature {
  const lines = blockText.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(WIKI_START_PREFIX));
  const after = start >= 0 ? lines.slice(start + 1) : lines;
  const heading = after.find((l) => l.startsWith("#"));
  return { heading: (heading ?? "## Project Wiki").trim(), reference: REFERENCE };
}

export async function checkAgentBlocks(input: AgentCheckInput): Promise<DoctorCheck[]> {
  const { root, manifest, agents, existing, signature } = input;
  const targets: string[] = [];
  for (const e of manifest.files) if (e.kind === "block" && !targets.includes(e.path)) targets.push(e.path);
  for (const t of resolveTargets(agents, existing)) if (!t.create && !targets.includes(t.path)) targets.push(t.path);
  const order = ["CLAUDE.md", "AGENTS.md", "GEMINI.md"];
  targets.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib);
  });
  const out: DoctorCheck[] = [];
  for (const f of targets) {
    let text: string;
    try {
      text = await readFile(fromPosixRelative(root, f), "utf8");
    } catch {
      out.push({ id: "agent-block-missing", severity: "error", message: `${f} is missing`, fix: "run wikeeper init", file: f });
      continue;
    }
    if (text.startsWith("\uFEFF")) text = text.slice(1);
    const starts = [...text.matchAll(START_LINE)];
    if (starts.length >= 2) {
      out.push({
        id: "agent-block-duplicated",
        severity: "error",
        message: `${f} has ${starts.length} WIKI blocks`,
        fix: `delete the extra WIKI block from ${f}`,
        file: f,
      });
    } else if (starts.length === 1) {
      const rest = text.slice((starts[0]!.index ?? 0) + starts[0]![0].length);
      const hasEnd = rest.split(/\r?\n/).some((l) => l === WIKI_END);
      if (!hasEnd) {
        out.push({
          id: "agent-block-missing",
          severity: "error",
          message: `${f} has WIKI:START without WIKI:END`,
          fix: "run wikeeper init",
          file: f,
        });
      }
    } else {
      const lines = text.split(/\r?\n/).map((l) => l.trimEnd());
      if (lines.includes(signature.heading) && text.includes(signature.reference)) {
        out.push({
          id: "agent-block-markers-deleted",
          severity: "warning",
          message: `${f} has the wiki text but the WIKI markers were deleted`,
          fix: `delete the leftover wiki text from ${f} and run wikeeper init`,
          file: f,
        });
      } else {
        out.push({ id: "agent-block-missing", severity: "error", message: `${f} has no WIKI block`, fix: "run wikeeper init", file: f });
      }
    }
  }
  return out;
}

export async function checkClaudeAgentsMdOnly(input: AgentCheckInput): Promise<DoctorCheck[]> {
  const { agents, existing } = input;
  if (!agents.includes("claude") || existing.includes("CLAUDE.md") || !existing.includes("AGENTS.md")) return [];
  return [
    {
      id: "claude-agents-md-only",
      severity: "warning",
      message: "Claude Code reads AGENTS.md only when no CLAUDE.md exists (Claude Code v2.1.277 or newer)",
      fix: "update Claude Code to v2.1.277+ or create CLAUDE.md and run wikeeper init",
      file: "AGENTS.md",
    },
  ];
}

export async function checkSkillLinks(input: AgentCheckInput): Promise<DoctorCheck[]> {
  const out: DoctorCheck[] = [];
  for (const e of input.manifest.files) {
    if (e.kind !== "link") continue;
    const p = e.path;
    const target = fromPosixRelative(input.root, p);
    let problem: string | null = null;
    try {
      const st = await lstat(target);
      if (!st.isSymbolicLink()) problem = `${p} is no longer a link`;
      else {
        try {
          await stat(target);
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === "ENOENT" || code === "ENOTDIR") problem = `${p} points to a missing folder`;
          else throw err;
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") problem = `${p} is missing`;
      else throw err;
    }
    if (problem) out.push({ id: "skill-link-broken", severity: "error", message: problem, fix: "run wikeeper init", file: p });
  }
  return out;
}

export async function checkCodexTrust(input: AgentCheckInput): Promise<DoctorCheck[]> {
  if (!input.agents.includes("codex") || input.config.enforce !== true) return [];
  return [
    {
      id: "codex-trust",
      severity: "info",
      message:
        "Codex applies project hooks and rules only in a trusted project after you approve each hook in /hooks; approve again whenever wikeeper update changes the guard command",
      file: ".codex/hooks.json",
    },
  ];
}
// INSERTION POINT 4 (002-06): checkAntigravityTrust and checkAntigravityAskFallback function bodies go HERE, above AGENT_CHECKS.
export async function checkAntigravityTrust(input: AgentCheckInput): Promise<DoctorCheck[]> {
  if (!input.agents.includes("antigravity") || input.config.enforce !== true) return [];
  return [
    {
      id: "antigravity-trust",
      severity: "info",
      message: "Antigravity loads .agents/hooks.json only after you trust this folder",
      file: ".agents/hooks.json",
    },
  ];
}

export async function checkAntigravityAskFallback(input: AgentCheckInput): Promise<DoctorCheck[]> {
  if (!input.agents.includes("antigravity") || input.config.enforce !== true || input.config.ingest.permission !== "ask") return [];
  return [
    {
      id: "antigravity-ask-fallback",
      severity: "info",
      message:
        "Antigravity has no project rule file in the repo, so ingest approval happens in chat; project rules live in your Antigravity profile (/permissions → Project)",
      file: ".agents/hooks.json",
    },
  ];
}
export const AGENT_CHECKS: readonly AgentCheck[] = [
  checkAgentBlocks, checkClaudeAgentsMdOnly, checkSkillLinks, checkCodexTrust,
  // INSERTION POINT 5 (002-06): checkAntigravityTrust, checkAntigravityAskFallback,
  checkAntigravityTrust, checkAntigravityAskFallback,
];
