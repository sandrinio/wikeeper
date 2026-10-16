import { lstat, readFile, rm, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { compareCodeUnits } from "../core/compare.js";
import { registerIntegration } from "../core/integrations.js";
import type { DoctorCheck, IntegrationContext, IntegrationOptions, PhaseReport } from "../core/integrations.js";
import type { AgentName } from "./agent-names.js";
import { isAgentName } from "./agent-names.js";
import { setConfigValue } from "../core/config.js";
import { sha256File } from "../core/manifest.js";
import type { ManifestEntry } from "../core/manifest.js";
import { fromPosixRelative } from "../core/paths.js";
import { createLineReader } from "./ask-agents.js";
import { createAskAgents } from "./ask-agents.js";
import { detectAgentFiles, needsInputError, resolveAgents, resolveTargets } from "./detect.js";
import type { AgentFile, AgentSource } from "./detect.js";
import { AGENT_CHECKS, readBlockSignature } from "./doctor-checks.js";
import type { AgentCheckInput, BlockSignature } from "./doctor-checks.js";
import { injectIntoFile, stripFromFile } from "./inject.js";
import { SHARED_AGENT, upsertManifestEntry } from "./skills.js";
import { installAgentAssets } from "./subagents.js";
import { snapshotForRollback } from "./rollback.js";

export const AGENTS_INTEGRATION_NAME = "agents";
/** Structural subset of 002-02's LineReader (no import: ask-agents.ts is not a contract file). */
export interface PromptLines { nextLine(): Promise<string | null> }
export interface AgentsState {
  agents: AgentName[];            // init: resolved agents; update/remove: config.agents ∩ AGENT_NAMES; canonical order
  lines: PromptLines | null;      // the run's ONE stdin reader; non-null only inside prepare when options.interactive
}
/** Sub-feature plugged into the agents integration (002-06's enforce). Runs AFTER the core agent wiring in
 *  init/update and BEFORE it in remove. Mutates ctx.options.manifest in init/update only. */
export interface AgentsExtension {
  name: string;
  /** init only: runs for every extension after the agents are resolved and BEFORE any write. May prompt (on state.lines) and throw. */
  preflight?(ctx: IntegrationContext, state: AgentsState): Promise<void>;
  init?(ctx: IntegrationContext, state: AgentsState): Promise<PhaseReport>;
  update?(ctx: IntegrationContext, state: AgentsState): Promise<PhaseReport>;
  remove?(ctx: IntegrationContext, state: AgentsState): Promise<PhaseReport>;
}
import { enforceExtension } from "./enforce/index.js";
// INSERTION POINT 1 (002-06): `import { enforceExtension } from "./enforce/index.js";` goes ABOVE this line.
export const AGENTS_EXTENSIONS: readonly AgentsExtension[] = [
  // INSERTION POINT 2 (002-06): `  enforceExtension,`
  enforceExtension,
];
export interface AgentsIntegration {
  prepare(ctx: IntegrationContext): Promise<void>;
  init(ctx: IntegrationContext): Promise<PhaseReport>;
  update(ctx: IntegrationContext): Promise<PhaseReport>;
  remove(ctx: IntegrationContext): Promise<PhaseReport>;
  doctor(ctx: IntegrationContext): Promise<DoctorCheck[]>;
}
export const agentsIntegration: AgentsIntegration = { prepare, init, update, remove, doctor };   // function declarations below (hoisted)
/** Registers the agents integration once. runCli calls it for the default program; an explicit registration (tests) wins. */
export function ensureAgentsIntegration(): void {
  try {
    registerIntegration({ name: AGENTS_INTEGRATION_NAME, ...agentsIntegration });
  } catch (err) {
    if ((err as { code?: string }).code !== "E_INTEGRATION_DUPLICATE") throw err;
  }
}

// ---------------------------------------------------------------------------

interface Acc {
  created: string[];
  replaced: string[];
  skipped: string[];
  removed: string[];
  backed_up: string[];
  kept: string[];
  warnings: string[];
}

function acc(): Acc {
  return { created: [], replaced: [], skipped: [], removed: [], backed_up: [], kept: [], warnings: [] };
}

function merge(into: Acc, r: PhaseReport | void): void {
  if (!r) return;
  into.created.push(...(r.created ?? []));
  into.replaced.push(...(r.replaced ?? []));
  into.skipped.push(...(r.skipped ?? []));
  into.removed.push(...(r.removed ?? []));
  into.backed_up.push(...(r.backed_up ?? []));
  into.kept.push(...(r.kept ?? []));
  into.warnings.push(...(r.warnings ?? []));
}

async function lstatOrNull(file: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(file);
  } catch {
    return null;
  }
}

function configuredAgents(ctx: IntegrationContext, a: Acc): AgentName[] {
  const out: AgentName[] = [];
  for (const raw of ctx.config.agents as readonly string[]) {
    if (isAgentName(raw)) {
      if (!out.includes(raw)) out.push(raw);
    } else a.warnings.push(`config agents: unknown "${raw}" ignored`);
  }
  return out;
}

