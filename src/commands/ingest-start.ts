// src/commands/ingest-start.ts
// Contract C5 — contract/S-02-ingest-group (owner STORY-003-04). Frozen exports. register() works (it adds `start`
// and its options to the ingest group); the action is a stub until the owner replaces it.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import type { OutputContext } from "../core/output.js";
import { assertInitialised, findRepoRoot, isInside, resolvePaths } from "../core/paths.js";
import { stripBom } from "../core/text.js";
import { findKindRule, isValidKindId, normalizeKindId, parseSourceKinds } from "../ingest/kind-rules.js";
import type { SourceKindRule } from "../ingest/kind-rules.js";
import { evaluatePermission } from "../ingest/permissions.js";
import type { PermissionResult } from "../ingest/permissions.js";
import {
  fileOrigin,
  findDuplicate,
  hashSource,
  listSources,
  normalizeUrl,
  registerSource,
  removeSource,
} from "../ingest/registry.js";
import type { OriginType, SourceMeta } from "../ingest/registry.js";
import { hookFailed, runUserHooks } from "../ingest/user-hooks.js";
import type { UserHookResult } from "../ingest/user-hooks.js";
import { readPayload } from "./hook.js";
import type { IngestSubcommand } from "./ingest.js";

const MAX_STDIN_BYTES = 10 * 1024 * 1024;

function usage(message: string): WikeeperError {
  return new WikeeperError(ExitCode.USAGE, "usage", message);
}

async function readStdinText(ctx: OutputContext): Promise<string> {
  if (ctx.isTTY) throw usage("stdin is a terminal: pipe the text in, or pass a file");
  const text = await readPayload(ctx.stdin, MAX_STDIN_BYTES);
  if (text === null) throw usage("stdin text is larger than 10 MB");
  const out = stripBom(text);
  if (out.length === 0) throw usage("stdin is empty: nothing to ingest");
  return out;
}

interface Resolved {
  originType: OriginType;
  origin: string;
  label: string;
  originalPath: string | null;
  text: string | null;
}

function baseNoExt(p: string): string {
  const b = path.basename(p);
  const e = path.extname(b);
  return e ? b.slice(0, -e.length) : b;
}

export interface IngestStartResult {
  status: "registered" | "duplicate";
  id: string | null; // null for a duplicate
  source: SourceMeta | null;
  prior: { id: string; captured_at: string; origin: string; match: "sha256" | "origin" } | null;
  rule: SourceKindRule | null;
  permission: PermissionResult | null; // null for a duplicate (not evaluated)
  hooks: UserHookResult[];
  available_kinds: Array<{ id: string; version: number }>;
  next: string | null; // "wikeeper ingest facts <id> < facts.json"
}

interface StartOptions {
  kind?: string;
  approved?: boolean;
  reingest?: boolean;
  textFile?: string;
  title?: string;
  providedBy: string;
}

