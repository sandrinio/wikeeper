import { stat } from "node:fs/promises";
import type { Command } from "commander";
import { compareCodeUnits } from "../core/compare.js";
import { loadConfig } from "../core/config.js";
import type { WikeeperConfig } from "../core/config.js";
import { WikeeperError } from "../core/exit-codes.js";
import { formatLimit, formatTokens, levelMark, levelOf, measureWiki } from "../core/tokens.js";
import type { TokenLevel, TokenLimits } from "../core/tokens.js";
import { entityStatus, daysSince, isFinalStatus } from "../lint/staleness.js";
import { pageEntities, loadPages } from "../wiki/parse-page.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { assertInitialised, findRepoRoot, resolvePaths, toPosixRelative } from "../core/paths.js";
import type { ResolvedPaths } from "../core/paths.js";
import { factsFilePath, readFacts } from "../ingest/facts.js";
import { normalizeKindId } from "../ingest/kind-rules.js";
import { formatLockAge, readLock } from "../ingest/lock.js";
import type { LockInfo } from "../ingest/lock.js";
import { readLogEvents } from "../ingest/log.js";
import type { IngestLogEvent } from "../ingest/log.js";
import { listSources } from "../ingest/registry.js";
import { loadInstructions } from "../kb/parse-instructions.js";
import { listDecisions } from "../kb/rule-decisions.js";
import type { CommandModule } from "../program.js";
import { plural } from "./doctor.js";
import { readManifest } from "../core/manifest.js";
import { readPackageVersion } from "../core/templates.js";
import { compareVersions, npmVersion } from "../core/version.js";
import { availableMessage, newerVersion, readSavedCheck, updateCheckEnabled, versionMismatch } from "../core/update-check.js";
import type { ConfigIssue } from "../core/config.js";

export interface StatusData {
  open_ingest: LockInfo | null;
  stale_lock: boolean;
  unfinished_sources: string[];
  reingest_candidates: Array<{
    source_id: string;
    origin: string; // additive to K5 (this story): the counted ingest event's origin
    kind: string;
    rule_version: number | null;
    current_version: number;
  }>;
  pending_rule_suggestions: Array<{ source_id: string; items: string[] }>;
  setup: { completed_at: string | null; me: boolean; project: boolean };
  misses: number;
  tokens: {
    wiki: number;
    page_count: number;
    index: number;
    limits: { page: TokenLimits; source: TokenLimits & { confirm_at: "yellow" | "red" | "never" } };
    largest: Array<{ path: string; tokens: number; level: TokenLevel }>; // at most 5
  };
  archive: { pages: number; tokens: number };
  archive_candidates: Array<
    | { path: string; reason: "size"; tokens: number }
    | { path: string; reason: "final_status"; status: string; entity: string; last_dated: string }
  >;
  version: { installed: string; latest: string | null; files: string | null };
}