async function loadBlock(ctx: IntegrationContext): Promise<string> {
  return readFile(path.join(ctx.options.templatesDir, "agent-block.md"), "utf8");
}

function dropEntry(ctx: IntegrationContext, e: ManifestEntry): void {
  const files = ctx.options.manifest.files;
  const i = files.indexOf(e);
  if (i >= 0) files.splice(i, 1);
}

/** Strips the WIKI block of one manifest `block` entry. Deletes the file if wikeeper created it and it is now empty. */
async function stripBlockEntry(ctx: IntegrationContext, e: ManifestEntry, a: Acc): Promise<void> {
  const file = fromPosixRelative(ctx.root, e.path);
  const { status } = await stripFromFile(file);
  if (status === "stripped") {
    const text = (await readFile(file, "utf8")).replace(/^\uFEFF/, "");
    if (e.created === true && text.trim() === "") {
      await rm(file, { force: true, maxRetries: 3 });
      a.removed.push(e.path);
    } else a.removed.push(`${e.path}#wiki-block`);
  } else if (status === "absent") a.warnings.push(`${e.path}: WIKI block already gone`);
  else a.warnings.push(`${e.path} has WIKI:START without WIKI:END; left unchanged`);
}

function depth(p: string): number {
  return p.split("/").length;
}

/** rmdir recorded dir entries that are empty, deepest first. Drops the entry when the dir is gone. */
async function emptyDirPass(ctx: IntegrationContext, a: Acc, report: "removed" | "kept"): Promise<void> {
  const dirs = ctx.options.manifest.files
    .filter((e) => e.kind === "dir")
    .sort((x, y) => depth(y.path) - depth(x.path) || compareCodeUnits(y.path, x.path));
  for (const e of dirs) {
    try {
      await rmdir(fromPosixRelative(ctx.root, e.path));
      a.removed.push(e.path);
      dropEntry(ctx, e);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOTEMPTY" || code === "EEXIST") {
        if (report === "kept") a.kept.push(e.path);
      } else if (code === "ENOENT") dropEntry(ctx, e);
      else throw err;
    }
  }
}

async function pruneDeconfigured(
  ctx: IntegrationContext,
  agents: readonly AgentName[],
  existing: readonly AgentFile[],
  a: Acc,
): Promise<void> {
  const manifest = ctx.options.manifest;
  for (const e of [...manifest.files]) {
    if (e.kind !== "skill" && e.kind !== "subagent" && e.kind !== "link") continue;
    if (!e.agent || e.agent === SHARED_AGENT || (agents as readonly string[]).includes(e.agent)) continue;
    const file = fromPosixRelative(ctx.root, e.path);
    if (e.kind === "link") {
      const st = await lstatOrNull(file);
      if (st?.isSymbolicLink()) {
        await unlink(file);
        a.removed.push(e.path);
      }
    } else {
      const st = await lstatOrNull(file);
      if (st) {
        let same = false;
        try {
          same = e.sha256 !== null && (await sha256File(file)) === e.sha256;
        } catch {
          same = false;
        }
        if (same) {
          await rm(file, { force: true, maxRetries: 3 });
          a.removed.push(e.path);
        } else a.warnings.push(`${e.path} was edited; left in place`);
      }
    }
    dropEntry(ctx, e);
  }
  const targets = new Set(resolveTargets(agents, existing).map((t) => t.path as string));
  for (const e of [...manifest.files]) {
    if (e.kind !== "block" || targets.has(e.path)) continue;
    await stripBlockEntry(ctx, e, a);
    dropEntry(ctx, e);
  }
  await emptyDirPass(ctx, a, "removed");
}

async function installAssets(ctx: IntegrationContext, agents: AgentName[], a: Acc): Promise<void> {
  const manifest = ctx.options.manifest;
  const res = await installAgentAssets({
    root: ctx.root,
    agents,
    manifest,
    templatesDir: ctx.options.templatesDir,
    config: ctx.config,
  });
  a.created.push(...res.created);
  a.replaced.push(...res.replaced);
  a.skipped.push(...res.skipped);
  a.warnings.push(...res.warnings);
  for (const d of res.dirs) {
    if (!manifest.files.some((f) => f.path === d && f.kind === "dir")) {
      manifest.files.push({ path: d, sha256: null, kind: "dir", created: true });
    }
  }
}

interface Prepared {
  agents: AgentName[];
  source: AgentSource;
  existing: AgentFile[];
  state: AgentsState;
}
/** Hand-off from prepare to init, keyed by the IntegrationOptions object both phases receive. */
const prepared = new WeakMap<IntegrationOptions, Prepared>();