export function createIngestStartCommand(deps: { now?: () => Date } = {}): IngestSubcommand {
  return {
    register(group: Command): void {
      group
        .command("start")
        .description("register a source: a file, an http(s) URL, or - for text on stdin")
        .argument("<source>", "file path, http(s) URL, or - for stdin")
        .option("--kind <kind>", "source kind, as listed in .wiki/kb_instructions.md")
        .option("--approved", "the user approved this source")
        .option("--reingest", "register the source again although it is a duplicate")
        .option("--text-file <file>", "the text the agent read from the source (- for stdin)")
        .option("--title <text>", "label for the source id")
        .option("--provided-by <who>", "user or agent", "user")
        .action(async (source: string, opts: StartOptions, command: Command) => {
          const ctx = getOutputContext(command);
          const root = findRepoRoot(ctx.cwd);
          const { config } = await loadConfig(root);
          const paths = resolvePaths(root, config);
          await assertInitialised(paths);

          if (opts.providedBy !== "user" && opts.providedBy !== "agent") {
            throw usage(`--provided-by must be "user" or "agent", got "${opts.providedBy}"`);
          }
          const providedBy = opts.providedBy;

          // 2. resolve the source (no writes)
          const textFromFlag = async (): Promise<string> => {
            if (opts.textFile === "-") return readStdinText(ctx);
            const abs = path.resolve(ctx.cwd, opts.textFile as string);
            let text: string;
            try {
              text = stripBom(await readFile(abs, "utf8"));
            } catch {
              throw usage(`cannot read --text-file ${opts.textFile}`);
            }
            if (text.length === 0) throw usage(`--text-file ${opts.textFile} is empty`);
            return text;
          };
          let resolved: Resolved;
          if (source === "-") {
            if (opts.textFile !== undefined) throw usage("`-` already reads stdin: drop --text-file");
            resolved = {
              originType: "stdin",
              origin: "stdin",
              label: opts.title ?? "chat-excerpt",
              originalPath: null,
              text: await readStdinText(ctx),
            };
          } else if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(source)) {
            let url: URL;
            try {
              url = new URL(source);
            } catch {
              throw usage(`not a valid URL: ${source}`);
            }
            if (url.protocol !== "http:" && url.protocol !== "https:") {
              throw usage(`unsupported URL scheme "${url.protocol}": only http and https`);
            }
            if (opts.textFile === undefined) {
              throw usage(
                "wikeeper does not fetch URLs: read the page yourself and pass its text with --text-file <file> (or --text-file - for stdin)",
              );
            }
            const segments = url.pathname.split("/").filter((x) => x.length > 0);
            const last = segments[segments.length - 1];
            resolved = {
              originType: "url",
              origin: normalizeUrl(source),
              label: opts.title ?? (last !== undefined ? baseNoExt(last) || last : url.hostname),
              originalPath: null,
              text: await textFromFlag(),
            };
          } else {
            const abs = path.resolve(ctx.cwd, source);
            let st;
            try {
              st = await stat(abs);
            } catch {
              throw usage(`source not found: ${source}`);
            }
            if (st.isDirectory()) {
              throw usage(`${source} is a directory: use wikeeper ingest plan ${source}`);
            }
            if (!st.isFile()) throw usage(`${source} is not a regular file`);
            if (isInside(paths.wikiDir, abs) || isInside(paths.contentDir, abs)) {
              throw usage(`${source} is inside the wiki itself and cannot be ingested`);
            }
            if (opts.textFile !== undefined && path.extname(abs).toLowerCase() === ".md") {
              throw usage("the original is already markdown; drop --text-file");
            }
            resolved = {
              originType: "file",
              origin: fileOrigin(root, abs),
              label: opts.title ?? baseNoExt(abs),
              originalPath: abs,
              text: opts.textFile !== undefined ? await textFromFlag() : null,
            };
          }

          // 3. kind
          let kind: string | null = null;
          if (opts.kind !== undefined) {
            if (!isValidKindId(opts.kind)) throw usage(`invalid --kind "${opts.kind}": use lowercase letters, digits and hyphens`);
            kind = normalizeKindId(opts.kind);
          }

          // 4. kb_instructions.md
          const warnings: string[] = [];
          let kbText: string | null = null;
          try {
            kbText = await readFile(paths.kbInstructions, "utf8");
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
          }
          let rule: SourceKindRule | null = null;
          let availableKinds: Array<{ id: string; version: number }> = [];
          if (kbText === null) {
            warnings.push("no .wiki/kb_instructions.md; no source-kind rules are available");
          } else {
            availableKinds = parseSourceKinds(kbText).map(({ id, version }) => ({ id, version }));
            if (kind !== null) rule = findKindRule(kbText, kind);
          }
          if (kind !== null && rule === null && kbText !== null) {
            warnings.push(`no rule for kind ${kind} in kb_instructions.md; propose one`);
          }

          // 5. hash, duplicate
          const { sha256, size } = await hashSource(resolved);
          const dup = findDuplicate(await listSources(paths), {
            sha256,
            originType: resolved.originType,
            origin: resolved.origin,
          });
          if (dup !== null && !opts.reingest) {
            const data: IngestStartResult = {
              status: "duplicate",
              id: null,
              source: null,
              prior: {
                id: dup.meta.id,
                captured_at: dup.meta.captured_at,
                origin: dup.meta.origin,
                match: dup.match,
              },
              rule,
              permission: null,
              hooks: [],
              available_kinds: availableKinds,
              next: null,
            };
            emitResult(ctx, {
              command: "ingest start",
              data,
              warnings,
              message: `already registered as ${dup.meta.id} (same ${dup.match}); use --reingest to register it again`,
            });
            return;
          }

          // 6. permission
          const perm = evaluatePermission(config.ingest, {
            origin: resolved.origin,
            originType: resolved.originType,
            kind,
            approved: opts.approved === true,
          });
          if (perm.decision !== "allowed") {
            const details = {
              source: { origin: resolved.origin, origin_type: resolved.originType, size, sha256, kind, rule },
              reason: perm.reason,
              matched: perm.matched,
            };
            if (perm.decision === "needs_approval") {
              throw new WikeeperError(
                ExitCode.NEEDS_APPROVAL,
                "needs_approval",
                `${resolved.origin} (${size} bytes) needs approval: ${perm.reason}`,
                details,
              );
            }
            throw new WikeeperError(ExitCode.DENIED, "denied", perm.reason, details);
          }

          // 7. register, then pre-hooks
          const meta = await registerSource(paths, {
            originType: resolved.originType,
            origin: resolved.origin,
            label: resolved.label,
            originalPath: resolved.originalPath,
            text: resolved.text,
            kind,
            providedBy,
            ruleVersion: rule?.version ?? null,
            reingestOf: dup?.meta.id ?? null,
            permission: {
              mode: perm.mode,
              approved: opts.approved === true,
              matched: perm.matched,
              kind_pending: perm.kind_pending,
            },
            ...(deps.now ? { now: deps.now() } : {}),
          });
          const hooks = await runUserHooks("pre_ingest", config.hooks.pre_ingest, { cwd: root, sourceId: meta.id });
          if (hooks.some(hookFailed)) {
            await removeSource(paths, meta.id);
            throw new WikeeperError(
              ExitCode.ERROR,
              "pre_ingest_failed",
              `a pre_ingest hook failed; ${meta.id} was not registered`,
              { hooks },
            );
          }

          const next = `wikeeper ingest facts ${meta.id} < facts.json`;
          const data: IngestStartResult = {
            status: "registered",
            id: meta.id,
            source: meta,
            prior: null,
            rule,
            permission: perm,
            hooks,
            available_kinds: availableKinds,
            next,
          };
          emitResult(ctx, {
            command: "ingest start",
            data,
            warnings,
            message: [
              `registered ${meta.id} from ${meta.origin} (${meta.size} bytes)`,
              `${rule ? `rule ${rule.id} v${rule.version}` : "no rule"}; permission ${perm.mode}: ${perm.decision}`,
              `next: ${next}`,
            ],
          });
        });
    },
  };
}

export const ingestStartCommand: IngestSubcommand = createIngestStartCommand();
