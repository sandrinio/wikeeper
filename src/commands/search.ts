// src/commands/search.ts
// Contract C10 — contract/S-02-search (owner STORY-004-02). executeSearch is a stub; createSearchCommand has a
// working body (registers `search`) because src/program.ts runs it at start-up. Consumers write only at their own
// INSERTION POINT lines; the owner keeps every anchor line exactly as written.
import type { Command } from "commander";
import { emitResult, getOutputContext } from "../core/output.js";
import { findRepoRoot } from "../core/paths.js";
import type { CommandModule } from "../program.js";
import { EMPTY_FILTERS } from "../search/engine.js";
import type { SearchData, SearchDeps, SearchRequest } from "../search/engine.js";

function stub(name: string): never {
  throw new Error(`contract stub: ${name} (C10)`);
}

export async function executeSearch(root: string, req: SearchRequest, deps: SearchDeps = {}): Promise<SearchData> {
  // INSERTION POINT STORY-004-03: filter step (req.filters.type / .where / .status) on the ranked hits.
  // INSERTION POINT STORY-004-04: entity mode (req.entity) and the --since changes (req.filters.since).
  // INSERTION POINT STORY-004-05: misses mode (req.misses) and miss recording.
  return stub("executeSearch");
}

interface SearchOptions {
  limit: string;
  // INSERTION POINT STORY-004-03: type?: string; where?: string[]; status?: string;
  // INSERTION POINT STORY-004-04: entity?: string; since?: string;
  // INSERTION POINT STORY-004-05: misses?: boolean;
}

export function createSearchCommand(deps: SearchDeps = {}): CommandModule {
  return {
    register(program: Command): void {
      program
        .command("search")
        .description("search the wiki pages")
        .argument("[query...]", "words to search for")
        .option("--limit <n>", "maximum number of results (1-100)", "10")
        // INSERTION POINT STORY-004-03: --type <type>, --where <key=value> (repeatable), --status <status>
        // INSERTION POINT STORY-004-04: --entity <name>, --since <date>
        // INSERTION POINT STORY-004-05: --misses
        .action(async (words: string[], opts: SearchOptions, command: Command) => {
          const ctx = getOutputContext(command);
          const req: SearchRequest = {
            query: words.length > 0 ? words.join(" ") : null,
            limit: Number(opts.limit),
            filters: { ...EMPTY_FILTERS, where: [] },
            entity: null,
            misses: false,
          };
          // INSERTION POINT STORY-004-03: req.filters.type / .where / .status from opts
          // INSERTION POINT STORY-004-04: req.entity and req.filters.since from opts
          // INSERTION POINT STORY-004-05: req.misses from opts
          const data = await executeSearch(findRepoRoot(ctx.cwd), req, deps);
          emitResult(ctx, { command: "search", data });
        });
    },
  };
}

export const searchCommand: CommandModule = createSearchCommand();