async function prepare(ctx: IntegrationContext): Promise<void> {
  const { options, root } = ctx;
  const lines = options.interactive ? createLineReader(options.io.stdin) : null;
  let state: AgentsState | null = null;
  try {
    const existing = await detectAgentFiles(root);
    const flag = options.flags["agents"];
    const r = await resolveAgents({
      ...(typeof flag === "string" ? { flag } : {}),
      config: ctx.config,
      isTTY: options.interactive,
      json: options.json,
      existing,
      ask: lines ? createAskAgents({ stderr: options.io.stderr, lines }) : async () => [],
    });
    if (r.status === "needs_input") throw needsInputError(r);
    const agents = r.agents;
    state = { agents, lines };
    for (const ext of AGENTS_EXTENSIONS) await ext.preflight?.(ctx, state);
    prepared.set(options, { agents, source: r.source, existing, state });
  } finally {
    lines?.close();
    if (state) state.lines = null;
  }
}

async function init(ctx: IntegrationContext): Promise<PhaseReport> {
  const a = acc();
  const { options, root } = ctx;
  if (!prepared.has(options)) await prepare(ctx);
  const p = prepared.get(options)!;
  prepared.delete(options);
  const { agents, existing, state } = p;
  {
    const targets = resolveTargets(agents, existing);
    const rollback = await snapshotForRollback(root, [...targets.map((t) => t.path as string), ".wiki/config.yml"]);
    try {
      if (p.source !== "config") {
        await setConfigValue(root, "agents", agents);
        ctx.config.agents = agents;
      }
      await pruneDeconfigured(ctx, agents, existing, a);
      await installAssets(ctx, agents, a);

      const block = await loadBlock(ctx);
      for (const t of targets) {
        const { status, created } = await injectIntoFile(fromPosixRelative(root, t.path), block);
        if (status === "injected") (created ? a.created : a.replaced).push(t.path);
        else a.skipped.push(t.path);
        const old = options.manifest.files.find((f) => f.path === t.path && f.kind === "block");
        upsertManifestEntry(options.manifest, { path: t.path, sha256: null, kind: "block", created: old?.created ?? created });
      }

      for (const ext of AGENTS_EXTENSIONS) merge(a, await ext.init?.(ctx, state));
    } catch (err) {
      await rollback();
      throw err;
    }
    return a;
  }
}

async function update(ctx: IntegrationContext): Promise<PhaseReport> {
  const a = acc();
  const agents = configuredAgents(ctx, a);
  if (agents.length === 0) return a;
  const existing = await detectAgentFiles(ctx.root);
  await pruneDeconfigured(ctx, agents, existing, a);
  await installAssets(ctx, agents, a);
  const state: AgentsState = { agents, lines: null };
  for (const ext of AGENTS_EXTENSIONS) merge(a, await ext.update?.(ctx, state));
  return a;
}

async function remove(ctx: IntegrationContext): Promise<PhaseReport> {
  const a = acc();
  const agents = configuredAgents(ctx, acc());
  const state: AgentsState = { agents, lines: null };
  for (const ext of [...AGENTS_EXTENSIONS].reverse()) merge(a, await ext.remove?.(ctx, state));

  const files = ctx.options.manifest.files;
  for (const e of files.filter((f) => f.kind === "block")) await stripBlockEntry(ctx, e, a);

  for (const e of files.filter((f) => f.kind === "skill" || f.kind === "subagent")) {
    const file = fromPosixRelative(ctx.root, e.path);
    if (await lstatOrNull(file)) {
      await rm(file, { force: true, maxRetries: 3 });
      a.removed.push(e.path);
    }
  }
  for (const e of files.filter((f) => f.kind === "link")) {
    const file = fromPosixRelative(ctx.root, e.path);
    const st = await lstatOrNull(file);
    if (!st) continue;
    if (st.isSymbolicLink()) {
      await unlink(file);
      a.removed.push(e.path);
    } else {
      a.kept.push(e.path);
      a.warnings.push(`${e.path} is not a link; left in place`);
    }
  }
  await emptyDirPass(ctx, a, "kept");
  return a;
}

async function doctor(ctx: IntegrationContext): Promise<DoctorCheck[]> {
  const agents = configuredAgents(ctx, acc());
  const manifest = ctx.options.manifest;
  if (agents.length === 0 && !manifest.files.some((f) => f.kind === "block")) return [];
  const existing = await detectAgentFiles(ctx.root);
  let signature: BlockSignature = { heading: "## Project Wiki", reference: ".wiki/system/WIKI.md" };
  try {
    signature = readBlockSignature(await loadBlock(ctx));
  } catch {
    /* keep the default signature */
  }
  const input: AgentCheckInput = { root: ctx.root, config: ctx.config, agents, manifest, existing, signature };
  const out: DoctorCheck[] = [];
  for (const check of AGENT_CHECKS) {
    try {
      out.push(...(await check(input)));
    } catch (e) {
      out.push({ id: "agent-wiring", severity: "error", message: "check failed: " + (e instanceof Error ? e.message : String(e)) });
    }
  }
  if (!out.some((c) => c.severity === "warning" || c.severity === "error")) {
    const n = (k: string): number => manifest.files.filter((f) => f.kind === k).length;
    out.unshift({
      id: "agent-wiring",
      severity: "ok",
      message: `agents ${agents.join(", ")}: WIKI block in ${n("block")} files, ${n("skill")} skills, ${n("subagent")} sub-agents`,
    });
  }
  return out;
}

