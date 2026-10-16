// src/commands/ingest-start.ts
// Contract C5 — contract/S-02-ingest-group (owner STORY-003-04). Frozen exports. register() works (it adds `start`
// and its options to the ingest group); the action is a stub until the owner replaces it.
import type { Command } from "commander";
import type { SourceKindRule } from "../ingest/kind-rules.js";
import type { PermissionResult } from "../ingest/permissions.js";
import type { SourceMeta } from "../ingest/registry.js";
import type { UserHookResult } from "../ingest/user-hooks.js";
import type { IngestSubcommand } from "./ingest.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C5)`);
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
          stub("ingest start");
        });
    },
  };
}

export const ingestStartCommand: IngestSubcommand = createIngestStartCommand();
