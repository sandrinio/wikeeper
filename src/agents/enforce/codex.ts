import type { AgentEnforceSpec, EnforceItem } from "./claude.js";

const AI_LINES = [
  'prefix_rule(pattern=["npx","wikeeper","ingest"], decision="allow")',
  'prefix_rule(pattern=["wikeeper","ingest"], decision="allow")',
];
const ASK_LINES = [
  'prefix_rule(pattern=["npx","wikeeper","ingest","start"], decision="prompt")',
  'prefix_rule(pattern=["wikeeper","ingest","start"], decision="prompt")',
];

const AI_PROMPT_LINES = [
  'prefix_rule(pattern=["npx","wikeeper","ingest","abort"], decision="prompt")',
  'prefix_rule(pattern=["wikeeper","ingest","abort"], decision="prompt")',
];

const READ_LINES = [
  'prefix_rule(pattern=["npx","wikeeper","read"], decision="allow")',
  'prefix_rule(pattern=["wikeeper","read"], decision="allow")',
];

const SEARCH_LINES = [
  'prefix_rule(pattern=["npx","wikeeper","search"], decision="allow")',
  'prefix_rule(pattern=["wikeeper","search"], decision="allow")',
];

const hooks: AgentEnforceSpec = {
  file: ".codex/hooks.json",
  format: "json",
  items(cmd) {
    return [
      {
        kind: "hook",
        agent: "codex",
        identity: "hooks.PreToolUse[guard:codex]",
        value: { matcher: "apply_patch", hooks: [{ type: "command", command: cmd, timeout: 30 }] },
      },
    ];
  },
};

const rules: AgentEnforceSpec = {
  file: ".codex/rules/wikeeper.rules",
  format: "lines",
  items(_cmd, permission) {
    const mode = permission === "ai" ? [...AI_LINES, ...AI_PROMPT_LINES] : permission === "ask" ? ASK_LINES : [];
    const lines = [...mode, ...(permission === "ai" ? READ_LINES : []), ...SEARCH_LINES];
    return lines.map((line): EnforceItem => ({ kind: "rule", agent: "codex", identity: line, value: line }));
  },
};

export const CODEX_ENFORCE: readonly AgentEnforceSpec[] = [hooks, rules];
