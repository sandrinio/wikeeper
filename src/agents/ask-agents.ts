import { createInterface } from "node:readline";
import { AGENT_NAMES, type AgentName } from "./agent-names.js";
import type { AskAgents } from "./detect.js";
import type { TextSink } from "../core/output.js";

export interface LineReader {
  nextLine(): Promise<string | null>; // null = EOF
  close(): void;
}

/** One reader per command run: a second readline on the same stdin would lose buffered lines. */
export function createLineReader(stdin: NodeJS.ReadableStream): LineReader {
  const rl = createInterface({ input: stdin, terminal: false });
  const it = rl[Symbol.asyncIterator]();
  return {
    async nextLine() {
      const r = await it.next();
      return r.done ? null : r.value;
    },
    close() {
      rl.close();
    },
  };
}

export function parseAgentSelection(
  answer: string,
  choices: readonly AgentName[],
  preselected: readonly AgentName[],
): AgentName[] | null {
  const trimmed = answer.trim();
  if (trimmed === "") return preselected.length > 0 ? [...preselected] : null;
  const picked = new Set<AgentName>();
  for (const raw of trimmed.split(",")) {
    const token = raw.trim();
    if (token === "") continue;
    let name: AgentName | undefined;
    if (/^\d+$/.test(token)) name = choices[Number(token) - 1];
    else name = choices.find((c) => c === token);
    if (name === undefined) return null;
    picked.add(name);
  }
  if (picked.size === 0) return null;
  return AGENT_NAMES.filter((n) => picked.has(n));
}

const MAX_ATTEMPTS = 3;

export function createAskAgents(io: { stderr: TextSink; lines: LineReader }): AskAgents {
  return async ({ choices, preselected }) => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      io.stderr.write("Which agents do you use? (numbers or names, comma-separated; Enter = marked)\n");
      choices.forEach((c, i) => {
        io.stderr.write(`  ${i + 1}) [${preselected.includes(c) ? "x" : " "}] ${c}\n`);
      });
      io.stderr.write("> ");
      const line = await io.lines.nextLine();
      if (line === null) return [];
      const parsed = parseAgentSelection(line, choices, preselected);
      if (parsed !== null) return parsed;
    }
    return [];
  };
}
