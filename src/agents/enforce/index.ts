import { lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { setConfigValue } from "../../core/config.js";
import type { IngestPermission } from "../../core/config.js";
import { ExitCode, WikeeperError } from "../../core/exit-codes.js";
import type { IntegrationContext, PhaseReport } from "../../core/integrations.js";
import type { ManifestEntry } from "../../core/manifest.js";
import type { TextSink } from "../../core/output.js";
import { fromPosixRelative, isInside, toPosixRelative } from "../../core/paths.js";
import type { AgentName } from "../agent-names.js";
import type { AgentsExtension, AgentsState, PromptLines } from "../index.js";
import { ANTIGRAVITY_ENFORCE } from "./antigravity.js";
import { CLAUDE_ENFORCE } from "./claude.js";
import type { AgentEnforceSpec, EnforceItem } from "./claude.js";
import { CODEX_ENFORCE } from "./codex.js";
import { guardCommand, resolveGuardForm } from "./guard-command.js";
import { loadJsonDoc, pruneEmptyPath, removeArrayItems, saveJsonDoc, upsertArrayItem, wouldWrite } from "./json-merge.js";
import type { JsonDoc, JsonObject } from "./json-merge.js";

export interface EnforceDecision { enabled: boolean; source: "flag" | "config" | "prompt" | "default" }
export const ENFORCE_QUESTION = "Enable --enforce (write guard and permission rules in your agents' settings)? [y/N] ";

export async function resolveEnforce(o: {
  flag: unknown;
  config: boolean;
  interactive: boolean;
  ask: () => Promise<boolean>;
}): Promise<EnforceDecision> {
  if (o.flag === true) return { enabled: true, source: "flag" };
  if (o.config) return { enabled: true, source: "config" };
  if (o.interactive) return (await o.ask()) ? { enabled: true, source: "prompt" } : { enabled: false, source: "default" };
  return { enabled: false, source: "default" };
}

export async function askYesNo(lines: PromptLines, stderr: TextSink, question: string): Promise<boolean> {
  stderr.write(question);
  const answer = await lines.nextLine();
  return answer !== null && /^(y|yes)$/i.test(answer.trim());
}

const SPECS: Record<AgentName, readonly AgentEnforceSpec[]> = {
  claude: [CLAUDE_ENFORCE],
  codex: CODEX_ENFORCE,
  antigravity: [ANTIGRAVITY_ENFORCE],
};

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}
function isOwned(e: ManifestEntry): boolean {
  return (e.kind === "hook" || e.kind === "rule") && e.identity !== undefined;
}
function isBackup(e: ManifestEntry): boolean {
  return e.kind === "hook" && e.identity === "backup";
}
function sameEntry(a: ManifestEntry, b: ManifestEntry): boolean {
  return a.path === b.path && a.kind === b.kind && a.identity === b.identity;
}
/** Sets one owned entry by (path, kind, identity). Never touches siblings (unlike upsertManifestEntry). */
function setOwned(files: ManifestEntry[], entry: ManifestEntry): void {
  const i = files.findIndex((f) => sameEntry(f, entry));
  if (i >= 0) files[i] = entry;
  else files.push(entry);
}
function dropOwned(files: ManifestEntry[], entry: ManifestEntry): void {
  const i = files.findIndex((f) => sameEntry(f, entry));
  if (i >= 0) files.splice(i, 1);
}

const IDENTITY_RE = /^(.+?)\[(.*)\]$/;
function guardMatch(agent: string): (el: unknown) => boolean {
  const tail = ` hook guard --agent ${agent}`;
  return (el) => {
    if (typeof el !== "object" || el === null || Array.isArray(el)) return false;
    const hooks = (el as { hooks?: unknown }).hooks;
    return (
      Array.isArray(hooks) &&
      hooks.some((h) => typeof (h as { command?: unknown } | null)?.command === "string" && ((h as { command: string }).command).endsWith(tail))
    );
  };
}
function selectorMatch(selector: string): (el: unknown) => boolean {
  const g = /^guard:(.+)$/.exec(selector);
  return g ? guardMatch(g[1]!) : (el) => el === selector;
}

