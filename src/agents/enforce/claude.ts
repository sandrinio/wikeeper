import type { IngestPermission } from "../../core/config.js";
import type { AgentName } from "../agent-names.js";

export interface EnforceItem {
  kind: "hook" | "rule";
  agent: AgentName;
  identity: string;
  value: unknown; // JSON value, or a rules line
}
export interface AgentEnforceSpec {
  file: string;
  format: "json" | "lines";
  items(cmd: string, permission: IngestPermission): EnforceItem[];
}

export const CLAUDE_MATCHER = "Edit|Write|MultiEdit|NotebookEdit";

const AI_ASK_RULES = [
  "Bash(npx wikeeper ingest *--drop*)",
  "Bash(wikeeper ingest *--drop*)",
  "Bash(npx wikeeper ingest *--force-unlock*)",
  "Bash(wikeeper ingest *--force-unlock*)",
];

export const CLAUDE_ENFORCE: AgentEnforceSpec = {
  file: ".claude/settings.json",
  format: "json",
  items(cmd, permission) {
    const items: EnforceItem[] = [
      {
        kind: "hook",
        agent: "claude",
        identity: "hooks.PreToolUse[guard:claude]",
        value: { matcher: CLAUDE_MATCHER, hooks: [{ type: "command", command: cmd }] },
      },
    ];
    if (permission === "ai") {
      for (const rule of ["Bash(npx wikeeper ingest *)", "Bash(wikeeper ingest *)"]) {
        items.push({ kind: "rule", agent: "claude", identity: `permissions.allow[${rule}]`, value: rule });
      }
      for (const rule of AI_ASK_RULES) {
        items.push({ kind: "rule", agent: "claude", identity: `permissions.ask[${rule}]`, value: rule });
      }
    } else if (permission === "ask") {
      for (const rule of ["Bash(npx wikeeper ingest start *)", "Bash(wikeeper ingest start *)"]) {
        items.push({ kind: "rule", agent: "claude", identity: `permissions.ask[${rule}]`, value: rule });
      }
    }
    for (const rule of ["Bash(npx wikeeper search *)", "Bash(wikeeper search *)"]) {
      items.push({ kind: "rule", agent: "claude", identity: `permissions.allow[${rule}]`, value: rule });
    }
    return items;
  },
};
