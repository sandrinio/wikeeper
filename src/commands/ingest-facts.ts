// src/commands/ingest-facts.ts
// `wikeeper ingest facts <id>`: validate and store the facts extracted from a registered source.
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "../core/config.js";
import { ExitCode, WikeeperError } from "../core/exit-codes.js";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot, resolvePaths } from "../core/paths.js";
import { FACTS_SCHEMA_REL, validateFacts, writeFacts } from "../ingest/facts.js";
import { findKindRule, normalizeKindId } from "../ingest/kind-rules.js";
import { readLogEvents } from "../ingest/log.js";
import { evaluatePermission } from "../ingest/permissions.js";
import { readMeta, removeSource } from "../ingest/registry.js";
import { plural } from "./doctor.js";
import { readPayload } from "./hook.js";
import type { IngestSubcommand } from "./ingest.js";

const MAX_BYTES = 10 * 1024 * 1024;

function usage(message: string): WikeeperError {
  return new WikeeperError(ExitCode.USAGE, "usage", message);
}

function invalid(errors: Array<{ path: string; message: string }>, prefix: string): WikeeperError {
  const list = errors.map((e) => `${e.path}: ${e.message}`).join("; ");
  return new WikeeperError(
    ExitCode.ERROR,
    "invalid_facts",
    `${prefix}${errors.length === 1 ? "1 problem" : `${errors.length} problems`}: ${list}`,
    { errors },
  );
}

export const ingestFactsCommand: IngestSubcommand = {
  register(group: Command): void {
    group
      .command("facts")
      .description("store the facts extracted from a source (JSON on stdin or --file)")
      .argument("<id>", "source id from wikeeper ingest start")
      .option("--file <path>", "read the facts JSON from this file instead of stdin")
      .action(async (id: string, opts: { file?: string }, command: Command) => {
        const ctx = getOutputContext(command);
        const root = findRepoRoot(ctx.cwd);
        const { config } = await loadConfig(root);
        const paths = resolvePaths(root, config);
        try {
          await stat(paths.configFile);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            throw new WikeeperError(ExitCode.ERROR, "not_initialised", "wiki is not initialised: run wikeeper init");
          }
          throw err;
        }

        // 2. input
        let text: string;
        if (opts.file !== undefined) {
          const abs = path.resolve(ctx.cwd, opts.file);
          let buf: Buffer;
          try {
            buf = await readFile(abs);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") throw usage(`facts file not found: ${opts.file}`);
            throw err;
          }
          if (buf.length > MAX_BYTES) throw usage("facts JSON larger than 10 MB");
          text = buf.toString("utf8");
        } else {
          if (ctx.isTTY) throw usage("pipe the facts JSON on stdin or pass --file");
          const got = await readPayload(ctx.stdin, MAX_BYTES);
          if (got === null) throw usage("facts JSON larger than 10 MB");
          text = got;
        }

        // 3. parse
        let parsed: unknown;
        try {
          parsed = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
        } catch (err) {
          throw invalid(
            [{ path: "$", message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` }],
            `facts do not match ${FACTS_SCHEMA_REL}: `,
          );
        }

        // 4. registered, not finished
        const meta = await readMeta(paths, id);
        if (meta === null) throw new WikeeperError(ExitCode.ERROR, "unknown_source", `no source ${id} is registered`);
        const finished = await readLogEvents(paths, { type: "ingest", sourceId: id });
        if (finished.events.length > 0) {
          throw new WikeeperError(ExitCode.ERROR, "ingest_finished", `the ingest of ${id} is already finished`);
        }

        // 6. schema
        const v = validateFacts(parsed);
        if (!v.ok) throw invalid(v.errors, `facts do not match ${FACTS_SCHEMA_REL}: `);
        const value = v.value;
        if (value.source_id !== id) {
          throw new WikeeperError(
            ExitCode.ERROR,
            "source_id_mismatch",
            `the facts name source ${value.source_id}, but the command names ${id}`,
          );
        }
        const kind = normalizeKindId(value.kind);
        if (meta.kind !== null && kind !== meta.kind) {
          throw new WikeeperError(
            ExitCode.ERROR,
            "kind_mismatch",
            `${id} was started with --kind ${meta.kind}, but the facts say ${kind}`,
          );
        }

        // 9. kind permission left open at start
        if (meta.permission.kind_pending) {
          const r = evaluatePermission(config.ingest, {
            origin: meta.origin,
            originType: meta.origin_type,
            kind,
            approved: true,
          });
          if (r.decision === "denied") {
            let removed: string[] = [];
            try {
              removed = await removeSource(paths, id);
            } catch (err) {
              let left: string[] = [];
              try {
                left = (await readdir(paths.rawDir)).filter((n) => n.startsWith(`${id}.`)).sort();
              } catch {
                // raw/ unreadable: nothing more to report
              }
              throw new WikeeperError(
                ExitCode.DENIED,
                "denied",
                `${r.reason} (could not remove ${left.join(", ")} from raw/: ${err instanceof Error ? err.message : String(err)})`,
                { reason: r.reason, removed: [], left },
              );
            }
            throw new WikeeperError(ExitCode.DENIED, "denied", r.reason, { reason: r.reason, removed });
          }
        }

        // 10. warnings
        const warnings: string[] = [];
        let kbText = "";
        try {
          kbText = await readFile(paths.kbInstructions, "utf8");
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
        }
        const rule = findKindRule(kbText, value.kind);
        if (rule === null) {
          warnings.push(`no rule for kind ${kind} in kb_instructions.md; propose one`);
          if (value.rule_version !== null) {
            warnings.push(`rule_version ${value.rule_version} is ignored: kind ${kind} has no rule`);
          }
        } else if (rule.version !== value.rule_version) {
          warnings.push(
            `rule_version ${value.rule_version === null ? "null" : value.rule_version} for kind ${kind} does not match kb_instructions.md (v${rule.version})`,
          );
        }

        // 11. store
        const written = await writeFacts(paths, value);
        const data = {
          source_id: id,
          file: written.file,
          replaced: written.replaced,
          kind: value.kind,
          rule_version: value.rule_version,
          facts: value.facts.length,
          new_entities: value.new_entities.length,
          uncovered: value.uncovered.length,
        };
        emitResult(ctx, {
          command: "ingest facts",
          data,
          warnings,
          message:
            `stored ${plural(data.facts, "fact")} for ${id} in ${written.file}` +
            `${written.replaced ? " (replaced the earlier facts)" : ""}` +
            `; new entities: ${data.new_entities}, uncovered: ${data.uncovered}`,
        });
      });
  },
};