function applyJsonItem(root: JsonObject, item: EnforceItem, rel: string): void {
  const m = IDENTITY_RE.exec(item.identity);
  if (m) upsertArrayItem(root, m[1]!.split("."), selectorMatch(m[2]!), item.value, rel);
  else root[item.identity] = item.value;
}
function removeJsonIdentity(root: JsonObject, identity: string): void {
  const m = IDENTITY_RE.exec(identity);
  if (m) removeArrayItems(root, m[1]!.split("."), selectorMatch(m[2]!));
  else delete root[identity];
}

function splitLines(text: string): { lines: string[]; eol: string } {
  const eol = /\r?\n/.exec(text)?.[0] ?? "\n";
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return { lines, eol };
}

interface FilePlan {
  rel: string;
  abs: string;
  format: "json" | "lines";
  agent: string;
  desired: EnforceItem[];
  stale: ManifestEntry[];
  created: boolean;
  doc?: JsonDoc;
  text?: string | null;
}

function isLines(rel: string): boolean {
  return !rel.endsWith(".json");
}

async function readTextOrNull(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function ensureDirs(ctx: IntegrationContext, file: string): Promise<void> {
  const missing: string[] = [];
  for (let d = path.dirname(file); isInside(ctx.root, d) && !(await exists(d)); d = path.dirname(d)) missing.unshift(d);
  if (missing.length === 0) return;
  await mkdir(path.dirname(file), { recursive: true });
  for (const d of missing) {
    const rel = toPosixRelative(ctx.root, d);
    setOwned(ctx.options.manifest.files, { path: rel, sha256: null, kind: "dir", created: true });
  }
}

export async function applyEnforce(ctx: IntegrationContext, state: AgentsState, enabled: boolean): Promise<PhaseReport> {
  const report: Required<PhaseReport> = { created: [], replaced: [], skipped: [], removed: [], kept: [], warnings: [] };
  const files = ctx.options.manifest.files;
  const permission: IngestPermission = ctx.config.ingest.permission;
  const form = resolveGuardForm({ root: ctx.root });

  // (a) Plan: every affected file is loaded before anything is written.
  const plans = new Map<string, FilePlan>();
  const plan = (rel: string, format: "json" | "lines", agent: string): FilePlan => {
    let p = plans.get(rel);
    if (!p) {
      const old = files.filter((e) => isOwned(e) && e.path === rel);
      p = {
        rel,
        abs: fromPosixRelative(ctx.root, rel),
        format,
        agent,
        desired: [],
        stale: [],
        created: false,
        ...(old.length > 0 ? { created: old.some((e) => e.created === true) } : {}),
      };
      plans.set(rel, p);
    }
    return p;
  };
  if (enabled) {
    for (const agent of state.agents) {
      for (const spec of SPECS[agent]) {
        const items = spec.items(guardCommand(form, agent, ctx.options.packageVersion), permission);
        const p = plan(spec.file, spec.format, agent);
        p.desired.push(...items);
      }
    }
  }
  const hasOld = new Set(files.filter((e) => isOwned(e) && !isBackup(e)).map((e) => e.path));
  for (const e of files.filter((f) => isOwned(f) && !isBackup(f))) {
    if (!isInside(ctx.root, fromPosixRelative(ctx.root, e.path))) continue;
    const agentConfigured = e.agent !== undefined && (state.agents as readonly string[]).includes(e.agent);
    const stillDesired = enabled && agentConfigured && plans.get(e.path)?.desired.some((d) => d.identity === e.identity);
    if (stillDesired) continue;
    if (!enabled && agentConfigured) continue;
    plan(e.path, isLines(e.path) ? "lines" : "json", e.agent ?? "").stale.push(e);
  }
  for (const p of plans.values()) {
    if (p.format === "json") p.doc = await loadJsonDoc(p.abs, p.rel); // throws settings_invalid before any write
    else p.text = await readTextOrNull(p.abs);
  }

  // (b) Write.
  for (const p of plans.values()) {
    const existedBefore = p.format === "json" ? p.doc!.existed : p.text !== null && p.text !== undefined;
    const fileCreated = hasOld.has(p.rel) ? p.created : !existedBefore;
    let removedFile = false;
    let wrote = false;
    let backup: string | null = null;
    if (p.format === "json") {
      const doc = p.doc!;
      const next = structuredClone(doc.value);
      for (const e of p.stale) removeJsonIdentity(next, e.identity!);
      for (const item of p.desired) applyJsonItem(next, item, p.rel);
      if (doc.existed && fileCreated && Object.keys(next).length === 0) {
        await rm(p.abs, { force: true, maxRetries: 3 });
        removedFile = true;
      } else if (wouldWrite(doc, next)) {
        if (!doc.existed) await ensureDirs(ctx, p.abs);
        const res = await saveJsonDoc(doc, next, { backup: !fileCreated });
        wrote = res.written;
        backup = res.backup;
      }
    } else {
      const staleSet = new Set(p.stale.map((e) => e.identity!));
      const { lines, eol } = splitLines(p.text ?? "");
      const next = lines.filter((l) => !staleSet.has(l.replace(/\r$/, "")));
      for (const item of p.desired) if (!next.includes(item.value as string)) next.push(item.value as string);
      const nextText = next.length > 0 ? next.join(eol) + eol : "";
      if (p.text !== null && p.text !== undefined && fileCreated && nextText.trim() === "") {
        await rm(p.abs, { force: true, maxRetries: 3 });
        removedFile = true;
      } else if (nextText !== (p.text ?? "") && !(p.text == null && nextText === "")) {
        if (p.text == null) await ensureDirs(ctx, p.abs);
        await writeFile(p.abs, nextText);
        wrote = true;
      }
    }
    for (const e of p.stale) dropOwned(files, e);
    if (removedFile) {
      report.removed.push(p.rel);
      const bakRel = p.rel + ".bak";
      if (files.some((f) => isBackup(f) && f.path === bakRel) && (await exists(fromPosixRelative(ctx.root, bakRel)))) {
        await rm(fromPosixRelative(ctx.root, bakRel), { force: true, maxRetries: 3 });
        report.removed.push(bakRel);
      }
      for (const e of files.filter((f) => f.path === p.rel || f.path === p.rel + ".bak")) dropOwned(files, e);
      continue;
    }
    if (wrote) (existedBefore ? report.replaced : report.created).push(p.rel);
    if (backup) {
      report.created.push(backup);
      setOwned(files, { path: backup, sha256: null, kind: "hook", agent: p.agent, identity: "backup" });
    }
    for (const item of p.desired) {
      setOwned(files, {
        path: p.rel,
        sha256: null,
        kind: item.kind,
        agent: item.agent,
        identity: item.identity,
        created: fileCreated,
      });
    }
  }
  return report;
}

export async function removeEnforce(ctx: IntegrationContext): Promise<PhaseReport> {
  const report: Required<PhaseReport> = { created: [], replaced: [], skipped: [], removed: [], kept: [], warnings: [] };
  const files = ctx.options.manifest.files;
  const owned = files.filter((e) => isOwned(e) && !isBackup(e));
  const byFile = new Map<string, ManifestEntry[]>();
  for (const e of owned) {
    if (!isInside(ctx.root, fromPosixRelative(ctx.root, e.path))) {
      throw new WikeeperError(ExitCode.ERROR, "unsafe_path", `refusing to edit ${e.path}: outside the repository`);
    }
    byFile.set(e.path, [...(byFile.get(e.path) ?? []), e]);
  }
  const docs = new Map<string, JsonDoc>();
  for (const rel of byFile.keys()) {
    if (!isLines(rel)) docs.set(rel, await loadJsonDoc(fromPosixRelative(ctx.root, rel), rel)); // a parse error leaves the manifest intact
  }

  for (const [rel, entries] of byFile) {
    const file = fromPosixRelative(ctx.root, rel);
    const created = entries.some((e) => e.created === true);
    const bakEntry = files.find((f) => isBackup(f) && f.path === rel + ".bak");
    const bakFile = file + ".bak";
    if (!isLines(rel)) {
      const doc = docs.get(rel)!;
      if (doc.existed) {
        const next = structuredClone(doc.value);
        for (const e of entries) removeJsonIdentity(next, e.identity!);
        let bakValue: unknown;
        if (bakEntry) {
          try {
            bakValue = JSON.parse((await readFile(bakFile, "utf8")).replace(/^\uFEFF/, ""));
          } catch {
            bakValue = undefined;
          }
        }
        let sameAsBak = false;
        if (bakValue !== undefined && typeof bakValue === "object" && bakValue !== null && !Array.isArray(bakValue)) {
          // Compare modulo empty containers on the paths wikeeper owns, so an original that already held one still restores byte-for-byte.
          const a = structuredClone(next);
          const b = structuredClone(bakValue as JsonObject);
          for (const e of entries) {
            const m = IDENTITY_RE.exec(e.identity!);
            if (!m) continue;
            pruneEmptyPath(a, m[1]!.split("."));
            pruneEmptyPath(b, m[1]!.split("."));
          }
          sameAsBak = isDeepStrictEqual(a, b);
        }
        if (sameAsBak) {
          await writeFile(file, await readFile(bakFile));
          await rm(bakFile, { force: true, maxRetries: 3 });
          report.removed.push(`${rel}#wikeeper`, rel + ".bak");
        } else if (created && Object.keys(next).length === 0) {
          await rm(file, { force: true, maxRetries: 3 });
          report.removed.push(rel);
          if (bakEntry && (await exists(bakFile))) {
            await rm(bakFile, { force: true, maxRetries: 3 });
            report.removed.push(rel + ".bak");
          }
        } else {
          const res = await saveJsonDoc(doc, next, { backup: false });
          if (res.written) report.removed.push(`${rel}#wikeeper`);
          if (bakEntry && (await exists(bakFile))) {
            report.kept.push(rel + ".bak");
            report.warnings.push(`${rel} changed since init; backup kept at ${rel}.bak`);
          }
        }
      }
    } else {
      const text = await readTextOrNull(file);
      if (text !== null) {
        const owned = new Set(entries.map((e) => e.identity!));
        const { lines, eol } = splitLines(text);
        const next = lines.filter((l) => !owned.has(l.replace(/\r$/, "")));
        const nextText = next.length > 0 ? next.join(eol) + eol : "";
        if (created && nextText.trim() === "") {
          await rm(file, { force: true, maxRetries: 3 });
          report.removed.push(rel);
        } else if (nextText !== text) {
          await writeFile(file, nextText);
          report.removed.push(`${rel}#wikeeper`);
        }
      }
    }
    for (const e of entries) dropOwned(files, e);
    if (bakEntry && !(await exists(bakFile))) dropOwned(files, bakEntry);
  }
  return report;
}

const decisions = new WeakMap<AgentsState, EnforceDecision>();

async function decide(ctx: IntegrationContext, state: AgentsState): Promise<EnforceDecision> {
  const known = decisions.get(state);
  if (known) return known;
  const decision = await resolveEnforce({
    flag: ctx.options.flags["enforce"],
    config: ctx.config.enforce === true,
    interactive: ctx.options.interactive,
    ask: () => (state.lines ? askYesNo(state.lines, ctx.options.io.stderr, ENFORCE_QUESTION) : Promise.resolve(false)),
  });
  decisions.set(state, decision);
  return decision;
}

export const enforceExtension: AgentsExtension = {
  name: "enforce",
  /** Resolves the enforce decision (prompt included) and strictly parses every JSON settings file init would touch. Writes nothing. */
  async preflight(ctx, state) {
    const decision = await decide(ctx, state);
    if (!decision.enabled) return;
    const seen = new Set<string>();
    for (const agent of state.agents) {
      for (const spec of SPECS[agent]) {
        if (spec.format !== "json" || seen.has(spec.file)) continue;
        seen.add(spec.file);
        await loadJsonDoc(fromPosixRelative(ctx.root, spec.file), spec.file);
      }
    }
  },
  async init(ctx, state) {
    const decision = await decide(ctx, state);
    const report = await applyEnforce(ctx, state, decision.enabled);
    if (decision.enabled && decision.source !== "config") {
      await setConfigValue(ctx.root, "enforce", true);
      ctx.config.enforce = true;
    }
    return report;
  },
  update(ctx, state) {
    return applyEnforce(ctx, state, ctx.config.enforce === true);
  },
  remove(ctx) {
    return removeEnforce(ctx);
  },
};