export interface StatusVersionOptions {
  installed?: string;
  env?: NodeJS.ProcessEnv;
  configIssues?: readonly ConfigIssue[];
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

class Families {
  private readonly parent = new Map<string, string>();
  find(id: string): string {
    let root = id;
    for (;;) {
      const p = this.parent.get(root);
      if (p === undefined || p === root) break;
      root = p;
    }
    this.parent.set(root, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export async function collectStatus(
  paths: ResolvedPaths,
  config: WikeeperConfig,
  now: Date,
  opts: StatusVersionOptions = {},
): Promise<{ data: StatusData; warnings: string[] }> {
  const warnings: string[] = [];
  const lock = await readLock(paths, now);
  const sources = await listSources(paths);
  const { events, skipped } = await readLogEvents(paths);
  for (const s of skipped) warnings.push(`${s.file}: ${s.reason}`);

  const ingests: IngestLogEvent[] = [];
  let misses = 0;
  for (const { event } of events) {
    if (event.type === "ingest") ingests.push(event);
    else if (event.type === "miss") misses += 1;
  }

  const ingested = new Set(ingests.map((e) => e.source_id));
  const unfinished = sources.map((m) => m.id).filter((id) => !ingested.has(id));

  // R5: families, newest finished ingest per family (events arrive sorted by at, then file name)
  const fam = new Families();
  for (const m of sources) {
    fam.find(m.id);
    if (typeof m.reingest_of === "string" && m.reingest_of !== "") fam.union(m.id, m.reingest_of);
  }
  const counted = new Map<string, IngestLogEvent>();
  for (const e of ingests) counted.set(fam.find(e.source_id), e);
  const countedEvents = [...counted.values()].sort((a, b) => compareCodeUnits(a.source_id, b.source_id));

  // R6
  const candidates: StatusData["reingest_candidates"] = [];
  const instructions = await loadInstructions(paths);
  if (instructions === null) {
    warnings.push("kb_instructions.md is missing: re-ingest candidates were not computed");
  } else {
    for (const ev of countedEvents) {
      const id = normalizeKindId(ev.kind);
      const current = instructions.kb.kinds.find((k) => k.id === id);
      if (current === undefined) continue;
      if (ev.rule_version === null || ev.rule_version < current.version) {
        candidates.push({
          source_id: ev.source_id,
          origin: ev.origin,
          kind: ev.kind,
          rule_version: ev.rule_version,
          current_version: current.version,
        });
      }
    }
  }

  // R7
  const decided = new Set((await listDecisions(paths)).map((d) => d.source_id));
  const pending: StatusData["pending_rule_suggestions"] = [];
  for (const ev of countedEvents) {
    const rel = toPosixRelative(paths.root, factsFilePath(paths, ev.source_id));
    let facts;
    try {
      facts = await readFacts(paths, ev.source_id);
    } catch (err) {
      if (err instanceof WikeeperError && err.code === "invalid_facts") {
        warnings.push(`${rel} is not valid and was skipped`);
        continue;
      }
      throw err;
    }
    if (facts === null) {
      warnings.push(`${rel} is missing and was skipped`);
      continue;
    }
    if (facts.uncovered.length > 0 && !decided.has(ev.source_id)) {
      pending.push({ source_id: ev.source_id, items: [...facts.uncovered] });
    }
  }

  // tokens (STORY-007-05)
  const size = await measureWiki(paths);
  const tokens: StatusData["tokens"] = {
    wiki: size.total,
    page_count: size.page_count,
    index: size.index,
    limits: config.tokens,
    largest: size.pages
      .slice(0, 5)
      .map((p) => ({ path: p.path, tokens: p.tokens, level: levelOf(p.tokens, config.tokens.page) })),
  };

  // archive (STORY-008-05)
  const archiveSize = await measureWiki({ ...paths, pagesDir: paths.archiveDir });
  const archive = { pages: archiveSize.page_count, tokens: archiveSize.total };
  const sizeByPath = new Map(
    size.pages.filter((p) => p.tokens >= config.tokens.page.red).map((p) => [p.path, p.tokens] as const),
  );
  const archiveCandidates: StatusData["archive_candidates"] = [];
  const pageList = await loadPages(paths.pagesDir);
  for (const page of pageList) {
    const sz = sizeByPath.get(page.path);
    if (sz !== undefined) archiveCandidates.push({ path: page.path, reason: "size", tokens: sz });
    for (const e of pageEntities(page)) {
      if (e.facts.length === 0) continue;
      const st = entityStatus(page, e);
      if (st === null || !isFinalStatus(st.value)) continue;
      const newest = e.facts.reduce((a, f) => (f.date > a ? f.date : a), "");
      if (daysSince(newest, now) <= config.lint.stale_after_days) continue;
      archiveCandidates.push({
        path: page.path,
        reason: "final_status",
        status: st.value,
        entity: e.name,
        last_dated: newest,
      });
    }
  }
  archiveCandidates.sort((a, b) => compareCodeUnits(a.path, b.path));

  // version (STORY-009-01)
  let installed = opts.installed ?? "";
  if (opts.installed === undefined) {
    try {
      installed = npmVersion(readPackageVersion());
    } catch {
      installed = "";
    }
  }
  let manifest: Awaited<ReturnType<typeof readManifest>> = null;
  try {
    manifest = await readManifest(paths.manifestFile);
  } catch {
    manifest = null;
  }
  const pv = manifest?.package_version;
  const files = pv !== undefined && compareVersions(pv, pv) !== null ? npmVersion(pv) : null;
  const latest = updateCheckEnabled(config, opts.env ?? process.env, opts.configIssues)
    ? newerVersion(await readSavedCheck(paths), installed)
    : null;

  const data: StatusData = {
    open_ingest: lock.lock,
    stale_lock: lock.stale,
    unfinished_sources: unfinished,
    reingest_candidates: candidates,
    pending_rule_suggestions: pending,
    setup: {
      completed_at: config.setup_completed_at,
      me: await exists(paths.meFile),
      project: await exists(paths.projectFile),
    },
    misses,
    tokens,
    archive,
    archive_candidates: archiveCandidates,
    version: { installed, latest, files },
  };
  return { data, warnings };
}

function renderStatus(data: StatusData, ageMs: number | null, staleAfterDays: number): string[] {
  const out: string[] = [];
  if (data.open_ingest !== null) {
    out.push(
      `open ingest: ${data.open_ingest.source_id} holds the write lock (acquired ${formatLockAge(Math.max(0, ageMs ?? 0))} ago)` +
        (data.stale_lock ? "; the lock is stale (older than 2 hours)" : ""),
    );
  } else if (data.stale_lock) {
    out.push("open ingest: .wiki/.lock is unreadable and counts as stale");
  } else {
    out.push("open ingest: none");
  }
  if (data.unfinished_sources.length === 0) out.push("unfinished sources: none");
  else {
    out.push(`unfinished sources: ${data.unfinished_sources.length}`);
    for (const id of data.unfinished_sources) out.push(`  ${id}`);
  }
  if (data.reingest_candidates.length === 0) out.push("re-ingest candidates: none");
  else {
    out.push(`re-ingest candidates: ${data.reingest_candidates.length}`);
    for (const c of data.reingest_candidates) {
      const was = c.rule_version === null ? "no rule" : `v${c.rule_version}`;
      out.push(`  ${c.source_id} (${c.kind} ${was}, rule now v${c.current_version}) from ${c.origin}`);
    }
  }
  if (data.pending_rule_suggestions.length === 0) out.push("pending rule suggestions: none");
  else {
    const items = data.pending_rule_suggestions.reduce((n, p) => n + p.items.length, 0);
    out.push(
      `pending rule suggestions: ${plural(data.pending_rule_suggestions.length, "source")}, ${plural(items, "item")}`,
    );
    for (const p of data.pending_rule_suggestions) {
      out.push(`  ${p.source_id}`);
      for (const item of p.items) out.push(`    - ${item}`);
    }
    out.push("  decide with wikeeper rules record --accepted|--rejected --kind <k> --summary <text> --from <id>");
  }
  out.push(
    `${data.setup.completed_at !== null ? `setup: completed ${data.setup.completed_at}` : "setup: not completed"}` +
      ` · me.md ${data.setup.me ? "present" : "missing"} · project.md ${data.setup.project ? "present" : "missing"}`,
  );
  out.push(
    data.misses === 0 ? "misses: none" : `misses: ${data.misses} recorded (wikeeper search --misses lists them)`,
  );
  const t = data.tokens;
  out.push(`tokens: wiki ${formatTokens(t.wiki)} · ${plural(t.page_count, "page")} · index.md ${formatTokens(t.index)}`);
  const p = t.limits.page;
  const s = t.limits.source;
  out.push(
    `  limits: page ${formatLimit(p.yellow)}/${formatLimit(p.red)} · source ${formatLimit(s.yellow)}/${formatLimit(s.red)}, ${
      s.confirm_at === "never" ? "no size approval" : `approval at ${s.confirm_at}`
    }`,
  );
  if (t.largest.length > 0) {
    out.push("  largest pages:");
    for (const l of t.largest) out.push(`    ${l.path} ${formatTokens(l.tokens)} ${levelMark(l.level)}`);
  }
  out.push(
    data.archive.pages === 0
      ? "archive: none"
      : `archive: ${formatTokens(data.archive.tokens)} tokens · ${plural(data.archive.pages, "page")}`,
  );
  if (data.archive_candidates.length === 0) out.push("archive candidates: none");
  else {
    out.push(`archive candidates: ${data.archive_candidates.length}`);
    let anySize = false;
    for (const c of data.archive_candidates) {
      if (c.reason === "size") {
        anySize = true;
        out.push(`  ${c.path} ${formatTokens(c.tokens)} ${levelMark("red")} (tokens.page.red is ${formatLimit(t.limits.page.red)})`);
      } else {
        out.push(
          `  ${c.path} · ${c.entity}: status ${c.status}, last dated ${c.last_dated} (lint.stale_after_days is ${staleAfterDays})`,
        );
      }
    }
    out.push(
      "  nothing moves to the archive until the user asks for a clean-up" +
        (anySize ? "; to raise the page limit instead, run wikeeper config set tokens.page.red <n>" : ""),
    );
  }
  const v = data.version;
  if (v.latest !== null) out.push(`version: ${availableMessage(v.latest, v.installed)}`);
  const mm = versionMismatch(v.installed, v.files);
  if (mm !== null) out.push(`version: ${mm.message}`);
  return out;
}

export function createStatusCommand(
  deps: { now?: () => Date; installed?: string; env?: NodeJS.ProcessEnv } = {},
): CommandModule {
  const now = deps.now ?? (() => new Date());
  return {
    register(program: Command): void {
      program
        .command("status")
        .description("show open ingests, unfinished sources, re-ingest candidates, pending rule suggestions and misses")
        .action(async (_opts: unknown, command: Command) => {
          const ctx = getOutputContext(command);
          const root = findRepoRoot(ctx.cwd);
          const { config, errors } = await loadConfig(root);
          const paths = resolvePaths(root, config);
          await assertInitialised(paths);
          const at = now();
          const { data, warnings } = await collectStatus(paths, config, at, {
            installed: deps.installed,
            env: deps.env,
            configIssues: errors,
          });
          const ageMs =
            data.open_ingest === null ? null : at.getTime() - Date.parse(data.open_ingest.acquired_at);
          emitResult(ctx, { command: "status", data, warnings, message: renderStatus(data, ageMs, config.lint.stale_after_days) });
        });
    },
  };
}

export const statusCommand: CommandModule = createStatusCommand();
