import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { AGENT_NAMES, type AgentName } from "./agent-names.js";
import type { Manifest } from "../core/manifest.js";
import type { WikeeperConfig } from "../core/config.js";
import { templatesDir as defaultTemplatesDir } from "../core/templates.js";
import { mapModel } from "./model-tiers.js";
import {
  abs,
  conflictError,
  emptyResult,
  ensureDir,
  exists,
  finishResult,
  installSkills,
  skillConflicts,
  upsertManifestEntry,
  type InstallResult,
  type InstallSkillsOptions,
} from "./skills.js";

export const SUBAGENT_NAMES = ["wiki-extractor", "wiki-writer"] as const;
export type SubagentName = (typeof SUBAGENT_NAMES)[number];
export const SUBAGENT_TARGETS: Readonly<Record<AgentName, { dir: string; ext: ".md" | ".toml" }>> = {
  claude: { dir: ".claude/agents", ext: ".md" },
  antigravity: { dir: ".agents/agents", ext: ".md" },
  codex: { dir: ".codex/agents", ext: ".toml" },
};
export interface InstallSubagentsOptions {
  root: string;
  agents: readonly AgentName[];
  config: Pick<WikeeperConfig, "ingest">;
  manifest: Manifest;
  templatesDir?: string;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function renderModelLine(template: string, model: string | undefined): string {
  const out: string[] = [];
  for (const line of template.split("\n")) {
    if (!line.includes("{{model}}")) out.push(line);
    else if (model !== undefined) out.push(line.replaceAll("{{model}}", model));
  }
  return out.join("\n");
}

interface Planned {
  agent: AgentName;
  rel: string;
  bytes: Buffer;
  warning?: string;
}

async function plan(options: InstallSubagentsOptions): Promise<Planned[]> {
  const base = options.templatesDir ?? defaultTemplatesDir();
  const out: Planned[] = [];
  for (const agent of AGENT_NAMES) {
    if (!options.agents.includes(agent)) continue;
    const { dir, ext } = SUBAGENT_TARGETS[agent];
    for (const name of SUBAGENT_NAMES) {
      const text = await readFile(abs(base, `agents/${agent}/${name}${ext}`), "utf8");
      const value = name === "wiki-extractor" ? options.config.ingest.extractor_model : options.config.ingest.writer_model;
      const mapped = mapModel(agent, value);
      const item: Planned = {
        agent,
        rel: `${dir}/${name}${ext}`,
        bytes: Buffer.from(renderModelLine(text, mapped.model)),
      };
      if (mapped.warning) item.warning = mapped.warning;
      out.push(item);
    }
  }
  return out;
}

export async function subagentConflicts(options: InstallSubagentsOptions): Promise<string[]> {
  const out: string[] = [];
  for (const p of await plan(options)) {
    if ((await exists(abs(options.root, p.rel))) && !options.manifest.files.some((f) => f.path === p.rel)) out.push(p.rel);
  }
  return out.sort(cmp);
}

export async function installSubagents(options: InstallSubagentsOptions): Promise<InstallResult> {
  const { root, manifest } = options;
  const result = emptyResult();
  const planned = await plan(options);
  const conflicts = await subagentConflicts(options);
  if (conflicts.length > 0) throw conflictError(conflicts);
  for (const p of planned) {
    const target = abs(root, p.rel);
    const had = await exists(target);
    let same = false;
    if (had) {
      try {
        same = (await readFile(target)).equals(p.bytes);
      } catch {
        same = false;
      }
    }
    if (!same) {
      await ensureDir(root, p.rel.split("/").slice(0, -1).join("/"), result.dirs);
      await writeFile(target, p.bytes);
    }
    (had ? (same ? result.skipped : result.replaced) : result.created).push(p.rel);
    upsertManifestEntry(manifest, {
      path: p.rel,
      sha256: createHash("sha256").update(p.bytes).digest("hex"),
      kind: "subagent",
      agent: p.agent,
    });
    if (p.warning && !result.warnings.includes(p.warning)) result.warnings.push(p.warning);
  }
  return finishResult(result);
}

export async function installAgentAssets(options: InstallSkillsOptions & InstallSubagentsOptions): Promise<InstallResult> {
  const conflicts = [...(await skillConflicts(options)), ...(await subagentConflicts(options))].sort(cmp);
  if (conflicts.length > 0) throw conflictError(conflicts);
  const a = await installSkills(options);
  const b = await installSubagents(options);
  const dirs = [...a.dirs];
  for (const d of b.dirs) if (!dirs.includes(d)) dirs.push(d);
  return finishResult({
    created: [...a.created, ...b.created],
    replaced: [...a.replaced, ...b.replaced],
    skipped: [...a.skipped, ...b.skipped],
    dirs,
    warnings: [...new Set([...a.warnings, ...b.warnings])],
  });
}

