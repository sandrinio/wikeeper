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

const READ_RULES = ["Bash(npx wikeeper read *)", "Bash(wikeeper read *)"];

/** Commands that write no file; allowed in every permission mode (Gate 1 decision 17). Exception: `statusline --install`
 *  adds a status line to .claude/settings.local.json only where none is set, and refuses without changing a file
 *  otherwise (SPRINT-04 Gate 1 decision 20). */
export const READ_ONLY_COMMANDS = ["lint", "status", "rules list", "statusline", "config get"] as const;

function permissionRule(list: "allow" | "ask", rule: string): EnforceItem {
  return { kind: "rule", agent: "claude", identity: `permissions.${list}[${rule}]`, value: rule };
}

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
        items.push(permissionRule("allow", rule));
      }
      for (const rule of AI_ASK_RULES) items.push(permissionRule("ask", rule));
      for (const rule of READ_RULES) items.push(permissionRule("allow", rule));
    } else if (permission === "ask") {
      for (const rule of ["Bash(npx wikeeper ingest start *)", "Bash(wikeeper ingest start *)"]) {
        items.push(permissionRule("ask", rule));
      }
    }
    for (const rule of ["Bash(npx wikeeper search *)", "Bash(wikeeper search *)"]) {
      items.push(permissionRule("allow", rule));
    }
    for (const c of READ_ONLY_COMMANDS) {
      for (const rule of [`Bash(npx wikeeper ${c} *)`, `Bash(wikeeper ${c} *)`]) {
        items.push(permissionRule("allow", rule));
      }
    }
    return items;
  },
};
